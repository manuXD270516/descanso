const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { api, iso, reset } = require('./helpers');

beforeEach(reset);

const RANGE = { from: '2026-09-01', to: '2026-09-14' };
const night = (date, bed, wake, offset) =>
  api.post('/api/sleep').send({ date, bedtime: iso(bed, offset), wake_time: wake && iso(wake, offset) }).expect(201);
const nap = (start, end) =>
  api.post('/api/naps').send({ date: start.slice(0, 10), start_time: iso(start), end_time: iso(end) }).expect(201);
const stats = () => api.get('/api/stats').query(RANGE).expect(200).then((r) => r.body);

test('duración media por noche: 7 h y 8 h → 450 min (US4-1)', async () => {
  await night('2026-09-02', '2026-09-02T23:00', '2026-09-03T06:00');
  await night('2026-09-03', '2026-09-03T23:00', '2026-09-04T07:00');
  const { summary } = await stats();
  assert.equal(summary.nights, 2);
  assert.equal(summary.avg_sleep_min, 450);
});

test('hora media de dormir es circular: 23:30 y 00:30 → medianoche, no mediodía (US4-2, FR-014)', async () => {
  await night('2026-09-02', '2026-09-02T23:30', '2026-09-03T07:00');
  await night('2026-09-04', '2026-09-04T00:30', '2026-09-04T08:00');
  const { summary } = await stats();
  // Hoy devuelve 1440 (no 0) por redondeo de coma flotante; la UI lo muestra como 00:00 (DT-21)
  assert.equal(summary.avg_bedtime_min % 1440, 0);
  assert.equal(summary.avg_wake_min, 450);
});

test('las noches abiertas no cuentan para los promedios (US4-3)', async () => {
  await night('2026-09-02', '2026-09-02T23:00', '2026-09-03T07:00');
  await night('2026-09-05', '2026-09-05T23:00', null);
  const { summary, days } = await stats();
  assert.equal(summary.nights, 1);
  assert.equal(summary.avg_sleep_min, 480);
  assert.ok(!days.some((d) => d.date === '2026-09-05'));
});

test('siestas: total y media por día con siestas (US4-4)', async () => {
  await nap('2026-09-02T14:00', '2026-09-02T14:20');
  await nap('2026-09-02T17:00', '2026-09-02T17:45');
  await nap('2026-09-03T15:00', '2026-09-03T15:30');
  const { summary } = await stats();
  assert.equal(summary.total_naps, 3);
  assert.equal(summary.avg_nap_min, 48); // (65 + 30) / 2 = 47.5 → 48
});

test('sin datos: horas medias null y duración media 0 (US4-5)', async () => {
  const { summary, days } = await stats();
  assert.deepEqual(days, []);
  assert.equal(summary.avg_sleep_min, 0);
  assert.equal(summary.avg_bedtime_min, null);
  assert.equal(summary.avg_wake_min, null);
});

test('days está ordenado por fecha ascendente y respeta el rango', async () => {
  await night('2026-09-10', '2026-09-10T23:00', '2026-09-11T07:00');
  await night('2026-09-02', '2026-09-02T23:00', '2026-09-03T07:00');
  await night('2026-08-20', '2026-08-20T23:00', '2026-08-21T07:00');
  const { days } = await stats();
  assert.deepEqual(days.map((d) => d.date), ['2026-09-02', '2026-09-10']);
});

test('la hora media usa la hora local escrita en el ISO, no la hora UTC (FR-014)', async () => {
  await night('2026-09-02', '2026-09-02T22:00', '2026-09-03T06:00', '+02:00');
  await night('2026-09-03', '2026-09-03T22:00', '2026-09-04T06:00', '-05:00');
  const { summary } = await stats();
  assert.equal(summary.avg_bedtime_min, 22 * 60);
  assert.equal(summary.avg_wake_min, 6 * 60);
});
