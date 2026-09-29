const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { api, iso, reset } = require('./helpers');

beforeEach(reset);

const night = (date, bed, wake, extra = {}) =>
  api.post('/api/sleep').send({ date, bedtime: iso(bed), wake_time: wake && iso(wake), ...extra });

test('registrar una noche pasada con despertar la crea cerrada con su duración (US2-1)', async () => {
  const res = await night('2026-09-01', '2026-09-01T23:00', '2026-09-02T06:45', { notes: 'bien' }).expect(201);
  assert.equal(res.body.date, '2026-09-01');
  assert.equal(res.body.duration_min, 465);
  assert.equal(res.body.notes, 'bien');
});

test('fecha u hora de dormir inválidas → 400', async () => {
  let res = await api.post('/api/sleep').send({ date: '01/09/2026', bedtime: iso('2026-09-01T23:00') }).expect(400);
  assert.equal(res.body.error, 'date debe tener formato YYYY-MM-DD');
  res = await api.post('/api/sleep').send({ date: '2026-09-01', bedtime: 'anoche' }).expect(400);
  assert.equal(res.body.error, 'bedtime debe ser una fecha/hora ISO válida');
});

test('crear con despertar no posterior a dormir → 400', async () => {
  const res = await night('2026-09-01', '2026-09-01T23:00', '2026-09-01T22:00').expect(400);
  assert.equal(res.body.error, 'La hora de despertar debe ser posterior a la de dormir');
});

test('editar solo las notas conserva las horas (US2-3)', async () => {
  const { body: created } = await night('2026-09-01', '2026-09-01T23:00', '2026-09-02T07:00').expect(201);
  const { body } = await api.put(`/api/sleep/${created.id}`).send({ notes: 'me desperté dos veces' }).expect(200);
  assert.equal(body.bedtime, created.bedtime);
  assert.equal(body.wake_time, created.wake_time);
  assert.equal(body.notes, 'me desperté dos veces');
});

test('editar horas recalcula la duración (US2-3)', async () => {
  const { body: created } = await night('2026-09-01', '2026-09-01T23:00', '2026-09-02T07:00').expect(201);
  const { body } = await api.put(`/api/sleep/${created.id}`).send({ wake_time: iso('2026-09-02T08:00') }).expect(200);
  assert.equal(body.duration_min, 540);
});

test('editar con despertar no posterior → 400 y el registro no cambia (US2-5)', async () => {
  const { body: created } = await night('2026-09-01', '2026-09-01T23:00', '2026-09-02T07:00').expect(201);
  await api.put(`/api/sleep/${created.id}`).send({ wake_time: iso('2026-09-01T22:00') }).expect(400);
  const { body: list } = await api.get('/api/sleep').expect(200);
  assert.equal(list[0].wake_time, created.wake_time);
});

test('editar o eliminar un id inexistente → 404', async () => {
  let res = await api.put('/api/sleep/9999').send({ notes: 'x' }).expect(404);
  assert.equal(res.body.error, 'Registro no encontrado');
  res = await api.delete('/api/sleep/9999').expect(404);
  assert.equal(res.body.error, 'Registro no encontrado');
});

test('eliminar una noche la quita de la lista (US2-4)', async () => {
  const { body: created } = await night('2026-09-01', '2026-09-01T23:00', '2026-09-02T07:00').expect(201);
  await api.delete(`/api/sleep/${created.id}`).expect(204);
  const { body: list } = await api.get('/api/sleep').expect(200);
  assert.equal(list.length, 0);
});

test('las notas se recortan a 500 caracteres y las vacías quedan en null (US2-6, FR-009)', async () => {
  const long = await night('2026-09-01', '2026-09-01T23:00', '2026-09-02T07:00', { notes: 'z'.repeat(600) }).expect(201);
  assert.equal(long.body.notes.length, 500);
  const empty = await night('2026-09-02', '2026-09-02T23:00', '2026-09-03T07:00', { notes: '' }).expect(201);
  assert.equal(empty.body.notes, null);
});

test('GET filtra por fecha de noche (inclusivo) y ordena por hora de dormir descendente', async () => {
  await night('2026-09-01', '2026-09-01T23:00', '2026-09-02T07:00').expect(201);
  await night('2026-09-02', '2026-09-02T23:00', '2026-09-03T07:00').expect(201);
  await night('2026-09-03', '2026-09-03T23:00', '2026-09-04T07:00').expect(201);
  const { body } = await api.get('/api/sleep').query({ from: '2026-09-02', to: '2026-09-03' }).expect(200);
  assert.deepEqual(body.map((r) => r.date), ['2026-09-03', '2026-09-02']);
});
