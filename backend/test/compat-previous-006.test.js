const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrate } = require('../src/migrate');
const { migrationsUpTo } = require('./fixtures/migrations-up-to');
const { makeLegacyDb } = require('./fixtures/make-legacy-db');
const { legacy005 } = require('./fixtures/legacy-005-statements');

// Expand/contract (feature 006): el código de 005 funciona sobre el esquema de 006 (migración 008).
const DIR = migrationsUpTo(8);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'descanso-compat006-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('las sentencias de 005 (alta, noche, objetivo, bienvenida, exportar, borrar) operan sobre el esquema de 006', () => {
  const db = new Database(makeLegacyDb(path.join(tmp, 'sleep.db')));
  db.pragma('foreign_keys = ON');
  migrate(db, { dir: DIR, log: { info() {}, warn() {} } });
  const v5 = legacy005(db);
  try {
    const id = v5.createUser('b@x.com');
    assert.equal(db.prepare('SELECT cycle_min, latency_min FROM user_settings WHERE user_id = ?').get(id).cycle_min, 90, 'la fila creada por 005 toma los valores por defecto');
    const night = v5.createNight(id, '2026-09-30', '2026-09-30T23:00:00-04:00');
    assert.equal(v5.setWake(id, night, '2026-10-01T07:00:00-04:00'), 1);
    db.prepare("UPDATE sleep_records SET sol_bucket = '15_30' WHERE id = ?").run(night); // respuesta guardada por 006
    assert.equal(v5.updateNight(id, night, { date: '2026-09-30', bedtime: '2026-09-30T23:30:00-04:00', wake_time: '2026-10-01T07:00:00-04:00', notes: 'ok' }), 1);
    assert.equal(db.prepare('SELECT sol_bucket FROM sleep_records WHERE id = ?').get(night).sol_bucket, '15_30', 'editar desde 005 no borra la respuesta');
    assert.equal(v5.night(id, night).notes, 'ok');
    v5.createNap(id, '2026-09-30');
    v5.setGoal(id, 450);
    v5.completeOnboarding(id);
    assert.equal(v5.profile(id).sleep_goal_min, 450);
    assert.ok(v5.profile(id).onboarded_at);
    assert.equal(v5.exportNights(id).length, 1);
    assert.equal(v5.deleteUser(id), 1);
    for (const t of ['sleep_records', 'naps', 'user_settings']) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE user_id = ?`).get(id).c, 0, t);
    }
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    db.close();
  }
});
