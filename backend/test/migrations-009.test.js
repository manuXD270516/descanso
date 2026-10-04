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

// Migración 009 (feature 010): horario versionado, pausas, aviso previo y registro del despertar.
let tmp;
const silent = { info() {}, warn() {} };
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'descanso-m009-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const PREVIOUS = ['id', 'user_id', 'date', 'bedtime', 'wake_time', 'notes', 'sol_bucket', 'awakenings_bucket', 'created_at'];
const hashPrevious = (db) =>
  crypto.createHash('sha256').update(JSON.stringify(db.prepare(`SELECT ${PREVIOUS.join(', ')} FROM sleep_records ORDER BY id`).raw().all())).digest('hex');

/** Base legacy migrada hasta 008, con una segunda persona y noches de ambas. */
function upTo008() {
  const db = new Database(makeLegacyDb(path.join(tmp, `${crypto.randomUUID()}.db`)));
  db.pragma('foreign_keys = ON');
  migrate(db, { dir: migrationsUpTo(8), log: silent });
  db.prepare("INSERT INTO users (id, email, role, created_at) VALUES (2, 'b@x.com', 'user', 'x')").run();
  db.prepare("INSERT INTO user_settings (user_id, updated_at) VALUES (2, 'x')").run();
  db.prepare("INSERT INTO sleep_records (user_id, date, bedtime, wake_time, sol_bucket) VALUES (2, '2026-09-29', '2026-09-29T23:00:00-04:00', '2026-09-30T07:00:00-04:00', '15_30')").run();
  return db;
}

test('009: tablas del horario y de pausas con sus restricciones', () => {
  const db = upTo008();
  migrate(db, { log: silent });
  const v = db.prepare("INSERT INTO schedule_versions (user_id, effective_from, created_at) VALUES (2, '2026-10-04', 'x')").run().lastInsertRowid;
  db.prepare('INSERT INTO schedule_days (version_id, weekday, bed_min, wake_min, active) VALUES (?, 0, 1395, 420, 1)').run(v);
  for (const [weekday, bed, wake, active] of [[7, 0, 0, 1], [1, 1440, 0, 1], [2, 0, -1, 1], [3, 0, 0, 2]]) {
    assert.throws(() => db.prepare('INSERT INTO schedule_days VALUES (?, ?, ?, ?, ?)').run(v, weekday, bed, wake, active), /CHECK/);
  }
  assert.throws(() => db.prepare('INSERT INTO schedule_days VALUES (?, 0, 0, 0, 1)').run(v), /UNIQUE|PRIMARY/);
  // Varias versiones el mismo día están permitidas: la vigente es la última (repo/schedule.js)
  db.prepare("INSERT INTO schedule_versions (user_id, effective_from, created_at) VALUES (2, '2026-10-04', 'x')").run();
  db.prepare("INSERT INTO pauses (user_id, start_date, end_date, created_at) VALUES (2, '2026-10-05', '2026-10-09', 'x')").run();
  assert.throws(() => db.prepare("INSERT INTO pauses (user_id, start_date, end_date, created_at) VALUES (2, '2026-10-09', '2026-10-05', 'x')").run(), /CHECK/);

  // Borrar la cuenta borra versiones, días y pausas (CASCADE)
  db.prepare('DELETE FROM users WHERE id = 2').run();
  for (const t of ['schedule_versions', 'schedule_days', 'pauses']) assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c, 0, t);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  db.close();
});

test('009: aviso previo de 30 min y despertar sin registro previo, sin alterar las noches', () => {
  const db = upTo008();
  const before = hashPrevious(db);
  migrate(db, { log: silent });
  assert.equal(hashPrevious(db), before);
  assert.deepEqual(db.prepare('SELECT DISTINCT lead_min FROM user_settings').all(), [{ lead_min: 30 }]);
  for (const v of [14, 61]) assert.throws(() => db.prepare('UPDATE user_settings SET lead_min = ? WHERE user_id = 2').run(v), /CHECK/);
  assert.deepEqual(db.prepare('SELECT DISTINCT wake_logged_at, wake_from_proposal FROM sleep_records').all(), [{ wake_logged_at: null, wake_from_proposal: 0 }]);
  db.close();
});

test('009: el up es idempotente', () => {
  const db = upTo008();
  migrate(db, { log: silent });
  assert.doesNotThrow(() => require('../src/migrations/009_horario').up(db));
  db.close();
});
