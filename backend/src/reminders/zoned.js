// Hora de pared + zona IANA → instante, y al revés (feature 013, research R3). Puro y sin librerías:
// Node 22 trae ICU completo. Reglas de horario oficial (principio III): una hora que no existe
// (salto de primavera) pasa a la primera hora válida posterior; una que existe dos veces (otoño)
// es la primera ocurrencia, la de mayor desfase.
const MINUTE = 60_000;
const DAY = 86_400_000;

const formats = new Map();
function formatter(timeZone) {
  let f = formats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formats.set(timeZone, f);
  }
  return f;
}

/** Hora de pared de un instante como milisegundos "ingenuos" (la pared leída como si fuera UTC). */
function wallMs(utcMs, timeZone) {
  const p = {};
  for (const { type, value } of formatter(timeZone).formatToParts(new Date(utcMs))) p[type] = Number(value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** Desfase de la zona respecto a UTC en un instante, en minutos (Madrid en verano: 120). */
const offsetMin = (utcMs, timeZone) => Math.round((wallMs(utcMs, timeZone) - Math.floor(utcMs / 1000) * 1000) / MINUTE);

const pad = (n) => String(n).padStart(2, '0');

/** ISO 8601 con el desfase de la zona en ese instante: 2026-10-25T02:30:00+02:00. */
function isoWithOffset(utcMs, timeZone) {
  const off = offsetMin(utcMs, timeZone);
  const w = new Date(utcMs + off * MINUTE).toISOString().slice(0, 19);
  const sign = off < 0 ? '-' : '+';
  return `${w}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

/** Instantes (ms) cuya hora de pared en la zona es exactamente `naive`; vacío si no existe. */
function matches(naive, timeZone) {
  const found = new Set();
  // Los desfases de la víspera y del día siguiente cubren cualquier cambio de ese día
  for (const probe of [naive - DAY, naive, naive + DAY]) {
    const candidate = naive - offsetMin(probe, timeZone) * MINUTE;
    if (wallMs(candidate, timeZone) === naive) found.add(candidate);
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * `minuteOfDay` de la fecha `dateIso` (AAAA-MM-DD) en `timeZone`. Admite minutos fuera de 0–1439
 * (se normaliza al día siguiente o anterior).
 * @returns {{ utcMs: number, iso: string }}
 */
function zonedToUtc(dateIso, minuteOfDay, timeZone) {
  const [y, m, d] = dateIso.split('-').map(Number);
  let naive = Date.UTC(y, m - 1, d) + minuteOfDay * MINUTE;
  for (let i = 0; i <= 60; i++, naive += MINUTE) {
    const [first] = matches(naive, timeZone); // la primera ocurrencia si la hora se repite
    if (first !== undefined) return { utcMs: first, iso: isoWithOffset(first, timeZone) };
  }
  throw new Error(`zonedToUtc: sin hora válida cerca de ${dateIso} ${minuteOfDay} en ${timeZone}`);
}

/** Fecha, minuto del día y día de la semana (0 = domingo) de pared de un instante en la zona. */
function localParts(utcMs, timeZone) {
  const w = new Date(wallMs(utcMs, timeZone));
  return { date: w.toISOString().slice(0, 10), minuteOfDay: w.getUTCHours() * 60 + w.getUTCMinutes(), weekday: w.getUTCDay() };
}

module.exports = { zonedToUtc, localParts, isoWithOffset };
