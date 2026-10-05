const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeStreak } = require('../src/streak');
const { addDays } = require('../src/analytics');

// Motor de la racha (feature 011, research R1–R3, R9). Fechas = noche (día en que te acuestas).
const SINCE = '2026-09-01'; // martes

/** Noche cerrada: acostarse `bed` (HH:MM, antes de mediodía = día siguiente) y levantarse `wake` al día siguiente. */
function night(date, bed, wake, extra = {}, offset = '-04:00') {
  const [bh] = bed.split(':').map(Number);
  const bedDate = bh < 12 ? addDays(date, 1) : date;
  const wakeIso = `${addDays(date, 1)}T${wake}:00${offset}`;
  return { date: bedDate, bedtime: `${bedDate}T${bed}:00${offset}`, wake_time: wakeIso, wake_logged_at: new Date(Date.parse(wakeIso) + 5 * 60000).toISOString(), wake_from_proposal: 0, ...extra };
}
const allDays = (bed_min, wake_min, active = true) => Array.from({ length: 7 }, (_, weekday) => ({ weekday, bed_min, wake_min, active }));
const SCHEDULE = [{ id: 1, effective_from: '2026-01-01', days: allDays(23 * 60, 7 * 60) }];
const run = (nights, opts = {}) => computeStreak({ nights, versions: SCHEDULE, pauses: [], since: SINCE, today: '2026-12-31', marginMin: 30, ...opts });
const stateOf = (r, date) => r.days.get(date);

test('asignación de la noche: antes de mediodía es la noche anterior; a las 12:00, su propia fecha', () => {
  const nights = [
    { date: '2026-09-02', bedtime: '2026-09-02T00:30:00-04:00', wake_time: '2026-09-02T07:00:00-04:00', wake_from_proposal: 0 },
    { date: '2026-09-04', bedtime: '2026-09-04T11:59:00-04:00', wake_time: '2026-09-04T13:00:00-04:00', wake_from_proposal: 0 },
    { date: '2026-09-05', bedtime: '2026-09-05T12:00:00-04:00', wake_time: '2026-09-05T14:00:00-04:00', wake_from_proposal: 0 },
  ];
  const r = run(nights, { versions: [], today: '2026-09-05' });
  assert.equal(stateOf(r, '2026-09-01').state, 'met');
  assert.equal(stateOf(r, '2026-09-03').state, 'met');
  assert.equal(stateOf(r, '2026-09-05').state, 'met');
});

test('límites inclusivos de margen y motivos con hora de pared', () => {
  const r = run([
    night('2026-09-01', '23:30', '07:30'), // justo en el límite
    night('2026-09-02', '23:31', '07:00'),
    night('2026-09-03', '23:00', '07:31'),
    night('2026-09-04', '00:15', '07:00'),
    night('2026-09-05', '21:00', '05:00'), // adelantarse nunca resta
  ], { today: '2026-09-06' });
  assert.equal(stateOf(r, '2026-09-01').state, 'met');
  assert.deepEqual([stateOf(r, '2026-09-02').reason, stateOf(r, '2026-09-02').bed_time], ['late_bed', '23:31']);
  assert.deepEqual([stateOf(r, '2026-09-03').reason, stateOf(r, '2026-09-03').wake_time], ['late_wake', '07:31']);
  assert.deepEqual([stateOf(r, '2026-09-04').reason, stateOf(r, '2026-09-04').bed_time], ['late_bed', '00:15']);
  assert.equal(stateOf(r, '2026-09-05').state, 'met');
});

test('horario después de medianoche: acostarse a la 1:15 y levantarse a las 9:00', () => {
  const versions = [{ id: 1, effective_from: '2026-01-01', days: allDays(75, 540) }];
  const r = run([night('2026-09-01', '01:40', '09:30'), night('2026-09-02', '01:46', '09:00'), night('2026-09-03', '23:50', '08:00')], { versions, today: '2026-09-04' });
  assert.equal(stateOf(r, '2026-09-01').state, 'met');
  assert.equal(stateOf(r, '2026-09-02').reason, 'late_bed');
  assert.equal(stateOf(r, '2026-09-03').state, 'met');
});

test('levantarse a las 0:15 agendado: el límite cruza medianoche', () => {
  const versions = [{ id: 1, effective_from: '2026-01-01', days: allDays(16 * 60, 15) }];
  const nights = [
    { date: '2026-09-01', bedtime: '2026-09-01T16:00:00-04:00', wake_time: '2026-09-02T00:45:00-04:00', wake_from_proposal: 0 },
    { date: '2026-09-02', bedtime: '2026-09-02T16:00:00-04:00', wake_time: '2026-09-03T00:46:00-04:00', wake_from_proposal: 0 },
  ];
  const r = run(nights, { versions, today: '2026-09-03' });
  assert.equal(stateOf(r, '2026-09-01').state, 'met');
  assert.equal(stateOf(r, '2026-09-02').reason, 'late_wake');
});

