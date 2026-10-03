// Feature 005: objetivo de sueño de 7 h por defecto (antes 8 h en 008), marca de objetivo elegido por
// la persona y bienvenida vista. user_settings es una hoja (nadie la referencia): se reconstruye sin
// desactivar las FK. El código de 008 sigue funcionando: inserta (user_id, updated_at) y actualiza
// sleep_goal_min.
// 480 era el valor por defecto de 008 (desplegado el 2026-10-02, sin cuentas personalizadas aún):
// esas filas pasan a 420 y se marcan como no personalizadas; el resto conserva su valor.
// NO EDITAR: una migración aplicada es inmutable (ver docs/sdd/guia-migraciones.md).
const crypto = require('node:crypto');

const hash = (rows) => crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');

module.exports = {
  up(db) {
    // Lo que debe quedar: mismas filas, con la conversión de 480 → 420 ya aplicada
    const expected = db
      .prepare(`SELECT user_id, CASE WHEN sleep_goal_min = 480 THEN 420 ELSE sleep_goal_min END AS goal, updated_at
        FROM user_settings ORDER BY user_id`)
      .raw()
      .all();

    db.exec(`CREATE TABLE user_settings_new (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      sleep_goal_min INTEGER NOT NULL DEFAULT 420 CHECK (sleep_goal_min BETWEEN 240 AND 720),
      goal_customized INTEGER NOT NULL DEFAULT 0,
      onboarded_at TEXT,
      updated_at TEXT NOT NULL
    )`);
    db.exec(`INSERT INTO user_settings_new (user_id, sleep_goal_min, goal_customized, updated_at)
      SELECT user_id,
             CASE WHEN sleep_goal_min = 480 THEN 420 ELSE sleep_goal_min END,
             CASE WHEN sleep_goal_min = 480 THEN 0 ELSE 1 END,
             updated_at
      FROM user_settings`);

    const copied = db.prepare('SELECT user_id, sleep_goal_min, updated_at FROM user_settings_new ORDER BY user_id').raw().all();
    if (copied.length !== expected.length || hash(copied) !== hash(expected)) {
      throw new Error(`la copia de user_settings no coincide (${expected.length} → ${copied.length} filas); no se sustituye la tabla`);
    }
    db.exec('DROP TABLE user_settings');
    db.exec('ALTER TABLE user_settings_new RENAME TO user_settings');
  },
};
