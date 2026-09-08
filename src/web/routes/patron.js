const router  = require('express').Router()
const express = require('express')
const { db, uploadsDir, cfg, setCfg } = require('../../db/database')

function req_p(req,res,next){ if(!req.session.patron) return res.status(403).json({error:'Non authentifié'}); next() }

router.post('/login', async (req,res) => {
  const {password}=req.body; const stored=cfg('patron_password')
  if(!stored){ if(!password||password.length<8) return res.status(400).json({error:'Min 8 car.',setup:true}); const b=require('bcryptjs'); setCfg('patron_password',await b.hash(password,12)); req.session.patron=true; return res.json({ok:true,first:true}) }
  const b=require('bcryptjs'); if(!await b.compare(password,stored)) return res.status(401).json({error:'Mot de passe incorrect'}); req.session.patron=true; res.json({ok:true})
})
router.post('/logout', (req,res)=>{ req.session.destroy(); res.json({ok:true}) })

router.get('/dashboard', req_p, (req,res) => {
  const now=new Date().toISOString().slice(0,7)
  const equipe  =db.prepare("SELECT * FROM employes WHERE actif=1 ORDER BY grade,discord_tag").all()
  const cv_att  =db.prepare("SELECT * FROM cv WHERE statut='en_attente' ORDER BY date_soumission DESC").all()
  const customs =db.prepare("SELECT c.*,e.discord_tag,e.grade FROM customs c JOIN employes e ON c.employe_discord_id=e.discord_id ORDER BY c.id DESC LIMIT 50").all()
  const absences=db.prepare("SELECT a.*,e.discord_tag,e.grade FROM absences a JOIN employes e ON a.employe_discord_id=e.discord_id ORDER BY a.id DESC LIMIT 30").all()
  const stats={employes:equipe.length,ca_mois:db.prepare("SELECT COALESCE(SUM(montant),0) as s FROM customs WHERE date LIKE ?").get(`${now}%`).s,customs_mois:db.prepare("SELECT COUNT(*) as c FROM customs WHERE date LIKE ?").get(`${now}%`).c,cv_att:cv_att.length,abs_att:db.prepare("SELECT COUNT(*) as c FROM absences WHERE statut='en_attente'").get().c}
  const config={couleur:cfg('entreprise_couleur'),nom:cfg('entreprise_nom'),emoji:cfg('entreprise_emoji')}
  const bot_ok=cfg('bot_actif')==='1'
  res.json({equipe,cv_att,customs,absences,stats,config,bot_ok})
})

router.get('/parametres', req_p, (req,res) => {
  const rows=db.prepare('SELECT key,value FROM config').all(); const result={}
  for(const {key,value} of rows){ if(key==='patron_password') continue; result[key]=key==='discord_token'?(value?'••••'+value.slice(-6):''):value }
  res.json(result)
})
router.post('/parametres', req_p, async (req,res) => {
  const {discord_token,...rest}=req.body
  for(const [k,v] of Object.entries(rest)) if(k!=='patron_password'&&k!=='bot_actif'&&k!=='bot_tag') setCfg(k,v)
  if(discord_token&&!discord_token.includes('••')){ setCfg('discord_token',discord_token); const {startBot}=require('../../bot/client'); const r=await startBot(); if(!r.ok) return res.json({ok:true,bot_warn:r.error}) }
  res.json({ok:true})
})

router.post('/bot/start', req_p, async (req,res) => { const {startBot}=require('../../bot/client'); res.json(await startBot()) })
router.post('/bot/stop',  req_p, async (req,res) => { const {stopBot}=require('../../bot/client');  res.json(await stopBot()) })
router.get('/bot/status', req_p, (req,res) => { const {getClient}=require('../../bot/client'); const c=getClient(); res.json({online:c?.isReady()||false,tag:c?.user?.tag||cfg('bot_tag')||'',ping:c?.ws?.ping||0}) })

