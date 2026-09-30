// Inicializador de la base ANTERIOR a la feature 003, congelado para las pruebas.
// Es una copia literal de backend/src/db.js de master antes de 003; solo cambia que recibe la
// ruta como argumento en lugar de leer DB_PATH y que devuelve la conexión.
// NO modificar: representa lo que hace la imagen anterior tras un rollback.
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function openLegacy(DB_PATH) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sleep_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,             -- fecha de la noche (YYYY-MM-DD), el día en que te acostaste
      bedtime TEXT NOT NULL,          -- ISO 8601 con zona horaria
      wake_time TEXT,                 -- ISO 8601; NULL mientras la noche sigue "abierta"
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS naps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('number','scale','boolean','text')),
      unit TEXT,
      min_value REAL,
      max_value REAL,
      color TEXT NOT NULL DEFAULT '#5b6ee1',
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS metric_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_id INTEGER NOT NULL REFERENCES metrics(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (metric_id, date)
    );

    CREATE INDEX IF NOT EXISTS idx_sleep_date ON sleep_records(date);
    CREATE INDEX IF NOT EXISTS idx_naps_date ON naps(date);
    CREATE INDEX IF NOT EXISTS idx_entries_date ON metric_entries(date);
  `);

  // Métricas iniciales para que el panel no arranque vacío
  const count = db.prepare('SELECT COUNT(*) AS c FROM metrics').get().c;
  if (count === 0) {
    const insert = db.prepare(
      'INSERT INTO metrics (name, type, unit, min_value, max_value, color, sort_order) VALUES (?,?,?,?,?,?,?)'
    );
    insert.run('Calidad del sueño', 'scale', null, 1, 5, '#5b6ee1', 0);
    insert.run('Energía al despertar', 'scale', null, 1, 5, '#e8a33d', 1);
    insert.run('Cafés', 'number', 'tazas', 0, null, '#8a5a3c', 2);
  }

  return db;
}

module.exports = { openLegacy };
