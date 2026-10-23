import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { PushDevice, PushMessage, PushPreferences, PushPreferencesPatch, PushState, TestResult } from './push';

/** Lo que el servicio necesita del navegador; las pruebas lo sustituyen (service worker, PushManager y Notification). */
export interface PushPlatform {
  supported(): boolean;
  permission(): NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  container(): ServiceWorkerContainer | null;
}

export const PUSH_PLATFORM = new InjectionToken<PushPlatform>('PUSH_PLATFORM', {
  providedIn: 'root',
  factory: () => ({
    supported: () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    permission: () => Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    container: () => ('serviceWorker' in navigator ? navigator.serviceWorker : null),
  }),
});

export const SW_URL = '/push-sw.js';

/** La persona no concedió el permiso de notificaciones al pulsar "Activar avisos". */
export class PushPermissionError extends Error {
  constructor(readonly permission: NotificationPermission) {
    super('permiso de notificaciones no concedido');
  }
}

export interface DeviceInspection {
  /** Este navegador tiene una suscripción push. */
  subscribed: boolean;
  /** Su clave del servidor coincide con la VAPID actual. */
  keyMatches: boolean;
  /** Huella (16 hexadecimales del SHA-256 del endpoint), la misma que calcula el servidor. */
  fingerprint: string | null;
}

const base64UrlToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

const sameBytes = (a: ArrayBuffer | null | undefined, b: Uint8Array): boolean => {
  if (!a || a.byteLength !== b.length) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
};

/**
 * Avisos push (feature 013): API, permiso y suscripción del navegador. El permiso se pide solo dentro de
 * `enable()`, que solo llama el botón "Activar avisos" (FR-001, SC-007): construir el servicio, cargar el
 * estado o inspeccionar el dispositivo nunca lo piden.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private http = inject(HttpClient);
  private platform = inject(PUSH_PLATFORM);

  /** Permiso actual de notificaciones de este navegador. */
  readonly permission = signal<NotificationPermission>(this.platform.supported() ? this.platform.permission() : 'default');
  /** Avisos recibidos con la app visible: los muestra el aviso de la app en vez de una notificación (FR-019). */
  readonly messages = new Subject<PushMessage>();

  constructor() {
    this.platform.container()?.addEventListener('message', (e) => {
      const data = (e as MessageEvent).data;
      if (data?.type === 'descanso-push') this.messages.next(data as PushMessage);
    });
  }

  isSupported(): boolean {
    return this.platform.supported();
  }

  /** Vuelve a leer el permiso (la persona puede cambiarlo en los ajustes del navegador). */
  refreshPermission(): NotificationPermission {
    if (this.platform.supported()) this.permission.set(this.platform.permission());
    return this.permission();
  }

  state(): Observable<PushState> {
    return this.http.get<PushState>('/api/push');
  }

  savePreferences(patch: PushPreferencesPatch): Observable<PushPreferences> {
    return this.http.put<PushPreferences>('/api/push/preferences', patch);
  }

  sendTest(id: number): Observable<{ result: TestResult }> {
    return this.http.post<{ result: TestResult }>(`/api/push/subscriptions/${id}/test`, {});
  }

  /**
   * Activa los avisos en este navegador: pide el permiso, se suscribe y registra el dispositivo. Si ya había
   * una suscripción con otra clave (rotación de VAPID), la cierra antes.
   */
  async enable(publicKey: string, timezone?: string): Promise<PushDevice> {
    const container = this.platform.container();
    if (!container) throw new Error('Este navegador no admite avisos');
    const permission = await this.platform.requestPermission(); // el único punto que lo pide
    this.permission.set(permission);
    if (permission !== 'granted') throw new PushPermissionError(permission);
    await container.register(SW_URL);
    const registration = await container.ready;
    const key = base64UrlToBytes(publicKey);
    const existing = await registration.pushManager.getSubscription();
    if (existing && !sameBytes(existing.options?.applicationServerKey, key)) await existing.unsubscribe();
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const json = subscription.toJSON();
    return firstValueFrom(
      this.http.post<PushDevice>('/api/push/subscriptions', { endpoint: json.endpoint, keys: json.keys, ...(timezone ? { timezone } : {}) }),
    );
  }

  /** Quita un dispositivo; si es este navegador, cierra también su suscripción. */
  async disable(id: number, thisDevice = false): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`/api/push/subscriptions/${id}`));
    if (thisDevice) await this.unsubscribeLocal();
  }

  private async currentSubscription(): Promise<PushSubscription | null> {
    const container = this.platform.container();
    if (!container || !this.platform.supported()) return null;
    try {
      const registration = await container.getRegistration();
      return registration ? await registration.pushManager.getSubscription() : null;
    } catch {
      return null;
    }
  }

  private async unsubscribeLocal(): Promise<void> {
    try {
      await (await this.currentSubscription())?.unsubscribe();
    } catch {
      // mejor esfuerzo
    }
  }

  /** Huella del endpoint calculada igual que el servidor (research R8). */
  async fingerprintOf(endpoint: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
    return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** Estado de este navegador frente a la clave VAPID actual, sin pedir ningún permiso. */
  async inspect(publicKey: string | null): Promise<DeviceInspection> {
    const subscription = await this.currentSubscription();
    if (!subscription) return { subscribed: false, keyMatches: false, fingerprint: null };
    const keyMatches = !!publicKey && sameBytes(subscription.options?.applicationServerKey, base64UrlToBytes(publicKey));
    let fingerprint: string | null = null;
    try {
      fingerprint = await this.fingerprintOf(subscription.endpoint);
    } catch {
      fingerprint = null; // sin crypto.subtle (contexto no seguro): no se puede marcar "Este móvil"
    }
    return { subscribed: true, keyMatches, fingerprint };
  }

  /** Cierra la suscripción de este navegador al cerrar sesión; nunca bloquea ni falla (FR-007). */
  async unsubscribeOnLogout(): Promise<void> {
    try {
      await Promise.race([this.unsubscribeLocal(), new Promise<void>((resolve) => setTimeout(resolve, 1500))]);
    } catch {
      // el cierre de sesión sigue su curso
    }
  }
}