router.get('/grades', req_p, (req,res) => res.json(db.prepare('SELECT * FROM grades ORDER BY ordre').all()))
router.put('/grades/:id', req_p, (req,res) => {
  const {nom,couleur,emoji,taux_base,role_discord}=req.body
  db.prepare('UPDATE grades SET nom=?,couleur=?,emoji=?,taux_base=?,role_discord=? WHERE id=?').run(nom,couleur,emoji||'🔧',+taux_base,role_discord||'',req.params.id)
  res.json({ok:true})
})

router.get('/employes', req_p, (req,res) => res.json(db.prepare("SELECT * FROM employes ORDER BY actif DESC,grade,discord_tag").all()))
router.post('/employes', req_p, (req,res) => {
  const {discord_id,discord_tag,grade,slug}=req.body; if(!discord_id||!discord_tag||!slug) return res.status(400).json({error:'Champs requis'})
  const gi=db.prepare('SELECT couleur,role_discord FROM grades WHERE nom=?').get(grade||'Technicien')
  try {
    db.prepare('INSERT INTO employes (discord_id,discord_tag,grade,grade_couleur,slug,avatar_initiales) VALUES (?,?,?,?,?,?)').run(discord_id,discord_tag,grade||'Technicien',gi?.couleur||'#8b5cf6',slug,discord_tag.slice(0,2).toUpperCase())
    const {getClient}=require('../../bot/client'); const c=getClient(); const rId=cfg('role_employe')
    if(c?.isReady()&&rId) c.guilds.cache.get(cfg('guild_id'))?.members.fetch(discord_id).then(m=>m.roles.add(rId)).catch(()=>{})
    res.json({ok:true})
  } catch { res.status(400).json({error:'Discord ID ou slug déjà utilisé'}) }
})
router.put('/employes/:id', req_p, (req,res) => {
  const {grade,actif,avertissement}=req.body
  const emp=db.prepare('SELECT * FROM employes WHERE discord_id=?').get(req.params.id)
  if(!emp) return res.status(404).json({error:'Introuvable'})
  if(avertissement!==undefined){ db.prepare('INSERT INTO avertissements (employe_discord_id,message) VALUES (?,?)').run(req.params.id,avertissement); return res.json({ok:true}) }
  const gi=grade?db.prepare('SELECT couleur,role_discord FROM grades WHERE nom=?').get(grade):null
  db.prepare('UPDATE employes SET grade=?,grade_couleur=?,actif=? WHERE discord_id=?').run(grade||emp.grade,gi?.couleur||emp.grade_couleur,actif===undefined?emp.actif:actif?1:0,req.params.id)
  if(gi?.role_discord){ const {getClient}=require('../../bot/client'); const c=getClient(); if(c?.isReady()) c.guilds.cache.get(cfg('guild_id'))?.members.fetch(req.params.id).then(m=>m.roles.add(gi.role_discord)).catch(()=>{}) }
  res.json({ok:true})
})

router.put('/cv/:id', req_p, async (req,res) => {
  const {statut,note}=req.body; const cv=db.prepare('SELECT * FROM cv WHERE id=?').get(req.params.id)
  if(!cv) return res.status(404).json({error:'Introuvable'})
  db.prepare('UPDATE cv SET statut=?,note_patron=? WHERE id=?').run(statut,note||'',req.params.id)
  try {
    const {getClient}=require('../../bot/client'); const client=getClient(); const {EmbedBuilder}=require('discord.js'); const chId=cfg('channel_cv')
    if(client?.isReady()&&chId) { client.channels.cache.get(chId)?.send({embeds:[new EmbedBuilder().setColor(statut==='accepte'?0x22c55e:0xef4444).setTitle(statut==='accepte'?'✅ CV Accepté':'❌ CV Refusé').setDescription(`Candidature de **${cv.discord_tag}** : ${statut==='accepte'?'acceptée':'refusée'}`).addFields({name:'Note patron',value:note||'—'}).setTimestamp()]}).catch(()=>{})
      if(statut==='accepte'){ const rId=cfg('role_attente_entretien'); if(rId) client.guilds.cache.get(cfg('guild_id'))?.members.fetch(cv.discord_id).then(m=>m.roles.add(rId)).catch(()=>{}) } }
  } catch {}
  res.json({ok:true})
})

