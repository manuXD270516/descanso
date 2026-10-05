const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { api, otherApi, db, iso, OTHER_ID } = require('./helpers');

// Suite de aislamiento de dos usuarios (feature 008, SC-001, constitución v2.0.0):
// A = propietario (api), B = invitada (otherApi). B nunca ve, cambia ni borra nada de A.
const A_ID = 1;
const ROUTERS = {
  '/api/sleep': require('../src/routes/sleep'),
  '/api/naps': require('../src/routes/naps'),
  '/api/metrics': require('../src/routes/metrics'),
  '/api/stats': require('../src/routes/stats'),
  '/api': require('../src/routes/export'),
  '/api/': require('../src/routes/schedule'), // feature 010 (montado en /api; clave distinta para el mapa)
  '/api/streak': require('../src/routes/streak'), // feature 011
};

/** Huella de todas las filas de A (por sus tablas y hijas). */
function fingerprintOf(userId) {
  const q = (sql) => db.prepare(sql).all(userId);
  const rows = {
    sleep: q('SELECT * FROM sleep_records WHERE user_id = ? ORDER BY id'),
    naps: q('SELECT * FROM naps WHERE user_id = ? ORDER BY id'),
    metrics: q('SELECT * FROM metrics WHERE user_id = ? ORDER BY id'),
    entries: q('SELECT e.* FROM metric_entries e JOIN metrics m ON m.id = e.metric_id WHERE m.user_id = ? ORDER BY e.id'),
    schedule: q('SELECT v.*, d.* FROM schedule_versions v JOIN schedule_days d ON d.version_id = v.id WHERE v.user_id = ? ORDER BY v.id, d.weekday'),
    pauses: q('SELECT * FROM pauses WHERE user_id = ? ORDER BY id'),
    settings: q('SELECT * FROM user_settings WHERE user_id = ?'),
    achievements: q('SELECT * FROM streak_achievements WHERE user_id = ? ORDER BY id'),
  };
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

const A = {};
before(async () => {
  db.exec('DELETE FROM sleep_records; DELETE FROM naps; DELETE FROM metric_entries;');
  A.closed = (await api.post('/api/sleep').send({ date: '2026-09-05', bedtime: iso('2026-09-05T23:00'), wake_time: iso('2026-09-06T07:00'), notes: 'de A' }).expect(201)).body;
  A.open = (await api.post('/api/sleep').send({ date: '2026-09-07', bedtime: iso('2026-09-07T23:30') }).expect(201)).body;
  A.nap = (await api.post('/api/naps').send({ date: '2026-09-06', start_time: iso('2026-09-06T14:00'), end_time: iso('2026-09-06T14:30') }).expect(201)).body;
  A.metric = (await api.get('/api/metrics').expect(200)).body[0];
  A.date = '2026-09-06';
  await api.put(`/api/metrics/${A.metric.id}/entries/${A.date}`).send({ value: 4 }).expect(200);
  // Feature 010: horario y pausa de A
  const today = new Date().toISOString().slice(0, 10);
  await api.put('/api/schedule').send({ today, days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, bed_min: 1395, wake_min: 420, active: true })) }).expect(200);
  db.exec('DELETE FROM pauses');
  A.pause = (await api.post('/api/pauses').send({ start_date: today, end_date: today, today }).expect(201)).body;
  // B también tiene lo suyo, incluida una noche abierta a la vez que A (FR-008)
  await otherApi.post('/api/sleep').send({ date: '2026-09-07', bedtime: iso('2026-09-07T22:00') }).expect(201);
});

/** Rutas de un router de Express 5 (método + path). */
const routesOf = (router, prefix) =>
  router.stack.filter((l) => l.route).flatMap((l) => Object.keys(l.route.methods).map((m) => [m, prefix + l.route.path]));

