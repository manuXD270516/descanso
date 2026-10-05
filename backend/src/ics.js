// Archivo de calendario del horario (feature 010, research R3), sin librería: función pura.
// Reglas comprobadas en el spike (specs/010-horario-recordatorios/spike/README.md):
// - hora flotante (sin TZID ni Z): el evento cae a la misma hora de reloj de pared aunque cambie la zona;
// - UID estable por noche de la semana + SEQUENCE = versión: reimportar actualiza en vez de duplicar;
// - los días quitados se emiten con STATUS:CANCELLED para que desaparezcan;
// - Google Calendar descarta URL: el enlace va también en DESCRIPTION.
// No contiene datos de salud (principio VIII): solo el horario y el texto del aviso.
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const pad = (n) => String(n).padStart(2, '0');

/** Fecha AAAA-MM-DD + n días (en UTC, sin horas). */
function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Plegado a 75 octetos (RFC 5545 §3.1) sin partir caracteres UTF-8. */
function fold(line) {
  const out = [];
  let buf = Buffer.from(line, 'utf8');
  while (buf.length > 75) {
    let cut = 75;
    while ((buf[cut] & 0xc0) === 0x80) cut--;
    out.push(buf.subarray(0, cut).toString('utf8'));
    buf = Buffer.concat([Buffer.from(' '), buf.subarray(cut)]);
  }
  out.push(buf.toString('utf8'));
  return out.join('\r\n');
}
/** Escapado de texto (RFC 5545 §3.3.11). */
const text = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * Primer acostarse de una noche de la semana desde `effectiveFrom`: la primera fecha ≥ effectiveFrom de
 * ese día de la semana; si la hora es antes de mediodía (bed_min < 720), cae el día siguiente.
 */
function firstBed(effectiveFrom, weekday, bedMin) {
  const night = addDays(effectiveFrom, (weekday - weekdayOf(effectiveFrom) + 7) % 7);
  const date = bedMin < 720 ? addDays(night, 1) : night;
  return { date, byday: BYDAY[weekdayOf(date)], time: `${pad(Math.floor(bedMin / 60))}${pad(bedMin % 60)}00` };
}

/**
 * @param {object} o
 * @param {number} o.userId
 * @param {number} o.versionId    id de la versión vigente (SEQUENCE; siempre crece)
 * @param {string} o.effectiveFrom AAAA-MM-DD
 * @param {{weekday:number,bed_min:number,wake_min:number,active:boolean|number}[]} o.days
 * @param {Set<number>} o.everActive noches de la semana activas en alguna versión anterior
 * @param {string} o.baseUrl       origen de la app, sin barra final
 * @param {number} o.leadMin       minutos de aviso (15–60)
 * @param {Date} o.now
 */
function scheduleIcs({ userId, versionId, effectiveFrom, days, everActive, baseUrl, leadMin, now }) {
  const message = `Descanso: en ${leadMin} min es tu hora de dormir`;
  const link = `${baseUrl}/#noche`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Descanso//Horario//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const d of [...days].sort((a, b) => a.weekday - b.weekday)) {
    const active = Boolean(d.active);
    if (!active && !everActive.has(d.weekday)) continue; // nunca estuvo en el calendario
    const first = firstBed(effectiveFrom, d.weekday, d.bed_min);
    lines.push(
      'BEGIN:VEVENT',
      `UID:sched-${userId}-${d.weekday}@descanso-sleep.fly.dev`,
      `SEQUENCE:${versionId}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${first.date.replace(/-/g, '')}T${first.time}`,
      'DURATION:PT15M',
      `RRULE:FREQ=WEEKLY;BYDAY=${first.byday}`,
      `SUMMARY:${text(message)}`,
      `DESCRIPTION:${text(`Abrir Descanso: ${link}`)}`,
      `URL:${link}`,
      `STATUS:${active ? 'CONFIRMED' : 'CANCELLED'}`,
    );
    if (active) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${text(message)}`, `TRIGGER:-PT${leadMin}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = { scheduleIcs, firstBed };