router.put('/absences/:id', req_p, async (req,res) => {
  const {statut,note}=req.body; const abs=db.prepare('SELECT a.*,e.discord_tag,e.grade FROM absences a JOIN employes e ON a.employe_discord_id=e.discord_id WHERE a.id=?').get(req.params.id)
  if(!abs) return res.status(404).json({error:'Introuvable'})
  db.prepare("UPDATE absences SET statut=?,note_patron=?,date_traitement=datetime('now') WHERE id=?").run(statut,note||'',req.params.id)
  try {
    const {getClient}=require('../../bot/client'); const client=getClient(); const chId=cfg('channel_absences')
    if(client?.isReady()&&chId){ const {EmbedBuilder}=require('discord.js'); client.channels.cache.get(chId)?.send({embeds:[new EmbedBuilder().setColor(statut==='accepte'?0x22c55e:0xef4444).setTitle(statut==='accepte'?'✅ Absence acceptée':'❌ Absence refusée').setDescription(`Absence de **${abs.discord_tag}** (${abs.grade})`).addFields({name:'Période',value:`${abs.date_debut} → ${abs.date_fin}`,inline:true},{name:'Décision',value:statut==='accepte'?'Acceptée ✅':'Refusée ❌',inline:true},{name:'Note patron',value:note||'—'}).setTimestamp()]}).catch(()=>{}) }
  } catch {}
  res.json({ok:true})
})

router.get('/compta', req_p, (req,res) => {
  const now=new Date().toISOString().slice(0,7)
  const empStats=db.prepare("SELECT * FROM employes WHERE actif=1").all().map(emp=>{
    const grade=db.prepare('SELECT * FROM grades WHERE nom=?').get(emp.grade)||{taux_base:10}
    const ca=db.prepare("SELECT COALESCE(SUM(montant),0) as s FROM customs WHERE employe_discord_id=? AND date LIKE ?").get(emp.discord_id,`${now}%`).s
    return {...emp,ca_mois:ca,paye_mois:ca*(grade.taux_base||10)/100,grade_info:grade}
  })
  res.json({empStats,mois:now,total_ca:empStats.reduce((s,e)=>s+e.ca_mois,0),total_paie:empStats.reduce((s,e)=>s+e.paye_mois,0)})
})

router.post('/debrief', req_p, async (req,res) => {
  const {message}=req.body; const chId=cfg('channel_annonces')
  if(!chId) return res.status(400).json({error:'Channel annonces non configuré dans Paramètres'})
  const {getClient}=require('../../bot/client'); const client=getClient()
  if(!client?.isReady()) return res.status(400).json({error:'Bot non connecté'})
  try {
    const {EmbedBuilder}=require('discord.js'); const now=new Date().toISOString().slice(0,7)
    const empStats=db.prepare("SELECT e.discord_tag,e.grade,COALESCE(SUM(c.montant),0) as ca FROM employes e LEFT JOIN customs c ON c.employe_discord_id=e.discord_id AND c.date LIKE ? WHERE e.actif=1 GROUP BY e.discord_id ORDER BY ca DESC").all(`${now}%`)
    const couleur=parseInt((cfg('entreprise_couleur')||'#8b5cf6').replace('#',''),16)
    const embed=new EmbedBuilder().setColor(couleur).setTitle(`${cfg('entreprise_emoji')||'🔧'} Débrief — ${cfg('entreprise_nom')}`).setDescription(message||'Récap mensuel.').setTimestamp().setFooter({text:cfg('entreprise_nom')})
    empStats.slice(0,8).forEach(e=>{ const grade=db.prepare('SELECT taux_base FROM grades WHERE nom=?').get(e.grade)||{taux_base:10}; embed.addFields({name:`${e.discord_tag} (${e.grade})`,value:`CA : $${Number(e.ca).toLocaleString('fr-FR')} · Paie : ~$${Math.round(e.ca*(grade.taux_base||10)/100).toLocaleString('fr-FR')}`,inline:true}) })
    await client.channels.cache.get(chId)?.send({embeds:[embed]})
    res.json({ok:true})
  } catch(err){ res.status(500).json({error:err.message}) }
})

router.use('/uploads', express.static(uploadsDir))
module.exports = router
