// Feature 005: contracción de expand/contract pendiente desde 004/008. sleep_records, naps y metrics
// dejan de tener DEFAULT 1 en user_id: una fila sin usuario explícito pasa a ser un error en vez de
// asignarse en silencio al propietario. La imagen anterior (008) siempre envía user_id por repo/.
// Reconstrucción verificada (constitución, principio II) con foreignKeys: false (DROP TABLE metrics
// borraría en cascada metric_entries).
// NO EDITAR: una migración aplicada es inmutable (ver docs/sdd/guia-migraciones.md).
const crypto = require('node:crypto');

const USER_ID = 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE';

const TABLES = [
  {
    name: 'sleep_records',
    columns: ['id', 'date', 'bedtime', 'wake_time', 'notes', 'created_at', 'user_id'],
    ddl: `CREATE TABLE sleep_records_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      bedtime TEXT NOT NULL,
      wake_time TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      ${USER_ID}
    )`,
    indexes: [
      'CREATE INDEX idx_sleep_date ON sleep_records(date)',
      // Con expresión, para que el error de SQLite siga nombrando el índice (ver 004)
      'CREATE UNIQUE INDEX ux_sleep_one_open ON sleep_records(user_id, (wake_time IS NULL)) WHERE wake_time IS NULL',
    ],
  },
  {
    name: 'naps',
    columns: ['id', 'date', 'start_time', 'end_time', 'notes', 'created_at', 'user_id'],
    ddl: `CREATE TABLE naps_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      ${USER_ID}
    )`,
    indexes: ['CREATE INDEX idx_naps_date ON naps(date)'],
  },
  {
    name: 'metrics',
    columns: ['id', 'name', 'type', 'unit', 'min_value', 'max_value', 'color', 'sort_order', 'archived', 'created_at', 'user_id'],
    ddl: `CREATE TABLE metrics_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('number','scale','boolean','text')),
      unit TEXT,
      min_value REAL,
      max_value REAL,
      color TEXT NOT NULL DEFAULT '#5b6ee1',
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      ${USER_ID}
    )`,
    indexes: [],
  },
];

function fingerprint(db, table, columns) {
  const rows = db.prepare(`SELECT ${columns.join(', ')} FROM ${table} ORDER BY id`).raw().all();
  return { count: rows.length, hash: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
}

module.exports = {
  foreignKeys: false,
  up(db) {
    const entriesBefore = db.prepare('SELECT COUNT(*) AS c FROM metric_entries').get().c;
    const seqBefore = new Map(db.prepare('SELECT name, seq FROM sqlite_sequence').all().map((r) => [r.name, r.seq]));

    for (const t of TABLES) {
      const cols = t.columns.join(', ');
      const before = fingerprint(db, t.name, t.columns);
      db.exec(t.ddl);
      db.exec(`INSERT INTO ${t.name}_new (${cols}) SELECT ${cols} FROM ${t.name}`);
      const after = fingerprint(db, `${t.name}_new`, t.columns);
      if (before.count !== after.count || before.hash !== after.hash) {
        throw new Error(`la copia de ${t.name} no coincide (${before.count} → ${after.count} filas); no se sustituye la tabla`);
      }
      db.exec(`DROP TABLE ${t.name}`);
      db.exec(`ALTER TABLE ${t.name}_new RENAME TO ${t.name}`);
      for (const ddl of t.indexes) db.exec(ddl);
      if (seqBefore.has(t.name)) {
        const seq = seqBefore.get(t.name);
        const upd = db.prepare('UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = ?').run(seq, t.name);
        if (!upd.changes) db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(t.name, seq);
      }
    }

    const entriesAfter = db.prepare('SELECT COUNT(*) AS c FROM metric_entries').get().c;
    if (entriesAfter !== entriesBefore) throw new Error(`metric_entries cambió (${entriesBefore} → ${entriesAfter} filas)`);
  },
};
