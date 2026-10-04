/**
 * Horario de sueño (feature 010): reglas puras, sin HTTP ni componentes.
 * - Cada día del horario es una NOCHE, nombrada por el día en que te acuestas (principio III);
 *   `weekday` 0 = domingo … 6 = sábado, como Date.getDay().
 * - Horas de reloj de pared en minutos (0–1439). La hora de acostarse antes de mediodía (< 720) cae
 *   después de medianoche, es decir, el día siguiente; la de levantarse siempre es la mañana siguiente.
 * - Los instantes se calculan en la hora local del navegador: "7:00" sigue siendo las 7:00 tras viajar.
 */
export interface ScheduleDay {
  weekday: number;
  bed_min: number;
  wake_min: number;
  active: boolean;
}

export interface ScheduleVersion {
  id: number;
  effective_from: string;
  days: ScheduleDay[];
}

export interface Pause {
  id: number;
  start_date: string;
  end_date: string;
}

export type ScheduleMode = 'same' | 'weekend' | 'each';

/** Noches de fin de semana: sábado y domingo (aclaración del 2026-10-03). */
export const WEEKEND_NIGHTS = [6, 0];
/** Orden de presentación: de lunes a domingo. */
export const NIGHT_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const NIGHT_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const DAY = 1440;
const AFTER_MIDNIGHT = 720;

/** Hora de acostarse propuesta = levantarse − objetivo − 15 min, con vuelta de día (FR-002). */
export function proposeBed(wakeMin: number, goalMin: number): number {
  return (((wakeMin - goalMin - 15) % DAY) + DAY) % DAY;
}

/** "23:15" a partir de minutos; "07:00" → "07:00" (para inputs type=time). */
export function minToTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** "07:30" → 450; null si no es una hora válida. */
export function timeToMin(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h < 24 && mm < 60 ? h * 60 + mm : null;
}

/**
 * Los 7 días a partir de un par para la semana y otro para el fin de semana (en "igual", el mismo),
 * conservando qué noches están activas.
 */
export function daysFor(
  mode: Exclude<ScheduleMode, 'each'>,
  week: { bed_min: number; wake_min: number },
  weekend: { bed_min: number; wake_min: number },
  active: boolean[] = [true, true, true, true, true, true, true],
): ScheduleDay[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const pair = mode === 'weekend' && WEEKEND_NIGHTS.includes(weekday) ? weekend : week;
    return { weekday, bed_min: pair.bed_min, wake_min: pair.wake_min, active: active[weekday] };
  });
}

/** Modo que describe unos días ya guardados (para abrir el editor con lo vigente). */
export function modeOf(days: ScheduleDay[]): ScheduleMode {
  const same = (a: ScheduleDay, b: ScheduleDay) => a.bed_min === b.bed_min && a.wake_min === b.wake_min;
  const by = (w: number) => days.find((d) => d.weekday === w)!;
  const week = [1, 2, 3, 4, 5].map(by);
  const weekend = WEEKEND_NIGHTS.map(by);
  if (week.every((d) => same(d, week[0])) && weekend.every((d) => same(d, week[0]))) return 'same';
  if (week.every((d) => same(d, week[0])) && same(weekend[0], weekend[1])) return 'weekend';
  return 'each';
}

/** Fecha local AAAA-MM-DD de un Date. */
function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function at(date: string, plusDays: number, minutes: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d + plusDays, Math.floor(minutes / 60), minutes % 60);
}
const weekdayOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};

/** Instante de acostarse de la noche `nightDate` (antes de mediodía → día siguiente). */
export function bedInstant(nightDate: string, bedMin: number): Date {
  return at(nightDate, bedMin < AFTER_MIDNIGHT ? 1 : 0, bedMin);
}

/** Instante de levantarse tras la noche `nightDate`: siempre la mañana siguiente. */
export function wakeInstant(nightDate: string, wakeMin: number): Date {
  return at(nightDate, 1, wakeMin);
}

/** Día del horario de una noche, o null si la versión no lo tiene activo. */
export function dayOf(version: ScheduleVersion | null, nightDate: string): ScheduleDay | null {
  const d = version?.days.find((x) => x.weekday === weekdayOf(nightDate));
  return d && d.active ? d : null;
}

function shiftDay(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + n));
}

/**
 * Hora de levantarse agendada para una noche abierta. La fecha de la noche registrada es el día en que
 * te acostaste (principio III), pero en el horario una hora después de medianoche pertenece a la noche
 * anterior (00:30 del sábado = noche del viernes). Por eso se mira esa noche y la anterior, y se toma la
 * primera hora de levantarse posterior a la hora real de acostarse (como mucho 18 h después).
 */
export function scheduledWake(bedtime: Date, nightDate: string, version: ScheduleVersion | null): Date | null {
  const candidates = [shiftDay(nightDate, -1), nightDate]
    .map((n) => dayOf(version, n) && wakeInstant(n, dayOf(version, n)!.wake_min))
    .filter((w): w is Date => !!w && w > bedtime && w.getTime() - bedtime.getTime() <= 18 * 3600_000);
  return candidates.length ? new Date(Math.min(...candidates.map((w) => w.getTime()))) : null;
}

/**
 * "¿Ya despertaste?" con horario (FR-012): con la noche abierta, si su noche del horario está activa y no
 * hay pausa, aparece a partir de la hora de levantarse agendada + 60 min, proponiendo esa hora.
 * null = no aplica (sin horario, noche inactiva o pausa): entonces rige la regla de 14 h de 006.
 */
export function scheduledWakeCheck(
  bedtime: Date, nightDate: string, version: ScheduleVersion | null, paused: boolean, now: Date,
): { due: boolean; proposal: Date } | null {
  if (paused) return null;
  const proposal = scheduledWake(bedtime, nightDate, version);
  if (!proposal) return null;
  return { due: now.getTime() - proposal.getTime() >= 60 * 60_000, proposal };
}

/**
 * Instante de prepararse de la noche de hoy (hora de acostarse − aviso), o null si hoy no hay horario
 * activo. `today` es la fecha local de la noche de hoy.
 */
export function prepareInstant(today: string, version: ScheduleVersion | null, leadMin: number): Date | null {
  const day = dayOf(version, today);
  if (!day) return null;
  return new Date(bedInstant(today, day.bed_min).getTime() - leadMin * 60_000);
}

/** ¿Está `now` a ±1 min del instante? (aviso con la app abierta, FR-018) */
export function isAround(now: Date, instant: Date | null, marginMin = 1): boolean {
  return !!instant && Math.abs(now.getTime() - instant.getTime()) <= marginMin * 60_000;
}

export { localDay };
