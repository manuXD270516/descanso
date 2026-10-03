const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { api, db, iso, reset } = require('./helpers');

// Correcciones de deuda técnica de la feature 003 (US3).
beforeEach(reset);

const OPEN_MSG = 'Ya hay una noche abierta. Ciérrala antes de abrir otra.';

test('DT-02: /api/stats sin rango, con fecha inválida o invertido → 400 en español, nunca 500', async () => {
  for (const query of [{}, { from: '2026-09-01' }, { from: 'ayer', to: '2026-09-14' }, { from: '2026-09-14', to: '2026-09-01' }]) {
    const r = await api.get('/api/stats').query(query);
    assert.equal(r.status, 400, JSON.stringify(query));
    assert.match(r.body.error, /from|to/);
  }
  await api.get('/api/stats').query({ from: '2026-09-01', to: '2026-09-14' }).expect(200);
});

test('DT-03: from/to que no son fechas reales → 400 en noches, siestas y valores de métricas', async () => {
  for (const url of ['/api/sleep', '/api/naps', '/api/metrics/entries']) {
    await api.get(url).query({ from: '2026-02-30' }).expect(400);
    await api.get(url).query({ to: '2026-9-1' }).expect(400);
    await api.get(url).query({ from: '2026-09-14', to: '2026-09-01' }).expect(400);
    await api.get(url).query({ from: '2026-09-01', to: '2026-09-14' }).expect(200);
    await api.get(url).expect(200); // sin rango sigue permitido
  }
});

test('DT-04: la fecha de una noche debe ser el día local de su hora de dormir (crear)', async () => {
  const r = await api.post('/api/sleep').send({ date: '2026-09-06', bedtime: iso('2026-09-05T23:00') }).expect(400);
  assert.equal(r.body.error, 'La fecha de la noche debe ser 2026-09-05 (el día en que te acostaste)');
  // Acostarse pasada la medianoche: la fecha es la de ese día (principio III)
  await api.post('/api/sleep').send({ date: '2026-09-06', bedtime: iso('2026-09-06T00:30'), wake_time: iso('2026-09-06T07:00') }).expect(201);
  // La hora de pared manda, aunque en UTC sea otro día
  await api.post('/api/sleep').send({ date: '2026-09-07', bedtime: iso('2026-09-07T23:00', '-10:00'), wake_time: iso('2026-09-08T07:00', '-10:00') }).expect(201);
  await api.post('/api/sleep').send({ date: '2026-09-08', bedtime: 'Sep 8 2026 23:00' }).expect(400);
});

test('DT-04: al editar una noche se aplica la misma regla', async () => {
  const { body: n } = await api.post('/api/sleep').send({ date: '2026-09-05', bedtime: iso('2026-09-05T23:00'), wake_time: iso('2026-09-06T07:00') }).expect(201);
  const r = await api.put(`/api/sleep/${n.id}`).send({ bedtime: iso('2026-09-04T23:00') }).expect(400);
  assert.match(r.body.error, /2026-09-04/);
  await api.put(`/api/sleep/${n.id}`).send({ date: '2026-09-04', bedtime: iso('2026-09-04T23:00') }).expect(200);
});

test('DT-04: la fecha de una siesta debe ser el día local de su inicio (crear y editar)', async () => {
  const r = await api.post('/api/naps').send({ date: '2026-09-05', start_time: iso('2026-09-06T14:00'), end_time: iso('2026-09-06T14:30') }).expect(400);
  assert.equal(r.body.error, 'La fecha de la siesta debe ser 2026-09-06 (el día en que empezó)');
  const { body: nap } = await api.post('/api/naps').send({ date: '2026-09-06', start_time: iso('2026-09-06T14:00'), end_time: iso('2026-09-06T14:30') }).expect(201);
  await api.put(`/api/naps/${nap.id}`).send({ start_time: iso('2026-09-07T14:00'), end_time: iso('2026-09-07T14:30') }).expect(400);
});

test('FR-021: los datos antiguos incoherentes se conservan; editarlos sin corregir la fecha → 400', async () => {
  const id = db
    .prepare('INSERT INTO sleep_records (user_id, date, bedtime, wake_time, notes) VALUES (1,?,?,?,?)')
    .run('2026-09-06', iso('2026-09-05T23:00'), iso('2026-09-06T07:00'), 'antigua').lastInsertRowid;
  const before = db.prepare('SELECT * FROM sleep_records WHERE id = ?').get(id);
  await api.put(`/api/sleep/${id}`).send({ notes: 'editada' }).expect(400);
  assert.deepEqual(db.prepare('SELECT * FROM sleep_records WHERE id = ?').get(id), before);
  const list = await api.get('/api/sleep').expect(200);
  assert.ok(list.body.some((n) => n.id === Number(id)), 'se sigue listando');
});

test('DT-08: una métrica sí/no solo acepta valores sí o no', async () => {
  const { body: m } = await api.post('/api/metrics').send({ name: 'Ejercicio', type: 'boolean' }).expect(201);
  for (const value of ['quizá', 2, null, '', 'si']) {
    const r = await api.put(`/api/metrics/${m.id}/entries/2026-09-05`).send({ value });
    assert.equal(r.status, 400, JSON.stringify(value));
    assert.equal(r.body.error, 'El valor debe ser sí o no');
  }
  for (const [value, stored] of [[true, '1'], ['true', '1'], [1, '1'], ['1', '1'], [false, '0'], ['false', '0'], [0, '0'], ['0', '0']]) {
    const r = await api.put(`/api/metrics/${m.id}/entries/2026-09-05`).send({ value }).expect(200);
    assert.equal(r.body.value, stored, JSON.stringify(value));
  }
  await api.put(`/api/metrics/${m.id}/entries/2026-02-30`).send({ value: true }).expect(400);
});

test('FR-019: la base impide dos noches abiertas, también insertando directamente', () => {
  const ins = db.prepare('INSERT INTO sleep_records (user_id, date, bedtime) VALUES (1, ?, ?)');
  ins.run('2026-09-05', iso('2026-09-05T23:00'));
  assert.throws(() => ins.run('2026-09-06', iso('2026-09-06T23:00')), (e) => e.code === 'SQLITE_CONSTRAINT_UNIQUE');
});

test('FR-019: abrir o reabrir una segunda noche por la API → 409 con el mensaje de siempre', async () => {
  const { body: closed } = await api.post('/api/sleep').send({ date: '2026-09-04', bedtime: iso('2026-09-04T23:00'), wake_time: iso('2026-09-05T07:00') }).expect(201);
  await api.post('/api/sleep').send({ date: '2026-09-05', bedtime: iso('2026-09-05T23:00') }).expect(201);
  const r1 = await api.post('/api/sleep').send({ date: '2026-09-06', bedtime: iso('2026-09-06T23:00') }).expect(409);
  assert.equal(r1.body.error, OPEN_MSG);
  const r2 = await api.put(`/api/sleep/${closed.id}`).send({ wake_time: null }).expect(409);
  assert.equal(r2.body.error, OPEN_MSG);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM sleep_records WHERE wake_time IS NULL').get().c, 1);
});

test('SC-008: dos peticiones simultáneas para abrir noche → exactamente una abierta', async () => {
  const open = (d) => api.post('/api/sleep').send({ date: d, bedtime: iso(`${d}T23:00`) });
  const results = await Promise.all([open('2026-09-05'), open('2026-09-06')]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM sleep_records WHERE wake_time IS NULL').get().c, 1);
});
