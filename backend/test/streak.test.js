const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { api, anon, db, reset } = require('./helpers');
const { addDays } = require('../src/analytics');
const { todayAt } = require('../src/util');

// API de la racha (feature 011): ajustes, consulta sin efectos, trinquete, constelaciones, oferta y
// resumen. El trinquete usa el reloj real del servidor: las noches se crean relativas a hoy.
const OFFSET = '-04:00';
const TODAY = todayAt(`2026-01-01T00:00:00${OFFSET}`);
const day = (k) => addDays(TODAY, k);

function resetStreak() {
  reset();
  db.exec(`DELETE FROM streak_achievements; DELETE FROM schedule_versions; DELETE FROM pauses;
    UPDATE user_settings SET streak_enabled = 0, streak_margin_min = 30, streak_since = NULL, streak_offered_at = NULL,
      streak_best = 0, streak_total = 0, streak_total_base = 0, streak_summary_dismissed = NULL;`);
}
beforeEach(resetStreak);

/** Noche k días antes de hoy (k < 0): acostarse `bed` y levantarse `wake` (HH:MM) al día siguiente. */
function body(k, bed = '23:00', wake = '07:00') {
  const bedDate = Number(bed.slice(0, 2)) < 12 ? day(k + 1) : day(k);
  return { date: bedDate, bedtime: `${bedDate}T${bed}:00${OFFSET}`, wake_time: `${day(k + 1)}T${wake}:00${OFFSET}` };
}
/** Inserta noches cerradas sin pasar por la API (sin trinquete). */
function insertNights(ks, bed, wake) {
  const ins = db.prepare('INSERT INTO sleep_records (user_id, date, bedtime, wake_time, wake_logged_at) VALUES (1, ?, ?, ?, ?)');
  for (const k of ks) { const b = body(k, bed, wake); ins.run(b.date, b.bedtime, b.wake_time, new Date(Date.parse(b.wake_time)).toISOString()); }
}
function schedule2300to0700() {
  const v = db.prepare("INSERT INTO schedule_versions (user_id, effective_from, created_at) VALUES (1, '2020-01-01', 'x')").run().lastInsertRowid;
  const ins = db.prepare('INSERT INTO schedule_days (version_id, weekday, bed_min, wake_min, active) VALUES (?, ?, 1380, 420, 1)');
  for (let w = 0; w < 7; w++) ins.run(v, w);
}
async function enableSince(k) {
  await api.put('/api/streak/settings').send({ today: TODAY, enabled: true }).expect(200);
  db.prepare('UPDATE user_settings SET streak_since = ? WHERE user_id = 1').run(day(k));
}
const stored = () => db.prepare('SELECT streak_enabled, streak_margin_min, streak_since, streak_offered_at, streak_best, streak_total, streak_total_base, streak_summary_dismissed FROM user_settings WHERE user_id = 1').get();
const streak = async () => (await api.get(`/api/streak?today=${TODAY}`).expect(200)).body;
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

test('desactivada: solo los ajustes; fecha inválida 400; sin sesión 401', async () => {
  assert.deepEqual(await streak(), { enabled: false, offered: false, margin_min: 30, offer: false });
  await api.get('/api/streak?today=2020-01-01').expect(400);
  await api.get('/api/streak').expect(400);
  await anon.get(`/api/streak?today=${TODAY}`).expect(401);
});

test('ajustes: activar fija since y total_base; margen y claves validados', async () => {
  db.prepare('UPDATE user_settings SET streak_total = 12 WHERE user_id = 1').run();
  const res = await api.put('/api/streak/settings').send({ today: TODAY, enabled: true }).expect(200);
  assert.deepEqual(res.body, { enabled: true, offered: true, margin_min: 30, offer: false });
  assert.equal(stored().streak_since, TODAY);
  assert.equal(stored().streak_total_base, 12);
  for (const m of [14, 61, '30', 30.5]) {
    const r = await api.put('/api/streak/settings').send({ today: TODAY, margin_min: m }).expect(400);
    assert.equal(r.body.error, 'El margen debe ser entre 15 y 60 minutos');
  }
  assert.equal((await api.put('/api/streak/settings').send({ today: TODAY, foo: 1 }).expect(400)).body.error, 'Ajuste no válido');
  await api.put('/api/streak/settings').send({ today: TODAY, enabled: 'si' }).expect(400);
  await api.put('/api/streak/settings').send({ enabled: true }).expect(400);
  await api.put('/api/streak/settings').send({ today: TODAY, margin_min: 45 }).expect(200);
  assert.equal(stored().streak_margin_min, 45);
});

