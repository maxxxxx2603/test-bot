const express = require('express')
const session = require('express-session')
const path    = require('path')
const { uploadsDir } = require('../db/database')

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended:true }))
app.use(express.static(path.join(process.cwd(),'public')))
app.use('/uploads', express.static(uploadsDir))

app.use(session({
  secret: process.env.SESSION_SECRET||'custom-dev',
  resave:false, saveUninitialized:false,
  cookie:{ secure:false, maxAge:1000*60*60*24*7 }
}))

app.get('/api/auth/me', (req,res) => {
  if(req.session.empDiscordId) return res.json({role:'employe'})
  if(req.session.patron) return res.json({role:'patron'})
  res.status(401).json({error:'Non connecté'})
})
app.post('/api/auth/logout', (req,res) => { req.session.destroy(); res.json({ok:true}) })

app.use('/api/employe', require('./routes/employe'))
app.use('/api/patron',  require('./routes/patron'))

app.get('/e/:slug', (_,res) => res.sendFile(path.join(process.cwd(),'public','employe.html')))
app.get('/', (_,res) => res.sendFile(path.join(process.cwd(),'public','patron.html')))
app.get('*', (_,res) => res.sendFile(path.join(process.cwd(),'public','patron.html')))

function startWeb(){
  const PORT=process.env.PORT||4000
  app.listen(PORT,'0.0.0.0',()=>console.log(`🌐 Custom Bot : http://0.0.0.0:${PORT}`))
}
module.exports = { startWeb }
