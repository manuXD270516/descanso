import { test as base, expect, request as playwrightRequest, type Page } from '@playwright/test';
import { Api, iso } from './api';
import { GUEST_EMAIL, GUEST_PASSWORD, SHARED_URL, TIMEZONE } from './env';
import { AppServer } from './server';

/** Servidor contra el que corre un test: uno propio (aislado) o el compartido. */
export interface TestServer {
  readonly url: string;
  /** Reinicio abrupto del proceso sobre la misma base (solo servidores aislados). */
  restart(): Promise<void>;
}

const shared: TestServer = {
  url: SHARED_URL,
  restart: () => Promise.reject(new Error('El servidor compartido no se puede reiniciar; usa isolate: true')),
};

interface Options {
  /**
   * true (por defecto): el test tiene su propio servidor con una base SQLite vacía, así que
   * puede escribir sin afectar a otros y los tests corren en paralelo. false: usa el servidor
   * compartido del webServer; solo para tests que NO escriben datos.
   */
  isolate: boolean;
  /** Variables de entorno extra para el servidor aislado (p. ej. APP_VERSION, BACKUP_TOKEN). */
  serverEnv: Record<string, string>;
  /**
   * true (por defecto): antes del test se da de alta al propietario (si hace falta) y se entra,
   * y la sesión se comparte entre el navegador y `api` (feature 004). false: sin sesión.
   */
  authenticated: boolean;
}

interface Fixtures {
  server: TestServer;
  /** Cliente de la API del mismo servidor que ve la página. */
  api: Api;
  /**
   * Feature 008: una segunda persona invitada por el propietario, con su propio cliente de API y
   * su propio navegador (contexto aislado, con su sesión). Solo se crea si el test la pide.
   */
  guest: { api: Api; page: Page; id: number };
}

export const test = base.extend<Options & Fixtures>({
  isolate: [true, { option: true }],
  serverEnv: [{}, { option: true }],
  authenticated: [true, { option: true }],

  server: async ({ isolate, serverEnv }, use, testInfo) => {
    if (!isolate) {
      await use(shared);
      return;
    }
    const server = await AppServer.start(testInfo.parallelIndex, serverEnv);
    try {
      await use(server);
    } finally {
      await server.stop();
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach('servidor.log', { body: server.logs(), contentType: 'text/plain' });
      }
    }
  },

  // page.goto('/') y el fixture `request` apuntan al servidor del test
  baseURL: async ({ server }, use) => use(server.url),

  // La app pide una fuente a Google Fonts: se bloquea para no depender de la red externa.
  // Con sesión, el navegador recibe la misma cookie que `api`.
  context: async ({ context, api, authenticated }, use) => {
    await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
    if (authenticated) await context.addCookies((await api.request.storageState()).cookies);
    await use(context);
  },

  // Cliente de la API con Origin del propio servidor (defensa CSRF de la feature 004)
  api: async ({ server, authenticated }, use) => {
    const request = await playwrightRequest.newContext({ baseURL: server.url, extraHTTPHeaders: { Origin: server.url } });
    const api = new Api(request);
    if (authenticated) await api.signIn();
    await use(api);
    await request.dispose();
  },

  guest: async ({ server, api, browser }, use) => {
    await api.signIn(); // el propietario (aunque el test empiece sin sesión) es quien invita
    const invite = await api.createInvite();
    const request = await playwrightRequest.newContext({ baseURL: server.url, extraHTTPHeaders: { Origin: server.url } });
    const guestApi = new Api(request);
    await guestApi.register(invite.token, 'Invitada', GUEST_EMAIL, GUEST_PASSWORD);
    const id = (await api.people()).find((p) => p.email === GUEST_EMAIL)!.id;

    const context = await browser.newContext({ baseURL: server.url, timezoneId: TIMEZONE, locale: 'es-ES' });
    await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
    await context.addCookies((await request.storageState()).cookies);
    const page = await context.newPage();
    await use({ api: guestApi, page, id });
    await context.close();
    await request.dispose();
  },
});

export { expect };

/**
 * Fija el reloj del navegador en una hora local de los tests ("YYYY-MM-DDTHH:mm", -04:00).
 * Solo cambia Date/Date.now; los temporizadores siguen corriendo, así Angular funciona normal.
 * Llamarlo antes de page.goto (o recargar después) para que la app lea la nueva hora.
 */
export async function setNow(page: Page, local: string): Promise<void> {
  await page.clock.setFixedTime(iso(local));
}

/** Formato de fecha corto de la app (lun, 7 sept), calculado en el propio navegador. */
export function fmtDateShort(page: Page, date: string): Promise<string> {
  return page.evaluate((d) => {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
  }, date);
}

/**
 * Responde al próximo confirm() de la página (aceptar o cancelar) y devuelve su mensaje.
 * Crear la promesa ANTES del clic que abre el diálogo.
 */
export function answerNextDialog(page: Page, accept: boolean): Promise<string> {
  return new Promise((resolve) => {
    page.once('dialog', async (dialog) => {
      const message = `${dialog.type()}: ${dialog.message()}`;
      await (accept ? dialog.accept() : dialog.dismiss());
      resolve(message);
    });
  });
}

/** Cambia de pestaña con la navegación principal (Noche, Siestas, Métricas). */
export async function openTab(page: Page, name: 'Noche' | 'Siestas' | 'Métricas'): Promise<void> {
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name }).click();
}
