import { inputLocalToIso, nightDate } from './time';

describe('nightDate (fecha de la noche = día local en que te acuestas)', () => {
  it('antes de medianoche: 23:40 del lunes → lunes', () => {
    expect(nightDate('2026-09-07T23:40:00-04:00')).toBe('2026-09-07');
  });

  it('después de medianoche: 00:30 del martes → martes', () => {
    expect(nightDate('2026-09-08T00:30:00-04:00')).toBe('2026-09-08');
  });

  it('usa el día local del offset registrado, no el día UTC', () => {
    // 22:00 en -04:00 es 02:00Z del día siguiente; la noche sigue siendo el día local
    expect(nightDate('2026-09-07T22:00:00-04:00')).toBe('2026-09-07');
    // 01:00 en +02:00 es 23:00Z del día anterior; la noche es el día local
    expect(nightDate('2026-09-08T01:00:00+02:00')).toBe('2026-09-08');
  });

  it('encadenado con inputLocalToIso conserva el día local introducido', () => {
    expect(nightDate(inputLocalToIso('2026-09-07T23:40'))).toBe('2026-09-07');
  });
});

describe('inputLocalToIso', () => {
  it('añade segundos y el offset del navegador (FR-005)', () => {
    const iso = inputLocalToIso('2026-09-07T23:40');
    expect(iso).toMatch(/^2026-09-07T23:40:00[+-]\d{2}:\d{2}$/);
    // Representa el mismo instante que la hora local introducida
    expect(new Date(iso).getTime()).toBe(new Date('2026-09-07T23:40').getTime());
  });

  it('no duplica los segundos si ya vienen', () => {
    expect(inputLocalToIso('2026-09-07T23:40:15')).toMatch(/^2026-09-07T23:40:15[+-]\d{2}:\d{2}$/);
  });
});
