const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrate } = require('../src/migrate');
const { migrationsUpTo } = require('./fixtures/migrations-up-to');
// Esquema de su momento: hasta la migración 002 (ver fixtures/migrations-up-to.js)
const DIR = migrationsUpTo(2);
const { openLegacy } = require('./fixtures/legacy-db');
const { makeLegacyDb } = require('./fixtures/make-legacy-db');

// Regla expand/contract (US2, FR-012, SC-006): tras migrar, la versión anterior del servicio
// (su inicializador y sus sentencias SQL, copiadas de master antes de 003) sigue funcionando.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'descanso-compat-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('la versión anterior arranca y opera sobre el esquema migrado', () => {
  const file = makeLegacyDb(path.join(tmp, 'sleep.db'));
  const m = new Database(file);
  migrate(m, { dir: DIR, log: { info() {}, warn() {} } });
  m.close();

  // "Rollback": la imagen anterior abre la base con su propio inicializador
  const db = openLegacy(file);
  try {
    // Noche: abrir (la versión anterior comprueba antes que no haya otra abierta) y cerrar
    const other = db.prepare('SELECT id FROM sleep_records WHERE wake_time IS NULL AND id IS NOT ? LIMIT 1').get(null);
    assert.equal(other, undefined);
    const night = db
      .prepare('INSERT INTO sleep_records (date, bedtime, wake_time, notes) VALUES (?,?,?,?)')
      .run('2026-09-28', '2026-09-28T23:00:00-04:00', null, null);
    const open = db.prepare('SELECT * FROM sleep_records WHERE wake_time IS NULL ORDER BY bedtime DESC LIMIT 1').get();
    assert.equal(open.id, night.lastInsertRowid);
    db.prepare('UPDATE sleep_records SET wake_time = ? WHERE id = ?').run('2026-09-29T07:00:00-04:00', open.id);
    db.prepare('UPDATE sleep_records SET date=?, bedtime=?, wake_time=?, notes=? WHERE id=?')
      .run('2026-09-28', '2026-09-28T22:45:00-04:00', '2026-09-29T07:00:00-04:00', 'editada', open.id);

    // Siesta
    db.prepare('INSERT INTO naps (date, start_time, end_time, notes) VALUES (?,?,?,?)')
      .run('2026-09-29', '2026-09-29T14:00:00-04:00', '2026-09-29T14:30:00-04:00', null);

    // Métricas: alta y upsert de un valor
    const metric = db
      .prepare('INSERT INTO metrics (name, type, unit, min_value, max_value, color, sort_order) VALUES (?,?,?,?,?,?,?)')
      .run('Pasos', 'number', null, 0, null, '#123456', 9);
    const upsert = db.prepare(
      `INSERT INTO metric_entries (metric_id, date, value) VALUES (?,?,?)
       ON CONFLICT(metric_id, date) DO UPDATE SET value = excluded.value`,
    );
    upsert.run(metric.lastInsertRowid, '2026-09-29', '100');
    upsert.run(metric.lastInsertRowid, '2026-09-29', '200');

    // Lecturas con rango, como /sleep, /naps, /metrics/entries y /stats
    assert.ok(db.prepare('SELECT * FROM sleep_records WHERE date >= ? AND date <= ? ORDER BY bedtime DESC').all('2026-09-01', '2026-09-30').length > 0);
    assert.ok(db.prepare('SELECT * FROM naps WHERE date >= ? AND date <= ? ORDER BY start_time DESC').all('2026-09-01', '2026-09-30').length > 0);
    const entries = db
      .prepare('SELECT e.* FROM metric_entries e JOIN metrics m ON m.id = e.metric_id WHERE 1=1 AND e.date >= ? AND e.date <= ? ORDER BY e.date DESC')
      .all('2026-09-29', '2026-09-29');
    assert.ok(entries.some((e) => e.value === '200'));
    assert.ok(db.prepare('SELECT * FROM sleep_records WHERE wake_time IS NOT NULL AND date >= ? AND date <= ?').all('2026-08-01', '2026-09-30').length > 0);

    // Borrados
    assert.equal(db.prepare('DELETE FROM naps WHERE date = ?').run('2026-09-29').changes, 1);
    assert.equal(db.prepare('DELETE FROM metric_entries WHERE metric_id = ? AND date = ?').run(metric.lastInsertRowid, '2026-09-29').changes, 1);

    // El inicializador anterior no duplicó las métricas iniciales
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM metrics WHERE name = 'Cafés'").get().c, 1);
  } finally {
    db.close();
  }
});

test('tras volver a la versión nueva, el esquema sigue en la última versión y no se reaplica nada', () => {
  const file = path.join(tmp, 'sleep.db');
  const db = new Database(file);
  const r = migrate(db, { dir: DIR, log: { info() {}, warn() {} } });
  db.close();
  assert.deepEqual(r.applied, []);
});
