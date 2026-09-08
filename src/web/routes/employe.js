const router  = require('express').Router()
const multer  = require('multer')
const path    = require('path')
const bcrypt  = require('bcryptjs')
const { db, uploadsDir, cfg } = require('../../db/database')

async function pushActivite(cfg, type, employe_tag, detail, montant=0) {
  try {
    const url=cfg('showroom_url'),instId=cfg('showroom_instance_id'),guildId=cfg('guild_id')
    if(!url||!instId) return
    await fetch(`${url}/api/instances/${instId}/activite`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:guildId,type,employe_tag,detail,montant}),signal:AbortSignal.timeout(3000)}).catch(()=>{})
  } catch {}
}


function req_emp(req,res,next){ if(!req.session.empDiscordId) return res.status(403).json({error:'Non connecté'}); next() }
const upload = multer({ storage:multer.diskStorage({ destination:uploadsDir, filename:(req,file,cb)=>cb(null,`${req.session.empDiscordId||'u'}_${Date.now()}${path.extname(file.originalname)}`) }), limits:{fileSize:15*1024*1024}, fileFilter:(_,f,cb)=>cb(null,f.mimetype.startsWith('image/')) })

router.get('/slug/:slug', (req,res) => {
  const emp=db.prepare('SELECT discord_id,discord_tag,grade,grade_couleur,avatar_initiales,discord_avatar,first_login FROM employes WHERE slug=? AND actif=1').get(req.params.slug)
  if(!emp) return res.status(404).json({error:'Espace introuvable'}); res.json(emp)
})
router.post('/login-slug', async (req,res) => {
  const {slug,password}=req.body; const emp=db.prepare('SELECT * FROM employes WHERE slug=? AND actif=1').get(slug)
  if(!emp) return res.status(404).json({error:'Introuvable'})
  if(emp.first_login||!emp.password_hash) return res.json({first_login:true,discord_tag:emp.discord_tag})
  if(!await bcrypt.compare(password,emp.password_hash)) return res.status(401).json({error:'Mot de passe incorrect'})
  req.session.empDiscordId=emp.discord_id; req.session.role='employe'; res.json({ok:true})
})
router.post('/set-password-slug', async (req,res) => {
  const {slug,password}=req.body; if(!password||password.length<8) return res.status(400).json({error:'Min 8 car.'})
  const emp=db.prepare('SELECT * FROM employes WHERE slug=? AND actif=1').get(slug)
  if(!emp) return res.status(404).json({error:'Introuvable'})
  db.prepare('UPDATE employes SET password_hash=?,first_login=0 WHERE discord_id=?').run(await bcrypt.hash(password,12),emp.discord_id)
  req.session.empDiscordId=emp.discord_id; req.session.role='employe'; res.json({ok:true})
})

router.get('/discord-profile/:discord_id', async (req,res) => {
  const discordId=req.params.discord_id, guildId=cfg('guild_id')
  try {
    const {getClient}=require('../../bot/client'), client=getClient()
    if(client?.isReady()&&guildId){
      const guild=client.guilds.cache.get(guildId); if(guild){
        let member=guild.members.cache.get(discordId); if(!member) try{member=await guild.members.fetch(discordId)}catch{}
        if(member){
          const sh=member.avatar,gh=member.user.avatar; let av
          if(sh) av=`https://cdn.discordapp.com/guilds/${guildId}/users/${discordId}/avatars/${sh}.${sh.startsWith('a_')?'gif':'webp'}?size=256`
          else if(gh) av=`https://cdn.discordapp.com/avatars/${discordId}/${gh}.${gh.startsWith('a_')?'gif':'webp'}?size=256`
          else av=`https://cdn.discordapp.com/embed/avatars/${(BigInt(discordId)>>22n)%6n}.png`
          const roles=member.roles.cache.filter(r=>r.id!==guild.id).sort((a,b)=>b.position-a.position).slice(0,8).map(r=>({id:r.id,nom:r.name,couleur:r.hexColor!=='#000000'?r.hexColor:'#7a7f96',position:r.position}))
          db.prepare('UPDATE employes SET discord_avatar=?,roles_json=? WHERE discord_id=?').run(av,JSON.stringify(roles),discordId)
          return res.json({avatar_url:av,username:member.user.username,roles})
        }
      }
    }
    const emp=db.prepare('SELECT discord_avatar,roles_json,discord_tag FROM employes WHERE discord_id=?').get(discordId)
    res.json({avatar_url:emp?.discord_avatar||'',username:emp?.discord_tag||'',roles:JSON.parse(emp?.roles_json||'[]')})
  } catch { const emp=db.prepare('SELECT discord_avatar,roles_json,discord_tag FROM employes WHERE discord_id=?').get(discordId); res.json({avatar_url:emp?.discord_avatar||'',username:emp?.discord_tag||'',roles:JSON.parse(emp?.roles_json||'[]')}) }
})

