const { test } = require('node:test');
const assert = require('node:assert/strict');
const { zonedToUtc, localParts } = require('../src/reminders/zoned');

// Principio III (feature 013, research R3): hora de pared + zona IANA → instante, con las reglas de DST.
const MADRID = 'Europe/Madrid';
const SANTIAGO = 'America/Santiago';

test('Europe/Madrid: salto de primavera, la hora inexistente pasa a la primera válida', () => {
  const r = zonedToUtc('2026-03-29', 2 * 60 + 30, MADRID);
  assert.equal(r.iso, '2026-03-29T03:00:00+02:00');
  assert.equal(r.utcMs, Date.parse('2026-03-29T01:00:00Z'));
});

test('Europe/Madrid: cambio de otoño, la hora repetida es la primera ocurrencia', () => {
  const r = zonedToUtc('2026-10-25', 2 * 60 + 30, MADRID);
  assert.equal(r.iso, '2026-10-25T02:30:00+02:00');
  assert.equal(r.utcMs, Date.parse('2026-10-25T00:30:00Z'));
});

test('Europe/Madrid: un día normal en invierno (+01:00) y en verano (+02:00)', () => {
  assert.equal(zonedToUtc('2026-01-12', 23 * 60 + 15, MADRID).iso, '2026-01-12T23:15:00+01:00');
  assert.equal(zonedToUtc('2026-07-12', 23 * 60 + 15, MADRID).iso, '2026-07-12T23:15:00+02:00');
  assert.equal(zonedToUtc('2026-07-12', 23 * 60 + 15, MADRID).utcMs, Date.parse('2026-07-12T21:15:00Z'));
});

test('Europe/Madrid: el día del cambio, las horas normales conservan su hora de pared', () => {
  assert.equal(zonedToUtc('2026-03-29', 22 * 60 + 45, MADRID).iso, '2026-03-29T22:45:00+02:00');
  assert.equal(zonedToUtc('2026-03-29', 1 * 60, MADRID).iso, '2026-03-29T01:00:00+01:00');
  assert.equal(zonedToUtc('2026-10-25', 22 * 60 + 45, MADRID).iso, '2026-10-25T22:45:00+01:00');
});

test('America/Santiago: salto de septiembre a medianoche, 00:15 no existe y pasa a 01:00', () => {
  const r = zonedToUtc('2026-09-06', 15, SANTIAGO);
  assert.equal(r.iso, '2026-09-06T01:00:00-03:00');
  assert.equal(r.utcMs, Date.parse('2026-09-06T04:00:00Z'));
  // La víspera a las 23:30 sigue en invierno
  assert.equal(zonedToUtc('2026-09-05', 23 * 60 + 30, SANTIAGO).iso, '2026-09-05T23:30:00-04:00');
});

test('America/Santiago: vuelta de abril, la hora ambigua es la primera ocurrencia (verano)', () => {
  const r = zonedToUtc('2026-04-04', 23 * 60 + 30, SANTIAGO);
  assert.equal(r.iso, '2026-04-04T23:30:00-03:00');
  assert.equal(r.utcMs, Date.parse('2026-04-05T02:30:00Z'));
  // Pasada la hora repetida, ya es invierno
  assert.equal(zonedToUtc('2026-04-05', 8 * 60, SANTIAGO).iso, '2026-04-05T08:00:00-04:00');
});

test('minutos fuera de 0–1439 se normalizan al día siguiente o anterior', () => {
  assert.equal(zonedToUtc('2026-01-12', 24 * 60 + 30, MADRID).iso, '2026-01-13T00:30:00+01:00');
  assert.equal(zonedToUtc('2026-01-12', -15, MADRID).iso, '2026-01-11T23:45:00+01:00');
});

test('UTC funciona y el ISO lleva +00:00', () => {
  const r = zonedToUtc('2026-06-01', 7 * 60, 'UTC');
  assert.equal(r.iso, '2026-06-01T07:00:00+00:00');
  assert.equal(r.utcMs, Date.parse('2026-06-01T07:00:00Z'));
});

test('zona con desfase de 30 minutos', () => {
  assert.equal(zonedToUtc('2026-06-01', 8 * 60, 'Asia/Kolkata').iso, '2026-06-01T08:00:00+05:30');
});

test('localParts devuelve fecha, minuto del día y día de la semana de pared', () => {
  // 2026-10-04 es domingo; 23:30 UTC ya es lunes 01:30 en Madrid (+02:00)
  assert.deepEqual(localParts(Date.parse('2026-10-04T23:30:00Z'), MADRID), { date: '2026-10-05', minuteOfDay: 90, weekday: 1 });
  assert.deepEqual(localParts(Date.parse('2026-10-04T23:30:00Z'), 'UTC'), { date: '2026-10-04', minuteOfDay: 23 * 60 + 30, weekday: 0 });
  assert.deepEqual(localParts(Date.parse('2026-10-04T23:30:00Z'), SANTIAGO), { date: '2026-10-04', minuteOfDay: 20 * 60 + 30, weekday: 0 });
});

test('ida y vuelta: localParts(zonedToUtc(...)) devuelve la hora pedida cuando existe', () => {
  for (const tz of [MADRID, SANTIAGO, 'UTC', 'Asia/Kolkata', 'Pacific/Auckland']) {
    for (const [date, min] of [['2026-02-10', 0], ['2026-02-10', 23 * 60 + 59], ['2026-08-15', 7 * 60 + 5]]) {
      const { utcMs } = zonedToUtc(date, min, tz);
      assert.deepEqual([localParts(utcMs, tz).date, localParts(utcMs, tz).minuteOfDay], [date, min], `${tz} ${date} ${min}`);
    }
  }
});
