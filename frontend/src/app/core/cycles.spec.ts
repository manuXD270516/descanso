import { CYCLE_MIN, LATENCY_MIN, fmtClock, fmtWindow, wakeWindows } from './cycles';

// Calculadora de ciclos (feature 006, US2, FR-005/FR-006, SC-003): instantes absolutos y hora local.
describe('wakeWindows / fmtWindow', () => {
  const at = (iso: string) => new Date(iso);
  const clocks = (bed: Date, opts = {}, tz = 'America/La_Paz') => wakeWindows(bed, opts).map((w) => fmtClock(w.center, tz));

  it('por defecto: ciclo de 90 min y 15 min para dormirse', () => {
    expect([CYCLE_MIN, LATENCY_MIN]).toEqual([90, 15]);
  });

  it('23:00 con 90/15 → 5:15, 6:45 y 8:15 (4, 5 y 6 ciclos), ventanas de ±15 min y "mañana"', () => {
    const bed = at('2026-09-29T23:00:00-04:00');
    const ws = wakeWindows(bed);
    expect(ws.map((w) => w.cycles)).toEqual([4, 5, 6]);
    expect(clocks(bed)).toEqual(['5:15', '6:45', '8:15']);
    const f = fmtWindow(ws[1], bed, 'America/La_Paz');
    expect(f.range).toBe('entre 6:30 y 7:00');
    expect(f.tomorrow).toBeTrue();
  });

  it('22:00 con ciclo de 70 y sin latencia → 2:40, 3:50 y 5:00', () => {
    expect(clocks(at('2026-09-29T22:00:00-04:00'), { cycleMin: 70, latencyMin: 0 })).toEqual(['2:40', '3:50', '5:00']);
  });

  it('acostarse de madrugada: la ventana cae el mismo día, sin "mañana"', () => {
    const bed = at('2026-09-30T00:30:00-04:00');
    const f = fmtWindow(wakeWindows(bed)[0], bed, 'America/La_Paz');
    expect(f.center).toBe('6:45');
    expect(f.tomorrow).toBeFalse();
  });

  it('cambio de horario (Europe/Madrid, 25-oct-2026, 3:00 → 2:00): 5 ciclos desde las 23:00 → 5:45, no 6:45', () => {
    const bed = at('2026-10-24T23:00:00+02:00');
    const five = wakeWindows(bed)[1];
    expect(five.center.toISOString()).toBe('2026-10-25T04:45:00.000Z');
    const f = fmtWindow(five, bed, 'Europe/Madrid');
    expect(f.center).toBe('5:45');
    expect(f.range).toBe('entre 5:30 y 6:00');
    expect(f.tomorrow).toBeTrue();
  });

  it('extremos: ciclo de 110, latencia de 60 y 6 ciclos → 12 h después, al día siguiente', () => {
    const bed = at('2026-09-29T21:00:00-04:00');
    const six = wakeWindows(bed, { cycleMin: 110, latencyMin: 60 })[2];
    expect(six.center.getTime() - bed.getTime()).toBe(720 * 60_000);
    expect(fmtWindow(six, bed, 'America/La_Paz')).toEqual({ range: 'entre 8:45 y 9:15', center: '9:00', tomorrow: true });
  });
});