test('activada: racha, récord, total, semana y última noche; consultar no escribe nada', async () => {
  schedule2300to0700();
  await enableSince(-12);
  for (const k of range(-12, -3)) await api.post('/api/sleep').send(body(k, '23:10', '07:10')).expect(201);
  const before = stored();
  const s = await streak();
  assert.equal(s.current, 10);
  assert.equal(s.best, 10);
  assert.equal(s.total, 10);
  assert.equal(s.cut, false);
  assert.equal(s.week.length, 7);
  assert.equal(new Date(`${s.week[0].date}T00:00:00Z`).getUTCDay(), 1, 'la semana empieza el lunes');
  assert.deepEqual([s.last_night.date, s.last_night.state], [day(-1), 'pending']);
  const twoAgo = s.week.find((d) => d.date === day(-2));
  if (twoAgo) assert.deepEqual([twoAgo.state, twoAgo.reason], ['missed', 'no_record']);
  await streak();
  assert.deepEqual(stored(), before, 'GET no cambia ninguna columna streak_*');
  assert.deepEqual(before.streak_best, 10, 'el trinquete subió el récord al crear noches cerradas');
});

test('trinquete: cerrar con /wake y editar suben récord y total; editar o borrar después no los baja', async () => {
  schedule2300to0700();
  await enableSince(-6);
  insertNights(range(-6, -3), '23:00', '07:00');
  const b = body(-2);
  await api.post('/api/sleep').send({ date: b.date, bedtime: b.bedtime }).expect(201);
  assert.equal(stored().streak_best, 0, 'abrir una noche no aplica el trinquete');
  await api.post('/api/sleep/wake').send({ wake_time: b.wake_time }).expect(200);
  assert.deepEqual([stored().streak_best, stored().streak_total], [5, 5]);
  // Editar dos noches para que queden fuera de horario y borrar otra: lo mostrado no baja
  const rows = db.prepare('SELECT id, date, bedtime, wake_time FROM sleep_records WHERE user_id = 1 ORDER BY date').all();
  for (const r of rows.slice(0, 2)) await api.put(`/api/sleep/${r.id}`).send({ wake_time: r.wake_time.replace('07:00', '10:00') }).expect(200);
  await api.delete(`/api/sleep/${rows[2].id}`).expect(204);
  const s = await streak();
  assert.ok(s.current < 5);
  assert.deepEqual([s.best, s.total], [5, 5]);
});

test('cambiar el margen recalcula la racha sin bajar el récord', async () => {
  schedule2300to0700();
  await enableSince(-6);
  insertNights(range(-6, -2), '23:20', '07:00');
  await api.put(`/api/sleep/${db.prepare('SELECT id FROM sleep_records LIMIT 1').get().id}`).send({}).expect(200);
  assert.equal((await streak()).current, 5);
  await api.put('/api/streak/settings').send({ today: TODAY, margin_min: 15 }).expect(200);
  const s = await streak();
  assert.equal(s.current, 0);
  assert.deepEqual([s.best, s.cut], [5, true]);
});

test('desactivar conserva récord y total; reactivar fija un since nuevo y el total sigue', async () => {
  await enableSince(-4);
  insertNights(range(-4, -2));
  await api.put(`/api/sleep/${db.prepare('SELECT id FROM sleep_records LIMIT 1').get().id}`).send({}).expect(200);
  assert.deepEqual([stored().streak_best, stored().streak_total], [3, 3]);
  await api.put('/api/streak/settings').send({ today: TODAY, enabled: false }).expect(200);
  assert.deepEqual(await streak(), { enabled: false, offered: true, margin_min: 30, offer: false });
  assert.deepEqual([stored().streak_best, stored().streak_total], [3, 3]);
  await api.put('/api/streak/settings').send({ today: TODAY, enabled: true }).expect(200);
  assert.deepEqual([stored().streak_since, stored().streak_total_base], [TODAY, 3]);
  const s = await streak();
  assert.deepEqual([s.current, s.best, s.total], [0, 3, 3]);
});

