const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { api, iso, reset } = require('./helpers');

const OPEN_CONFLICT = 'Ya hay una noche abierta. Ciérrala antes de abrir otra.';

beforeEach(reset);

const goToSleep = (local = '2026-09-07T23:40', offset = '-04:00') =>
  api.post('/api/sleep').send({ date: local.slice(0, 10), bedtime: iso(local, offset) });

// --- US1: caracterización del comportamiento existente ---

test('crear una noche sin despertar la deja abierta (US1-1)', async () => {
  const res = await goToSleep().expect(201);
  assert.equal(res.body.date, '2026-09-07');
  assert.equal(res.body.wake_time, null);
  assert.equal(res.body.duration_min, null);
});

test('GET /api/sleep/open devuelve la noche abierta, o null si no hay (US1-2)', async () => {
  const none = await api.get('/api/sleep/open').expect(200);
  assert.equal(none.body, null);

  const created = await goToSleep().expect(201);
  const open = await api.get('/api/sleep/open').expect(200);
  assert.equal(open.body.id, created.body.id);
});

test('cerrar la noche: 23:40 → 07:10 son 450 min y la fecha es la del lunes (US1-3, US1-6)', async () => {
  await goToSleep('2026-09-07T23:40').expect(201);
  const res = await api.post('/api/sleep/wake').send({ wake_time: iso('2026-09-08T07:10') }).expect(200);
  assert.equal(res.body.duration_min, 450);
  assert.equal(res.body.date, '2026-09-07');

  const open = await api.get('/api/sleep/open').expect(200);
  assert.equal(open.body, null);
});

test('despertar igual o anterior a dormir se rechaza y la noche sigue abierta (US1-4)', async () => {
  await goToSleep('2026-09-07T23:40').expect(201);
  for (const wake of ['2026-09-07T23:40', '2026-09-07T22:00']) {
    const res = await api.post('/api/sleep/wake').send({ wake_time: iso(wake) }).expect(400);
    assert.equal(res.body.error, 'La hora de despertar debe ser posterior a la de dormir');
  }
  const open = await api.get('/api/sleep/open').expect(200);
  assert.notEqual(open.body, null);
});

test('cerrar sin noche abierta → 404 (US1-5)', async () => {
  const res = await api.post('/api/sleep/wake').send({ wake_time: iso('2026-09-08T07:10') }).expect(404);
  assert.equal(res.body.error, 'No hay una noche abierta para cerrar');
});

test('wake_time no ISO → 400', async () => {
  await goToSleep().expect(201);
  const res = await api.post('/api/sleep/wake').send({ wake_time: 'mañana' }).expect(400);
  assert.equal(res.body.error, 'wake_time debe ser ISO');
});

// --- FR-003: una sola noche abierta, garantizada por el servicio ---

test('con una noche abierta, crear otra sin despertar → 409 (FR-003, US1-7)', async () => {
  await goToSleep('2026-09-07T23:40').expect(201);
  const res = await goToSleep('2026-09-08T23:10').expect(409);
  assert.equal(res.body.error, OPEN_CONFLICT);

  const all = await api.get('/api/sleep').expect(200);
  assert.equal(all.body.filter((r) => r.wake_time === null).length, 1);
});

test('con una noche abierta, reabrir otra al editarla → 409 y no cambia (FR-003)', async () => {
  const closed = await api.post('/api/sleep').send({
    date: '2026-09-06', bedtime: iso('2026-09-06T23:00'), wake_time: iso('2026-09-07T07:00'),
  }).expect(201);
  await goToSleep('2026-09-07T23:40').expect(201);

  const res = await api.put(`/api/sleep/${closed.body.id}`).send({ wake_time: null }).expect(409);
  assert.equal(res.body.error, OPEN_CONFLICT);

  const all = await api.get('/api/sleep').expect(200);
  const same = all.body.find((r) => r.id === closed.body.id);
  assert.equal(same.wake_time, closed.body.wake_time);
});

test('editar la propia noche abierta dejando wake_time en null se permite (FR-003)', async () => {
  const open = await goToSleep().expect(201);
  const res = await api.put(`/api/sleep/${open.body.id}`).send({ wake_time: null, notes: 'sin sueño' }).expect(200);
  assert.equal(res.body.wake_time, null);
  assert.equal(res.body.notes, 'sin sueño');
});

test('con una noche abierta, crear una noche ya cerrada sí se permite (FR-003)', async () => {
  await goToSleep('2026-09-07T23:40').expect(201);
  await api.post('/api/sleep').send({
    date: '2026-09-05', bedtime: iso('2026-09-05T23:00'), wake_time: iso('2026-09-06T06:30'),
  }).expect(201);
});

test('sin noches abiertas, reabrir una noche cerrada se permite (FR-003)', async () => {
  const closed = await api.post('/api/sleep').send({
    date: '2026-09-06', bedtime: iso('2026-09-06T23:00'), wake_time: iso('2026-09-07T07:00'),
  }).expect(201);
  const res = await api.put(`/api/sleep/${closed.body.id}`).send({ wake_time: null }).expect(200);
  assert.equal(res.body.wake_time, null);
});
