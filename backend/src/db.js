const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { migrate } = require('./migrate');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'sleep.db');
const inMemory = DB_PATH === ':memory:';
if (!inMemory) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// El esquema vive en src/migrations (feature 003). Si una migración falla, este require lanza y
// el servicio no llega a escuchar: el pipeline revierte a la imagen anterior.
migrate(db, { backupDir: inMemory ? null : path.join(path.dirname(DB_PATH), 'backups') });

module.exports = db;
