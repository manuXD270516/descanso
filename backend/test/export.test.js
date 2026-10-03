const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { api, anon, db, iso } = require('./helpers');
const { migrate } = require('../src/migrate');
const { importExport } = require('./fixtures/import-export');

// Exportar mis datos (US5, FR-022…FR-024, SC-007).

function seed() {
  db.prepare('INSERT INTO sleep_records (user_id, date, bedtime, wake_time, notes) VALUES (1,?,?,?,?)')
    .run('2026-09-05', iso('2026-09-05T23:00'), iso('2026-09-06T07:00'), 'dormí, "bien", y\ndesperté una vez');
  db.prepare('INSERT INTO sleep_records (user_id, date, bedtime) VALUES (1,?,?)').run('2026-09-06', iso('2026-09-06T23:30'));
  db.prepare('INSERT INTO naps (user_id, date, start_time, end_time) VALUES (1,?,?,?)').run('2026-09-06', iso('2026-09-06T14:00'), iso('2026-09-06T14:30'));
  db.prepare('INSERT INTO metric_entries (metric_id, date, value) VALUES (1, ?, ?), (3, ?, ?)').run('2026-09-06', '4', '2026-09-06', '2');
}

test('JSON versionado con todas las colecciones y sin credenciales (FR-022, FR-024)', async () => {
  seed();
  const res = await api.get('/api/export.json').expect(200);
  assert.match(res.headers['content-disposition'], /^attachment; filename="descanso-\d{4}-\d{2}-\d{2}\.json"$/);
  const j = res.body;
  assert.equal(j.format, 'descanso-export');
  assert.equal(j.version, 1);
  assert.ok(!Number.isNaN(Date.parse(j.exported_at)));
  assert.deepEqual([j.sleep_records.length, j.naps.length, j.metrics.length, j.metric_entries.length], [2, 1, 3, 2]);
  const text = JSON.stringify(j);
  for (const secret of ['password', 'session', 'token', 'scrypt$', 'users', 'user_id']) assert.ok(!text.includes(secret), secret);
});

test('con el JSON se reconstruye una base vacía con los mismos recuentos (SC-007)', async () => {
  const j = (await api.get('/api/export.json').expect(200)).body;
  const fresh = new Database(':memory:');
  fresh.pragma('foreign_keys = ON');
  migrate(fresh, { log: { info() {}, warn() {} } });
  importExport(fresh, j);
  // Recuentos del propietario (id 1) en la base de origen: la exportación es por usuario (feature 008)
  const ownerCount = {
    sleep_records: 'SELECT COUNT(*) AS c FROM sleep_records WHERE user_id = 1',
    naps: 'SELECT COUNT(*) AS c FROM naps WHERE user_id = 1',
    metrics: 'SELECT COUNT(*) AS c FROM metrics WHERE user_id = 1',
    metric_entries: 'SELECT COUNT(*) AS c FROM metric_entries e JOIN metrics m ON m.id = e.metric_id WHERE m.user_id = 1',
  };
  for (const table of Object.keys(ownerCount)) {
    assert.equal(fresh.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c, j[table].length, table);
    assert.equal(fresh.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c, db.prepare(ownerCount[table]).get().c, table);
  }
  assert.deepEqual(fresh.prepare('SELECT notes FROM sleep_records WHERE date = ?').get('2026-09-05'), { notes: 'dormí, "bien", y\ndesperté una vez' });
  fresh.close();
});