router.get('/dashboard', req_emp, (req,res) => {
  const id=req.session.empDiscordId; const emp=db.prepare('SELECT * FROM employes WHERE discord_id=? AND actif=1').get(id)
  if(!emp) return res.status(403).json({error:'Compte introuvable'})
  const grade=db.prepare('SELECT * FROM grades WHERE nom=?').get(emp.grade)||{taux_base:10}
  const now=new Date().toISOString().slice(0,7)
  const customs_mois=db.prepare("SELECT * FROM customs WHERE employe_discord_id=? AND date LIKE ? ORDER BY id DESC").all(id,`${now}%`)
  const ca_mois=customs_mois.reduce((s,c)=>s+c.montant,0)
  const minutes_mois=db.prepare("SELECT COALESCE(SUM(duree_minutes),0) as s FROM sessions_service WHERE employe_discord_id=? AND date LIKE ?").get(id,`${now}%`).s
  const session_active=db.prepare("SELECT * FROM sessions_service WHERE employe_discord_id=? AND fin IS NULL ORDER BY id DESC LIMIT 1").get(id)
  const absences=db.prepare("SELECT * FROM absences WHERE employe_discord_id=? ORDER BY id DESC LIMIT 10").all(id)
  const avertissements=db.prepare("SELECT * FROM avertissements WHERE employe_discord_id=? ORDER BY id DESC LIMIT 5").all(id)
  const paye_prev=ca_mois*(grade.taux_base||10)/100
  const config={couleur:cfg('entreprise_couleur'),nom:cfg('entreprise_nom'),emoji:cfg('entreprise_emoji')}
  res.json({emp,grade,customs_mois,ca_mois,minutes_mois,paye_prev,session_active,absences,avertissements,config})
})

router.post('/service/debut', req_emp, (req,res) => {
  const id=req.session.empDiscordId
  if(db.prepare('SELECT id FROM sessions_service WHERE employe_discord_id=? AND fin IS NULL').get(id)) return res.status(400).json({error:'Service déjà en cours'})
  db.prepare('INSERT INTO sessions_service (employe_discord_id,debut) VALUES (?,?)').run(id,new Date().toISOString()); res.json({ok:true})
})
router.post('/service/fin', req_emp, (req,res) => {
  const id=req.session.empDiscordId; const sess=db.prepare('SELECT * FROM sessions_service WHERE employe_discord_id=? AND fin IS NULL').get(id)
  if(!sess) return res.status(400).json({error:'Aucun service en cours'})
  const duree=Math.floor((Date.now()-new Date(sess.debut))/60000)
  db.prepare('UPDATE sessions_service SET fin=?,duree_minutes=? WHERE id=?').run(new Date().toISOString(),duree,sess.id); res.json({ok:true,duree})
})

router.post('/customs', req_emp, upload.single('preuve'), (req,res) => {
  const {montant,description}=req.body
  if(!montant||isNaN(montant)) return res.status(400).json({error:'Montant requis'})
  if(!req.file) return res.status(400).json({error:'Photo obligatoire'})
  db.prepare('INSERT INTO customs (employe_discord_id,montant,description,preuve_filename) VALUES (?,?,?,?)').run(req.session.empDiscordId,Number(montant),description||'',req.file.filename)
  try {
    const {getClient}=require('../../bot/client'); const client=getClient(); const chId=cfg('channel_customs')
    if(client?.isReady()&&chId){
      const {EmbedBuilder}=require('discord.js'); const emp=db.prepare('SELECT discord_tag,grade FROM employes WHERE discord_id=?').get(req.session.empDiscordId)
      client.channels.cache.get(chId)?.send({embeds:[new EmbedBuilder().setColor(parseInt((cfg('entreprise_couleur')||'#8b5cf6').replace('#',''),16)).setTitle('🔧 Nouvelle custom').setDescription(`**${emp?.discord_tag}** (${emp?.grade})`).addFields({name:'Montant',value:`$${Number(montant).toLocaleString('fr-FR')}`,inline:true},{name:'Note',value:description||'—',inline:true}).setTimestamp()]}).catch(()=>{})
    }
  } catch {}
  const emp3=db.prepare('SELECT discord_tag FROM employes WHERE discord_id=?').get(req.session.empDiscordId)
  pushActivite(cfg,'custom',emp3?.discord_tag||'Employé',description||'Custom véhicule',Number(montant)||0)
  res.json({ok:true})
})

router.get('/absences', req_emp, (req,res) => res.json(db.prepare('SELECT * FROM absences WHERE employe_discord_id=? ORDER BY id DESC').all(req.session.empDiscordId)))
router.post('/absences', req_emp, async (req,res) => {
  const {date_debut,date_fin,raison}=req.body; if(!date_debut||!date_fin) return res.status(400).json({error:'Dates requises'})
  const emp=db.prepare('SELECT * FROM employes WHERE discord_id=?').get(req.session.empDiscordId)
  db.prepare('INSERT INTO absences (employe_discord_id,date_debut,date_fin,raison) VALUES (?,?,?,?)').run(req.session.empDiscordId,date_debut,date_fin,raison||'')
  try {
    const {getClient}=require('../../bot/client'); const client=getClient(); const chId=cfg('channel_absences')
    if(client?.isReady()&&chId){ const {EmbedBuilder}=require('discord.js'); client.channels.cache.get(chId)?.send({embeds:[new EmbedBuilder().setColor(0xfacc15).setTitle('📅 Nouvelle absence').setDescription(`**${emp.discord_tag}** (${emp.grade})`).addFields({name:'Du',value:date_debut,inline:true},{name:'Au',value:date_fin,inline:true},{name:'Raison',value:raison||'Non précisée'}).setTimestamp().setFooter({text:'En attente de validation patron'})]}).catch(()=>{}) }
  } catch {}
  res.json({ok:true})
})

module.exports = router
