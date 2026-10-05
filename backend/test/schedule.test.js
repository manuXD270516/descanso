const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { api, otherApi, anon, db, OTHER_ID } = require('./helpers');
const { addDays } = require('../src/analytics');

// Horario versionado y archivo de calendario (feature 010, US1/US2, FR-003…FR-010).
const TODAY = new Date().toISOString().slice(0, 10);
const day = (weekday, bed = 1395, wake = 420, active = true) => ({ weekday, bed_min: bed, wake_min: wake, active });
const WEEK = [0, 1, 2, 3, 4, 5, 6].map((w) => day(w));

beforeEach(() => {
  db.exec('DELETE FROM schedule_versions; DELETE FROM pauses;');
  db.prepare('UPDATE user_settings SET lead_min = 30').run();
});

test('sin horario: version null, aviso de 30 min y sin pausa', async () => {
  const r = (await api.get(`/api/schedule?date=${TODAY}`).expect(200)).body;
  assert.deepEqual(r, { version: null, lead_min: 30, pause: null });
});

test('guardar crea una versión vigente desde hoy; guardar otra vez hoy deja vigente la última (id nuevo) sin borrar la anterior', async () => {
  const v1 = (await api.put('/api/schedule').send({ today: TODAY, days: WEEK }).expect(200)).body;
  assert.equal(v1.effective_from, TODAY);
  assert.equal(v1.days.length, 7);
  assert.deepEqual(v1.days[0], { weekday: 0, bed_min: 1395, wake_min: 420, active: true });
  const v2 = (await api.put('/api/schedule').send({ today: TODAY, days: WEEK.map((d) => ({ ...d, wake_min: 450 })) }).expect(200)).body;
  assert.ok(v2.id > v1.id, 'id nuevo: el SEQUENCE del calendario crece');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM schedule_versions WHERE user_id = 1').get().c, 2, 'el historial no se borra');
  const cur = (await api.get(`/api/schedule?date=${TODAY}`).expect(200)).body.version;
  assert.equal(cur.days[3].wake_min, 450);
});

test('una versión de otro día no cambia el pasado: cada fecha ve su versión', async () => {
  const yesterday = addDays(TODAY, -1);
  // versión de ayer sembrada directamente (la API solo acepta "hoy")
  const id = db.prepare('INSERT INTO schedule_versions (user_id, effective_from, created_at) VALUES (1, ?, ?)').run(addDays(TODAY, -10), 'x').lastInsertRowid;
  for (const d of WEEK) db.prepare('INSERT INTO schedule_days VALUES (?, ?, ?, ?, 1)').run(id, d.weekday, 1380, 400);
  await api.put('/api/schedule').send({ today: TODAY, days: WEEK }).expect(200);
  assert.equal((await api.get(`/api/schedule?date=${yesterday}`).expect(200)).body.version.days[0].wake_min, 400);
  assert.equal((await api.get(`/api/schedule?date=${TODAY}`).expect(200)).body.version.days[0].wake_min, 420);
  assert.equal((await api.get(`/api/schedule?date=${addDays(TODAY, -30)}`).expect(200)).body.version, null);
});

test('validación: 7 días distintos, minutos en rango, hoy cercano a la fecha del servidor', async () => {
  const bad = [
    { today: TODAY, days: WEEK.slice(0, 6) },
    { today: TODAY, days: [...WEEK.slice(0, 6), day(0)] },
    { today: TODAY, days: WEEK.map((d, i) => (i === 2 ? { ...d, bed_min: 1440 } : d)) },
    { today: TODAY, days: WEEK.map((d, i) => (i === 2 ? { ...d, wake_min: -1 } : d)) },
    { today: TODAY, days: WEEK.map((d, i) => (i === 2 ? { ...d, active: 'sí' } : d)) },
    { today: addDays(TODAY, 3), days: WEEK },
    { today: 'ayer', days: WEEK },
  ];
  for (const body of bad) await api.put('/api/schedule').send(body).expect(400);
  await api.get('/api/schedule?date=no').expect(400);
  await anon.get(`/api/schedule?date=${TODAY}`).expect(401);
});

test('es por usuario: el horario de una persona no aparece para la otra', async () => {
  await api.put('/api/schedule').send({ today: TODAY, days: WEEK }).expect(200);
  assert.equal((await otherApi.get(`/api/schedule?date=${TODAY}`).expect(200)).body.version, null);
  await otherApi.get(`/api/schedule.ics?today=${TODAY}`).expect(404);
});

test('GET /api/schedule.ics: archivo del horario vigente, con su aviso, UID propio y descarga', async () => {
  await api.put('/api/schedule').send({ today: TODAY, days: WEEK.map((d) => (d.weekday === 3 ? { ...d, active: false } : d)) }).expect(200);
  const res = await api.get(`/api/schedule.ics?today=${TODAY}`).buffer(true).parse((r, cb) => { let d = ''; r.setEncoding('utf8'); r.on('data', (c) => (d += c)); r.on('end', () => cb(null, d)); }).expect(200);
  assert.match(res.headers['content-type'], /^text\/calendar; charset=utf-8/);
  assert.equal(res.headers['content-disposition'], 'attachment; filename="descanso-horario.ics"');
  assert.equal((res.body.match(/BEGIN:VEVENT/g) ?? []).length, 6, 'el miércoles nunca estuvo activo: no se emite');
  assert.match(res.body, /UID:sched-1-0@descanso-sleep\.fly\.dev/);
  assert.match(res.body, /TRIGGER:-PT30M/);
  assert.match(res.body, /URL:http:\/\/127\.0\.0\.1:\d+\/#noche|URL:http:\/\/[^/\r]+\/#noche/);

  // Quitar el lunes en una versión de mañana no es posible por API; se simula con otra versión de hoy:
  await api.put('/api/me').send({ lead_min: 45 }).expect(200);
  await api.put('/api/schedule').send({ today: TODAY, days: WEEK.map((d) => (d.weekday === 1 ? { ...d, active: false } : d)) }).expect(200);
  const v2 = (await api.get(`/api/schedule.ics?today=${TODAY}`).buffer(true).parse((r, cb) => { let d = ''; r.setEncoding('utf8'); r.on('data', (c) => (d += c)); r.on('end', () => cb(null, d)); })).body;
  assert.match(v2, /TRIGGER:-PT45M/);
  assert.match(v2, /SUMMARY:Descanso: en 45 min es tu hora de dormir/);
  assert.equal((v2.match(/BEGIN:VEVENT/g) ?? []).length, 7, 'el miércoles vuelve y el lunes quitado sale cancelado');
  assert.match(v2, /UID:sched-1-1@descanso-sleep\.fly\.dev\r\nSEQUENCE:\d+[\s\S]*?STATUS:CANCELLED/);
});

test('sin horario, el .ics responde 404 "No tienes horario"', async () => {
  const r = await api.get(`/api/schedule.ics?today=${TODAY}`).expect(404);
  assert.equal(r.body.error, 'No tienes horario');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM schedule_versions WHERE user_id = ?').get(OTHER_ID).c, 0);
});
