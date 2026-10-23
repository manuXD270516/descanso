import { daysFor } from './schedule';
import {
  BlockInputs, PUSH_DELIVERY, PUSH_DOUBLE, PUSH_INTRO, PUSH_LIMITS, PUSH_NO_HEALTH, TEST_MESSAGES, blockState, clock, pushMessageText, reminderTimes,
} from './push';

// Avisos push (feature 013, US1): horas de hoy, estado del bloque y textos de la explicación previa.
const version = (bed: number, wake: number, inactive: number[] = []) => ({
  id: 1,
  effective_from: '2026-10-01',
  days: daysFor('same', { bed_min: bed, wake_min: wake }, { bed_min: bed, wake_min: wake }, [0, 1, 2, 3, 4, 5, 6].map((d) => !inactive.includes(d))),
});

describe('core/push · reminderTimes', () => {
  it('23:15 → 7:00 con 30 min: Prepárate 22:45, Hora de dormir 23:15 y ¿Ya despertaste? 8:00', () => {
    expect(reminderTimes(version(1395, 420), 1, 30)!.map((t) => t.text)).toEqual([
      'Prepárate · 22:45', 'Hora de dormir · 23:15', '¿Ya despertaste? · 8:00',
    ]);
  });

  it('con otro "Avisarme antes" cambia solo el prepárate', () => {
    expect(reminderTimes(version(1395, 420), 1, 45)!.map((t) => t.time)).toEqual(['22:30', '23:15', '8:00']);
  });

  it('acostarse a las 0:15 → prepárate 23:45; levantarse 23:30 → 0:30', () => {
    expect(reminderTimes(version(15, 420), 1, 30)!.map((t) => t.time)).toEqual(['23:45', '0:15', '8:00']);
    expect(reminderTimes(version(1395, 1410), 1, 30)!.map((t) => t.time)).toEqual(['22:45', '23:15', '0:30']);
  });

  it('sin horario o con la noche inactiva no hay horas', () => {
    expect(reminderTimes(null, 1, 30)).toBeNull();
    expect(reminderTimes(version(1395, 420, [3]), 3, 30)).toBeNull();
    expect(reminderTimes(version(1395, 420, [3]), 4, 30)).not.toBeNull();
  });

  it('clock normaliza la vuelta de día', () => {
    expect([clock(0), clock(-15), clock(1440 + 30), clock(450)]).toEqual(['0:00', '23:45', '0:30', '7:30']);
  });
});

describe('core/push · blockState', () => {
  const base: BlockInputs = { supported: true, available: true, hasSchedule: true, permission: 'default', subscribed: false, keyMatches: false, listed: false };
  const state = (p: Partial<BlockInputs>) => blockState({ ...base, ...p });

  it('no compatible y no disponible mandan sobre todo lo demás', () => {
    expect(state({ supported: false })).toBe('unsupported');
    expect(state({ supported: false, available: false, permission: 'denied' })).toBe('unsupported');
    expect(state({ available: false })).toBe('unavailable');
  });

  it('permiso denegado', () => {
    expect(state({ permission: 'denied' })).toBe('denied');
    expect(state({ permission: 'denied', hasSchedule: false })).toBe('denied');
  });

  it('sin horario no se puede activar', () => {
    expect(state({ hasSchedule: false })).toBe('no_schedule');
  });

  it('desactivado, activado y "hay que reactivar" (FR-025)', () => {
    expect(state({})).toBe('off');
    expect(state({ permission: 'granted' })).toBe('off');
    expect(state({ permission: 'granted', subscribed: true, keyMatches: true, listed: true })).toBe('on');
    expect(state({ permission: 'granted', subscribed: true, keyMatches: true, listed: true, hasSchedule: false })).toBe('on');
    expect(state({ permission: 'granted', subscribed: true, keyMatches: false, listed: true })).toBe('needs_reactivation');
    expect(state({ permission: 'granted', subscribed: true, keyMatches: true, listed: false })).toBe('needs_reactivation');
  });
});

describe('core/push · textos', () => {
  it('la explicación previa dice quién entrega el aviso, que no lleva datos de salud y el doble "prepárate"', () => {
    expect(PUSH_DELIVERY).toContain('Google, en Chrome de Android');
    expect(PUSH_DELIVERY).toContain('no su contenido');
    expect(PUSH_DELIVERY).toContain('ningún otro tercero');
    expect(PUSH_NO_HEALTH).toContain('nunca lleva datos de tu sueño ni de tu salud');
    expect(PUSH_DOUBLE).toContain('dos avisos de "prepárate"');
    expect(PUSH_INTRO).toContain('Avisarme antes');
  });

  it('los límites del móvil: No molestar, ahorro de batería y reposo', () => {
    expect(PUSH_LIMITS).toContain('No molestar');
    expect(PUSH_LIMITS).toContain('ahorro de batería');
    expect(PUSH_LIMITS).toContain('quieto');
  });

  it('el aviso recibido con la app abierta se lee como la notificación', () => {
    expect(pushMessageText({ title: 'Descanso', body: 'es tu hora de dormir' })).toBe('Descanso: es tu hora de dormir');
  });

  it('los mensajes de la prueba cubren cada resultado', () => {
    expect(TEST_MESSAGES.sent).toBe('Enviado. Debería llegarte en unos segundos.');
    expect(TEST_MESSAGES.expired).toContain('vuelve a activar los avisos');
    expect(TEST_MESSAGES.denied).toContain('Permiso retirado');
    expect(TEST_MESSAGES.failed).toBe('No se pudo enviar.');
  });
});
