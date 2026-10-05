const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { api, otherApi, db, iso, reset } = require('./helpers');

// Tarjeta "¿Cómo fue la noche?" (feature 006, US5, FR-017…FR-019): dos respuestas opcionales por
// rangos, guardadas en la noche con PUT /api/sleep/:id (fusión parcial). NULL = sin respuesta.
let night;
beforeEach(async () => {
  reset();
  night = (await api.post('/api/sleep').send({ date: '2026-09-29', bedtime: iso('2026-09-29T23:00'), wake_time: iso('2026-09-30T07:00'), notes: 'nota' }).expect(201)).body;
});

test('una noche nueva no tiene respuestas (null, nunca 0)', () => {
  assert.equal(night.sol_bucket, null);
  assert.equal(night.awakenings_bucket, null);
});

test('cada respuesta se guarda sola sin tocar el resto de la noche; null la borra', async () => {
  let r = (await api.put(`/api/sleep/${night.id}`).send({ sol_bucket: '15_30' }).expect(200)).body;
  assert.deepEqual([r.sol_bucket, r.awakenings_bucket, r.notes, r.wake_time, r.duration_min], ['15_30', null, 'nota', night.wake_time, 480]);
  r = (await api.put(`/api/sleep/${night.id}`).send({ awakenings_bucket: '3plus' }).expect(200)).body;
  assert.deepEqual([r.sol_bucket, r.awakenings_bucket], ['15_30', '3plus']);
  r = (await api.put(`/api/sleep/${night.id}`).send({ sol_bucket: null }).expect(200)).body;
  assert.deepEqual([r.sol_bucket, r.awakenings_bucket], [null, '3plus']);
  // Editar horas o notas no borra las respuestas
  r = (await api.put(`/api/sleep/${night.id}`).send({ notes: 'otra' }).expect(200)).body;
  assert.equal(r.awakenings_bucket, '3plus');
});

test('todos los valores permitidos se aceptan; fuera de la lista → 400 "Respuesta no válida"', async () => {
  for (const v of ['lt15', '15_30', 'gt30']) await api.put(`/api/sleep/${night.id}`).send({ sol_bucket: v }).expect(200);
  for (const v of ['0', '1_2', '3plus']) await api.put(`/api/sleep/${night.id}`).send({ awakenings_bucket: v }).expect(200);
  for (const body of [{ sol_bucket: '15' }, { sol_bucket: 15 }, { sol_bucket: '' }, { awakenings_bucket: 0 }, { awakenings_bucket: 'tres' }]) {
    const res = await api.put(`/api/sleep/${night.id}`).send(body).expect(400);
    assert.equal(res.body.error, 'Respuesta no válida');
  }
  const row = db.prepare('SELECT sol_bucket, awakenings_bucket FROM sleep_records WHERE id = ?').get(night.id);
  assert.deepEqual(row, { sol_bucket: 'gt30', awakenings_bucket: '3plus' });
});

test('los listados y la noche abierta devuelven las dos columnas', async () => {
  await api.put(`/api/sleep/${night.id}`).send({ sol_bucket: 'lt15', awakenings_bucket: '0' }).expect(200);
  const list = (await api.get('/api/sleep').expect(200)).body;
  assert.deepEqual([list[0].sol_bucket, list[0].awakenings_bucket], ['lt15', '0']);
  await api.post('/api/sleep').send({ date: '2026-09-30', bedtime: iso('2026-09-30T23:00') }).expect(201);
  const open = (await api.get('/api/sleep/open').expect(200)).body;
  assert.ok('sol_bucket' in open && open.sol_bucket === null);
});

test('las respuestas en la noche de otra persona → 404 y sin cambios', async () => {
  await otherApi.put(`/api/sleep/${night.id}`).send({ sol_bucket: 'gt30' }).expect(404);
  assert.equal(db.prepare('SELECT sol_bucket FROM sleep_records WHERE id = ?').get(night.id).sol_bucket, null);
});

test('feature 010: cerrar la noche registra cuándo se anotó el despertar y si se confirmó la hora propuesta', async () => {
  await api.post('/api/sleep').send({ date: '2026-09-30', bedtime: iso('2026-09-30T23:00') }).expect(201);
  const t0 = Date.now();
  const closed = (await api.post('/api/sleep/wake').send({ wake_time: iso('2026-10-01T07:00'), from_proposal: true }).expect(200)).body;
  assert.ok(Math.abs(Date.parse(closed.wake_logged_at) - t0) < 5000, 'wake_logged_at ≈ ahora');
  assert.equal(closed.wake_from_proposal, 1);
  assert.ok(night.wake_logged_at, 'una noche pasada registrada a mano también guarda cuándo se anotó');

  await api.post('/api/sleep').send({ date: '2026-10-01', bedtime: iso('2026-10-01T23:00') }).expect(201);
  const plain = (await api.post('/api/sleep/wake').send({ wake_time: iso('2026-10-02T07:00') }).expect(200)).body;
  assert.equal(plain.wake_from_proposal, 0);

  await api.post('/api/sleep').send({ date: '2026-10-02', bedtime: iso('2026-10-02T23:00') }).expect(201);
  await api.post('/api/sleep/wake').send({ wake_time: iso('2026-10-03T07:00'), from_proposal: 'sí' }).expect(400);
  // Cerrar con PUT (editar la noche abierta y ponerle despertar) también registra el momento
  const open = (await api.get('/api/sleep/open').expect(200)).body;
  assert.equal(open.wake_logged_at, null);
  const viaPut = (await api.put(`/api/sleep/${open.id}`).send({ wake_time: iso('2026-10-03T07:00') }).expect(200)).body;
  assert.ok(viaPut.wake_logged_at);
  assert.equal(viaPut.wake_from_proposal, 0);
  // Editar notas no cambia cuándo se anotó
  const again = (await api.put(`/api/sleep/${open.id}`).send({ notes: 'x' }).expect(200)).body;
  assert.equal(again.wake_logged_at, viaPut.wake_logged_at);
});
