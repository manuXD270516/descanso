const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { scheduleIcs } = require('../src/ics');

// Archivo de calendario del horario (feature 010, US2, FR-007…FR-010, SC-002/SC-003/SC-005).
// Reglas validadas en el spike (specs/010-horario-recordatorios/spike/README.md).
const FIX = (name) => path.join(__dirname, 'fixtures', name);
const NOW = new Date('2026-10-05T12:00:00Z');
const BASE = 'https://descanso-sleep.fly.dev';
const day = (weekday, bed, wake, active = true) => ({ weekday, bed_min: bed, wake_min: wake, active });
// Noches de lunes a viernes 23:15 → 7:00; sábado y domingo 1:15 → 9:00 (fin de semana = noches 6 y 0)
const V1_DAYS = [day(0, 75, 540), day(1, 1395, 420), day(2, 1395, 420), day(3, 1395, 420), day(4, 1395, 420), day(5, 1395, 420), day(6, 75, 540)];
// v2: el miércoles se desactiva y el fin de semana pasa a 0:45
const V2_DAYS = V1_DAYS.map((d) => (d.weekday === 3 ? { ...d, active: false } : d.weekday === 0 || d.weekday === 6 ? { ...d, bed_min: 45 } : d));
const v1 = () => scheduleIcs({ userId: 7, versionId: 12, effectiveFrom: '2026-10-05', days: V1_DAYS, everActive: new Set(), baseUrl: BASE, leadMin: 30, now: NOW });
const v2 = () => scheduleIcs({ userId: 7, versionId: 13, effectiveFrom: '2026-10-06', days: V2_DAYS, everActive: new Set([0, 1, 2, 3, 4, 5, 6]), baseUrl: BASE, leadMin: 30, now: NOW });

const events = (ics) => ics.split('BEGIN:VEVENT').slice(1).map((e) => e.split('END:VEVENT')[0].replace(/\r\n /g, ''));
const prop = (ev, name) => (ev.match(new RegExp(`\\r\\n${name}(?:;[^:]*)?:([^\\r]*)`)) ?? [])[1];

test('coincide con los archivos de referencia (golden)', () => {
  if (process.env.UPDATE_GOLDEN) {
    fs.writeFileSync(FIX('schedule-v1.ics'), v1());
    fs.writeFileSync(FIX('schedule-v2.ics'), v2());
  }
  assert.equal(v1(), fs.readFileSync(FIX('schedule-v1.ics'), 'utf8'));
  assert.equal(v2(), fs.readFileSync(FIX('schedule-v2.ics'), 'utf8'));
});

test('formato RFC 5545: CRLF, líneas ≤ 75 octetos, VERSION y PRODID', () => {
  for (const ics of [v1(), v2()]) {
    assert.ok(ics.endsWith('\r\n'));
    const lines = ics.split('\r\n').slice(0, -1);
    for (const l of lines) {
      assert.ok(!l.includes('\n') && !l.includes('\r'), 'sin saltos sueltos');
      assert.ok(Buffer.byteLength(l, 'utf8') <= 75, `línea de ${Buffer.byteLength(l, 'utf8')} octetos: ${l}`);
    }
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:'));
  }
});

test('un evento semanal por día activo, en hora flotante, con UID estable, SEQUENCE y alarma de 30 min', () => {
  const evs = events(v1());
  assert.equal(evs.length, 7);
  for (const ev of evs) {
    assert.match(prop(ev, 'UID'), /^sched-7-[0-6]@descanso-sleep\.fly\.dev$/);
    assert.equal(prop(ev, 'SEQUENCE'), '12');
    assert.match(prop(ev, 'DTSTART'), /^\d{8}T\d{6}$/, 'hora flotante: sin TZID ni Z');
    assert.ok(!/DTSTART;TZID/.test(ev));
    assert.match(prop(ev, 'DTSTAMP'), /^20261005T120000Z$/);
    assert.match(prop(ev, 'RRULE'), /^FREQ=WEEKLY;BYDAY=(SU|MO|TU|WE|TH|FR|SA)$/);
    assert.equal(prop(ev, 'SUMMARY'), 'Descanso: en 30 min es tu hora de dormir');
    assert.match(ev, /BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Descanso: en 30 min es tu hora de dormir\r\nTRIGGER:-PT30M\r\nEND:VALARM/);
    // Google Calendar descarta URL: el enlace va también en la descripción (spike)
    assert.equal(prop(ev, 'URL'), `${BASE}/#noche`);
    assert.equal(prop(ev, 'DESCRIPTION'), `Abrir Descanso: ${BASE}/#noche`);
  }
});

test('noche del lunes a las 23:15 empieza el lunes; la del sábado a la 1:15 cae el domingo de madrugada', () => {
  const byUid = Object.fromEntries(events(v1()).map((e) => [prop(e, 'UID'), e]));
  // effective_from 2026-10-05 es lunes
  assert.equal(prop(byUid['sched-7-1@descanso-sleep.fly.dev'], 'DTSTART'), '20261005T231500');
  assert.equal(prop(byUid['sched-7-1@descanso-sleep.fly.dev'], 'RRULE'), 'FREQ=WEEKLY;BYDAY=MO');
  // noche del sábado 10-oct, 1:15 → domingo 11-oct 01:15, repetición en domingo
  assert.equal(prop(byUid['sched-7-6@descanso-sleep.fly.dev'], 'DTSTART'), '20261011T011500');
  assert.equal(prop(byUid['sched-7-6@descanso-sleep.fly.dev'], 'RRULE'), 'FREQ=WEEKLY;BYDAY=SU');
  // noche del domingo 11-oct, 1:15 → lunes 12-oct
  assert.equal(prop(byUid['sched-7-0@descanso-sleep.fly.dev'], 'DTSTART'), '20261012T011500');
});

test('v1 → v2: mismos UID, SEQUENCE mayor, mismo número de eventos y el día quitado cancelado sin alarma', () => {
  const a = events(v1());
  const b = events(v2());
  assert.deepEqual(b.map((e) => prop(e, 'UID')).sort(), a.map((e) => prop(e, 'UID')).sort());
  assert.ok(b.every((e) => Number(prop(e, 'SEQUENCE')) > 12));
  const wed = b.find((e) => prop(e, 'UID') === 'sched-7-3@descanso-sleep.fly.dev');
  assert.equal(prop(wed, 'STATUS'), 'CANCELLED');
  assert.ok(!wed.includes('BEGIN:VALARM'));
});

test('un día que nunca estuvo activo no se emite; el aviso usa lead_min', () => {
  const ics = scheduleIcs({ userId: 7, versionId: 1, effectiveFrom: '2026-10-05', days: V2_DAYS, everActive: new Set(), baseUrl: BASE, leadMin: 45, now: NOW });
  assert.equal(events(ics).length, 6);
  assert.ok(!ics.includes('sched-7-3@'));
  assert.ok(ics.includes('TRIGGER:-PT45M'));
  assert.ok(ics.includes('SUMMARY:Descanso: en 45 min es tu hora de dormir'));
});

test('sin datos de salud (SC-005)', () => {
  for (const ics of [v1(), v2()]) assert.doesNotMatch(ics, /horas dormidas|duraci[oó]n|calidad|nota|m[eé]trica|siesta|insomnio|objetivo/i);
});
