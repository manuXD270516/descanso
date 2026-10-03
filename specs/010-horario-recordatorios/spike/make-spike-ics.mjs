// Spike de 010 (antes del plan): archivos de calendario de prueba para comprobar, en cada calendario,
// (1) que la alarma importada suena y (2) que reimportar una versión nueva ACTUALIZA los eventos en
// lugar de duplicarlos, y que un día cancelado desaparece.
//
// Uso:  node specs/010-horario-recordatorios/spike/make-spike-ics.mjs --at 21:40 [--lead 5]
//   --at    hora de reloj de pared del evento (hoy y cada día de la semana); ponla unos minutos en
//           el futuro para oír la alarma pronto.
//   --lead  minutos de antelación de la alarma (por defecto 5, para no esperar 30).
// Genera spike-v1.ics y spike-v2.ics junto a este script. No contienen datos de salud.
//
// v1: 7 eventos semanales (uno por día) a la hora --at, alarma --lead min antes, SEQUENCE 1.
// v2: mismos UID, SEQUENCE 2, 15 min más tarde, y el miércoles emitido con STATUS:CANCELLED.
// Criterio: tras importar v2, sigue habiendo un evento por día (no el doble), a la hora nueva, y el
// miércoles ya no aparece.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
if (!/^\d{1,2}:\d{2}$/.test(args.at ?? '')) {
  console.error('Uso: node make-spike-ics.mjs --at HH:MM [--lead 5]');
  process.exit(1);
}
const lead = Number(args.lead ?? 5);
const [h, m] = args.at.split(':').map(Number);
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const pad = (n) => String(n).padStart(2, '0');

/** Fecha local (AAAAMMDD) de la próxima vez que cae ese día de la semana, hoy incluido. */
function nextDate(weekday) {
  const d = new Date();
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
/** Plegado RFC 5545: líneas de como máximo 75 octetos, continuación con un espacio. */
function fold(line) {
  const out = [];
  let buf = Buffer.from(line, 'utf8');
  while (buf.length > 75) {
    let cut = 75;
    while ((buf[cut] & 0xc0) === 0x80) cut--; // no partir un carácter UTF-8
    out.push(buf.subarray(0, cut).toString('utf8'));
    buf = Buffer.concat([Buffer.from(' '), buf.subarray(cut)]);
  }
  out.push(buf.toString('utf8'));
  return out.join('\r\n');
}

function calendar(version, minuteShift, cancelled) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const total = h * 60 + m + minuteShift;
  const time = `${pad(Math.floor(total / 60) % 24)}${pad(total % 60)}00`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Descanso//Spike 010//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  DAYS.forEach((day, weekday) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:sched-spike-${weekday}@descanso-sleep.fly.dev`,
      `SEQUENCE:${version}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${nextDate(weekday)}T${time}`, // hora flotante: sin TZID ni Z
      'DURATION:PT15M',
      `RRULE:FREQ=WEEKLY;BYDAY=${day}`,
      `SUMMARY:Descanso: en ${lead} min es tu hora de dormir (prueba v${version})`,
      'URL:https://descanso-sleep.fly.dev/',
      `STATUS:${cancelled.includes(day) ? 'CANCELLED' : 'CONFIRMED'}`,
    );
    if (!cancelled.includes(day)) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:Descanso: en ${lead} min es tu hora de dormir`, `TRIGGER:-PT${lead}M`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

const dir = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(dir, 'spike-v1.ics'), calendar(1, 0, []));
writeFileSync(join(dir, 'spike-v2.ics'), calendar(2, 15, ['WE']));
console.log(`spike-v1.ics: 7 eventos a las ${args.at}, alarma ${lead} min antes.`);
console.log(`spike-v2.ics: mismos eventos 15 min más tarde y el miércoles cancelado.`);