test('modo "Registro": sin versión o con el día inactivo basta con cerrar la noche', () => {
  const late = night('2026-09-01', '03:00', '11:00');
  assert.equal(stateOf(run([late], { versions: [], today: '2026-09-02' }), '2026-09-01').state, 'met');
  const inactive = [{ id: 1, effective_from: '2026-01-01', days: allDays(23 * 60, 420, false) }];
  assert.equal(stateOf(run([late], { versions: inactive, today: '2026-09-02' }), '2026-09-01').state, 'met');
});

test('hora propuesta: no cumple con horario; cumple en modo "Registro"', () => {
  const n = night('2026-09-01', '23:00', '07:00', { wake_from_proposal: 1 });
  assert.equal(stateOf(run([n], { today: '2026-09-02' }), '2026-09-01').reason, 'proposal');
  assert.equal(stateOf(run([n], { versions: [], today: '2026-09-02' }), '2026-09-01').state, 'met');
});

test('"Anotado después" (61 frente a 60 min) se evalúa con la hora guardada y queda marcado', () => {
  const at = (min) => new Date(Date.parse('2026-09-02T07:10:00-04:00') + min * 60000).toISOString();
  const r = run([
    night('2026-09-01', '23:00', '07:10', { wake_logged_at: at(61) }),
    night('2026-09-02', '23:00', '07:10', { wake_logged_at: at(60) }),
    night('2026-09-03', '23:00', '09:10', { wake_logged_at: '2026-09-05T18:00:00.000Z' }),
  ], { today: '2026-09-04' });
  assert.deepEqual([stateOf(r, '2026-09-01').state, stateOf(r, '2026-09-01').late_logged], ['met', true]);
  assert.equal(stateOf(r, '2026-09-02').late_logged, false);
  assert.deepEqual([stateOf(r, '2026-09-03').reason, stateOf(r, '2026-09-03').late_logged], ['late_wake', true]);
});

test('sin cerrar: "aún no" hoy y ayer; no cumplido desde anteayer; la noche abierta igual', () => {
  const open = { date: '2026-09-05', bedtime: '2026-09-05T23:00:00-04:00', wake_time: null, wake_from_proposal: 0 };
  const r = run([open], { today: '2026-09-06' });
  assert.equal(stateOf(r, '2026-09-06').state, 'pending');
  assert.equal(stateOf(r, '2026-09-05').state, 'pending');
  assert.deepEqual([stateOf(r, '2026-09-04').state, stateOf(r, '2026-09-04').reason], ['missed', 'no_record']);
  assert.equal(stateOf(run([open], { today: '2026-09-07' }), '2026-09-05').reason, 'no_record');
});

test('noche partida: primera hora de acostarse y última de levantarse, un solo día', () => {
  const r = run([night('2026-09-01', '23:00', '02:00'), { ...night('2026-09-01', '03:00', '07:20'), wake_time: '2026-09-02T07:20:00-04:00' }], { today: '2026-09-02' });
  assert.deepEqual([stateOf(r, '2026-09-01').bed_time, stateOf(r, '2026-09-01').wake_time, stateOf(r, '2026-09-01').state], ['23:00', '07:20', 'met']);
  assert.equal(r.total, 1);
});

test('cada noche usa la versión vigente en su fecha', () => {
  const versions = [SCHEDULE[0], { id: 2, effective_from: '2026-09-03', days: allDays(21 * 60, 5 * 60) }];
  const r = run([night('2026-09-01', '23:00', '07:00'), night('2026-09-03', '23:00', '07:00')], { versions, today: '2026-09-04' });
  assert.equal(stateOf(r, '2026-09-01').state, 'met');
  assert.equal(stateOf(r, '2026-09-03').reason, 'late_bed');
});

test('DST y viaje: la misma hora de pared con otro desfase da el mismo resultado', () => {
  for (const offset of ['-04:00', '-03:00', '+01:00']) {
    const r = run([night('2026-09-01', '23:30', '07:30', {}, offset), night('2026-09-02', '23:31', '07:00', {}, offset)], { today: '2026-09-03' });
    assert.equal(stateOf(r, '2026-09-01').state, 'met', offset);
    assert.equal(stateOf(r, '2026-09-02').reason, 'late_bed', offset);
  }
});

