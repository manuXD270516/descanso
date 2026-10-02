const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { api, otherApi, anon, db, iso, reset, OTHER_ID } = require('./helpers');
const { addDays } = require('../src/analytics');

// Dashboard y bienvenida (feature 005): contrato, validación, rendimiento y bienvenida por usuario.
beforeEach(() => {
  reset();
  db.prepare("UPDATE user_settings SET sleep_goal_min = 420, goal_customized = 0, onboarded_at = NULL").run();
});
const TO = '2026-09-30';
const dash = (q = {}) => api.get('/api/dashboard').query({ days: 30, to: TO, ...q });

test('forma del contrato con datos, huecos, siestas y noche abierta (FR-001…FR-004)', async () => {
  await api.post('/api/sleep').send({ date: '2026-09-28', bedtime: iso('2026-09-28T23:00'), wake_time: iso('2026-09-29T06:00') }).expect(201);
  await api.post('/api/naps').send({ date: '2026-09-28', start_time: iso('2026-09-28T15:00'), end_time: iso('2026-09-28T15:30') }).expect(201);
  await api.post('/api/sleep').send({ date: '2026-09-29', bedtime: iso('2026-09-29T23:00'), wake_time: iso('2026-09-30T07:00') }).expect(201);
  await api.post('/api/sleep').send({ date: '2026-09-30', bedtime: iso('2026-09-30T23:00') }).expect(201);

  const { body } = await dash().expect(200);
  assert.equal(body.goal_min, 420);
  assert.equal(body.cycle_min, 90);
  assert.deepEqual(body.period, { from: '2026-09-01', to: TO, days: 30 });
  assert.equal(body.days.length, 30);
  const byDate = Object.fromEntries(body.days.map((d) => [d.date, d]));
  assert.deepEqual(byDate['2026-09-28'], { date: '2026-09-28', night_min: 420, nap_min: 30, total_min: 450, status: 'data' });
  assert.equal(byDate['2026-09-29'].total_min, 480);
  assert.equal(byDate['2026-09-30'].status, 'in_progress');
  assert.equal(byDate['2026-09-10'].status, 'none');
  assert.equal(byDate['2026-09-10'].total_min, null, 'un hueco nunca es 0');
  assert.deepEqual(body.summary, { avg_min: 465, days_with_data: 2, goal_met: 2 });
  assert.deepEqual(body.pending14, { net_min: 2 * 420 - 930, days: 2 });
  assert.equal(body.regularity, null, 'menos de 7 noches');
  assert.equal(body.cycles.equivalent, 4.7);
});

test('days y to se validan: 400 en español (contrato)', async () => {
  for (const q of [{ days: 14 }, { days: 'x' }, { to: '2026-02-30' }, { to: 'hoy' }, { to: addDays(new Date().toISOString().slice(0, 10), 3) }]) {
    const r = await dash(q);
    assert.equal(r.status, 400, JSON.stringify(q));
    assert.match(r.body.error, /periodo|Fecha/);
  }
  await anon.get('/api/dashboard').query({ days: 7, to: TO }).expect(401);
});

test('editar el objetivo: 239/721 → 400; 450 → guardado y personalizado; el dashboard lo usa (FR-007)', async () => {
  await api.put('/api/me').send({ sleep_goal_min: 239 }).expect(400);
  await api.put('/api/me').send({ sleep_goal_min: 721 }).expect(400);
  const me = (await api.put('/api/me').send({ sleep_goal_min: 450 }).expect(200)).body;
  assert.equal(me.sleep_goal_min, 450);
  assert.equal(me.goal_customized, 1);
  assert.equal((await dash()).body.goal_min, 450);
});

test('bienvenida: con o sin objetivo se marca vista, una vez y por usuario (FR-010)', async () => {
  assert.equal((await api.get('/api/auth/status')).body.onboarded, false);
  await api.post('/api/me/onboarding').send({ sleep_goal_min: 721 }).expect(400);
  const me = (await api.post('/api/me/onboarding').send({ sleep_goal_min: 450 }).expect(200)).body;
  assert.ok(me.onboarded_at);
  assert.equal(me.sleep_goal_min, 450);
  const first = me.onboarded_at;
  const again = (await api.post('/api/me/onboarding').send({}).expect(200)).body;
  assert.equal(again.onboarded_at, first, 'no se reescribe');
  assert.equal((await api.get('/api/auth/status')).body.onboarded, true);
  // La invitada sigue sin haberla visto; saltarla deja 7 h
  assert.equal((await otherApi.get('/api/auth/status')).body.onboarded, false);
  const skipped = (await otherApi.post('/api/me/onboarding').send({}).expect(200)).body;
  assert.equal(skipped.sleep_goal_min, 420);
  assert.equal(skipped.goal_customized, 0);
  void OTHER_ID;
});

test('90 días con datos responden en menos de 300 ms (SC-001)', async () => {
  const ins = db.prepare('INSERT INTO sleep_records (user_id, date, bedtime, wake_time) VALUES (1, ?, ?, ?)');
  const nap = db.prepare('INSERT INTO naps (user_id, date, start_time, end_time) VALUES (1, ?, ?, ?)');
  db.transaction(() => {
    for (let i = 0; i < 90; i++) {
      const d = addDays(TO, -i);
      ins.run(d, `${d}T23:00:00-04:00`, `${addDays(d, 1)}T07:00:00-04:00`);
      nap.run(d, `${d}T14:00:00-04:00`, `${d}T14:20:00-04:00`);
    }
  })();
  const t0 = performance.now();
  const { body } = await dash({ days: 90 }).expect(200);
  const ms = performance.now() - t0;
  assert.equal(body.summary.days_with_data, 90);
  assert.ok(body.regularity && body.regularity.nights === 90);
  assert.ok(ms < 300, `${Math.round(ms)} ms`);
});
