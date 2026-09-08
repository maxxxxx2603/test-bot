const router = require('express').Router()
router.get('/me', (req,res) => {
  if (req.session.empDiscordId) return res.json({ role:'employe' })
  if (req.session.patron) return res.json({ role:'patron' })
  res.status(401).json({ error:'Non connecté' })
})
router.post('/logout', (req,res) => { req.session.destroy(); res.json({ ok:true }) })
module.exports = router