test('Independent Test de US1: 10 → 10 → corte → Día 1 con total 11', () => {
  const nights = [];
  for (let i = 0; i < 10; i++) nights.push(night(addDays(SINCE, i), '23:10', '07:10'));
  let r = run(nights, { today: addDays(SINCE, 10) });
  assert.equal(r.current, 10);
  nights.push(night(addDays(SINCE, 10), '23:10', '09:10')); // noche 11: fuera de horario
  // noche 12 sin registrar
  r = run(nights, { today: addDays(SINCE, 13) });
  assert.deepEqual([r.current, r.total], [10, 10], '2 no cumplidos en 7 días: se mantiene');
  nights.push(night(addDays(SINCE, 12), '00:15', '07:00')); // noche 13
  r = run(nights, { today: addDays(SINCE, 14) });
  assert.deepEqual([r.current, r.total], [0, 10], 'el tercero corta');
  nights.push(night(addDays(SINCE, 13), '23:00', '07:00'));
  r = run(nights, { today: addDays(SINCE, 14) });
  assert.deepEqual([r.current, r.total], [1, 11]);
});

test('la ventana es de 7 días: no cumplidos separados por 7 o más días no cortan', () => {
  const nights = [];
  for (let i = 0; i < 30; i++) if (i % 7 !== 3) nights.push(night(addDays(SINCE, i), '23:00', '07:00'));
  const r = run(nights, { today: addDays(SINCE, 30) });
  assert.equal(r.current, 30 - 4);
});

test('pausa: sin registrar es neutra y se salta al formar los 7 días; registrada cuenta en modo "Registro"', () => {
  const nights = [];
  for (let i = 0; i < 10; i++) nights.push(night(addDays(SINCE, i), '23:00', '07:00'));
  const pauses = [{ start_date: addDays(SINCE, 11), end_date: addDays(SINCE, 15) }];
  // 1 no cumplido (día 10), 5 en pausa (11–15), 1 no cumplido (16), cumplido (17): no se corta
  let r = run([...nights, night(addDays(SINCE, 17), '23:00', '07:00')], { pauses, today: addDays(SINCE, 18) });
  assert.equal(r.days.get(addDays(SINCE, 13)).state, 'paused');
  assert.equal(r.current, 11);
  // La pausa no separa los no cumplidos (FR-024): 2 antes y 1 después son 3 en 7 días no pausados
  const p3 = [{ start_date: addDays(SINCE, 12), end_date: addDays(SINCE, 16) }];
  r = run([...nights, night(addDays(SINCE, 18), '23:00', '07:00')], { pauses: p3, today: addDays(SINCE, 19) });
  assert.equal(r.current, 1);
  // US5 literal: racha 10, pausa de 5 sin registrar → 10; registrar en pausa a cualquier hora → 11
  const p2 = [{ start_date: addDays(SINCE, 10), end_date: addDays(SINCE, 14) }];
  r = run(nights, { pauses: p2, today: addDays(SINCE, 15) });
  assert.equal(r.current, 10);
  r = run([...nights, night(addDays(SINCE, 11), '03:00', '12:00')], { pauses: p2, today: addDays(SINCE, 15) });
  assert.equal(r.current, 11);
});

test('since excluye las noches anteriores', () => {
  const r = run([night('2026-08-30', '23:00', '07:00'), night('2026-09-01', '23:00', '07:00')], { today: '2026-09-02' });
  assert.equal(r.total, 1);
  assert.equal(r.days.has('2026-08-30'), false);
});

test('spreadMin: null con menos de 7 cumplidos; σ circular con horas que cruzan medianoche', () => {
  const versions = [];
  const nights = [];
  for (let i = 0; i < 6; i++) nights.push(night(addDays(SINCE, i), '14:00', '23:50'));
  assert.equal(run(nights, { versions, today: addDays(SINCE, 6) }).spreadMin, null);
  // Levantarse alternando 23:50 y 0:10: σ circular ≈ 10 min, no ≈ 12 h
  const cross = [];
  for (let i = 0; i < 8; i++) {
    const d = addDays(SINCE, i);
    cross.push({ date: d, bedtime: `${d}T15:00:00-04:00`, wake_time: i % 2 ? `${addDays(d, 1)}T00:10:00-04:00` : `${d}T23:50:00-04:00`, wake_from_proposal: 0 });
  }
  const spread = run(cross, { versions, today: addDays(SINCE, 8) }).spreadMin;
  assert.ok(spread >= 9 && spread <= 11, `σ = ${spread}`);
});

