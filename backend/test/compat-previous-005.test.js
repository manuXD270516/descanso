const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrate } = require('../src/migrate');
const { migrationsUpTo } = require('./fixtures/migrations-up-to');
const { makeLegacyDb } = require('./fixtures/make-legacy-db');
const { legacy008 } = require('./fixtures/legacy-008-statements');

// Expand/contract (feature 005): el código de 008 funciona sobre el esquema de 005 (migraciones 006–007).
const DIR = migrationsUpTo(7);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'descanso-compat005-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('las sentencias de 008 (datos con user_id, alta, objetivo, borrado) operan sobre el esquema de 005', () => {
  const db = new Database(makeLegacyDb(path.join(tmp, 'sleep.db')));
  db.pragma('foreign_keys = ON');
  migrate(db, { dir: DIR, log: { info() {}, warn() {} } });
  const v8 = legacy008(db);
  try {
    const id = v8.createUser('b@x.com');
    assert.equal(v8.profile(id).sleep_goal_min, 420, 'una cuenta nueva creada por 008 recibe el nuevo valor por defecto');
    v8.createNight(id, '2026-09-30', '2026-09-30T23:00:00-04:00');
    v8.createNap(id, '2026-09-30');
    v8.seedMetric(id);
    v8.setGoal(id, 450);
    assert.equal(v8.profile(id).sleep_goal_min, 450);
    assert.equal(v8.deleteUser(id), 1);
    for (const t of ['sleep_records', 'naps', 'metrics', 'user_settings']) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE user_id = ?`).get(id).c, 0, t);
    }
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    db.close();
  }
});
