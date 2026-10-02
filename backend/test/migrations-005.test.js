const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrate } = require('../src/migrate');
const { makeLegacyDb } = require('./fixtures/make-legacy-db');

// Migración 005 (feature 008): users reconstruida con roles y perfil, y tablas nuevas.
let tmp;
const silent = { info() {}, warn() {} };
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'descanso-m005-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** Base legacy migrada hasta 004, con el propietario dado de alta y una sesión, y luego hasta 005. */
function migrated() {
  const file = makeLegacyDb(path.join(tmp, `${crypto.randomUUID()}.db`));
  const dir004 = path.join(tmp, `m-${crypto.randomUUID()}`);
  fs.mkdirSync(dir004);
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'src', 'migrations')).filter((f) => Number(f.slice(0, 3)) <= 4)) {
    fs.copyFileSync(path.join(__dirname, '..', 'src', 'migrations', f), path.join(dir004, f));
  }
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  migrate(db, { dir: dir004, log: silent });
  db.prepare("UPDATE users SET email = 'Ana.Perez@ejemplo.com', password_hash = 'scrypt$x' WHERE id = 1").run();
  db.prepare("INSERT INTO sessions (id_hash, user_id, created_at, last_seen_at, expires_at) VALUES ('h', 1, 'a', 'a', '2099-01-01')").run();
  const usersBefore = db.prepare('SELECT id, email, password_hash, role, created_at FROM users ORDER BY id').all();
  const counts = (d) => Object.fromEntries(['sessions', 'sleep_records', 'naps', 'metrics', 'metric_entries'].map((t) => [t, d.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c]));
  const countsBefore = counts(db);
  migrate(db, { log: silent }); // aplica 005 con el directorio real
  return { db, usersBefore, countsBefore, counts };
}

test('users se conserva, admite el rol "user" y el propietario recibe nombre visible y objetivo de 8 h', () => {
  const { db, usersBefore, countsBefore, counts } = migrated();
  assert.deepEqual(db.prepare('SELECT id, email, password_hash, role, created_at FROM users ORDER BY id').all(), usersBefore);
  assert.deepEqual(counts(db), countsBefore, 'sin cascadas al sustituir users');
  assert.equal(db.prepare('SELECT display_name FROM users WHERE id = 1').get().display_name, 'Ana.Perez');
  assert.deepEqual(db.prepare('SELECT user_id, sleep_goal_min FROM user_settings').all(), [{ user_id: 1, sleep_goal_min: 480 }]);
  assert.deepEqual(db.pragma('foreign_key_check'), []);

  db.prepare("INSERT INTO users (id, email, role, created_at) VALUES (2, 'b@x.com', 'user', 'x')").run();
  assert.throws(() => db.prepare("INSERT INTO users (id, email, role, created_at) VALUES (3, 'c@x.com', 'admin', 'x')").run(), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO users (id, email, role, created_at) VALUES (4, 'B@X.COM', 'user', 'x')").run(), /UNIQUE/, 'email NOCASE');
  assert.throws(() => db.prepare('INSERT INTO user_settings (user_id, sleep_goal_min, updated_at) VALUES (2, 239, ?)').run('x'), /CHECK/);
  db.close();
});

test('tablas nuevas con sus FK: borrar un usuario borra en cascada lo suyo y anula el actor en la auditoría', () => {
  const { db } = migrated();
  db.prepare("INSERT INTO users (id, email, role, created_at) VALUES (2, 'b@x.com', 'user', 'x')").run();
  db.prepare("INSERT INTO invites (token_hash, created_by, created_at, expires_at, used_by, used_at) VALUES ('t', 1, 'x', 'y', 2, 'z')").run();
  db.prepare("INSERT INTO password_resets (token_hash, user_id, created_by, expires_at) VALUES ('r', 2, 1, 'y')").run();
  db.prepare("INSERT INTO audit_log (user_id, actor_user_id, action, created_at) VALUES (2, 1, 'reset_link_created', 'x')").run();
  assert.throws(() => db.prepare("INSERT INTO audit_log (user_id, action, created_at) VALUES (2, 'otra', 'x')").run(), /CHECK/);
  db.prepare('DELETE FROM users WHERE id = 2').run();
  for (const t of ['invites', 'password_resets', 'audit_log']) assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c, 0, t);
  db.close();
});
