// Feature 008: multiusuario con perfiles. Reconstrucción verificada de `users` (el CHECK de role no
// se puede alterar en SQLite) y tablas nuevas. `foreignKeys: false`: sin él, DROP TABLE users
// borraría en cascada sesiones, noches, siestas y métricas.
// Expand/contract: el código de 004 lee y escribe columnas que se conservan e ignora lo nuevo.
// NO EDITAR: una migración aplicada es inmutable (ver docs/sdd/guia-migraciones.md).
const crypto = require('node:crypto');

const KEPT = ['id', 'email', 'password_hash', 'role', 'created_at'];

function fingerprint(db, table) {
  const rows = db.prepare(`SELECT ${KEPT.join(', ')} FROM ${table} ORDER BY id`).raw().all();
  return { count: rows.length, hash: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
}

module.exports = {
  foreignKeys: false,
  up(db) {
    // Tablas que referencian users: sus recuentos no pueden cambiar al sustituirla
    const DEPENDENT = ['sessions', 'sleep_records', 'naps', 'metrics', 'metric_entries'];
    const count = (t) => db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
    const countsBefore = DEPENDENT.map(count);
    const before = fingerprint(db, 'users');
    db.exec(`CREATE TABLE users_new (
      id INTEGER PRIMARY KEY,
      email TEXT COLLATE NOCASE UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL CHECK (role IN ('owner','user')),
      display_name TEXT,
      timezone TEXT,
      consent_version TEXT,
      consent_at TEXT,
      reset_notice_at TEXT,
      created_at TEXT NOT NULL
    )`);
    db.exec(`INSERT INTO users_new (${KEPT.join(', ')}, display_name)
      SELECT ${KEPT.join(', ')}, CASE WHEN email IS NULL THEN NULL ELSE substr(email, 1, instr(email, '@') - 1) END FROM users`);
    const after = fingerprint(db, 'users_new');
    if (before.count !== after.count || before.hash !== after.hash) {
      throw new Error(`la copia de users no coincide (${before.count} → ${after.count} filas); no se sustituye la tabla`);
    }
    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_new RENAME TO users');

    db.exec(`
      CREATE TABLE user_settings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        sleep_goal_min INTEGER NOT NULL DEFAULT 480 CHECK (sleep_goal_min BETWEEN 240 AND 720),
        updated_at TEXT NOT NULL
      );
      INSERT INTO user_settings (user_id, updated_at) SELECT id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM users;

      CREATE TABLE invites (
        id INTEGER PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
        used_at TEXT,
        revoked_at TEXT
      );

      CREATE TABLE password_resets (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        used_at TEXT
      );
      CREATE INDEX idx_password_resets_user ON password_resets(user_id);

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL CHECK (action IN ('reset_link_created','password_reset')),
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_audit_user ON audit_log(user_id);
    `);

    // Nada se perdió en cascada al sustituir users
    DEPENDENT.forEach((t, i) => {
      const now = count(t);
      if (now !== countsBefore[i]) throw new Error(`${t} cambió al reconstruir users (${countsBefore[i]} → ${now} filas)`);
    });
  },
};
