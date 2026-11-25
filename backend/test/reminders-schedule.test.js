const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dueReminders } = require('../src/reminders/schedule');

// Feature 013 (research R2, SC-001): vencimientos puros con reloj falso.
const MADRID = 'Europe/Madrid';
const SANTIAGO = 'America/Santiago';
const at = (iso) => Date.parse(iso);

/** Versión con los mismos horarios para los siete días; `overrides` cambia días concretos (0 = domingo). */
const version = (effective_from, bed_min, wake_min, { id = 1, inactive = [], overrides = {} } = {}) => ({
  id,
  effective_from,
  days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, bed_min, wake_min, active: !inactive.includes(weekday), ...(overrides[weekday] ?? {}) })),
});
const weekdays = (...args) => version(...args.slice(0, 3), { ...args[3], inactive: [0, 6] });

const person = (extra = {}) => ({
  id: 1, timezone: MADRID, lead_min: 30, kinds: { prepare: true, bedtime: true, wake_check: true },
  since: null, versions: [weekdays('2026-09-01', 1395, 420)], pauses: [], openNight: null, deliveries: [], ...extra,
});
const run = (now, user = person()) => dueReminders({ now: at(now), users: [user] });
const pick = (dues, kind, night) => dues.find((d) => d.kind === kind && d.nightDate === night);

test('L–V 23:15 → 7:00 con aviso de 30 min: prepare 22:45, bedtime 23:15 y wake_check 8:00 del día siguiente', () => {
  const evening = run('2026-10-05T22:45:00+02:00'); // lunes
  assert.deepEqual(pick(evening, 'prepare', '2026-10-05'), {
    userId: 1, kind: 'prepare', nightDate: '2026-10-05', dueUtc: at('2026-10-05T22:45:00+02:00'), dueIso: '2026-10-05T22:45:00+02:00', windowMin: 10, state: 'send',
  });
  assert.equal(pick(evening, 'bedtime', '2026-10-05').dueIso, '2026-10-05T23:15:00+02:00');
  assert.equal(pick(evening, 'bedtime', '2026-10-05').state, 'future');
  assert.equal(pick(evening, 'wake_check', '2026-10-05'), undefined, 'sin noche abierta no hay wake_check');

  const open = person({ openNight: { bedtime: '2026-10-05T23:20:00+02:00' } });
  const morning = run('2026-10-06T08:00:00+02:00', open); // martes
  const wake = pick(morning, 'wake_check', '2026-10-05');
  assert.equal(wake.dueIso, '2026-10-06T08:00:00+02:00');
  assert.equal(wake.windowMin, 60);
  assert.equal(wake.state, 'send');
  assert.equal(pick(run('2026-10-06T08:00:00+02:00'), 'wake_check', '2026-10-05'), undefined);
});

test('noche que cruza medianoche: la fecha de la noche es el día en que te acuestas', () => {
  const user = person({ versions: [version('2026-09-01', 75, 540)] }); // acostarse 1:15, levantarse 9:00
  const dues = run('2026-10-11T00:45:00+02:00', user); // domingo 0:45
  assert.deepEqual(
    [pick(dues, 'prepare', '2026-10-10')?.dueIso, pick(dues, 'bedtime', '2026-10-10')?.dueIso],
    ['2026-10-11T00:45:00+02:00', '2026-10-11T01:15:00+02:00'],
  );
  assert.equal(pick(dues, 'prepare', '2026-10-10').state, 'send');
  assert.equal(pick(dues, 'bedtime', '2026-10-10').state, 'future');
});

test('acostarse a las 0:15 con 30 min: prepare 23:45 del día de la noche', () => {
  const user = person({ versions: [version('2026-09-01', 15, 420)] });
  const dues = run('2026-10-05T23:45:00+02:00', user);
  const prepare = pick(dues, 'prepare', '2026-10-05');
  assert.equal(prepare.dueIso, '2026-10-05T23:45:00+02:00');
  assert.equal(prepare.state, 'send');
  assert.equal(pick(dues, 'bedtime', '2026-10-05').dueIso, '2026-10-06T00:15:00+02:00');
});

test('wake_check de una noche abierta registrada a las 0:30 del domingo es la noche del sábado (011-R2)', () => {
  const user = person({ versions: [version('2026-09-01', 75, 420)], openNight: { bedtime: '2026-10-11T00:30:00+02:00' } });
  const dues = run('2026-10-11T08:00:00+02:00', user);
  const wake = pick(dues, 'wake_check', '2026-10-10');
  assert.ok(wake, 'noche del sábado');
  assert.equal(wake.dueIso, '2026-10-11T08:00:00+02:00');
  assert.equal(dues.filter((d) => d.kind === 'wake_check').length, 1);
});

