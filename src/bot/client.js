const { Client, GatewayIntentBits, Events } = require('discord.js')
let client = null

function getClient() { return client }

async function startBot() {
  const { cfg, setCfg } = require('../db/database')
  const token = cfg('discord_token')
  if (!token) return { ok:false, error:'Token non configuré — va dans Paramètres' }
  if (client) { try { client.destroy() } catch {}; client = null }
  client = new Client({ intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildMessages] })
  client.once(Events.ClientReady, () => { console.log(`✅ Custom Bot : ${client.user.tag}`); setCfg('bot_actif','1'); setCfg('bot_tag',client.user.tag) })
  client.on('error', err => { console.error('Erreur Discord:',err.message); setCfg('bot_actif','0') })
  client.on(Events.GuildMemberRemove, async member => {
    if(member.guild.id!==cfg('guild_id')) return
    const chId=cfg('channel_alertes'); if(!chId) return
    try {
      const {EmbedBuilder}=require('discord.js')
      client.channels.cache.get(chId)?.send({embeds:[new EmbedBuilder().setColor(0xef4444).setTitle('⚠️ Membre parti').setDescription(`**${member.user.tag}** a quitté.`).setTimestamp()]})
    } catch {}
  })
  try { await client.login(token); return { ok:true, tag:client.user?.tag } }
  catch(err) { setCfg('bot_actif','0'); client=null; return { ok:false, error:err.message } }
}

async function stopBot() {
  if(client){ try{client.destroy()}catch{}; client=null }
  const { setCfg } = require('../db/database'); setCfg('bot_actif','0')
  return { ok:true }
}

module.exports = { getClient, startBot, stopBot }
