const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { api, db, reset } = require('./helpers');

// Métricas iniciales: 1 = "Calidad del sueño" (escala 1–5), 3 = "Cafés" (número, mínimo 0)
const QUALITY = 1;
const COFFEE = 3;
const DAY = '2026-09-08';

beforeEach(reset);

const setValue = (id, value, date = DAY) => api.put(`/api/metrics/${id}/entries/${date}`).send({ value });
const entries = (from = DAY, to = DAY) => api.get('/api/metrics/entries').query({ from, to }).expect(200).then((r) => r.body);

test('guardar dos veces el mismo día reemplaza el valor: uno por métrica y día (FR-021)', async () => {
  await setValue(QUALITY, 3).expect(200);
  const { body } = await setValue(QUALITY, 4).expect(200);
  assert.equal(body.value, '4');
  const list = await entries();
  assert.equal(list.filter((e) => e.metric_id === QUALITY).length, 1);
});

test('los valores respetan mínimo y máximo (US5-4, FR-022)', async () => {
  let res = await setValue(COFFEE, -1).expect(400);
  assert.equal(res.body.error, 'Mínimo 0');
  res = await setValue(QUALITY, 6).expect(400);
  assert.equal(res.body.error, 'Máximo 5');
  res = await setValue(COFFEE, 'abc').expect(400);
  assert.equal(res.body.error, 'El valor debe ser numérico');
  await setValue(COFFEE, 2).expect(200);
});

test('sí/no se guarda como "1" o "0" (US5-5)', async () => {
  const { body: m } = await api.post('/api/metrics').send({ name: 'Ejercicio', type: 'boolean' }).expect(201);
  assert.equal((await setValue(m.id, true).expect(200)).body.value, '1');
  assert.equal((await setValue(m.id, false).expect(200)).body.value, '0');
});

test('los textos se recortan a 500 caracteres (FR-022)', async () => {
  const { body: m } = await api.post('/api/metrics').send({ name: 'Diario', type: 'text' }).expect(201);
  const { body } = await setValue(m.id, 'x'.repeat(600)).expect(200);
  assert.equal(body.value.length, 500);
});

test('fecha inválida → 400 y métrica inexistente → 404', async () => {
  let res = await setValue(QUALITY, 3, 'mañana').expect(400);
  assert.equal(res.body.error, 'Fecha inválida');
  res = await setValue(9999, 3).expect(404);
  assert.equal(res.body.error, 'Métrica no encontrada');
});

test('borrar el valor del día → 204; si no existe → 404 (US5-3)', async () => {
  await setValue(QUALITY, 3).expect(200);
  await api.delete(`/api/metrics/${QUALITY}/entries/${DAY}`).expect(204);
  const res = await api.delete(`/api/metrics/${QUALITY}/entries/${DAY}`).expect(404);
  assert.equal(res.body.error, 'Registro no encontrado');
});

test('GET /entries filtra por rango y excluye métricas archivadas (FR-018)', async () => {
  const { body: m } = await api.post('/api/metrics').send({ name: 'Temporal', type: 'number' }).expect(201);
  await setValue(m.id, 1).expect(200);
  await setValue(QUALITY, 4).expect(200);
  await setValue(QUALITY, 2, '2026-08-01').expect(200);
  await api.put(`/api/metrics/${m.id}`).send({ archived: 1 }).expect(200);

  const list = await entries('2026-09-02', DAY);
  assert.deepEqual(list.map((e) => [e.metric_id, e.date]), [[QUALITY, DAY]]);
});

test('eliminar una métrica elimina también todos sus valores (US5-8, FR-019)', async () => {
  const { body: m } = await api.post('/api/metrics').send({ name: 'Borrable', type: 'number' }).expect(201);
  await setValue(m.id, 1, '2026-09-07').expect(200);
  await setValue(m.id, 2, DAY).expect(200);
  await api.delete(`/api/metrics/${m.id}`).expect(204);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM metric_entries WHERE metric_id = ?').get(m.id).c, 0);
});