// --- Propiedades (R9): generador con semilla, 500 historiales por propiedad ---
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pad = (n) => String(n).padStart(2, '0');
function randomHistory(rand, length = 40) {
  const nights = [];
  for (let i = 0; i < length; i++) {
    if (rand() < 0.15) continue;
    const bedMin = 22 * 60 + Math.floor(rand() * 180); // 22:00 a 0:59
    const wakeMin = 6 * 60 + Math.floor(rand() * 180); // 6:00 a 8:59
    const bed = `${pad(Math.floor(bedMin / 60) % 24)}:${pad(bedMin % 60)}`;
    const wake = `${pad(Math.floor(wakeMin / 60))}:${pad(wakeMin % 60)}`;
    nights.push(night(addDays(SINCE, i), bed, wake, { wake_from_proposal: rand() < 0.1 ? 1 : 0 }));
  }
  const pauses = rand() < 0.3 ? [{ start_date: addDays(SINCE, 10), end_date: addDays(SINCE, 13) }] : [];
  return { nights, pauses, today: addDays(SINCE, length + 1) };
}
function forAll(name, check) {
  const seed = 20261005;
  const rand = mulberry32(seed);
  for (let i = 0; i < 500; i++) {
    const h = randomHistory(rand);
    try { check(h, rand); } catch (e) { e.message = `${name} (semilla ${seed}, caso ${i}): ${e.message}`; throw e; }
  }
}
const metCount = (r) => [...r.days.values()].filter((d) => d.state === 'met').length;

test('propiedad: la racha no supera los días cumplidos y no crece sin ellos', () => {
  forAll('sin cumplidos', ({ nights, pauses, today }) => {
    const r = run(nights, { pauses, today });
    assert.ok(r.current <= metCount(r));
    assert.equal(r.total, metCount(r));
    assert.equal(run([], { pauses, today }).current, 0);
  });
});

test('propiedad: quitar un registro nunca sube current ni total', () => {
  forAll('quitar registro', ({ nights, pauses, today }, rand) => {
    if (!nights.length) return;
    const r = run(nights, { pauses, today });
    const without = nights.filter((_, i) => i !== Math.floor(rand() * nights.length));
    const r2 = run(without, { pauses, today });
    assert.ok(r2.current <= r.current && r2.total <= r.total, `${r2.current}/${r2.total} > ${r.current}/${r.total}`);
  });
});

test('propiedad: retrasar una hora o marcar la hora propuesta nunca mejora', () => {
  forAll('retrasar', ({ nights, pauses, today }, rand) => {
    if (!nights.length) return;
    const r = run(nights, { pauses, today });
    const i = Math.floor(rand() * nights.length);
    const later = (iso) => `${new Date(Date.parse(iso) + 45 * 60000 - 4 * 3600000).toISOString().slice(0, 19)}-04:00`;
    const worse = [
      nights.map((n, j) => (j === i ? { ...n, wake_time: later(n.wake_time) } : n)),
      nights.map((n, j) => (j === i ? { ...n, bedtime: later(n.bedtime) } : n)),
      nights.map((n, j) => (j === i ? { ...n, wake_from_proposal: 1 } : n)),
    ];
    for (const w of worse) {
      const r2 = run(w, { pauses, today });
      assert.ok(r2.current <= r.current && r2.total <= r.total);
    }
  });
});

test('propiedad: no registrar en pausa nunca corta; una noche nunca cerrada acaba no cumplida', () => {
  forAll('pausa', ({ nights, today }) => {
    const pauses = [{ start_date: addDays(SINCE, 10), end_date: addDays(SINCE, 13) }];
    const inPause = (n) => n.date >= addDays(SINCE, 10) && n.date <= addDays(SINCE, 14);
    const withPause = nights.filter((n) => !inPause(n));
    const r = run(withPause, { pauses, today });
    for (let d = addDays(SINCE, 10); d <= addDays(SINCE, 13); d = addDays(d, 1)) {
      if (!r.days.get(d) || r.days.get(d).state !== 'met') assert.equal(r.days.get(d).state, 'paused');
    }
    const open = { date: SINCE, bedtime: `${SINCE}T23:00:00-04:00`, wake_time: null, wake_from_proposal: 0 };
    assert.equal(run([open], { today }).days.get(SINCE).state, 'missed');
  });
});

test('rendimiento: 3.650 noches en menos de 20 ms (mediana de 5)', () => {
  const nights = [];
  for (let i = 0; i < 3650; i++) nights.push(night(addDays('2016-01-01', i), i % 9 ? '23:10' : '00:20', '07:00'));
  const times = [];
  for (let k = 0; k < 5; k++) {
    const t = performance.now();
    computeStreak({ nights, versions: SCHEDULE, pauses: [], since: '2016-01-01', today: addDays('2016-01-01', 3650), marginMin: 30 });
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  assert.ok(times[2] < 20, `mediana ${times[2].toFixed(1)} ms`);
});
