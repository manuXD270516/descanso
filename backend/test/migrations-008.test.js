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

// Migración 008 (feature 006): ajustes de ciclo y respuestas de la tarjeta, solo expand.
let tmp;
const silent = { info() {}, warn() {} };
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'descanso-m008-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const PREVIOUS = ['id', 'user_id', 'date', 'bedtime', 'wake_time', 'notes', 'created_at'];
const hashPrevious = (db) =>
  crypto.createHash('sha256').update(JSON.stringify(db.prepare(`SELECT ${PREVIOUS.join(', ')} FROM sleep_records ORDER BY id`).raw().all())).digest('hex');

/** Base legacy migrada hasta 007, con una segunda persona y noches de ambas. */
function upTo007() {
  const db = new Database(makeLegacyDb(path.join(tmp, `${crypto.randomUUID()}.db`)));
  db.pragma('foreign_keys = ON');
  migrate(db, { dir: migrationsUpTo(7), log: silent });
  db.prepare("INSERT INTO users (id, email, role, created_at) VALUES (2, 'b@x.com', 'user', 'x')").run();
  db.prepare("INSERT INTO user_settings (user_id, sleep_goal_min, goal_customized, updated_at) VALUES (2, 450, 1, 'x')").run();
  db.prepare("INSERT INTO sleep_records (user_id, date, bedtime, wake_time) VALUES (2, '2026-09-29', '2026-09-29T23:00:00-04:00', '2026-09-30T07:00:00-04:00')").run();
  db.prepare("INSERT INTO sleep_records (user_id, date, bedtime) VALUES (2, '2026-09-30', '2026-09-30T23:00:00-04:00')").run();
  return db;
}

test('008: ajustes de ciclo 90/15 en las filas existentes, con sus rangos', () => {
  const db = upTo007();
  migrate(db, { log: silent });
  assert.deepEqual(db.prepare('SELECT user_id, cycle_min, latency_min, sleep_goal_min, goal_customized FROM user_settings ORDER BY user_id').all(), [
    { user_id: 1, cycle_min: 90, latency_min: 15, sleep_goal_min: 420, goal_customized: 0 },
    { user_id: 2, cycle_min: 90, latency_min: 15, sleep_goal_min: 450, goal_customized: 1 },
  ]);
  for (const v of [69, 111]) assert.throws(() => db.prepare('UPDATE user_settings SET cycle_min = ? WHERE user_id = 1').run(v), /CHECK/);
  for (const v of [-1, 61]) assert.throws(() => db.prepare('UPDATE user_settings SET latency_min = ? WHERE user_id = 1').run(v), /CHECK/);
  db.prepare('UPDATE user_settings SET cycle_min = 70, latency_min = 0 WHERE user_id = 1').run();
  db.prepare('UPDATE user_settings SET cycle_min = 110, latency_min = 60 WHERE user_id = 1').run();
  db.close();
});

test('008: respuestas de la noche NULL en las noches existentes, sin alterar el resto', () => {
  const db = upTo007();
  const before = hashPrevious(db);
  const count = db.prepare('SELECT COUNT(*) AS c FROM sleep_records').get().c;
  migrate(db, { log: silent });
  assert.equal(hashPrevious(db), before, 'columnas previas intactas');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM sleep_records').get().c, count);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM sleep_records WHERE sol_bucket IS NOT NULL OR awakenings_bucket IS NOT NULL').get().c, 0);
  assert.deepEqual(db.pragma('foreign_key_check'), []);

  const id = db.prepare('SELECT id FROM sleep_records WHERE user_id = 2 AND wake_time IS NOT NULL').get().id;
  for (const v of ['lt15', '15_30', 'gt30', null]) db.prepare('UPDATE sleep_records SET sol_bucket = ? WHERE id = ?').run(v, id);
  for (const v of ['0', '1_2', '3plus', null]) db.prepare('UPDATE sleep_records SET awakenings_bucket = ? WHERE id = ?').run(v, id);
  for (const v of ['15', 'otro', '']) assert.throws(() => db.prepare('UPDATE sleep_records SET sol_bucket = ? WHERE id = ?').run(v, id), /CHECK/);
  for (const v of ['1', '3', 'tres']) assert.throws(() => db.prepare('UPDATE sleep_records SET awakenings_bucket = ? WHERE id = ?').run(v, id), /CHECK/);
  db.close();
});

test('008: el up es idempotente (columnas ya presentes)', () => {
  const db = upTo007();
  migrate(db, { log: silent });
  const mod = require('../src/migrations/008_ciclos_y_diario');
  assert.doesNotThrow(() => mod.up(db));
  const cols = db.prepare('PRAGMA table_info(sleep_records)').all().map((c) => c.name);
  assert.equal(cols.filter((c) => c === 'sol_bucket').length, 1);
  db.close();
});
