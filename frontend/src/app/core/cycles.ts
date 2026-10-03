/**
 * Ciclos de sueño (feature 005, US4). Misma regla que backend/src/analytics.js `cycles()`, aquí para
 * recalcular al vuelo mientras se edita el objetivo. Hasta la feature 006, un ciclo dura 90 min.
 */
export const CYCLE_MIN = 90;
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
