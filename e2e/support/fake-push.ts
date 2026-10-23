import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

// Servicio de push simulado para la e2e de la feature 013 (research R17). Chromium de Playwright no
// tiene servicio de push (FCM) y el servidor no debe hablar con Google en CI: el navegador recibe una
// suscripción falsa cuyo endpoint apunta a este servidor local, que registra cada petición y responde
// 201 o, si el test lo pide, 410. Nada de esto vive en frontend/src ni en el código del servicio.

export interface PushRequest {
  url: string;
  headers: IncomingHttpHeaders;
  bytes: number;
}

export class FakePush {
  readonly requests: PushRequest[] = [];
  /** Código con el que responde a las siguientes peticiones (201 por defecto). */
  status = 201;

  private constructor(private readonly server: Server, readonly origin: string) {}

  static async start(): Promise<FakePush> {
    let fake!: FakePush;
    const server = createServer((req, res) => {
      let bytes = 0;
      req.on('data', (c: Buffer) => (bytes += c.length));
      req.on('end', () => {
        fake.requests.push({ url: req.url ?? '', headers: req.headers, bytes });
        res.statusCode = fake.status;
        res.end();
      });
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    fake = new FakePush(server, `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    return fake;
  }

  async stop(): Promise<void> {
    await new Promise((ok) => this.server.close(ok));
  }
}

/** Claves VAPID de prueba generadas al vuelo con `web-push` del backend; nunca se guardan. */
export function generateVapid(): { publicKey: string; privateKey: string } {
  const require = createRequire(resolve(__dirname, '..', '..', 'backend', 'package.json'));
  return require('web-push').generateVAPIDKeys();
}

/**
 * Sustituye `PushManager.prototype.subscribe/getSubscription` por una suscripción falsa hacia el servicio
 * simulado y cuenta las llamadas a `Notification.requestPermission` (SC-007). Concede el permiso de
 * notificaciones. Se instala antes de cargar la página.
 */
export async function installFakePush(context: BrowserContext, origin: string, serverOrigin: string): Promise<void> {
  await context.grantPermissions(['notifications'], { origin: serverOrigin });
  await context.addInitScript((pushOrigin: string) => {
    const KEY = 'fake-push-subscription';
    const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

    type Stored = { endpoint: string; p256dh: string; auth: string; key: string };
    const make = (s: Stored) => ({
      endpoint: s.endpoint,
      options: { applicationServerKey: fromB64u(s.key).buffer },
      unsubscribe: async () => { localStorage.removeItem(KEY); return true; },
      toJSON: () => ({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }),
    });

    PushManager.prototype.getSubscription = async function () {
      const raw = localStorage.getItem(KEY);
      return raw ? (make(JSON.parse(raw)) as unknown as PushSubscription) : null;
    };
    PushManager.prototype.subscribe = async function (options?: PushSubscriptionOptionsInit) {
      const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
      const p256dh = b64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
      const auth = b64u(crypto.getRandomValues(new Uint8Array(16)));
      const server = new Uint8Array(options?.applicationServerKey as ArrayBuffer);
      const stored: Stored = { endpoint: `${pushOrigin}/push/${crypto.randomUUID()}`, p256dh, auth, key: b64u(server) };
      localStorage.setItem(KEY, JSON.stringify(stored));
      return make(stored) as unknown as PushSubscription;
    };

    // SC-007: ningún código debe pedir el permiso salvo "Activar avisos"
    const original = Notification.requestPermission.bind(Notification);
    Notification.requestPermission = ((...args: Parameters<typeof original>) => {
      sessionStorage.setItem('permission-requests', String(Number(sessionStorage.getItem('permission-requests') ?? '0') + 1));
      return original(...args);
    }) as typeof Notification.requestPermission;
  }, origin);
}

/** Veces que la página pidió el permiso de notificaciones desde que se abrió la pestaña. */
export const permissionRequests = (page: Page): Promise<number> =>
  page.evaluate(() => Number(sessionStorage.getItem('permission-requests') ?? '0'));

/**
 * Entrega un push al service worker real de la página (`ServiceWorker.deliverPushMessage` por CDP), como
 * si llegara del servicio de push, y espera a que la app lo haya registrado.
 */
export async function deliverPush(page: Page, payload: object): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const registrations = new Map<string, string>();
  cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => {
    for (const r of e.registrations) registrations.set(r.scopeURL, r.registrationId);
  });
  await cdp.send('ServiceWorker.enable');
  await expect.poll(() => registrations.size, { message: 'registro del service worker' }).toBeGreaterThan(0);
  const registrationId = [...registrations.values()][0];
  await cdp.send('ServiceWorker.deliverPushMessage', { origin: new URL(page.url()).origin, registrationId, data: JSON.stringify(payload) });
}
