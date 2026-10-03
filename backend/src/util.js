class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
// Fecha real de calendario: Date.parse aceptaría 2026-02-30 (lo desborda a marzo)
const isDate = (v) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const durationMinutes = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 60000);

/** Día de pared de un ISO con desfase ("2026-09-05T23:30:00-04:00" → "2026-09-05"); null si no es ISO. */
const localDateOf = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? v.slice(0, 10) : null);

/** Valida ?from&to (fechas reales, from ≤ to). Con required, ambos son obligatorios. */
function parseRange(query, { required = false } = {}) {
  const { from, to } = query;
  if (required && (from === undefined || to === undefined)) throw new HttpError(400, 'from y to son obligatorios (AAAA-MM-DD)');
  if (from !== undefined && !isDate(from)) throw new HttpError(400, 'from debe ser una fecha AAAA-MM-DD válida');
  if (to !== undefined && !isDate(to)) throw new HttpError(400, 'to debe ser una fecha AAAA-MM-DD válida');
  if (from !== undefined && to !== undefined && from > to) throw new HttpError(400, 'from no puede ser posterior a to');
  return { from, to };
}

/** Media circular de minutos del día (0..1439): 23:30 y 00:30 → 00:00, no 12:00. */
function circularAvg(values) {
  if (!values.length) return null;
  const rad = values.map((v) => (v / 1440) * 2 * Math.PI);
  const x = rad.reduce((s, a) => s + Math.cos(a), 0) / rad.length;
  const y = rad.reduce((s, a) => s + Math.sin(a), 0) / rad.length;
  let ang = Math.atan2(y, x);
  if (ang < 0) ang += 2 * Math.PI;
  // El redondeo puede dar 1440 (DT-21); "+ 0" evita devolver -0 cuando atan2 da -0
  return (Math.round((ang / (2 * Math.PI)) * 1440) % 1440) + 0;
}

module.exports = { HttpError, isIso, isDate, durationMinutes, localDateOf, parseRange, circularAvg };
