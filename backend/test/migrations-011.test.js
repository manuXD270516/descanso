const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrate } = require('../src/migrate');
const { migrationsUpTo } = require('./fixtures/migrations-up-to');
const { makeLegacyDb } = require('./fixtures/make-legacy-db');

// Migración 011 (feature 013): dispositivos con avisos, registro de entregas y preferencias de avisos.
let tmp;
const silent = { info() {}, warn() {} };
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'descanso-m011-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const fingerprint = (db, table, cols) =>
  crypto.createHash('sha256').update(JSON.stringify(db.prepare(`SELECT ${cols.join(', ')} FROM ${table} ORDER BY 1`).raw().all())).digest('hex');
const SETTINGS = [
  'user_id', 'sleep_goal_min', 'cycle_min', 'latency_min', 'lead_min', 'updated_at', 'streak_enabled', 'streak_margin_min',
  'streak_since', 'streak_best', 'streak_total',
];
const KEY = 'B'.repeat(87);
const AUTH = 'a'.repeat(22);

/** Base legacy migrada hasta 010, con dos personas y una sesión de cada una. */
function upTo010() {
  const db = new Database(makeLegacyDb(path.join(tmp, `${crypto.randomUUID()}.db`)));
  db.pragma('foreign_keys = ON');
  migrate(db, { dir: migrationsUpTo(10), log: silent });
  db.prepare("INSERT INTO users (id, email, role, created_at) VALUES (2, 'b@x.com', 'user', 'x')").run();
  db.prepare("INSERT INTO user_settings (user_id, updated_at) VALUES (2, 'x')").run();
  for (const [hash, user] of [['sa', 1], ['sb', 2], ['sb2', 2]]) {
    db.prepare("INSERT INTO sessions (id_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, 'x', 'x', '2099-01-01T00:00:00Z')").run(hash, user);
  }
  return db;
}