test('constelaciones: 7 al llegar; 7 y 21 a la vez; permanentes, sin duplicar y vistas', async () => {
  schedule2300to0700();
  await enableSince(-23);
  insertNights(range(-23, -2));
  // Una edición sube la racha de 0 guardado a 22: desbloquea 7 y 21 a la vez
  const first = db.prepare('SELECT id FROM sleep_records ORDER BY date LIMIT 1').get().id;
  await api.put(`/api/sleep/${first}`).send({}).expect(200);
  let s = await streak();
  assert.deepEqual(s.achievements.map((a) => [a.key, a.achieved_on, a.wake_spread_min, a.seen]), [[7, TODAY, 0, false], [21, TODAY, 0, false]]);
  // Editar todas las noches para que no cumplan no retira nada ni cambia la fecha (SC-005)
  for (const r of db.prepare('SELECT id, wake_time FROM sleep_records').all()) {
    await api.put(`/api/sleep/${r.id}`).send({ wake_time: r.wake_time.replace('07:00', '11:00') }).expect(200);
  }
  s = await streak();
  assert.equal(s.current, 0);
  assert.deepEqual(s.achievements.map((a) => [a.key, a.achieved_on]), [[7, TODAY], [21, TODAY]]);
  await api.post('/api/streak/achievements/7/seen').expect(204);
  await api.post('/api/streak/achievements/7/seen').expect(204);
  await api.post('/api/streak/achievements/66/seen').expect(404);
  await api.post('/api/streak/achievements/8/seen').expect(404);
  assert.deepEqual((await streak()).achievements.map((a) => a.seen), [true, false]);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM streak_achievements').get().c, 2);
});

test('la semana trae estado, motivo, horas de pared y "Anotado después"', async () => {
  schedule2300to0700();
  await enableSince(-14);
  insertNights(range(-14, -2), '23:00', '09:10');
  db.prepare("UPDATE sleep_records SET wake_logged_at = '2099-01-01T00:00:00.000Z'").run();
  const s = await streak();
  const missed = [...s.week, s.last_night].find((d) => d.state === 'missed');
  if (missed) assert.deepEqual([missed.reason, missed.bed_time, missed.wake_time, missed.late_logged], ['late_wake', '23:00', '09:10', true]);
  assert.ok(s.week.every((d) => ['met', 'missed', 'paused', 'pending', 'off'].includes(d.state)));
});

test('oferta: solo desactivada, sin ofrecer y con 3 noches cerradas; "Ahora no" la apaga para siempre', async () => {
  insertNights([-3, -2]);
  assert.equal((await streak()).offer, false);
  insertNights([-1]);
  assert.equal((await streak()).offer, true);
  await api.put('/api/streak/settings').send({ today: TODAY, offered: true }).expect(200);
  assert.deepEqual(await streak(), { enabled: false, offered: true, margin_min: 30, offer: false });
  await api.put('/api/streak/settings').send({ today: TODAY, offered: false }).expect(400);
});

test('desactivada: cerrar o editar noches no escribe nada de la racha (SC-006)', async () => {
  const before = stored();
  for (const k of range(-9, -2)) await api.post('/api/sleep').send(body(k)).expect(201);
  const id = db.prepare('SELECT id FROM sleep_records LIMIT 1').get().id;
  await api.put(`/api/sleep/${id}`).send({}).expect(200);
  assert.deepEqual(stored(), before);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM streak_achievements').get().c, 0);
});

test('resumen de la semana anterior: cumplidos, días decididos y media solo con 3 noches; descartable', async () => {
  await enableSince(-30);
  const dow = (new Date(`${TODAY}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = lunes
  const prevMonday = -dow - 7;
  insertNights([prevMonday, prevMonday + 1]);
  let s = await streak();
  assert.equal(s.summary.week_start, day(prevMonday));
  // Los días de la semana anterior desde ayer aún no están decididos (si hoy es lunes, el domingo)
  const undecided = range(prevMonday, prevMonday + 6).filter((k) => k >= -1).length;
  assert.deepEqual([s.summary.met, s.summary.of, s.summary.avg_min], [2, 7 - undecided, null]);
  insertNights([prevMonday + 2]);
  s = await streak();
  assert.deepEqual([s.summary.met, s.summary.avg_min], [3, 480]);
  await api.put('/api/streak/settings').send({ today: TODAY, dismiss_summary: true }).expect(200);
  assert.equal((await streak()).summary, null);
  assert.equal(stored().streak_summary_dismissed, day(-dow));
});

test('pausa: noches en pausa sin registrar quedan neutras y crear una pausa en el pasado sigue dando 400', async () => {
  await enableSince(-10);
  insertNights(range(-10, -7));
  db.prepare('INSERT INTO pauses (user_id, start_date, end_date, created_at) VALUES (1, ?, ?, ?)').run(day(-6), day(-2), 'x');
  const s = await streak();
  assert.equal(s.current, 4);
  assert.ok([...s.week, s.last_night].filter((d) => d.date >= day(-6) && d.date <= day(-2)).every((d) => d.state === 'paused'));
  await api.post('/api/pauses').send({ today: TODAY, start_date: day(-1), end_date: day(2) }).expect(400);
  // Una pausa programada se ve "en pausa" también en las noches futuras de la semana
  await api.post('/api/pauses').send({ today: TODAY, start_date: TODAY, end_date: day(6) }).expect(201);
  const after = await streak();
  assert.ok(after.week.filter((d) => d.date >= TODAY).every((d) => d.state === 'paused'));
});
