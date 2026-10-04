// Feature 010: horario de sueño versionado (horas de reloj de pared), pausas, aviso previo y cuándo se
// registró cada despertar. Solo expand: tablas nuevas y columnas con DEFAULT o NULL; el código de 006
// sigue funcionando porque nombra sus columnas.
// NO EDITAR: una migración aplicada es inmutable (ver docs/sdd/guia-migraciones.md).
const COLUMNS = [
  ['user_settings', 'lead_min', 'INTEGER NOT NULL DEFAULT 30 CHECK (lead_min BETWEEN 15 AND 60)'],
  ['sleep_records', 'wake_logged_at', 'TEXT'],
  ['sleep_records', 'wake_from_proposal', 'INTEGER NOT NULL DEFAULT 0 CHECK (wake_from_proposal IN (0, 1))'],
];

module.exports = {
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schedule_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        effective_from TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      -- Varias versiones el mismo día: la vigente es la última guardada (id mayor); el historial no se borra
      CREATE INDEX IF NOT EXISTS idx_schedule_versions_user ON schedule_versions(user_id, effective_from, id);
      CREATE TABLE IF NOT EXISTS schedule_days (
        version_id INTEGER NOT NULL REFERENCES schedule_versions(id) ON DELETE CASCADE,
        weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
        bed_min INTEGER NOT NULL CHECK (bed_min BETWEEN 0 AND 1439),
        wake_min INTEGER NOT NULL CHECK (wake_min BETWEEN 0 AND 1439),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        PRIMARY KEY (version_id, weekday)
      );
      CREATE TABLE IF NOT EXISTS pauses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        CHECK (end_date >= start_date)
      );
      CREATE INDEX IF NOT EXISTS idx_pauses_user ON pauses(user_id, start_date);
    `);
    for (const [table, column, definition] of COLUMNS) {
      const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
      if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  },
};
