const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrate } = require('../src/migrate');
const { migrationsUpTo } = require('./fixtures/migrations-up-to');
const { makeLegacyDb } = require('./fixtures/make-legacy-db');
const { legacy006 } = require('./fixtures/legacy-006-statements');

// Expand/contract (feature 010): el código de 006 funciona sobre el esquema de 010 (migración 009).
const DIR = migrationsUpTo(9);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'descanso-compat010-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('las sentencias de 006 (alta, noche, despertar, respuestas, ciclo, exportar, borrar) operan sobre el esquema de 010', () => {
  const db = new Database(makeLegacyDb(path.join(tmp, 'sleep.db')));
  db.pragma('foreign_keys = ON');
  migrate(db, { dir: DIR, log: { info() {}, warn() {} } });
  const v6 = legacy006(db);
  try {
    const id = v6.createUser('b@x.com');
    assert.equal(db.prepare('SELECT lead_min FROM user_settings WHERE user_id = ?').get(id).lead_min, 30, 'la fila creada por 006 toma el aviso por defecto');
    const night = v6.createNight(id, '2026-09-30', '2026-09-30T23:00:00-04:00');
    assert.equal(v6.setWake(id, night, '2026-10-01T07:00:00-04:00'), 1);
    db.prepare("UPDATE sleep_records SET wake_logged_at = '2026-10-01T12:00:00.000Z', wake_from_proposal = 1 WHERE id = ?").run(night); // lo escribe 010
    assert.equal(v6.updateNight(id, night, { date: '2026-09-30', bedtime: '2026-09-30T23:00:00-04:00', wake_time: '2026-10-01T07:00:00-04:00', sol_bucket: 'lt15' }), 1);
    const row = db.prepare('SELECT wake_logged_at, wake_from_proposal FROM sleep_records WHERE id = ?').get(night);
    assert.deepEqual(row, { wake_logged_at: '2026-10-01T12:00:00.000Z', wake_from_proposal: 1 }, 'editar desde 006 no borra lo de 010');
    assert.equal(v6.night(id, night).sol_bucket, 'lt15');
    v6.setCycleSettings(id, 100, 20);
    assert.equal(v6.profile(id).cycle_min, 100);
    const v = db.prepare("INSERT INTO schedule_versions (user_id, effective_from, created_at) VALUES (?, '2026-10-04', 'x')").run(id).lastInsertRowid;
    db.prepare('INSERT INTO schedule_days VALUES (?, 0, 1395, 420, 1)').run(v);
    db.prepare("INSERT INTO pauses (user_id, start_date, end_date, created_at) VALUES (?, '2026-10-05', '2026-10-06', 'x')").run(id);
    assert.equal(v6.exportNights(id).length, 1);
    assert.equal(v6.deleteUser(id), 1, 'borrar la cuenta desde 006 arrastra el horario y las pausas');
    for (const t of ['sleep_records', 'user_settings', 'schedule_versions', 'pauses']) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE user_id = ?`).get(id).c, 0, t);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM schedule_days').get().c, 0);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    db.close();
  }
});