test('B no puede leer, editar ni borrar ningún recurso de A por id: siempre 404 y A intacto (FR-007)', async () => {
  const before = fingerprintOf(A_ID);
  const routes = Object.entries(ROUTERS).flatMap(([p, r]) => routesOf(r, p.replace(/\/$/, ''))).filter(([, path]) => path.includes(':id'));
  assert.ok(routes.length >= 8, `rutas con id: ${routes.length}`);
  for (const [method, path] of routes) {
    const id = path.startsWith('/api/sleep') ? A.closed.id : path.startsWith('/api/naps') ? A.nap.id : path.startsWith('/api/pauses') ? A.pause.id : A.metric.id;
    const url = path.replace(':id', id).replace(':date', A.date);
    const body = { today: new Date().toISOString().slice(0, 10), value: 1, name: 'x', type: 'number', date: '2026-09-05', bedtime: iso('2026-09-05T23:00'), start_time: iso('2026-09-06T14:00'), end_time: iso('2026-09-06T15:00') };
    const res = await otherApi[method](url).send(body);
    assert.equal(res.status, 404, `${method.toUpperCase()} ${url} → ${res.status}`);
  }
  assert.equal(fingerprintOf(A_ID), before, 'las filas de A no cambiaron');
});

test('los listados, el resumen y la exportación de B no contienen nada de A (FR-007, US2-1)', async () => {
  const aIds = { sleep: [A.closed.id, A.open.id], naps: [A.nap.id] };
  const nights = (await otherApi.get('/api/sleep').expect(200)).body;
  assert.ok(nights.every((n) => !aIds.sleep.includes(n.id)) && nights.every((n) => n.notes !== 'de A'));
  assert.deepEqual((await otherApi.get('/api/naps').expect(200)).body, []);
  const metrics = (await otherApi.get('/api/metrics?all=1').expect(200)).body;
  assert.equal(metrics.length, 3, 'B tiene sus propias 3 métricas iniciales (FR-005)');
  assert.ok(metrics.every((m) => m.id !== A.metric.id));
  assert.deepEqual((await otherApi.get('/api/metrics/entries').expect(200)).body, []);
  const stats = (await otherApi.get('/api/stats').query({ from: '2026-09-01', to: '2026-09-30' }).expect(200)).body;
  assert.equal(stats.summary.nights, 0);
  assert.equal(stats.summary.total_naps, 0);
  const exp = (await otherApi.get('/api/export.json').expect(200)).body;
  assert.ok(!JSON.stringify(exp).includes('de A'));
  assert.equal(exp.sleep_records.length, 1);
  assert.equal(exp.metric_entries.length, 0);
  for (const tipo of ['noches', 'siestas', 'metricas', 'valores']) {
    const csv = await otherApi.get(`/api/export/${tipo}.csv`).buffer(true).parse((r, cb) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => cb(null, d)); }).expect(200);
    assert.ok(!csv.body.includes('de A'), tipo);
  }
  // Feature 010: B no ve el horario, las pausas ni el calendario de A
  const today = new Date().toISOString().slice(0, 10);
  const sched = (await otherApi.get(`/api/schedule?date=${today}`).expect(200)).body;
  assert.equal(sched.version, null);
  assert.equal(sched.pause, null);
  assert.deepEqual((await otherApi.get('/api/pauses').expect(200)).body, []);
  await otherApi.get(`/api/schedule.ics?today=${today}`).expect(404);
  assert.deepEqual([exp.schedule_versions, exp.pauses], [[], []]);
  // Y ninguna respuesta de datos expone user_id
  assert.ok(!JSON.stringify([nights, metrics, exp]).includes('user_id'));
});

test('la racha de A no aparece ni se toca desde B (feature 011, FR-027, SC-008)', async () => {
  const today = new Date().toISOString().slice(0, 10);
  await api.put('/api/streak/settings').send({ today, enabled: true, margin_min: 40 }).expect(200);
  db.prepare("INSERT INTO streak_achievements (user_id, key, achieved_on, wake_spread_min, created_at) VALUES (1, 7, '2026-09-08', 5, 'x')").run();
  const before = fingerprintOf(A_ID);
  // Todas las rutas de /api/streak, recorridas desde B
  const routes = routesOf(ROUTERS['/api/streak'], '/api/streak');
  assert.equal(routes.length, 3);
  assert.deepEqual((await otherApi.get(`/api/streak?today=${today}`).expect(200)).body, { enabled: false, offered: false, margin_min: 30, offer: false });
  await otherApi.put('/api/streak/settings').send({ today, margin_min: 15, dismiss_summary: true }).expect(200);
  await otherApi.post('/api/streak/achievements/7/seen').expect(404);
  assert.equal(fingerprintOf(A_ID), before, 'B no cambió los ajustes ni los logros de A');
  assert.equal(db.prepare('SELECT seen_at FROM streak_achievements WHERE user_id = 1 AND key = 7').get().seen_at, null);
  const exp = (await otherApi.get('/api/export.json').expect(200)).body;
  assert.deepEqual(exp.streak.achievements, []);
  assert.equal(exp.streak.settings.enabled, false);
  db.exec('DELETE FROM streak_achievements; UPDATE user_settings SET streak_enabled = 0, streak_since = NULL, streak_offered_at = NULL, streak_margin_min = 30, streak_summary_dismissed = NULL;');
});

