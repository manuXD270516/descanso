const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrate } = require('../src/migrate');
const { makeLegacyDb } = require('./fixtures/make-legacy-db');
const { legacy003 } = require('./fixtures/legacy-003-statements');

// Expand/contract (US4, FR-020, SC-004): el código de 003 funciona sobre el esquema de 004.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'descanso-compat004-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('las sentencias de 003 operan sobre el esquema de 004 y lo que crean va al propietario', () => {
  const file = makeLegacyDb(path.join(tmp, 'sleep.db'));
  const db = new Database(file);
  db.pragma('foreign_keys = ON'); // como en db.js de 003
  migrate(db, { log: { info() {}, warn() {} } });
  const v3 = legacy003(db);

  try {
    // Noches: abrir, rechazar la segunda con 409 (como 003), cerrar, editar, borrar
    const id = v3.createNight({ date: '2026-09-29', bedtime: '2026-09-29T23:00:00-04:00' });
    assert.equal(v3.openNight().id, id);
    assert.throws(() => v3.createNight({ date: '2026-09-30', bedtime: '2026-09-30T23:00:00-04:00' }), (e) => e.status === 409);
    v3.wake(id, '2026-09-30T07:00:00-04:00');
    const closed = v3.createNight({ date: '2026-09-27', bedtime: '2026-09-27T23:00:00-04:00', wake_time: '2026-09-28T07:00:00-04:00' });
    v3.createNight({ date: '2026-09-30', bedtime: '2026-09-30T23:00:00-04:00' }); // otra abierta
    assert.throws(() => v3.updateNight(closed, { date: '2026-09-27', bedtime: '2026-09-27T23:00:00-04:00', wake_time: null }), (e) => e.status === 409);
    v3.updateNight(closed, { date: '2026-09-27', bedtime: '2026-09-27T22:30:00-04:00', wake_time: '2026-09-28T07:00:00-04:00', notes: 'editada' });
    assert.ok(v3.listNights('2026-09-01', '2026-09-30').length >= 3);
    assert.ok(v3.statsNights('2026-09-01', '2026-09-30').length >= 2);
    assert.equal(v3.deleteNight(closed), 1);

    // Siestas
    const nap = v3.createNap({ date: '2026-09-30', start_time: '2026-09-30T14:00:00-04:00', end_time: '2026-09-30T14:30:00-04:00' });
    assert.equal(v3.listNaps('2026-09-30', '2026-09-30').length, 1);

    // Métricas y valores (borrar una métrica borra sus valores en cascada, como en 003)
    const m = v3.createMetric({ name: 'Pasos', type: 'number', min_value: 0 });
    v3.updateMetric(m, 'Pasos diarios');
    v3.upsertEntry(m, '2026-09-30', '100');
    v3.upsertEntry(m, '2026-09-30', '200');
    assert.ok(v3.listEntries('2026-09-30', '2026-09-30').some((e) => e.value === '200'));
    assert.equal(v3.deleteMetric(m), 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM metric_entries WHERE metric_id = ?').get(m).c, 0);

    // Todo lo creado por 003 quedó asociado al propietario
    assert.equal(db.prepare('SELECT user_id FROM sleep_records WHERE id = ?').get(id).user_id, 1);
    assert.equal(db.prepare('SELECT user_id FROM naps WHERE id = ?').get(nap).user_id, 1);
    for (const t of ['sleep_records', 'naps', 'metrics']) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE user_id IS NOT 1`).get().c, 0, t);
    }
  } finally {
    db.close();
  }
});
