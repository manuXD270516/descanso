// Feature 013: avisos push con la app cerrada. Dispositivos con avisos (ligados a la sesión que los
// activó), registro de cada aviso programado y preferencias en user_settings. Solo expand: dos
// tablas nuevas y columnas con DEFAULT o NULL; el código de 011 sigue funcionando porque nombra sus
// columnas, y borrar una sesión desde el código anterior borra su dispositivo por la FK.
// NO EDITAR: una migración aplicada es inmutable (ver docs/sdd/guia-migraciones.md).
const COLUMNS = [
  ['push_prepare', 'INTEGER NOT NULL DEFAULT 1 CHECK (push_prepare IN (0, 1))'],
  ['push_bedtime', 'INTEGER NOT NULL DEFAULT 1 CHECK (push_bedtime IN (0, 1))'],
  ['push_wake_check', 'INTEGER NOT NULL DEFAULT 1 CHECK (push_wake_check IN (0, 1))'],
  ['dnd_start_min', 'INTEGER CHECK (dnd_start_min IS NULL OR dnd_start_min BETWEEN 0 AND 1439)'],
  ['dnd_end_min', 'INTEGER CHECK (dnd_end_min IS NULL OR dnd_end_min BETWEEN 0 AND 1439)'],
  ['muted_until', 'TEXT'],
];

module.exports = {
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_hash TEXT NOT NULL REFERENCES sessions(id_hash) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE CHECK (length(endpoint) <= 1024),
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_success_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_session ON push_subscriptions(session_hash);

      CREATE TABLE IF NOT EXISTS reminder_deliveries (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('prepare', 'bedtime', 'wake_check')),
        night_date TEXT NOT NULL,
        due_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('claimed', 'sent', 'skipped', 'failed')),
        reason TEXT CHECK (reason IS NULL OR reason IN ('late', 'night_open', 'muted', 'dnd', 'expired', 'timeout', 'error', 'no_devices', 'interrupted')),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, kind, night_date)
      );
      CREATE INDEX IF NOT EXISTS idx_reminder_deliveries_updated ON reminder_deliveries(updated_at);
    `);
    for (const [column, definition] of COLUMNS) {
      const exists = db.prepare('PRAGMA table_info(user_settings)').all().some((c) => c.name === column);
      if (!exists) db.exec(`ALTER TABLE user_settings ADD COLUMN ${column} ${definition}`);
    }
  },
};