test('un CSV por tipo: BOM, cabeceras en español, RFC 4180 y una fila por registro (FR-023)', async () => {
  const expected = { noches: ['id,fecha_noche,hora_dormir,hora_despertar,notas,creado,tiempo_dormirse,despertares', 2], siestas: ['id,fecha,inicio,fin,notas,creado', 1], metricas: ['id,nombre,tipo,unidad,minimo,maximo,color,orden,archivada,creado', 3], valores: ['id,metrica_id,fecha,valor,creado', 2] };
  for (const [tipo, [header, count]] of Object.entries(expected)) {
    const res = await api.get(`/api/export/${tipo}.csv`).buffer(true).parse((r, cb) => { let d = ''; r.setEncoding('utf8'); r.on('data', (c) => (d += c)); r.on('end', () => cb(null, d)); }).expect(200);
    assert.match(res.headers['content-type'], /^text\/csv; charset=utf-8/);
    assert.match(res.headers['content-disposition'], new RegExp(`filename="descanso-${tipo}-\\d{4}-\\d{2}-\\d{2}\\.csv"`));
    assert.ok(res.body.startsWith('\uFEFF'), 'BOM');
    const lines = res.body.slice(1).trimEnd().split('\r\n');
    assert.equal(lines[0], header);
    if (tipo !== 'noches') assert.equal(lines.length - 1, count, tipo);
  }
  const noches = (await api.get('/api/export/noches.csv').buffer(true).parse((r, cb) => { let d = ''; r.setEncoding('utf8'); r.on('data', (c) => (d += c)); r.on('end', () => cb(null, d)); })).body;
  assert.ok(noches.includes('"dormí, ""bien"", y\ndesperté una vez"'), 'comillas, comas y saltos escapados');
  assert.ok(noches.includes('2026-09-06T23:30:00-04:00,,'), 'noche abierta: despertar vacío');
});

test('tipo desconocido → 404; sin sesión → 401', async () => {
  await api.get('/api/export/usuarios.csv').expect(404);
  await anon.get('/api/export.json').expect(401);
  await anon.get('/api/export/noches.csv').expect(401);
});

test('10 años de datos se exportan en menos de 5 s', async () => {
  db.exec('DELETE FROM sleep_records; DELETE FROM metric_entries;');
  const ins = db.prepare('INSERT INTO sleep_records (user_id, date, bedtime, wake_time) VALUES (1,?,?,?)');
  const ent = db.prepare('INSERT INTO metric_entries (metric_id, date, value) VALUES (?,?,?)');
  db.transaction(() => {
    for (let i = 0; i < 3650; i++) {
      const d = new Date(Date.UTC(2016, 9, 1 + i)).toISOString().slice(0, 10);
      ins.run(d, `${d}T23:00:00-04:00`, `${d}T23:59:00-04:00`);
      for (const m of [1, 2, 3]) ent.run(m, d, '3');
    }
  })();
  const t0 = performance.now();
  const res = await api.get('/api/export.json').expect(200);
  assert.equal(res.body.sleep_records.length, 3650);
  assert.ok(performance.now() - t0 < 5000);
});

test('las respuestas de la tarjeta se exportan: códigos en JSON, rangos legibles al final del CSV (feature 006, FR-019)', async () => {
  db.exec('DELETE FROM sleep_records; DELETE FROM naps; DELETE FROM metric_entries;');
  seed();
  db.prepare("UPDATE sleep_records SET sol_bucket = 'gt30', awakenings_bucket = '1_2' WHERE date = '2026-09-05' AND user_id = 1").run();
  const j = (await api.get('/api/export.json').expect(200)).body;
  const answered = j.sleep_records.find((n) => n.date === '2026-09-05');
  const open = j.sleep_records.find((n) => n.date === '2026-09-06');
  assert.deepEqual([answered.sol_bucket, answered.awakenings_bucket], ['gt30', '1_2']);
  assert.deepEqual([open.sol_bucket, open.awakenings_bucket], [null, null]);

  const csv = (await api.get('/api/export/noches.csv').buffer(true).parse((r, cb) => { let d = ''; r.setEncoding('utf8'); r.on('data', (c) => (d += c)); r.on('end', () => cb(null, d)); })).body;
  const lines = csv.slice(1).trimEnd().split('\r\n');
  assert.ok(lines.some((l) => l.endsWith(',>30,1-2')), 'rangos legibles al final');
  assert.ok(lines.some((l) => l.startsWith(`${open.id},2026-09-06`) && l.endsWith(',,')), 'sin respuesta: vacío');
});
