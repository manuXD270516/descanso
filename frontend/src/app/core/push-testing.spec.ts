import { HttpTestingController } from '@angular/common/http/testing';
import { PushPlatform } from './push.service';
import { PushState } from './push';

/** Estado por defecto que devuelve GET /api/push (feature 013): avisos disponibles y sin dispositivos. */
export const PUSH_STATE: PushState = {
  available: true,
  public_key: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
  timezone: 'Europe/Madrid',
  preferences: { kinds: { prepare: true, bedtime: true, wake_check: true }, dnd: null, muted_until: null },
  devices: [],
};

/** Responde a las peticiones del estado de los avisos pendientes (Mi horario las pide al montarse). */
export function flushPush(http: HttpTestingController, state: PushState = PUSH_STATE) {
  for (const r of http.match((req) => req.url === '/api/push' && req.method === 'GET')) r.flush(state);
}

/** Suscripción falsa con el mismo contrato que PushSubscription. */
export interface FakeSubscription {
  endpoint: string;
  options: { applicationServerKey: ArrayBuffer | null };
  unsubscribe: jasmine.Spy;
  toJSON: () => { endpoint: string; keys: { p256dh: string; auth: string } };
}

export function fakeSubscription(endpoint: string, key: Uint8Array | null): FakeSubscription {
  return {
    endpoint,
    options: { applicationServerKey: key ? (key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer) : null },
    unsubscribe: jasmine.createSpy('unsubscribe').and.resolveTo(true),
    toJSON: () => ({ endpoint, keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } }),
  };
}

export interface FakePlatform {
  platform: PushPlatform;
  requestPermission: jasmine.Spy;
  register: jasmine.Spy;
  getSubscription: jasmine.Spy;
  subscribe: jasmine.Spy;
  /** Entrega un mensaje del service worker a la página. */
  postMessage(data: unknown): void;
  setPermission(p: NotificationPermission): void;
}

/**
 * Navegador simulado: `navigator.serviceWorker`, `PushManager` y `Notification`. Por defecto admite
 * avisos, el permiso está sin decidir y concede lo que se le pida.
 */
export function fakePlatform(
  opts: { supported?: boolean; permission?: NotificationPermission; granted?: NotificationPermission; subscription?: FakeSubscription | null } = {},
): FakePlatform {
  let permission: NotificationPermission = opts.permission ?? 'default';
  let current: FakeSubscription | null = opts.subscription ?? null;
  const listeners: ((e: MessageEvent) => void)[] = [];
  const requestPermission = jasmine.createSpy('requestPermission').and.callFake(async () => {
    permission = opts.granted ?? 'granted';
    return permission;
  });
  const subscribe = jasmine.createSpy('subscribe').and.callFake(async (o: { applicationServerKey: Uint8Array }) => {
    current = fakeSubscription('https://fcm.googleapis.com/fcm/send/abc', o.applicationServerKey);
    return current;
  });
  const getSubscription = jasmine.createSpy('getSubscription').and.callFake(async () => current);
  const registration = { pushManager: { getSubscription, subscribe } };
  const register = jasmine.createSpy('register').and.resolveTo(registration);
  const container = {
    register,
    ready: Promise.resolve(registration),
    getRegistration: jasmine.createSpy('getRegistration').and.callFake(async () => registration),
    addEventListener: (_type: string, fn: (e: MessageEvent) => void) => { listeners.push(fn); },
  };
  const platform: PushPlatform = {
    supported: () => opts.supported ?? true,
    permission: () => permission,
    requestPermission,
    container: () => (opts.supported === false ? null : (container as unknown as ServiceWorkerContainer)),
  };
  return {
    platform, requestPermission, register, getSubscription, subscribe,
    postMessage: (data) => listeners.forEach((fn) => fn({ data } as MessageEvent)),
    setPermission: (p) => { permission = p; },
  };
}
