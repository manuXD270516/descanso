// Feature 011: racha de constancia opcional. Ajustes, récord y total en user_settings; constelaciones
// (logros permanentes) en una tabla propia. Solo expand: columnas con DEFAULT o NULL y una tabla
// nueva; el código de 010 sigue funcionando porque nombra sus columnas.
// NO EDITAR: una migración aplicada es inmutable (ver docs/sdd/guia-migraciones.md).
const COLUMNS = [
  ['streak_enabled', 'INTEGER NOT NULL DEFAULT 0 CHECK (streak_enabled IN (0, 1))'],
  ['streak_margin_min', 'INTEGER NOT NULL DEFAULT 30 CHECK (streak_margin_min BETWEEN 15 AND 60)'],
  ['streak_since', 'TEXT'],
  ['streak_offered_at', 'TEXT'],
  ['streak_best', 'INTEGER NOT NULL DEFAULT 0 CHECK (streak_best >= 0)'],
  ['streak_total', 'INTEGER NOT NULL DEFAULT 0 CHECK (streak_total >= 0)'],
  ['streak_total_base', 'INTEGER NOT NULL DEFAULT 0 CHECK (streak_total_base >= 0)'],
  ['streak_summary_dismissed', 'TEXT'],
];

module.exports = {
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS streak_achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key INTEGER NOT NULL CHECK (key IN (7, 21, 66, 100, 180, 365)),
        achieved_on TEXT NOT NULL,
        wake_spread_min INTEGER NOT NULL CHECK (wake_spread_min >= 0),
        seen_at TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (user_id, key)
      );
    `);
    for (const [column, definition] of COLUMNS) {
      const exists = db.prepare('PRAGMA table_info(user_settings)').all().some((c) => c.name === column);
      if (!exists) db.exec(`ALTER TABLE user_settings ADD COLUMN ${column} ${definition}`);
    }
  },
};
