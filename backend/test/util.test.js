const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isIso, isDate, durationMinutes, localDateOf, parseRange, circularAvg, HttpError } = require('../src/util');

test('isIso acepta ISO con offset y rechaza texto o no-strings', () => {
  assert.equal(isIso('2026-09-07T23:40:00-04:00'), true);
  assert.equal(isIso('ayer'), false);
  assert.equal(isIso(null), false);
  assert.equal(isIso(1234), false);
});

test('isDate exige YYYY-MM-DD válido', () => {
  assert.equal(isDate('2026-09-07'), true);
  assert.equal(isDate('2026-13-01'), false);
  assert.equal(isDate('26-09-01'), false);
  assert.equal(isDate('2026-09-07T00:00'), false);
});

test('isDate rechaza días imposibles del calendario y acepta el 29 de febrero bisiesto (DT-03)', () => {
  assert.equal(isDate('2026-02-30'), false);
  assert.equal(isDate('2026-02-29'), false);
  assert.equal(isDate('2026-04-31'), false);
  assert.equal(isDate('2028-02-29'), true);
  assert.equal(isDate('2026-12-31'), true);
});

test('durationMinutes cruza la medianoche (23:40 → 07:10 = 450 min)', () => {
  assert.equal(durationMinutes('2026-09-07T23:40:00-04:00', '2026-09-08T07:10:00-04:00'), 450);
});

test('durationMinutes respeta offsets distintos', () => {
  // 23:00 en -04:00 = 03:00Z; 05:00 en +00:00 = 05:00Z → 120 min
  assert.equal(durationMinutes('2026-09-07T23:00:00-04:00', '2026-09-08T05:00:00+00:00'), 120);
});

test('durationMinutes es negativo o cero si el fin no es posterior', () => {
  assert.equal(durationMinutes('2026-09-07T23:00:00-04:00', '2026-09-07T23:00:00-04:00'), 0);
  assert.ok(durationMinutes('2026-09-07T23:00:00-04:00', '2026-09-07T22:00:00-04:00') < 0);
});

test('localDateOf devuelve el día de pared del ISO, sin convertir zonas (DT-04)', () => {
  assert.equal(localDateOf('2026-09-05T23:30:00-04:00'), '2026-09-05');
  assert.equal(localDateOf('2026-09-06T00:30:00-04:00'), '2026-09-06'); // pasada la medianoche
  assert.equal(localDateOf('2026-09-05T23:30:00+14:00'), '2026-09-05'); // aunque en UTC sea otro día
  assert.equal(localDateOf('Sep 7 2026'), null);
  assert.equal(localDateOf(null), null);
});

test('parseRange: opcional, obligatorio, fechas inválidas y orden (DT-02, DT-03)', () => {
  assert.deepEqual(parseRange({}), { from: undefined, to: undefined });
  assert.deepEqual(parseRange({ from: '2026-09-01', to: '2026-09-14' }, { required: true }), { from: '2026-09-01', to: '2026-09-14' });
  const bad = (q, opts, re) =>
    assert.throws(() => parseRange(q, opts), (e) => e instanceof HttpError && e.status === 400 && re.test(e.message));
  bad({}, { required: true }, /obligatorios/);
  bad({ from: '2026-09-01' }, { required: true }, /obligatorios/);
  bad({ from: '2026-02-30' }, {}, /from debe ser una fecha/);
  bad({ to: 'ayer' }, {}, /to debe ser una fecha/);
  bad({ from: ['2026-09-01', '2026-09-02'] }, {}, /from debe ser una fecha/); // ?from=a&from=b
  bad({ from: '2026-09-14', to: '2026-09-01' }, {}, /posterior/);
});

test('circularAvg: siempre en 0..1439, nunca 1440 (DT-21)', () => {
  for (const pair of [[1410, 30], [1439, 1], [1430, 10], [1435, 5], [0, 0], [720, 720]]) {
    const v = circularAvg(pair);
    assert.ok(Number.isInteger(v) && v >= 0 && v <= 1439, `${pair} → ${v}`);
  }
  assert.equal(circularAvg([1410, 30]), 0); // 23:30 y 00:30 → medianoche
  assert.equal(circularAvg([60, 120]), 90);
  assert.equal(circularAvg([]), null);
});

test('todayAt da la fecha de pared de ahora en el desfase del ISO (feature 011)', () => {
  const { todayAt } = require('../src/util');
  const now = Date.parse('2026-10-05T02:30:00Z');
  assert.equal(todayAt('2026-10-04T23:00:00-04:00', now), '2026-10-04');
  assert.equal(todayAt('2026-10-05T07:00:00+05:30', now), '2026-10-05');
  assert.equal(todayAt('2026-10-05T07:00:00Z', now), '2026-10-05');
  assert.equal(todayAt('2026-10-05T07:00:00-0300', now), '2026-10-04');
});
