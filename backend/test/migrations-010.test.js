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

// Migración 010 (feature 011): ajustes de la racha en user_settings y constelaciones.
let tmp;
const silent = { info() {}, warn() {} };
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'descanso-m010-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const fingerprint = (db, table, cols) =>
  crypto.createHash('sha256').update(JSON.stringify(db.prepare(`SELECT ${cols.join(', ')} FROM ${table} ORDER BY 1`).raw().all())).digest('hex');
const SETTINGS = ['user_id', 'sleep_goal_min', 'cycle_min', 'latency_min', 'lead_min', 'updated_at'];
const NIGHTS = ['id', 'user_id', 'date', 'bedtime', 'wake_time', 'notes', 'sol_bucket', 'awakenings_bucket', 'wake_logged_at', 'wake_from_proposal', 'created_at'];

/** Base legacy migrada hasta 009, con una segunda persona, su horario y una noche. */
function upTo009() {
  const db = new Database(makeLegacyDb(path.join(tmp, `${crypto.randomUUID()}.db`)));
  db.pragma('foreign_keys = ON');
  migrate(db, { dir: migrationsUpTo(9), log: silent });
  db.prepare("INSERT INTO users (id, email, role, created_at) VALUES (2, 'b@x.com', 'user', 'x')").run();
  db.prepare("INSERT INTO user_settings (user_id, updated_at) VALUES (2, 'x')").run();
  db.prepare("INSERT INTO sleep_records (user_id, date, bedtime, wake_time, wake_from_proposal) VALUES (2, '2026-09-29', '2026-09-29T23:00:00-04:00', '2026-09-30T07:00:00-04:00', 1)").run();
  return db;
}

test('010: columnas de la racha con sus valores por defecto y restricciones', () => {
  const db = upTo009();
  const before = [fingerprint(db, 'user_settings', SETTINGS), fingerprint(db, 'sleep_records', NIGHTS)];
  migrate(db, { log: silent });
  assert.deepEqual([fingerprint(db, 'user_settings', SETTINGS), fingerprint(db, 'sleep_records', NIGHTS)], before);
  const rows = db.prepare(`SELECT streak_enabled, streak_margin_min, streak_since, streak_offered_at, streak_best, streak_total,
    streak_total_base, streak_summary_dismissed FROM user_settings`).all();
  assert.ok(rows.length >= 1);
  for (const r of rows) {
    assert.deepEqual(r, { streak_enabled: 0, streak_margin_min: 30, streak_since: null, streak_offered_at: null, streak_best: 0, streak_total: 0, streak_total_base: 0, streak_summary_dismissed: null });
  }
  for (const [col, v] of [['streak_enabled', 2], ['streak_margin_min', 14], ['streak_margin_min', 61], ['streak_best', -1], ['streak_total', -1], ['streak_total_base', -1]]) {
    assert.throws(() => db.prepare(`UPDATE user_settings SET ${col} = ? WHERE user_id = 2`).run(v), /CHECK/, col);
  }
  db.close();
});

test('010: constelaciones con clave válida, una por persona y borradas con la cuenta', () => {
  const db = upTo009();
  migrate(db, { log: silent });
  const add = (key, spread = 10) =>
    db.prepare("INSERT INTO streak_achievements (user_id, key, achieved_on, wake_spread_min, created_at) VALUES (2, ?, '2026-10-05', ?, 'x')").run(key, spread);
  add(7);
  assert.throws(() => add(7), /UNIQUE/);
  assert.throws(() => add(8), /CHECK/);
  assert.throws(() => add(21, -1), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO streak_achievements (user_id, key, wake_spread_min, created_at) VALUES (2, 21, 5, 'x')").run(), /NOT NULL/);
  db.prepare('DELETE FROM users WHERE id = 2').run();
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM streak_achievements').get().c, 0);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  db.close();
});

test('010: el up es idempotente', () => {
  const db = upTo009();
  migrate(db, { log: silent });
  assert.doesNotThrow(() => require('../src/migrations/010_rachas').up(db));
  db.close();
});
