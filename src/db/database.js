const Database = require('better-sqlite3')
const path = require('path')
const fs   = require('fs')

const dataDir    = path.join(process.cwd(), 'data')
const uploadsDir = path.join(dataDir, 'uploads')
if (!fs.existsSync(dataDir))    fs.mkdirSync(dataDir,    { recursive: true })
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const db = new Database(path.join(dataDir, 'custom.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS config ( key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '' );
  CREATE TABLE IF NOT EXISTS employes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT UNIQUE NOT NULL,
    discord_tag TEXT NOT NULL, grade TEXT DEFAULT 'Technicien',
    grade_couleur TEXT DEFAULT '#8b5cf6', roles_json TEXT DEFAULT '[]',
    discord_avatar TEXT DEFAULT '', avatar_initiales TEXT DEFAULT '',
    date_embauche TEXT DEFAULT (date('now')), actif INTEGER DEFAULT 1,
    password_hash TEXT, first_login INTEGER DEFAULT 1, slug TEXT UNIQUE
  );
  CREATE TABLE IF NOT EXISTS sessions_service (
    id INTEGER PRIMARY KEY AUTOINCREMENT, employe_discord_id TEXT NOT NULL,
    debut TEXT NOT NULL, fin TEXT, duree_minutes INTEGER, date TEXT DEFAULT (date('now'))
  );
  CREATE TABLE IF NOT EXISTS customs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, employe_discord_id TEXT NOT NULL,
    montant REAL NOT NULL, description TEXT DEFAULT '',
    preuve_filename TEXT DEFAULT '', date TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS absences (
    id INTEGER PRIMARY KEY AUTOINCREMENT, employe_discord_id TEXT NOT NULL,
    date_debut TEXT NOT NULL, date_fin TEXT NOT NULL, raison TEXT DEFAULT '',
    statut TEXT DEFAULT 'en_attente', note_patron TEXT DEFAULT '',
    date_declaration TEXT DEFAULT (datetime('now')), date_traitement TEXT
  );
  CREATE TABLE IF NOT EXISTS cv (
    id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT NOT NULL,
    discord_tag TEXT NOT NULL, reponses TEXT NOT NULL,
    statut TEXT DEFAULT 'en_attente', date_soumission TEXT DEFAULT (datetime('now')), note_patron TEXT
  );
  CREATE TABLE IF NOT EXISTS avertissements (
    id INTEGER PRIMARY KEY AUTOINCREMENT, employe_discord_id TEXT NOT NULL,
    message TEXT NOT NULL, date TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT UNIQUE NOT NULL,
    couleur TEXT DEFAULT '#8b5cf6', emoji TEXT DEFAULT '🔧',
    ordre INTEGER DEFAULT 0, taux_base REAL DEFAULT 10, role_discord TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS questions_cv (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ordre INTEGER NOT NULL,
    question TEXT NOT NULL, actif INTEGER DEFAULT 1
  );
`)

const ic = db.prepare('INSERT OR IGNORE INTO config (key,value) VALUES (?,?)')
const DEFAULTS = {
  entreprise_nom:     'Custom Shop RP',
  entreprise_couleur: '#8b5cf6',
  entreprise_emoji:   '🔧',
  discord_token:      '',
  discord_client_id:  '',
  guild_id:           '',
  channel_cv:         '',
  channel_customs:    '',
  channel_logs:       '',
  channel_alertes:    '',
  channel_annonces:   '',
  channel_absences:   '',
  role_employe:       '',
  role_attente_entretien: '',
  role_patron:        '',
  bot_actif:          '0',
}
for (const [k,v] of Object.entries(DEFAULTS)) ic.run(k,v)

if (db.prepare('SELECT COUNT(*) as c FROM grades').get().c === 0) {
  const ig = db.prepare('INSERT OR IGNORE INTO grades (nom,couleur,emoji,ordre,taux_base) VALUES (?,?,?,?,?)')
  ;[['Stagiaire','#6b7280','🔰',0,5],['Technicien','#60a5fa','🔧',1,8],['Senior','#8b5cf6','⭐',2,12],['Chef atelier','#f59e0b','👑',3,15],['Directeur','#ef4444','💎',4,20]]
    .forEach(r => ig.run(...r))
}
if (db.prepare('SELECT COUNT(*) as c FROM questions_cv').get().c === 0) {
  const iq = db.prepare('INSERT INTO questions_cv (ordre,question) VALUES (?,?)')
  ;["Quel poste vous intéresse ?","Expérience en mécanique / custom RP ?","Disponibilités en jeu ?","Décrivez-vous en 3 mots","Pourquoi rejoindre cet atelier ?"]
    .forEach((q,i) => iq.run(i+1,q))
}

function cfg(k) { return db.prepare('SELECT value FROM config WHERE key=?').get(k)?.value || '' }
function setCfg(k,v) { db.prepare('INSERT OR REPLACE INTO config (key,value) VALUES (?,?)').run(k, String(v||'')) }

module.exports = { db, uploadsDir, cfg, setCfg }
