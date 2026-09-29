const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api } = require('./helpers');

// Los tests de este archivo comparten la tabla de métricas y se ejecutan en orden.

test('una base nueva trae las 3 métricas iniciales en orden (US5-1, FR-025)', async () => {
  const { body } = await api.get('/api/metrics').expect(200);
  assert.deepEqual(
    body.map(({ name, type, unit, min_value, max_value, sort_order }) => ({ name, type, unit, min_value, max_value, sort_order })),
    [
      { name: 'Calidad del sueño', type: 'scale', unit: null, min_value: 1, max_value: 5, sort_order: 0 },
      { name: 'Energía al despertar', type: 'scale', unit: null, min_value: 1, max_value: 5, sort_order: 1 },
      { name: 'Cafés', type: 'number', unit: 'tazas', min_value: 0, max_value: null, sort_order: 2 },
    ],
  );
});

test('nombre vacío o tipo inválido → 400 (US5-2, FR-016)', async () => {
  let res = await api.post('/api/metrics').send({ name: '   ', type: 'text' }).expect(400);
  assert.equal(res.body.error, 'El nombre es obligatorio');
  res = await api.post('/api/metrics').send({ name: 'Ánimo', type: 'emoji' }).expect(400);
  assert.equal(res.body.error, 'type debe ser uno de: number, scale, boolean, text');
});

test('una escala necesita mínimo < máximo (US5-2, FR-017)', async () => {
  const msg = 'Una escala necesita mínimo y máximo (mínimo < máximo)';
  for (const body of [
    { name: 'A', type: 'scale' },
    { name: 'A', type: 'scale', min_value: 5, max_value: 5 },
    { name: 'A', type: 'scale', min_value: 5, max_value: 1 },
  ]) {
    const res = await api.post('/api/metrics').send(body).expect(400);
    assert.equal(res.body.error, msg);
  }
});

test('crear recorta nombre (60) y unidad (20) y usa el color por defecto si no es válido (FR-016)', async () => {
  const { body } = await api.post('/api/metrics').send({
    name: 'n'.repeat(80), type: 'number', unit: 'u'.repeat(30), color: 'rojo',
  }).expect(201);
  assert.equal(body.name.length, 60);
  assert.equal(body.unit.length, 20);
  assert.equal(body.color, '#5b6ee1');
  assert.equal(body.archived, 0);
});

test('crear acepta un color #RRGGBB válido', async () => {
  const { body } = await api.post('/api/metrics').send({ name: 'Leer', type: 'boolean', color: '#7fd3a8' }).expect(201);
  assert.equal(body.color, '#7fd3a8');
});

test('archivar oculta la métrica salvo con ?all=1, y restaurar la devuelve (US5-7, FR-018)', async () => {
  const { body: m } = await api.post('/api/metrics').send({ name: 'Archivable', type: 'text' }).expect(201);
  await api.put(`/api/metrics/${m.id}`).send({ archived: 1 }).expect(200);

  let active = (await api.get('/api/metrics').expect(200)).body;
  assert.ok(!active.some((x) => x.id === m.id));
  const all = (await api.get('/api/metrics').query({ all: '1' }).expect(200)).body;
  assert.equal(all.find((x) => x.id === m.id).archived, 1);

  await api.put(`/api/metrics/${m.id}`).send({ archived: 0 }).expect(200);
  active = (await api.get('/api/metrics').expect(200)).body;
  assert.ok(active.some((x) => x.id === m.id));
});

test('editar conserva los campos no enviados', async () => {
  const { body: m } = await api.post('/api/metrics').send({ name: 'Pasos', type: 'number', unit: 'k', color: '#6fc8de' }).expect(201);
  const { body } = await api.put(`/api/metrics/${m.id}`).send({ name: 'Pasos diarios' }).expect(200);
  assert.equal(body.name, 'Pasos diarios');
  assert.equal(body.unit, 'k');
  assert.equal(body.color, '#6fc8de');
});

test('sort_order persiste y define el orden (US5-6, FR-020)', async () => {
  const active = (await api.get('/api/metrics').expect(200)).body;
  const reversed = [...active].reverse();
  for (const [i, m] of reversed.entries()) {
    await api.put(`/api/metrics/${m.id}`).send({ sort_order: i }).expect(200);
  }
  const after = (await api.get('/api/metrics').expect(200)).body;
  assert.deepEqual(after.map((m) => m.id), reversed.map((m) => m.id));
});

test('editar o eliminar una métrica inexistente → 404', async () => {
  let res = await api.put('/api/metrics/9999').send({ name: 'x' }).expect(404);
  assert.equal(res.body.error, 'Métrica no encontrada');
  res = await api.delete('/api/metrics/9999').expect(404);
  assert.equal(res.body.error, 'Métrica no encontrada');
});