test('el dashboard de B no refleja nada de A (feature 005)', async () => {
  const q = { days: 30, to: '2026-09-30' };
  const a = (await api.get('/api/dashboard').query(q).expect(200)).body;
  const b = (await otherApi.get('/api/dashboard').query(q).expect(200)).body;
  assert.ok(a.summary.days_with_data > 0, 'A tiene datos');
  assert.equal(b.summary.days_with_data, 0);
  assert.equal(b.pending14.days, 0);
  assert.ok(b.days.every((d) => d.status !== 'data'));
});

test('la noche abierta y "una sola noche abierta" son por usuario (FR-008, US2-3)', async () => {
  assert.equal((await api.get('/api/sleep/open').expect(200)).body.id, A.open.id);
  const bOpen = (await otherApi.get('/api/sleep/open').expect(200)).body;
  assert.notEqual(bOpen.id, A.open.id);
  // B no puede abrir una segunda noche, pero su 409 no depende de la de A
  await otherApi.post('/api/sleep').send({ date: '2026-09-08', bedtime: iso('2026-09-08T23:00') }).expect(409);
  // Cerrar "la noche abierta" de B no toca la de A
  await otherApi.post('/api/sleep/wake').send({ wake_time: iso('2026-09-08T07:00') }).expect(200);
  assert.equal((await api.get('/api/sleep/open').expect(200)).body.id, A.open.id);
});

test('el propietario tampoco ve los datos de B (FR-009)', async () => {
  const bNight = db.prepare('SELECT id FROM sleep_records WHERE user_id = ?').get(OTHER_ID);
  await api.get('/api/sleep').expect(200).then((r) => assert.ok(r.body.every((n) => n.id !== bNight.id)));
  await api.put(`/api/sleep/${bNight.id}`).send({ notes: 'intruso' }).expect(404);
  await api.delete(`/api/sleep/${bNight.id}`).expect(404);
  const bMetric = db.prepare('SELECT id FROM metrics WHERE user_id = ?').get(OTHER_ID);
  await api.put(`/api/metrics/${bMetric.id}/entries/2026-09-06`).send({ value: 3 }).expect(404);
  await api.delete(`/api/metrics/${bMetric.id}/entries/2026-09-06`).expect(404);
});

test('IDOR corregido: B no puede borrar un valor de A conociendo id de métrica y fecha (R2)', async () => {
  await otherApi.delete(`/api/metrics/${A.metric.id}/entries/${A.date}`).expect(404);
  const still = db.prepare('SELECT COUNT(*) AS c FROM metric_entries WHERE metric_id = ? AND date = ?').get(A.metric.id, A.date);
  assert.equal(still.c, 1);
});

test('las respuestas de la tarjeta de A no se leen ni se escriben desde B (feature 006)', async () => {
  await api.put(`/api/sleep/${A.closed.id}`).send({ sol_bucket: '15_30', awakenings_bucket: '1_2' }).expect(200);
  const before = fingerprintOf(A_ID);
  await otherApi.put(`/api/sleep/${A.closed.id}`).send({ sol_bucket: null, awakenings_bucket: '3plus' }).expect(404);
  const mine = (await otherApi.get('/api/sleep').expect(200)).body;
  assert.ok(mine.every((n) => n.sol_bucket === null && n.awakenings_bucket === null), 'B no ve respuestas de A');
  const exported = (await otherApi.get('/api/export.json').expect(200)).body;
  assert.ok(!JSON.stringify(exported).includes('15_30'));
  assert.equal(fingerprintOf(A_ID), before);
});
