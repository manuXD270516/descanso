import {
  MEAN_66_TEXT, TOLERANCE_TEXT, achievementFact, bestText, dayLine, freshStartText, morningText, reasonText, starLabel, summaryText, totalText,
} from './streak';

// Textos de la racha (feature 011, US1 y US4): sin culpa, con el motivo y la variante de la semana.
describe('core/streak · textos', () => {
  it('día, récord, total y tolerancia', () => {
    expect(dayLine(12)).toBe('Día 12 de constancia');
    expect(bestText(25)).toBe('Tu récord: 25');
    expect(totalText(60)).toBe('Días cumplidos en total: 60');
    expect(TOLERANCE_TEXT).toBe('Puedes fallar hasta 2 días en cualquier periodo de 7 días seguidos');
  });

  it('motivos neutros con la hora de pared', () => {
    expect(reasonText({ reason: 'late_bed', bed_time: '00:15', wake_time: '07:00' })).toBe('Te acostaste a las 0:15 (fuera de tu horario)');
    expect(reasonText({ reason: 'late_wake', bed_time: '23:00', wake_time: '09:10' })).toBe('Te levantaste a las 9:10 (fuera de tu horario)');
    expect(reasonText({ reason: 'proposal', bed_time: '23:00', wake_time: '07:00' })).toBe('Hora propuesta, sin anotar la real');
    expect(reasonText({ reason: 'no_record', bed_time: null, wake_time: null })).toBe('Sin registro');
  });

  it('nuevo comienzo, con la variante si mañana es lunes', () => {
    expect(freshStartText(25, '2026-10-07')).toBe('Tu récord sigue siendo 25. Mañana es un buen día para empezar otra');
    expect(freshStartText(25, '2026-10-04')).toContain('Mañana empieza la semana'); // domingo
  });

  it('etiqueta accesible de cada estrella, con motivo y marca "Anotado después"', () => {
    expect(starLabel({ date: '2026-10-05', state: 'met', reason: null, bed_time: '23:00', wake_time: '07:00', late_logged: false }))
      .toBe('Noche del lunes: cumplido');
    expect(starLabel({ date: '2026-10-06', state: 'missed', reason: 'late_wake', bed_time: '23:00', wake_time: '09:10', late_logged: true }))
      .toBe('Noche del martes: no cumplido. Te levantaste a las 9:10 (fuera de tu horario). Anotado después');
    expect(starLabel({ date: '2026-10-07', state: 'paused', reason: null, bed_time: null, wake_time: null, late_logged: false })).toContain('en pausa');
  });

  it('línea de la mañana: con estrella, neutra o nuevo comienzo', () => {
    const met = { date: '2026-10-04', state: 'met' as const, reason: null, bed_time: '23:00', wake_time: '07:00', late_logged: false };
    const base = { enabled: true, offered: true, margin_min: 30, offer: false };
    expect(morningText({ ...base, current: 4, last_night: met }, '2026-10-05')).toBe('Día 4 de constancia ★');
    expect(morningText({ ...base, current: 4, last_night: { ...met, state: 'missed', reason: 'late_wake', wake_time: '09:10' } }, '2026-10-05'))
      .toBe('Anoche no sumó a la racha: Te levantaste a las 9:10 (fuera de tu horario). Sigues en el día 4 de constancia.');
    expect(morningText({ ...base, current: 0, last_night: { ...met, state: 'missed', reason: 'late_bed', bed_time: '00:15' } }, '2026-10-05'))
      .toBe('Anoche no sumó a la racha: Te acostaste a las 0:15 (fuera de tu horario). Tu racha empieza con la próxima noche que cumplas.');
    expect(morningText({ ...base, current: 0, best: 25, cut: true, last_night: { ...met, state: 'missed', reason: 'no_record' } }, '2026-10-07'))
      .toBe('Tu récord sigue siendo 25. Mañana es un buen día para empezar otra');
  });

  it('constelaciones y resumen: la de 66 como media; "sin datos" nunca es 0', () => {
    expect(achievementFact({ key: 7, achieved_on: '2026-10-05', wake_spread_min: 12, seen: false })).toBe('Tu hora de levantarte varió solo ±12 min');
    expect(MEAN_66_TEXT).toContain('media');
    expect(summaryText({ week_start: '2026-09-28', met: 5, of: 7, avg_min: 430 })).toBe('La semana pasada: 5 de 7 días cumplidos · media 7 h 10 min');
    expect(summaryText({ week_start: '2026-09-28', met: 1, of: 6, avg_min: null })).toBe('La semana pasada: 1 de 6 días cumplidos · media: sin datos');
  });
});
