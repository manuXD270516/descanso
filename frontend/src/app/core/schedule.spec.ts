import {
  ScheduleVersion, bedInstant, dayOf, daysFor, isAround, minToTime, modeOf, prepareInstant, proposeBed,
  scheduledWakeCheck, timeToMin, wakeInstant,
} from './schedule';

// Reglas del horario (feature 010): propuesta de acostarse, fin de semana = noches de sábado y domingo,
// instantes que cruzan la medianoche y "¿Ya despertaste?" a la hora de levantarse + 60 min.
const local = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi);
const week = { bed_min: 1395, wake_min: 420 };
const weekend = { bed_min: 75, wake_min: 540 };
const version = (days = daysFor('weekend', week, weekend)): ScheduleVersion => ({ id: 1, effective_from: '2026-10-01', days });

describe('core/schedule', () => {
  it('propone acostarse = levantarse − objetivo − 15 min, con vuelta de día (FR-002)', () => {
    expect(proposeBed(420, 450)).toBe(1395); // 7:00 con 7 h 30 → 23:15
    expect(proposeBed(540, 450)).toBe(75); //   9:00 → 1:15
    expect(proposeBed(300, 540)).toBe(1185); // 5:00 con 9 h → 19:45
    expect(minToTime(1395)).toBe('23:15');
    expect(timeToMin('07:05')).toBe(425);
    expect(timeToMin('25:00')).toBeNull();
  });

  it('fin de semana = noches del sábado (6) y del domingo (0); "igual" pone el mismo par en las 7', () => {
    const days = daysFor('weekend', week, weekend);
    expect(days.filter((d) => d.bed_min === 75).map((d) => d.weekday)).toEqual([0, 6]);
    expect(days.filter((d) => d.bed_min === 1395).map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(daysFor('same', week, weekend).map((d) => d.bed_min))).toEqual(new Set([1395]));
    expect(modeOf(days)).toBe('weekend');
    expect(modeOf(daysFor('same', week, weekend))).toBe('same');
    expect(modeOf(days.map((d) => (d.weekday === 3 ? { ...d, wake_min: 400 } : d)))).toBe('each');
  });

  it('instantes: acostarse antes de mediodía cae el día siguiente; levantarse, siempre la mañana siguiente', () => {
    expect(bedInstant('2026-10-03', 75)).toEqual(local(2026, 10, 4, 1, 15)); // noche del sábado, 1:15 del domingo
    expect(bedInstant('2026-10-05', 1395)).toEqual(local(2026, 10, 5, 23, 15));
    expect(wakeInstant('2026-10-05', 420)).toEqual(local(2026, 10, 6, 7, 0));
  });

  it('"¿Ya despertaste?": a las 7:59 no, a las 8:00 sí (levantarse 7:00 + 60 min); propone 7:00', () => {
    const v = version();
    const bed = local(2026, 10, 5, 23, 10); // noche del lunes
    const at759 = scheduledWakeCheck(bed, '2026-10-05', v, false, local(2026, 10, 6, 7, 59))!;
    expect(at759.due).toBeFalse();
    const at800 = scheduledWakeCheck(bed, '2026-10-05', v, false, local(2026, 10, 6, 8, 0))!;
    expect(at800.due).toBeTrue();
    expect(at800.proposal).toEqual(local(2026, 10, 6, 7, 0));
  });

  it('acostarse pasada la medianoche: la noche registrada es la del día siguiente, pero rige la hora de levantarse de la noche anterior del horario', () => {
    // Domingo 4-oct a las 00:40: la noche registrada es la del domingo (principio III), pero en el horario
    // es la del sábado (1:15 → 9:00). Propone el domingo a las 9:00, no el lunes a las 7:00.
    const bed = local(2026, 10, 4, 0, 40);
    expect(scheduledWakeCheck(bed, '2026-10-04', version(), false, local(2026, 10, 4, 10, 1))!).toEqual({ due: true, proposal: local(2026, 10, 4, 9, 0) });
  });

  it('sin horario, con la noche inactiva o en pausa no aplica (rige la regla de 14 h de 006)', () => {
    const inactive = version(daysFor('weekend', week, weekend, [true, false, true, true, true, true, true]));
    const bed = local(2026, 10, 5, 23, 10);
    expect(scheduledWakeCheck(bed, '2026-10-05', null, false, new Date())).toBeNull();
    expect(scheduledWakeCheck(bed, '2026-10-05', inactive, false, new Date())).toBeNull(); // 5-oct es lunes
    expect(scheduledWakeCheck(bed, '2026-10-05', version(), true, new Date())).toBeNull();
    expect(dayOf(version(), '2026-10-03')!.bed_min).toBe(75); // sábado
  });

  it('aviso con la app abierta: acostarse − aviso, con ±1 min de margen (FR-018)', () => {
    const prep = prepareInstant('2026-10-05', version(), 30)!;
    expect(prep).toEqual(local(2026, 10, 5, 22, 45));
    expect(isAround(local(2026, 10, 5, 22, 46), prep)).toBeTrue();
    expect(isAround(local(2026, 10, 5, 22, 47), prep)).toBeFalse();
    expect(prepareInstant('2026-10-05', null, 30)).toBeNull();
  });
});
