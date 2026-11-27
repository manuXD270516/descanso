const pad = (n: number) => String(n).padStart(2, '0');

/** Fecha local YYYY-MM-DD */
export function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Valor para <input type="datetime-local"> */
export function toInputLocal(d: Date = new Date()): string {
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convierte "YYYY-MM-DDTHH:mm" (hora local) a ISO con el offset del navegador */
export function inputLocalToIso(v: string): string {
  const d = new Date(v);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${v.length === 16 ? v + ':00' : v}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * Duración en minutos entre dos valores de <input type="datetime-local"> (inicio y fin), o null si el fin
 * no es posterior al inicio. Se mide entre los mismos ISO con offset que se envían al servidor, así la
 * validez y la duración coinciden con lo guardado también en la hora repetida del cambio de horario (T046).
 * `toIso` se inyecta solo en las pruebas, para fijar un desfase sin depender de la zona del navegador.
 */
export function inputDurationMin(start: string, end: string, toIso: (v: string) => string = inputLocalToIso): number | null {
  if (!start || !end) return null;
  const m = Math.round((Date.parse(toIso(end)) - Date.parse(toIso(start))) / 60000);
  return m > 0 ? m : null;
}

/**
 * Fecha de la noche (YYYY-MM-DD): el día local en que la persona se acuesta.
 * El ISO lleva el offset de quien registra, así que su parte de fecha ya es el día local.
 */
export function nightDate(iso: string): string {
  return iso.slice(0, 10);
}

/** ISO → "YYYY-MM-DDTHH:mm" en hora local */
export function isoToInputLocal(iso: string): string {
  return toInputLocal(new Date(iso));
}

export function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDuration(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${pad(m)} min` : `${h} h`;
}

export function fmtMinutesOfDay(min: number | null): string {
  if (min === null) return '—';
  return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
}

export function fmtDateShort(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + n));
}

/** Minutos desde medianoche, hora local, a partir de un ISO */
export function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
