const { test } = require('node:test');
const assert = require('node:assert/strict');
const a = require('../src/analytics');

// Agregaciones del dashboard (feature 005): funciones puras con fixtures.
const iso = (d, hm) => `${d}T${hm}:00-04:00`;
const night = (date, bed, wakeDate, wake) => ({ date, bedtime: iso(date, bed), wake_time: wake ? iso(wakeDate, wake) : null });
const nap = (date, s, e) => ({ date, start_time: iso(date, s), end_time: iso(date, e) });

test('buildDays: noche + siestas se suman; varias noches de una fecha se suman (FR-001, DT-23)', () => {
  const days = a.buildDays(
    [night('2026-09-01', '23:00', '2026-09-02', '07:00'), night('2026-09-02', '13:00', '2026-09-02', '14:00'), night('2026-09-02', '23:30', '2026-09-03', '06:30')],
    [nap('2026-09-01', '15:00', '15:30'), nap('2026-09-01', '17:00', '17:20')],
    '2026-09-01', '2026-09-02',
  );
  assert.deepEqual(days[0], { date: '2026-09-01', night_min: 480, nap_min: 50, total_min: 530, status: 'data' });
  assert.deepEqual(days[1], { date: '2026-09-02', night_min: 480, nap_min: null, total_min: 480, status: 'data' });
});

test('buildDays: un día sin registro es "sin dato" (null, nunca 0); una noche abierta es "en curso" (FR-002, SC-002)', () => {
  const days = a.buildDays([night('2026-09-03', '23:00')], [nap('2026-09-04', '14:00', '14:30')], '2026-09-01', '2026-09-04');
  assert.deepEqual(days.map((d) => [d.date, d.status, d.total_min]), [
    ['2026-09-01', 'none', null],
    ['2026-09-02', 'none', null],
    ['2026-09-03', 'in_progress', null],
    ['2026-09-04', 'data', 30],
  ]);
});

test('summary: media y "X de Y" solo con días con dato (FR-003)', () => {
  const days = [
    { status: 'data', total_min: 420 },
    { status: 'none', total_min: null },
    { status: 'data', total_min: 360 },
    { status: 'in_progress', total_min: null },
    { status: 'data', total_min: 480 },
  ];
  assert.deepEqual(a.summary(days, 420), { avg_min: 420, days_with_data: 3, goal_met: 2 });
  assert.deepEqual(a.summary([{ status: 'none', total_min: null }], 420), { avg_min: null, days_with_data: 0, goal_met: 0 });
});

test('pending: neto sobre días registrados; dormir de más compensa; sin días → null (FR-004)', () => {
  const d = (m) => ({ status: 'data', total_min: m });
  assert.deepEqual(a.pending([d(360), d(400), { status: 'none', total_min: null }], 420), { net_min: 80, days: 2 });
  assert.deepEqual(a.pending([d(360), d(500)], 420), { net_min: -20, days: 2 }, 'compensa: 20 min de más');
  assert.deepEqual(a.pending([{ status: 'in_progress', total_min: null }], 420), { net_min: null, days: 0 });
});

test('regularity: < 7 noches → null; 23:30 y 00:30 → media 00:00 (SC-003); dispersión conocida', () => {
  const six = Array.from({ length: 6 }, (_, i) => night(`2026-09-0${i + 1}`, '23:00', `2026-09-0${i + 2}`, '07:00'));
  assert.equal(a.regularity(six), null);
  const around = Array.from({ length: 8 }, (_, i) => {
    const d = `2026-09-${String(i + 1).padStart(2, '0')}`;
    const nd = `2026-09-${String(i + 2).padStart(2, '0')}`;
    return i % 2 ? night(d, '23:30', nd, '07:00') : { date: d, bedtime: `${nd}T00:30:00-04:00`, wake_time: iso(nd, '07:00') };
  });
  const r = a.regularity(around);
  assert.equal(r.bedtime.mean_min, 0);
  assert.ok(r.bedtime.spread_min >= 25 && r.bedtime.spread_min <= 35, `±${r.bedtime.spread_min}`);
  assert.equal(r.wake.spread_min, 0);
  // Alternar 22:20 y 23:40 (±40 min) da una dispersión de unos 40 min
  const alt = Array.from({ length: 10 }, (_, i) => night(`2026-09-${String(i + 1).padStart(2, '0')}`, i % 2 ? '23:40' : '22:20', `2026-09-${String(i + 2).padStart(2, '0')}`, '07:00'));
  const s = a.regularity(alt).bedtime;
  assert.equal(s.mean_min, 23 * 60);
  assert.ok(Math.abs(s.spread_min - 40) <= 2, `±${s.spread_min}`);
  for (const v of [r.bedtime.mean_min, r.wake.mean_min, s.mean_min]) assert.ok(v >= 0 && v <= 1439);
});

test('cycles: equivalencia y 3 atajos de ciclos completos dentro de 4–12 h (FR-009)', () => {
  assert.deepEqual(a.cycles(420), { equivalent: 4.7, shortcuts: [{ cycles: 4, minutes: 360 }, { cycles: 5, minutes: 450 }, { cycles: 6, minutes: 540 }] });
  assert.deepEqual(a.cycles(240).shortcuts.map((s) => s.cycles), [3, 4, 5]);
  assert.deepEqual(a.cycles(720).shortcuts.map((s) => s.cycles), [6, 7, 8]);
  for (const g of [240, 300, 450, 600, 720]) {
    for (const s of a.cycles(g).shortcuts) assert.ok(s.minutes >= 240 && s.minutes <= 720);
  }
  assert.equal(a.cycles(450).equivalent, 5);
});

test('addDays y dateRange cruzan meses y años', () => {
  assert.equal(a.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(a.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(a.dateRange('2026-09-29', '2026-10-02').length, 4);
});
