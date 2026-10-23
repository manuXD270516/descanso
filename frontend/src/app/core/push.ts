// Avisos push con la app cerrada (feature 013): tipos de la API, reglas y textos puros. El cliente no
// calcula cuándo llega un aviso (lo hace el servidor); solo muestra las horas de hoy y el estado de
// este dispositivo. Sin datos de sueño ni de salud en ningún texto (FR-022, principio VIII).
import { ScheduleVersion } from './schedule';

export type PushKind = 'prepare' | 'bedtime' | 'wake_check';

export interface PushKinds {
  prepare: boolean;
  bedtime: boolean;
  wake_check: boolean;
}

export interface PushDnd {
  start_min: number;
  end_min: number;
}

export interface PushPreferences {
  kinds: PushKinds;
  dnd: PushDnd | null;
  muted_until: string | null;
}

export interface PushDevice {
  id: number;
  label: string;
  created_at: string;
  fingerprint: string;
}

export interface PushState {
  available: boolean;
  public_key: string | null;
  timezone: string | null;
  preferences: PushPreferences;
  devices: PushDevice[];
}

export interface PushPreferencesPatch {
  kinds?: Partial<PushKinds>;
  dnd?: PushDnd | null;
  mute_today?: boolean;
}

export type TestResult = 'sent' | 'expired' | 'failed';

/** Mensaje que el service worker entrega a la página cuando hay una ventana visible (FR-019). */
export interface PushMessage {
  type: 'descanso-push';
  kind: PushKind | 'test';
  night: string | null;
  title: string;
  body: string;
  tag: string;
  url: string;
}

export const KIND_LABELS: Record<PushKind, string> = {
  prepare: 'Prepárate',
  bedtime: 'Hora de dormir',
  wake_check: '¿Ya despertaste?',
};
export const KINDS: PushKind[] = ['prepare', 'bedtime', 'wake_check'];

/** "23:15" → "23:15"; "07:00" → "7:00" (sin cero a la izquierda, como el resto de textos de la app). */
export function clock(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

export interface ReminderTime {
  kind: PushKind;
  time: string;
  /** "Prepárate · 22:45" */
  text: string;
}

/**
 * Horas de los tres avisos de la noche de `weekday` (0 = domingo) con la versión del horario vigente:
 * prepare = acostarse − "Avisarme antes", bedtime = acostarse y wake_check = levantarse + 60 min.
 * null si no hay horario o esa noche está inactiva.
 */
export function reminderTimes(version: ScheduleVersion | null, weekday: number, leadMin: number): ReminderTime[] | null {
  const day = version?.days.find((d) => d.weekday === weekday);
  if (!day || !day.active) return null;
  const minutes: Record<PushKind, number> = { prepare: day.bed_min - leadMin, bedtime: day.bed_min, wake_check: day.wake_min + 60 };
  return KINDS.map((kind) => {
    const time = clock(minutes[kind]);
    return { kind, time, text: `${KIND_LABELS[kind]} · ${time}` };
  });
}

export type BlockState = 'unsupported' | 'unavailable' | 'no_schedule' | 'denied' | 'needs_reactivation' | 'off' | 'on';

export interface BlockInputs {
  /** El navegador admite service worker, PushManager y Notification. */
  supported: boolean;
  /** El servidor tiene credenciales VAPID (FR-024). */
  available: boolean;
  hasSchedule: boolean;
  permission: NotificationPermission;
  /** Este navegador tiene una suscripción push. */
  subscribed: boolean;
  /** Su clave del servidor coincide con la actual (se rota con VAPID, FR-025). */
  keyMatches: boolean;
  /** Su huella está en la lista de dispositivos de la persona. */
  listed: boolean;
}

/** Estado del dispositivo actual (FR-004, FR-025); la app funciona igual en todos. */
export function blockState(i: BlockInputs): BlockState {
  if (!i.supported) return 'unsupported';
  if (!i.available) return 'unavailable';
  if (i.permission === 'denied') return 'denied';
  if (i.subscribed && i.keyMatches && i.listed) return 'on';
  if (!i.hasSchedule) return 'no_schedule';
  return i.subscribed ? 'needs_reactivation' : 'off';
}

/** Texto visible de un aviso recibido con la app abierta (idéntico al de la notificación). */
export const pushMessageText = (m: Pick<PushMessage, 'title' | 'body'>): string => `${m.title}: ${m.body}`;

// --- Textos de la explicación previa (FR-002, FR-005, FR-012 y los límites del móvil) ---

export const PUSH_TITLE = 'Avisos en este móvil';
export const PUSH_INTRO =
  'Recibe un aviso en este móvil aunque Descanso esté cerrada: uno para prepararte, otro a la hora de dormir y otro por la mañana, ' +
  'si tu noche sigue abierta. Las horas salen de tu horario y de "Avisarme antes".';
export const PUSH_NO_HEALTH = 'El texto de los avisos es siempre el mismo: nunca lleva datos de tu sueño ni de tu salud.';
export const PUSH_DELIVERY =
  'Lo entrega el servicio de avisos de tu navegador (Google, en Chrome de Android): sabe cuándo llega un aviso, pero no su contenido. ' +
  'Descanso no usa ningún otro tercero para programarlos. Al pulsar "Activar avisos" aceptas esto.';
export const PUSH_DOUBLE =
  'Si importaste el calendario de Descanso, recibirás dos avisos de "prepárate": el del calendario y este. ' +
  'Puedes desactivar aquí el de Descanso o borrar los eventos de tu calendario.';
export const PUSH_LIMITS =
  'Límites del móvil: "No molestar" de Android puede silenciar el aviso, el ahorro de batería del fabricante puede retrasarlo y, ' +
  'con el móvil quieto mucho rato, Android puede entregarlo con algo de retraso.';

export const PUSH_UNSUPPORTED = 'Este navegador no puede recibir avisos con la app cerrada';
export const PUSH_UNSUPPORTED_ALT =
  'Puedes usar el calendario: descarga el archivo de "Añadir a mi calendario" y tu calendario te avisará antes de acostarte.';
export const PUSH_UNAVAILABLE = 'Los avisos no están disponibles';
export const PUSH_NO_SCHEDULE = 'Primero agenda tu horario';
export const PUSH_DENIED =
  'Los avisos están bloqueados en este navegador. Para reactivarlos, abre los ajustes del sitio en tu navegador (el candado junto a la dirección), ' +
  'permite las notificaciones y vuelve aquí. El resto de Descanso funciona igual.';
export const PUSH_REACTIVATE = 'Vuelve a activar los avisos';
export const PUSH_REACTIVATE_WHY = 'Este móvil ya no está activado en tu cuenta (se cerró la sesión, se quitó o cambió la clave del servicio).';

export const TEST_MESSAGES = {
  sent: 'Enviado. Debería llegarte en unos segundos.',
  expired: 'Este dispositivo ya no es válido: vuelve a activar los avisos.',
  failed: 'No se pudo enviar.',
  denied: `Permiso retirado: ${PUSH_DENIED}`,
} as const;
