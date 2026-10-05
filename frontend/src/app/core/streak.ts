// Racha de constancia (feature 011): tipos de la API y textos puros. El cliente no recalcula nada:
// pinta lo que devuelve el servidor. Lenguaje sin culpa (FR-020…FR-022, principio VIII).
import { fmtDuration } from './time';

export type DayState = 'met' | 'missed' | 'paused' | 'pending' | 'off';
export type MissReason = 'late_bed' | 'proposal' | 'late_wake' | 'no_record';

export interface StreakDay {
  date: string;
  state: DayState;
  reason: MissReason | null;
  bed_time: string | null;
  wake_time: string | null;
  late_logged: boolean;
}

export interface Achievement {
  key: number;
  achieved_on: string;
  wake_spread_min: number;
  seen: boolean;
}

export interface WeekSummary {
  week_start: string;
  met: number;
  of: number;
  avg_min: number | null;
}

export interface Streak {
  enabled: boolean;
  offered: boolean;
  margin_min: number;
  offer: boolean;
  current?: number;
  best?: number;
  total?: number;
  cut?: boolean;
  week?: StreakDay[];
  last_night?: StreakDay;
  achievements?: Achievement[];
  summary?: WeekSummary | null;
}

export interface StreakSettingsPatch {
  enabled?: boolean;
  margin_min?: number;
  offered?: true;
  dismiss_summary?: true;
}

export const TOLERANCE_TEXT = 'Puedes fallar hasta 2 días en cualquier periodo de 7 días seguidos';

export const dayLine = (n: number) => `Día ${n} de constancia`;
export const bestText = (n: number) => `Tu récord: ${n}`;
export const totalText = (n: number) => `Días cumplidos en total: ${n}`;

/** "00:15" → "0:15" (como se lee en voz alta). */
export const wallTime = (hhmm: string | null) => (hhmm ? hhmm.replace(/^0(\d)/, '$1') : '');

/** Motivo de un día no cumplido, sin juicio (FR-021). */
export function reasonText(day: Pick<StreakDay, 'reason' | 'bed_time' | 'wake_time'>): string {
  switch (day.reason) {
    case 'late_bed': return `Te acostaste a las ${wallTime(day.bed_time)} (fuera de tu horario)`;
    case 'late_wake': return `Te levantaste a las ${wallTime(day.wake_time)} (fuera de tu horario)`;
    case 'proposal': return 'Hora propuesta, sin anotar la real';
    case 'no_record': return 'Sin registro';
    default: return '';
  }
}

/** Nuevo comienzo (FR-020): variante de inicio de semana si mañana es lunes. */
export function freshStartText(best: number, today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const tomorrowIsMonday = new Date(y, m - 1, d + 1).getDay() === 1;
  return tomorrowIsMonday
    ? `Tu récord sigue siendo ${best}. Mañana empieza la semana: un buen día para empezar otra`
    : `Tu récord sigue siendo ${best}. Mañana es un buen día para empezar otra`;
}

const WEEKDAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const STATE_LABEL: Record<DayState, string> = {
  met: 'cumplido',
  missed: 'no cumplido',
  paused: 'en pausa',
  pending: 'aún no',
  off: 'antes de activar la racha',
};

/** Etiqueta accesible de una estrella: no depende solo del color (FR-012). */
export function starLabel(day: StreakDay): string {
  const [y, m, d] = day.date.split('-').map(Number);
  const name = WEEKDAY[new Date(y, m - 1, d).getDay()];
  const parts = [`Noche del ${name}: ${STATE_LABEL[day.state]}`];
  if (day.state === 'missed') parts.push(reasonText(day));
  if (day.late_logged) parts.push('Anotado después');
  return parts.join('. ');
}

/** Línea tras "Ya desperté" (FR-019): con estrella si anoche cuenta; neutra si no. */
export function morningText(s: Streak, today: string): string {
  const n = s.current ?? 0;
  if (s.last_night?.state === 'met') return `${dayLine(n)} ★`;
  if (s.cut) return freshStartText(s.best ?? 0, today);
  const why = s.last_night?.state === 'missed' ? `Anoche no sumó a la racha: ${reasonText(s.last_night)}. ` : '';
  return n > 0 ? `${why}Sigues en el día ${n} de constancia.` : `${why}Tu racha empieza con la próxima noche que cumplas.`;
}

export const achievementTitle = (key: number) => `Constelación de ${key} días`;
export const achievementFact = (a: Achievement) => `Tu hora de levantarte varió solo ±${a.wake_spread_min} min`;
/** La de 66 se presenta como media, no como regla para todos (FR-014). */
export const MEAN_66_TEXT = '66 días es la media que tarda un hábito en volverse automático; a cada persona le lleva su tiempo.';

export function summaryText(s: WeekSummary): string {
  const avg = s.avg_min === null ? 'media: sin datos' : `media ${fmtDuration(s.avg_min)}`;
  return `La semana pasada: ${s.met} de ${s.of} días cumplidos · ${avg}`;
}