test('una versión guardada hoy rige ya esta noche; la anterior sigue rigiendo las noches pasadas', () => {
  const user = person({
    versions: [weekdays('2026-09-01', 1395, 420, { id: 1 }), weekdays('2026-10-05', 1320, 420, { id: 2 })],
  });
  const dues = run('2026-10-05T21:30:00+02:00', user);
  assert.equal(pick(dues, 'bedtime', '2026-10-05').dueIso, '2026-10-05T22:00:00+02:00', 'versión de hoy');
  const friday = run('2026-10-03T08:30:00+02:00', user); // sábado por la mañana: noche del viernes, versión 1
  assert.equal(pick(friday, 'bedtime', '2026-10-02').dueIso, '2026-10-02T23:15:00+02:00');
  // A igualdad de fecha de entrada en vigor, manda la de id mayor
  const same = person({ versions: [weekdays('2026-10-05', 1395, 420, { id: 1 }), weekdays('2026-10-05', 1380, 420, { id: 2 })] });
  assert.equal(pick(run('2026-10-05T20:00:00+02:00', same), 'bedtime', '2026-10-05').dueIso, '2026-10-05T23:00:00+02:00');
});

test('sin horario, día inactivo, noche en pausa o sin zona horaria no hay vencimientos', () => {
  assert.deepEqual(run('2026-10-05T22:45:00+02:00', person({ versions: [] })), []);
  assert.deepEqual(run('2026-10-10T22:45:00+02:00').filter((d) => d.nightDate === '2026-10-10'), [], 'sábado inactivo (L–V)');
  assert.deepEqual(run('2026-10-05T22:45:00+02:00', person({ pauses: [{ start_date: '2026-10-05', end_date: '2026-10-07' }] })), []);
  assert.deepEqual(run('2026-10-05T22:45:00+02:00', person({ timezone: null })), []);
  assert.deepEqual(run('2026-10-05T22:45:00+02:00', person({ versions: [weekdays('2026-10-06', 1395, 420)] })), [], 'versión posterior a la noche');
});

test('un tipo desactivado no genera su vencimiento', () => {
  const open = { bedtime: '2026-10-05T23:20:00+02:00' };
  const dues = run('2026-10-06T08:00:00+02:00', person({ kinds: { prepare: false, bedtime: true, wake_check: false }, openNight: open }));
  assert.deepEqual([...new Set(dues.map((d) => d.kind))], ['bedtime']);
});

test('ventanas de descarte: 10 min para prepare y bedtime, 60 min para wake_check', () => {
  const state = (now, kind, night, user) => pick(run(now, user), kind, night)?.state;
  assert.equal(state('2026-10-05T22:44:59+02:00', 'prepare', '2026-10-05'), 'future');
  assert.equal(state('2026-10-05T22:45:00+02:00', 'prepare', '2026-10-05'), 'send');
  assert.equal(state('2026-10-05T22:54:59+02:00', 'prepare', '2026-10-05'), 'send');
  assert.equal(state('2026-10-05T22:55:00+02:00', 'prepare', '2026-10-05'), 'discard');
  assert.equal(state('2026-10-05T23:24:59+02:00', 'bedtime', '2026-10-05'), 'send');
  assert.equal(state('2026-10-05T23:25:00+02:00', 'bedtime', '2026-10-05'), 'discard');
  const open = person({ openNight: { bedtime: '2026-10-05T23:20:00+02:00' } });
  assert.equal(state('2026-10-06T08:59:59+02:00', 'wake_check', '2026-10-05', open), 'send');
  assert.equal(state('2026-10-06T09:00:00+02:00', 'wake_check', '2026-10-05', open), 'discard');
});

test('las entregas existentes se ignoran y lo anterior al alta del dispositivo no cuenta', () => {
  const now = '2026-10-05T23:15:00+02:00';
  const delivered = run(now, person({ deliveries: ['prepare|2026-10-05', 'bedtime|2026-10-05'] }));
  assert.equal(pick(delivered, 'prepare', '2026-10-05'), undefined);
  assert.equal(pick(delivered, 'bedtime', '2026-10-05'), undefined);
  const afterPrepare = run(now, person({ since: '2026-10-05T22:50:00+02:00' })); // dispositivo activado a las 22:50
  assert.equal(pick(afterPrepare, 'prepare', '2026-10-05'), undefined);
  assert.equal(pick(afterPrepare, 'bedtime', '2026-10-05').state, 'send');
  assert.equal(pick(run(now, person({ since: at('2026-10-05T22:50:00+02:00') })), 'prepare', '2026-10-05'), undefined, 'también en milisegundos');
});

test('DST de Europe/Madrid: la hora agendada inexistente pasa a la primera válida y la repetida es la primera', () => {
  // Noche del sábado 28-03-2026: acostarse a las 2:30 del domingo, que no existe (03:00 +02:00)
  const spring = run('2026-03-29T03:00:00+02:00', person({ versions: [version('2026-01-01', 150, 540)] }));
  assert.equal(pick(spring, 'bedtime', '2026-03-28').dueIso, '2026-03-29T03:00:00+02:00');
  assert.equal(pick(spring, 'bedtime', '2026-03-28').state, 'send');
  // Noche del sábado 24-10-2026: levantarse a la 1:30 + 60 min = 2:30 del 25-10, hora repetida
  const autumn = run('2026-10-25T02:30:00+02:00', person({ versions: [version('2026-01-01', 1380, 90)], openNight: { bedtime: '2026-10-24T23:10:00+02:00' } }));
  const wake = pick(autumn, 'wake_check', '2026-10-24');
  assert.equal(wake.dueIso, '2026-10-25T02:30:00+02:00');
  assert.equal(wake.dueUtc, at('2026-10-25T00:30:00Z'));
  // "22:45" sigue siendo 22:45 el día del cambio (se resta el aviso en minutos de pared)
  const day = run('2026-10-25T22:45:00+01:00', person({ versions: [version('2026-01-01', 1395, 420)] }));
  assert.equal(pick(day, 'prepare', '2026-10-25').dueIso, '2026-10-25T22:45:00+01:00');
});

