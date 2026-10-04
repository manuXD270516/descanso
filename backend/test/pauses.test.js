const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { api, otherApi, db } = require('./helpers');
const { addDays } = require('../src/analytics');

// Modo pausa (feature 010, US4, FR-015…FR-017, SC-007): reglas validadas en el servidor.
const TODAY = new Date().toISOString().slice(0, 10);
const pause = (start, end, client = api) => client.post('/api/pauses').send({ start_date: start, end_date: end, today: TODAY });

beforeEach(() => db.exec('DELETE FROM pauses;'));

test('una pausa de hoy a dentro de 4 días (5 días) se guarda y aparece activa en el horario', async () => {
  const p = (await pause(TODAY, addDays(TODAY, 4)).expect(201)).body;
  assert.deepEqual([p.start_date, p.end_date], [TODAY, addDays(TODAY, 4)]);
  const s = (await api.get(`/api/schedule?date=${TODAY}`).expect(200)).body;
  assert.equal(s.pause.id, p.id);
  assert.equal((await api.get(`/api/schedule?date=${addDays(TODAY, 5)}`).expect(200)).body.pause, null);
  assert.equal((await api.get('/api/pauses').expect(200)).body.length, 1);
});

test('reglas: no empieza en el pasado, como máximo 14 días, sin solapes y 2 cada 30 días', async () => {
  let r = await pause(addDays(TODAY, -1), addDays(TODAY, 2)).expect(400);
  assert.equal(r.body.error, 'La pausa no puede empezar en el pasado');
  r = await pause(TODAY, addDays(TODAY, 14)).expect(400);
  assert.equal(r.body.error, 'La pausa dura como máximo 14 días');
  await pause(TODAY, addDays(TODAY, 13)).expect(201); // 14 días justos
  r = await pause(addDays(TODAY, 13), addDays(TODAY, 15)).expect(409);
  assert.equal(r.body.error, 'Se solapa con otra pausa');
  await pause(addDays(TODAY, 20), addDays(TODAY, 21)).expect(201);
  r = await pause(addDays(TODAY, 25), addDays(TODAY, 26)).expect(400);
  assert.equal(r.body.error, 'Solo puedes hacer 2 pausas cada 30 días');
  await pause(addDays(TODAY, 40), addDays(TODAY, 41)).expect(201); // fuera de la ventana de 30 días
  await pause(addDays(TODAY, 2), addDays(TODAY, 1)).expect(400);
  await api.post('/api/pauses').send({ start_date: TODAY, end_date: TODAY, today: addDays(TODAY, 5) }).expect(400);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM pauses').get().c, 3, '0 pausas inválidas guardadas');
});

test('terminar hoy una pausa activa; "terminar" una futura la cancela', async () => {
  const active = (await pause(TODAY, addDays(TODAY, 5)).expect(201)).body;
  const ended = (await api.post(`/api/pauses/${active.id}/end`).send({ today: TODAY }).expect(200)).body;
  assert.equal(ended.end_date, TODAY);
  const future = (await pause(addDays(TODAY, 30), addDays(TODAY, 31)).expect(201)).body;
  await api.post(`/api/pauses/${future.id}/end`).send({ today: TODAY }).expect(204);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM pauses WHERE id = ?').get(future.id).c, 0);
});

test('las pausas son por usuario: la de otra persona → 404 y no cuenta para sus reglas', async () => {
  const mine = (await pause(TODAY, addDays(TODAY, 3)).expect(201)).body;
  await otherApi.post(`/api/pauses/${mine.id}/end`).send({ today: TODAY }).expect(404);
  assert.deepEqual((await otherApi.get('/api/pauses').expect(200)).body, []);
  await pause(TODAY, addDays(TODAY, 3), otherApi).expect(201); // no se solapa con la de otra persona
});
