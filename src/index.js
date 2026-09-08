require('dotenv').config()
const { startWeb } = require('./web/server')
console.log('🔧 Custom Bot — Démarrage…')
startWeb()
setTimeout(async () => {
  const { cfg } = require('./db/database')
  if (cfg('discord_token')) {
    const { startBot } = require('./bot/client')
    const r = await startBot()
    if (r.ok) console.log(`✅ Auto-connect : ${r.tag}`)
    else console.log(`❌ Auto-connect échoué : ${r.error}`)
  } else console.log('ℹ️ Aucun token — configure depuis le site.')
}, 2000)
