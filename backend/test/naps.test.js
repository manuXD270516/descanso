const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { api, iso, reset } = require('./helpers');

beforeEach(reset);

const nap = (start, end, extra = {}) =>
  api.post('/api/naps').send({ date: start.slice(0, 10), start_time: iso(start), end_time: iso(end), ...extra });

test('crear una siesta devuelve su duración (US3)', async () => {
  const res = await nap('2026-09-08T14:00', '2026-09-08T14:30', { notes: 'después del almuerzo' }).expect(201);
  assert.equal(res.body.duration_min, 30);
  assert.equal(res.body.date, '2026-09-08');
  assert.equal(res.body.notes, 'después del almuerzo');
});

test('fin igual o anterior al inicio → 400 (US3-2, FR-010)', async () => {
  const res = await nap('2026-09-08T14:00', '2026-09-08T14:00').expect(400);
  assert.equal(res.body.error, 'La siesta debe terminar después de empezar');
});

test('horas no ISO o fecha inválida → 400', async () => {
  let res = await api.post('/api/naps').send({ date: '2026-09-08', start_time: 'luego', end_time: iso('2026-09-08T14:30') }).expect(400);
  assert.equal(res.body.error, 'start_time y end_time deben ser ISO');
  res = await api.post('/api/naps').send({ date: '8/9', start_time: iso('2026-09-08T14:00'), end_time: iso('2026-09-08T14:30') }).expect(400);
  assert.equal(res.body.error, 'date debe tener formato YYYY-MM-DD');
});

test('editar solo el fin conserva el resto y recalcula la duración (US3-5)', async () => {
  const { body: created } = await nap('2026-09-08T14:00', '2026-09-08T14:30', { notes: 'n' }).expect(201);
  const { body } = await api.put(`/api/naps/${created.id}`).send({ end_time: iso('2026-09-08T15:00') }).expect(200);
  assert.equal(body.start_time, created.start_time);
  assert.equal(body.notes, 'n');
  assert.equal(body.duration_min, 60);
});

test('editar o eliminar una siesta inexistente → 404', async () => {
  let res = await api.put('/api/naps/9999').send({ notes: 'x' }).expect(404);
  assert.equal(res.body.error, 'Siesta no encontrada');
  res = await api.delete('/api/naps/9999').expect(404);
  assert.equal(res.body.error, 'Siesta no encontrada');
});

test('eliminar una siesta → 204 (US3-5)', async () => {
  const { body: created } = await nap('2026-09-08T14:00', '2026-09-08T14:30').expect(201);
  await api.delete(`/api/naps/${created.id}`).expect(204);
  const { body } = await api.get('/api/naps').expect(200);
  assert.equal(body.length, 0);
});

test('GET filtra por fecha (inclusivo) y ordena por inicio descendente (FR-012)', async () => {
  await nap('2026-08-09T14:00', '2026-08-09T14:20').expect(201);
  await nap('2026-09-07T13:00', '2026-09-07T13:20').expect(201);
  await nap('2026-09-07T17:00', '2026-09-07T17:45').expect(201);
  const { body } = await api.get('/api/naps').query({ from: '2026-08-10', to: '2026-09-08' }).expect(200);
  assert.deepEqual(body.map((n) => n.start_time), [iso('2026-09-07T17:00'), iso('2026-09-07T13:00')]);
});
