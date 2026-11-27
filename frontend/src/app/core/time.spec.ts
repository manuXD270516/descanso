import { inputDurationMin, inputLocalToIso, nightDate } from './time';

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

describe('inputDurationMin (T046: misma duración y validez al crear y al editar)', () => {
  // Karma no permite fijar la zona del navegador: se inyecta la conversión de America/New_York, donde el
  // 2026-11-01 el reloj retrocede de 02:00 a 01:00 y la hora 01:00-01:59 existe con -04:00 y con -05:00.
  const nuevaYork = (offsetDeLaHoraRepetida: string) => (v: string) => {
    const hora = v.slice(11, 16);
    const repetida = v.startsWith('2026-11-01') && hora >= '01:00' && hora < '02:00';
    const off = repetida ? offsetDeLaHoraRepetida : v.startsWith('2026-11-01') ? '-05:00' : '-04:00';
    return `${v}:00${off}`;
  };

  it('en la hora repetida, 01:30 con -04:00 y con -05:00 son instantes distintos (una hora de diferencia)', () => {
    const a = Date.parse(nuevaYork('-04:00')('2026-11-01T01:30'));
    const b = Date.parse(nuevaYork('-05:00')('2026-11-01T01:30'));
    expect(b - a).toBe(60 * 60000);
  });

  it('mide con los mismos offsets que se envían: 01:30 (-04:00) a 02:10 (-05:00) son 100 min, no 40', () => {
    expect(inputDurationMin('2026-11-01T01:30', '2026-11-01T02:10', nuevaYork('-04:00'))).toBe(100);
  });

  it('si el inicio cae en la segunda pasada (-05:00), el mismo fin da 40 min', () => {
    expect(inputDurationMin('2026-11-01T01:30', '2026-11-01T02:10', nuevaYork('-05:00'))).toBe(40);
  });

  it('un fin igual o anterior al inicio no es válido (null)', () => {
    expect(inputDurationMin('2026-11-01T01:30', '2026-11-01T01:30', nuevaYork('-04:00'))).toBeNull();
    expect(inputDurationMin('2026-11-01T01:50', '2026-11-01T01:20', nuevaYork('-04:00'))).toBeNull();
  });

  it('sin inicio o sin fin devuelve null', () => {
    expect(inputDurationMin('', '2026-11-01T02:10')).toBeNull();
    expect(inputDurationMin('2026-11-01T01:30', '')).toBeNull();
  });

  it('con la conversión real da lo mismo que la resta de los ISO enviados', () => {
    const s = '2026-09-07T14:00', e = '2026-09-07T14:45';
    expect(inputDurationMin(s, e)).toBe(Math.round((Date.parse(inputLocalToIso(e)) - Date.parse(inputLocalToIso(s))) / 60000));
  });
});
