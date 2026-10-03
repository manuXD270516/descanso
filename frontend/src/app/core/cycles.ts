/**
 * Ciclos de sueño (feature 005, US4). Misma regla que backend/src/analytics.js `cycles()`, aquí para
 * recalcular al vuelo mientras se edita el objetivo. Desde la feature 006 cada persona ajusta su
 * ciclo (70–110 min); CYCLE_MIN y LATENCY_MIN son solo los valores por defecto.
 */
export const CYCLE_MIN = 90;
export const LATENCY_MIN = 15;
export const GOAL_MIN = 240;
export const GOAL_MAX = 720;

export interface CycleShortcut {
  cycles: number;
  minutes: number;
}

/** Equivalencia en ciclos (1 decimal) y los 3 atajos de ciclos completos más cercanos dentro de 4–12 h. */
export function cyclesFor(goalMin: number, cycleMin = CYCLE_MIN): { equivalent: number; shortcuts: CycleShortcut[] } {
  const all: CycleShortcut[] = [];
  for (let n = 1; n * cycleMin <= GOAL_MAX; n++) if (n * cycleMin >= GOAL_MIN) all.push({ cycles: n, minutes: n * cycleMin });
  const shortcuts = [...all]
    .sort((a, b) => Math.abs(a.minutes - goalMin) - Math.abs(b.minutes - goalMin) || a.minutes - b.minutes)
    .slice(0, 3)
    .sort((a, b) => a.cycles - b.cycles);
  return { equivalent: Math.round((goalMin / cycleMin) * 10) / 10, shortcuts };
}

/** "7 h 30" / "6 h" para atajos y textos. */
export function fmtGoal(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Ventana de despertar estimada (feature 006, US2). Nunca se guarda: es una estimación (principio VIII). */
export interface WakeWindow {
  cycles: number;
  center: Date;
  start: Date;
  end: Date;
}

/**
 * Ventanas para despertar tras completar n ciclos: centro = dormir + tiempo en dormirse + n × ciclo,
 * ± halfWidth minutos. Se suma en instantes absolutos (milisegundos), así un cambio de horario entre
 * la noche y la mañana no desplaza la hora real (principio III).
 */
export function wakeWindows(
  bedtime: Date,
  { cycleMin = CYCLE_MIN, latencyMin = LATENCY_MIN }: { cycleMin?: number; latencyMin?: number } = {},
  counts: number[] = [4, 5, 6],
  halfWidth = 15,
): WakeWindow[] {
  const MIN = 60_000;
  return counts.map((cycles) => {
    const center = new Date(bedtime.getTime() + (latencyMin + cycles * cycleMin) * MIN);
    return { cycles, center, start: new Date(center.getTime() - halfWidth * MIN), end: new Date(center.getTime() + halfWidth * MIN) };
  });
}

/** Fecha local (AAAA-MM-DD) de un instante en una zona (por defecto, la del navegador). */
function localDay(d: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** "6:30" en hora local de la zona. */
export function fmtClock(d: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('es', { timeZone, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).format(d);
}

/** Texto de una ventana ("entre 6:30 y 7:00") y si cae al día siguiente del de acostarse. */
export function fmtWindow(w: WakeWindow, bedtime: Date, timeZone?: string): { range: string; center: string; tomorrow: boolean } {
  return {
    range: `entre ${fmtClock(w.start, timeZone)} y ${fmtClock(w.end, timeZone)}`,
    center: fmtClock(w.center, timeZone),
    tomorrow: localDay(w.center, timeZone) > localDay(bedtime, timeZone),
  };
}