const addDevice = (db, user, session, endpoint, extra = {}) =>
  db.prepare('INSERT INTO push_subscriptions (user_id, session_hash, endpoint, p256dh, auth, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(user, session, endpoint, extra.p256dh ?? KEY, 'auth' in extra ? extra.auth : AUTH, 'Chrome en Android', 'x');

test('011: push_subscriptions con sus restricciones e índices', () => {
  const db = upTo010();
  const before = fingerprint(db, 'user_settings', SETTINGS);
  migrate(db, { log: silent });
  assert.equal(fingerprint(db, 'user_settings', SETTINGS), before, 'las columnas previas conservan su huella');
  addDevice(db, 2, 'sb', 'https://fcm.googleapis.com/fcm/send/1');
  assert.throws(() => addDevice(db, 2, 'sb', 'https://fcm.googleapis.com/fcm/send/1'), /UNIQUE/);
  assert.throws(() => addDevice(db, 2, 'sb', `https://fcm.googleapis.com/${'x'.repeat(1010)}`), /CHECK/);
  assert.throws(() => addDevice(db, 2, 'sb', 'https://fcm.googleapis.com/2', { auth: null }), /NOT NULL/);
  assert.throws(() => addDevice(db, 2, 'no-existe', 'https://fcm.googleapis.com/3'), /FOREIGN KEY/);
  const cols = Object.fromEntries(db.prepare('PRAGMA table_info(push_subscriptions)').all().map((c) => [c.name, c]));
  for (const c of ['user_id', 'session_hash', 'endpoint', 'p256dh', 'auth', 'label', 'created_at']) assert.equal(cols[c].notnull, 1, c);
  assert.equal(cols.last_success_at.notnull, 0);
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'push_subscriptions'").all().map((r) => r.name);
  assert.ok(idx.includes('idx_push_subscriptions_user') && idx.includes('idx_push_subscriptions_session'));
  db.close();
});

test('011: reminder_deliveries con clave primaria, tipos, estados y motivos válidos', () => {
  const db = upTo010();
  migrate(db, { log: silent });
  const add = (kind, night, status, reason = null) =>
    db.prepare('INSERT INTO reminder_deliveries (user_id, kind, night_date, due_at, status, reason, updated_at) VALUES (2, ?, ?, ?, ?, ?, ?)')
      .run(kind, night, '2026-10-05T22:45:00+02:00', status, reason, 'x');
  add('prepare', '2026-10-05', 'claimed');
  assert.throws(() => add('prepare', '2026-10-05', 'sent'), /UNIQUE|PRIMARY/);
  add('bedtime', '2026-10-05', 'skipped', 'late');
  assert.throws(() => add('otro', '2026-10-05', 'sent'), /CHECK/);
  assert.throws(() => add('wake_check', '2026-10-05', 'hecho'), /CHECK/);
  assert.throws(() => add('wake_check', '2026-10-05', 'failed', 'raro'), /CHECK/);
  for (const reason of ['late', 'night_open', 'muted', 'dnd', 'expired', 'timeout', 'error', 'no_devices', 'interrupted']) {
    db.prepare('DELETE FROM reminder_deliveries').run();
    assert.doesNotThrow(() => add('wake_check', '2026-10-06', 'failed', reason), reason);
  }
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'reminder_deliveries'").all().map((r) => r.name);
  assert.ok(idx.includes('idx_reminder_deliveries_updated'));
  db.close();
});

test('011: columnas de preferencias con sus valores por defecto y restricciones', () => {
  const db = upTo010();
  migrate(db, { log: silent });
  const rows = db.prepare('SELECT push_prepare, push_bedtime, push_wake_check, dnd_start_min, dnd_end_min, muted_until FROM user_settings').all();
  assert.ok(rows.length >= 1);
  for (const r of rows) assert.deepEqual(r, { push_prepare: 1, push_bedtime: 1, push_wake_check: 1, dnd_start_min: null, dnd_end_min: null, muted_until: null });
  for (const [col, v] of [['push_prepare', 2], ['push_bedtime', -1], ['push_wake_check', 5], ['dnd_start_min', 1440], ['dnd_end_min', -1]]) {
    assert.throws(() => db.prepare(`UPDATE user_settings SET ${col} = ? WHERE user_id = 2`).run(v), /CHECK/, col);
  }
  assert.doesNotThrow(() => db.prepare('UPDATE user_settings SET dnd_start_min = 0, dnd_end_min = 1439 WHERE user_id = 2').run());
  db.close();
});

test('011: CASCADE: la cuenta borra dispositivos y entregas; una sesión borra solo su dispositivo', () => {
  const db = upTo010();
  migrate(db, { log: silent });
  addDevice(db, 2, 'sb', 'https://fcm.googleapis.com/fcm/send/b1');
  addDevice(db, 2, 'sb2', 'https://fcm.googleapis.com/fcm/send/b2');
  addDevice(db, 1, 'sa', 'https://fcm.googleapis.com/fcm/send/a1');
  db.prepare("INSERT INTO reminder_deliveries (user_id, kind, night_date, due_at, status, updated_at) VALUES (2, 'prepare', '2026-10-05', 'x', 'sent', 'x')").run();
  db.prepare("DELETE FROM sessions WHERE id_hash = 'sb'").run();
  assert.deepEqual(db.prepare('SELECT endpoint FROM push_subscriptions ORDER BY id').all().map((r) => r.endpoint),
    ['https://fcm.googleapis.com/fcm/send/b2', 'https://fcm.googleapis.com/fcm/send/a1']);
  db.prepare('DELETE FROM users WHERE id = 2').run();
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM push_subscriptions').get().c, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM reminder_deliveries').get().c, 0);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  db.close();
});

test('011: el up es idempotente', () => {
  const db = upTo010();
  migrate(db, { log: silent });
  assert.doesNotThrow(() => require('../src/migrations/011_avisos_push').up(db));
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  db.close();
});
