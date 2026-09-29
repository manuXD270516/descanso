const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isIso, isDate, durationMinutes } = require('../src/util');

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
