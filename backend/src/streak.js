// Racha de constancia (feature 011, research R1–R3). Función pura, sin I/O: recibe noches, versiones
// del horario y pausas, y devuelve el estado de cada noche de constancia y la racha. Solo premia
// conductas controlables: acostarse y levantarse a tu hora (con horario) o registrar la noche (sin él).
// Internamente las fechas son números de día (días desde 1970-01-01) para recorrer 10 años en < 20 ms.
const { circularStat } = require('./analytics');

const MILESTONES = [7, 21, 66, 100, 180, 365];
const MAX_MISSED = 2; // "Puedes fallar hasta 2 días en cualquier periodo de 7 días seguidos"
const WINDOW = 7;
const LATE_LOG_MIN = 60; // "Anotado después" (010-R5)

/** "2026-10-05" (o el inicio de un ISO) → número de día. */
const dayNum = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / 86400000;
const dateOf = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const weekdayOfNum = (n) => (n + 4) % 7; // 1970-01-01 fue jueves
/** Hora de pared de un ISO "AAAA-MM-DDTHH:MM…", en minutos. */
const wallMin = (iso) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
const hhmm = (iso) => iso.slice(11, 16);

/** Minutos de reloj de pared de un ISO contados desde las 0:00 de la noche `n` (cruza medianoche). */
const wallFrom = (n, iso) => (dayNum(iso) - n) * 1440 + wallMin(iso);

/** Noche de constancia de una noche registrada: antes de mediodía es la noche anterior (R2). */
const nightNumOf = (bedtime) => dayNum(bedtime) - (wallMin(bedtime) < 720 ? 1 : 0);
const nightOf = (bedtime) => dateOf(nightNumOf(bedtime));

const lateLogged = (n) => !!n.wake_logged_at && Date.parse(n.wake_logged_at) - Date.parse(n.wake_time) > LATE_LOG_MIN * 60000;

/** Agrupa las noches por noche de constancia: primera hora de acostarse y última de levantarse. */
function groupNights(nights) {
  const byNight = new Map();
  for (const n of nights) {
    const key = nightNumOf(n.bedtime);
    let g = byNight.get(key);
    if (!g) byNight.set(key, (g = { closed: [] }));
    if (n.wake_time) g.closed.push(n);
  }
  const out = new Map();
  for (const [key, g] of byNight) {
    if (!g.closed.length) continue; // solo abiertas: cuentan como sin registrar
    let bed = g.closed[0];
    let last = g.closed[0];
    for (const n of g.closed) {
      if (wallFrom(key, n.bedtime) < wallFrom(key, bed.bedtime)) bed = n;
      if (wallFrom(key, n.wake_time) > wallFrom(key, last.wake_time)) last = n;
    }
    out.set(key, { bedtime: bed.bedtime, wake_time: last.wake_time, from_proposal: last.wake_from_proposal === 1, late_logged: lateLogged(last) });
  }
  return out;
}

/** Día del horario activo en la noche `n`, o null (sin versión o día inactivo: modo "Registro"). */
function makeScheduleLookup(versions) {
  // Vigente en N: mayor effective_from ≤ N; el mismo día, id mayor (010)
  const sorted = versions
    .map((v) => {
      const byWeekday = new Array(7).fill(null);
      for (const d of v.days) if (d.active) byWeekday[d.weekday] = d;
      return { from: dayNum(v.effective_from), id: v.id, byWeekday };
    })
    .sort((a, b) => a.from - b.from || a.id - b.id);
  let i = -1;
  return (n) => {
    while (i + 1 < sorted.length && sorted[i + 1].from <= n) i++;
    return i < 0 ? null : sorted[i].byWeekday[weekdayOfNum(n)];
  };
}

/** Estado de una noche cerrada: cumplido o no cumplido con su motivo (R3). */
function judge(n, date, night, day, marginMin) {
  const base = { date, bed_time: hhmm(night.bedtime), wake_time: hhmm(night.wake_time), late_logged: night.late_logged };
  if (!day) return { ...base, state: 'met', reason: null };
  const bedLimit = (day.bed_min < 720 ? day.bed_min + 1440 : day.bed_min) + marginMin;
  const wakeLimit = 1440 + day.wake_min + marginMin;
  let reason = null;
  if (wallFrom(n, night.bedtime) > bedLimit) reason = 'late_bed';
  else if (night.from_proposal) reason = 'proposal';
  else if (wallFrom(n, night.wake_time) > wakeLimit) reason = 'late_wake';
  return { ...base, state: reason ? 'missed' : 'met', reason };
}

const empty = (date, state, reason = null) => ({ date, state, reason, bed_time: null, wake_time: null, late_logged: false });

/**
 * Racha desde `since` hasta `today` (noches por fecha del día en que te acuestas).
 * Estados: met, missed (con motivo), paused (neutro) y pending ("aún no": hoy y ayer sin cerrar).
 * La racha se corta en el no cumplido que deja 3 en los últimos 7 días decididos y no pausados; la
 * siguiente empieza en el siguiente cumplido. O(n) con una cola de no cumplidos.
 * @returns {{ days: Map<string, object>, current: number, total: number, spreadMin: number|null }}
 */
function computeStreak({ nights, versions = [], pauses = [], since, today, marginMin = 30 }) {
  const grouped = groupNights(nights);
  const scheduleOn = makeScheduleLookup(versions);
  const first = dayNum(since);
  const last = dayNum(today);
  const paused = new Set();
  for (const p of pauses) {
    for (let n = Math.max(dayNum(p.start_date), first); n <= Math.min(dayNum(p.end_date), last); n++) paused.add(n);
  }
  const days = new Map();
  let current = 0;
  let total = 0;
  let position = 0; // días decididos y no pausados desde la activación
  const misses = []; // posiciones de los no cumplidos de los últimos 7 días decididos y no pausados
  let wakes = []; // hora de levantarse de los cumplidos de la racha viva

  for (let n = first; n <= last; n++) {
    const date = dateOf(n);
    const night = grouped.get(n);
    const isPaused = paused.has(n);
    let day;
    if (night) day = judge(n, date, night, isPaused ? null : scheduleOn(n), marginMin);
    else if (isPaused) day = empty(date, 'paused');
    else if (n >= last - 1) day = empty(date, 'pending');
    else day = empty(date, 'missed', 'no_record');
    days.set(date, day);

    if (day.state === 'met') {
      total++;
      position++;
      current++;
      wakes.push(wallMin(night.wake_time));
    } else if (day.state === 'missed') {
      position++;
      misses.push(position);
      while (misses[0] <= position - WINDOW) misses.shift();
      // La ventana no se vacía al cortar: vaciarla haría que no registrar pudiera mejorar la racha
      // (FR-003, SC-001); la racha viva cuenta los cumplidos desde el último corte.
      if (misses.length > MAX_MISSED) { current = 0; wakes = []; }
    }
  }
  const spreadMin = wakes.length >= WINDOW ? circularStat(wakes).spread_min : null;
  return { days, current, total, spreadMin };
}

module.exports = { MILESTONES, computeStreak, nightOf };