test('cambio de zona del perfil: los vencimientos siguientes son a la hora local de la zona nueva', () => {
  const madrid = pick(run('2026-10-05T22:00:00+02:00'), 'bedtime', '2026-10-05');
  assert.equal(madrid.dueIso, '2026-10-05T23:15:00+02:00');
  const santiago = pick(dueReminders({ now: at('2026-10-05T22:00:00-03:00'), users: [person({ timezone: SANTIAGO })] }), 'bedtime', '2026-10-05');
  assert.equal(santiago.dueIso, '2026-10-05T23:15:00-03:00');
  assert.equal(santiago.dueUtc, at('2026-10-06T02:15:00Z'));
});

test('varias personas se calculan por separado', () => {
  const a = person({ id: 1 });
  const b = person({ id: 2, timezone: SANTIAGO });
  const dues = dueReminders({ now: at('2026-10-05T22:45:00+02:00'), users: [a, b] });
  assert.deepEqual([...new Set(dues.map((d) => d.userId))].sort(), [1, 2]);
});

// --- SC-001: semana simulada con cambios de horario, comparada con una búsqueda por fuerza bruta ---

/** Primer instante (UTC, ms) cuya hora de pared es `wall` (o la primera válida posterior), escaneando minutos. */
function bruteForce(tz, from, to) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const index = new Map();
  const ordered = [];
  for (let t = from; t <= to; t += 60_000) {
    const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    const key = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
    if (!index.has(key)) { index.set(key, t); ordered.push([key, t]); }
  }
  return (date, minutes) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCMinutes(d.getUTCMinutes() + minutes);
    const key = d.toISOString().slice(0, 16);
    if (index.has(key)) return index.get(key);
    return ordered.find(([k]) => k > key)[1]; // no existe: la primera hora válida posterior
  };
}

const SCENARIOS = [
  ['Europe/Madrid', '2026-03-24', '2026-04-01'],
  ['Europe/Madrid', '2026-10-21', '2026-10-29'],
  ['America/Santiago', '2026-04-01', '2026-04-09'],
  ['America/Santiago', '2026-09-02', '2026-09-10'],
];
const iterDates = (from, to) => {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
};

for (const [tz, from, to] of SCENARIOS) {
  test(`SC-001: ${tz} ${from}…${to}: todos los vencimientos a su hora, con la noche correcta y detectados en el primer tick`, () => {
    const expected = bruteForce(tz, Date.parse(`${from}T00:00:00Z`) - 86_400_000, Date.parse(`${to}T00:00:00Z`) + 4 * 86_400_000);
    // Noches con horas de dormir de tarde, de madrugada y de levantarse a medianoche pasada
    for (const [bed, wake] of [[1395, 420], [75, 540], [0, 360], [1410, 1410]]) {
      const user = person({ timezone: tz, versions: [version('2026-01-01', bed, wake)], kinds: { prepare: true, bedtime: true, wake_check: true } });
      for (const night of iterDates(from, to)) {
        const bedWall = bed < 720 ? bed + 1440 : bed;
        const want = { prepare: bedWall - 30, bedtime: bedWall, wake_check: 1440 + wake + 60 };
        for (const kind of ['prepare', 'bedtime', 'wake_check']) {
          const expectedMs = expected(night, want[kind]);
          const u = { ...user, openNight: kind === 'wake_check' ? { bedtime: `${night}T${bed < 720 ? '23:59' : '23:30'}:00+00:00` } : null };
          if (kind === 'wake_check' && bed < 720) u.openNight = { bedtime: `${new Date(Date.parse(`${night}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)}T00:20:00+00:00` };
          // Primer tick (cada 30 s) en el que el vencimiento está para enviar
          let first = null;
          for (let now = expectedMs - 90_000; now <= expectedMs + 90_000; now += 30_000) {
            const due = dueReminders({ now, users: [u] }).find((d) => d.kind === kind && d.nightDate === night);
            if (due) {
              assert.equal(due.dueUtc, expectedMs, `${tz} ${night} ${kind} (${bed}/${wake})`);
              if (first === null && due.state === 'send') first = now;
            }
          }
          assert.ok(first !== null && first - expectedMs <= 30_000, `${tz} ${night} ${kind}: primer tick ${first - expectedMs} ms tras la hora`);
          assert.ok(first - expectedMs < 120_000);
        }
      }
    }
  });
}
