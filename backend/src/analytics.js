// Agregaciones del dashboard (feature 005, research R1). Funciones puras, sin I/O: reciben filas y
// devuelven cálculos. Todas las fechas son "fecha de la noche" (principio III).
const { durationMinutes, circularAvg } = require('./util');

/** Duración de ciclo usada en las sugerencias hasta que la feature 006 la estime por persona. */
const CYCLE_MIN = 90;
const GOAL_MIN = 240;
const GOAL_MAX = 720;

/** "2026-09-30" + n días (aritmética de calendario, sin zona horaria). */
function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Hora de pared de un ISO con desfase, en minutos desde medianoche (0..1439). */
const minutesOfDay = (iso) => {
  const m = /T(\d{2}):(\d{2})/.exec(iso || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Un elemento por fecha del periodo. Varias noches o siestas de la misma fecha se suman.
 * status: 'data' (hay noche cerrada o siesta), 'in_progress' (solo una noche abierta), 'none'.
 * Un día sin dato tiene total_min = null: nunca cuenta como 0.
 */
function buildDays(nights, naps, from, to) {
  const byDate = new Map(dateRange(from, to).map((d) => [d, { date: d, night_min: null, nap_min: null, open: false }]));
  for (const n of nights) {
    const day = byDate.get(n.date);
    if (!day) continue;
    if (!n.wake_time) day.open = true;
    else day.night_min = (day.night_min ?? 0) + durationMinutes(n.bedtime, n.wake_time);
  }
  for (const n of naps) {
    const day = byDate.get(n.date);
    if (day) day.nap_min = (day.nap_min ?? 0) + durationMinutes(n.start_time, n.end_time);
  }
  return [...byDate.values()].map(({ open, ...d }) => {
    const hasData = d.night_min !== null || d.nap_min !== null;
    return {
      ...d,
      total_min: hasData ? (d.night_min ?? 0) + (d.nap_min ?? 0) : null,
      status: hasData ? 'data' : open ? 'in_progress' : 'none',
    };
  });
}

/** Media diaria y días con el objetivo, solo sobre días con dato. */
function summary(days, goalMin) {
  const withData = days.filter((d) => d.status === 'data');
  const total = withData.reduce((s, d) => s + d.total_min, 0);
  return {
    avg_min: withData.length ? Math.round(total / withData.length) : null,
    days_with_data: withData.length,
    goal_met: withData.filter((d) => d.total_min >= goalMin).length,
  };
}

/** Sueño pendiente neto (aclaración del 2026-10-02): objetivo × días registrados − total dormido. */
function pending(days, goalMin) {
  const withData = days.filter((d) => d.status === 'data');
  if (!withData.length) return { net_min: null, days: 0 };
  const total = withData.reduce((s, d) => s + d.total_min, 0);
  return { net_min: goalMin * withData.length - total, days: withData.length };
}

/** Media y desviación circulares (minutos) de horas de reloj; σ = sqrt(−2·ln R) · 1440 / 2π. */
function circularStat(values) {
  const rad = values.map((v) => (v / 1440) * 2 * Math.PI);
  const c = rad.reduce((s, a) => s + Math.cos(a), 0) / rad.length;
  const s = rad.reduce((s, a) => s + Math.sin(a), 0) / rad.length;
  const r = Math.min(1, Math.sqrt(c * c + s * s));
  const spread = r === 0 ? 720 : Math.sqrt(-2 * Math.log(r)) * (1440 / (2 * Math.PI));
  // "+ 0": con R = 1 (todas iguales) sqrt(-2·0) da -0
  return { mean_min: circularAvg(values), spread_min: Math.round(Math.min(spread, 720)) + 0 };
}

/** Regularidad de dormir y despertar con al menos 7 noches cerradas; si no, null. */
function regularity(nights) {
  const closed = nights.filter((n) => n.wake_time);
  if (closed.length < 7) return null;
  const bed = closed.map((n) => minutesOfDay(n.bedtime)).filter((v) => v !== null);
  const wake = closed.map((n) => minutesOfDay(n.wake_time)).filter((v) => v !== null);
  return { nights: closed.length, bedtime: circularStat(bed), wake: circularStat(wake) };
}

/** A cuántos ciclos equivale el objetivo y los 3 atajos de ciclos completos más cercanos (en 4–12 h). */
function cycles(goalMin, cycleMin = CYCLE_MIN) {
  const all = [];
  for (let n = 1; n * cycleMin <= GOAL_MAX; n++) if (n * cycleMin >= GOAL_MIN) all.push({ cycles: n, minutes: n * cycleMin });
  const shortcuts = [...all]
    .sort((a, b) => Math.abs(a.minutes - goalMin) - Math.abs(b.minutes - goalMin) || a.minutes - b.minutes)
    .slice(0, 3)
    .sort((a, b) => a.cycles - b.cycles);
  return { equivalent: Math.round((goalMin / cycleMin) * 10) / 10, shortcuts };
}

module.exports = { CYCLE_MIN, GOAL_MIN, GOAL_MAX, addDays, dateRange, minutesOfDay, buildDays, summary, pending, circularStat, regularity, cycles };
