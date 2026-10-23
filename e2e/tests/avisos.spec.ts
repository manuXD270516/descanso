import { test as base, expect, openTab } from '../support/fixtures';
import { FakePush, deliverPush, generateVapid, installFakePush, permissionRequests } from '../support/fake-push';
import { AppServer } from '../support/server';
import { TIMEZONE } from '../support/env';
import { addDays } from '../support/api';

// Feature 013: avisos push con la app cerrada, con un servicio de push simulado (research R17).
// Chromium no recibe un push real: el navegador tiene una suscripción falsa hacia un servidor local que
// registra lo que el servicio le envía, y el push "entrante" se entrega al service worker real por CDP.
const TODAY = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10); // fecha local de los tests (-04:00)
const week = (bed: number, wake: number) => [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, bed_min: bed, wake_min: wake, active: true }));

const test = base.extend<{ fake: FakePush }>({
  fake: async ({}, use) => { // eslint-disable-line no-empty-pattern
    const fake = await FakePush.start();
    await use(fake);
    await fake.stop();
  },
  // Servidor propio con avisos disponibles: claves VAPID de prueba, costura de pruebas y sin disparador
  server: async ({ fake }, use, testInfo) => {
    const vapid = generateVapid();
    const server = await AppServer.start(testInfo.parallelIndex, {
      NODE_ENV: 'test',
      PUSH_TEST_ORIGIN: fake.origin,
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: 'mailto:avisos@descanso.test',
      REMINDER_WAKER: 'off',
    });
    try {
      await use(server);
    } finally {
      await server.stop();
      if (testInfo.status !== testInfo.expectedStatus) await testInfo.attach('servidor.log', { body: server.logs(), contentType: 'text/plain' });
    }
  },
});

test.use({ timezoneId: TIMEZONE });

async function openAvisos(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByText('Cuenta', { exact: true }).click();
  await page.getByRole('button', { name: 'Mi horario' }).click();
  return page.getByRole('region', { name: 'Avisos en este móvil' });
}

test('cargar y recargar la app, y abrir Mi horario, no pide el permiso de notificaciones (SC-007)', async ({ page, context, server, fake, api }) => {
  await installFakePush(context, fake.origin, server.url);
  await api.saveSchedule(TODAY, week(1395, 420));
  const avisos = await openAvisos(page);
  await expect(avisos.getByRole('button', { name: 'Activar avisos' })).toBeEnabled();
  expect(await permissionRequests(page)).toBe(0);
  await page.reload();
  await openTab(page, 'Noche');
  await expect(page.getByRole('button', { name: 'Me voy a dormir' })).toBeVisible();
  expect(await permissionRequests(page)).toBe(0);
});

test('sin horario, "Activar avisos" está deshabilitado con "Primero agenda tu horario"', async ({ page, context, server, fake }) => {
  await installFakePush(context, fake.origin, server.url);
  const avisos = await openAvisos(page);
  await expect(avisos.getByRole('button', { name: 'Activar avisos' })).toBeDisabled();
  await expect(avisos).toContainText('Primero agenda tu horario');
  await expect(avisos.getByRole('link', { name: 'Mi horario' })).toBeVisible();
});

test('con horario, la explicación previa y "Activar avisos" dejan el móvil activado con un solo toque propio (SC-008)', async ({ page, context, server, fake, api }) => {
  await installFakePush(context, fake.origin, server.url);
  await api.saveSchedule(TODAY, week(1395, 420));
  const avisos = await openAvisos(page);
  await expect(avisos).toContainText('Prepárate · 22:45');
  await expect(avisos).toContainText('Hora de dormir · 23:15');
  await expect(avisos).toContainText('¿Ya despertaste? · 8:00');
  await expect(avisos).toContainText('nunca lleva datos de tu sueño ni de tu salud');
  await expect(avisos).toContainText('Google, en Chrome de Android');
  expect(await permissionRequests(page)).toBe(0);

  await avisos.getByRole('button', { name: 'Activar avisos' }).click();
  await expect(avisos.getByText('Este móvil', { exact: true })).toBeVisible();
  await expect(avisos).toContainText('Avisos activados en este móvil');
  expect(await permissionRequests(page)).toBe(1);

  // El servidor guardó el dispositivo con su nombre, sin exponer el endpoint
  const state = await (await api.request.get('/api/push')).json();
  expect(state.devices).toHaveLength(1);
  expect(state.devices[0].label).toMatch(/^Chrome/);
  expect(JSON.stringify(state)).not.toContain(fake.origin);
  expect(state.timezone).toBe(TIMEZONE); // el perfil no tenía zona: se guardó la del navegador
});

test('"Enviarme un aviso de prueba" llega al servicio de push con TTL, Topic, Urgency y VAPID en menos de 10 s (SC-005)', async ({ page, context, server, fake, api }) => {
  await installFakePush(context, fake.origin, server.url);
  await api.saveSchedule(TODAY, week(1395, 420));
  const avisos = await openAvisos(page);
  await avisos.getByRole('button', { name: 'Activar avisos' }).click();
  await expect(avisos.getByText('Este móvil', { exact: true })).toBeVisible();

  const started = Date.now();
  await avisos.getByRole('button', { name: 'Enviarme un aviso de prueba' }).click();
  await expect(avisos.getByRole('status').filter({ hasText: 'Enviado' })).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - started).toBeLessThan(10_000);
  expect(fake.requests).toHaveLength(1);
  const h = fake.requests[0].headers;
  expect(h.ttl).toBe('60');
  expect(h.topic).toBe('test');
  expect(h.urgency).toBe('high');
  expect(h.authorization).toMatch(/^vapid /);
  expect(fake.requests[0].bytes).toBeGreaterThan(0); // la carga viaja cifrada

  // El cuarto intento en un minuto avisa con amabilidad (FR-021)
  for (let i = 0; i < 2; i++) {
    await avisos.getByRole('button', { name: 'Enviarme un aviso de prueba' }).click();
    await expect.poll(() => fake.requests.length).toBe(i + 2);
  }
  await avisos.getByRole('button', { name: 'Enviarme un aviso de prueba' }).click();
  await expect(avisos).toContainText('Espera un momento antes de probar otra vez');
  expect(fake.requests).toHaveLength(3);
});

test('si el servicio de push responde 410, la app explica que el dispositivo ya no es válido y lo quita de la lista', async ({ page, context, server, fake, api }) => {
  await installFakePush(context, fake.origin, server.url);
  await api.saveSchedule(TODAY, week(1395, 420));
  const avisos = await openAvisos(page);
  await avisos.getByRole('button', { name: 'Activar avisos' }).click();
  await expect(avisos.getByText('Este móvil', { exact: true })).toBeVisible();

  fake.status = 410;
  await avisos.getByRole('button', { name: 'Enviarme un aviso de prueba' }).click();
  await expect(avisos).toContainText('Este dispositivo ya no es válido: vuelve a activar los avisos');
  await expect(avisos.getByText('Este móvil', { exact: true })).toHaveCount(0);
  expect((await (await api.request.get('/api/push')).json()).devices).toHaveLength(0);
  // Y el bloque propone activarlo de nuevo
  await expect(avisos.getByRole('button', { name: 'Activar avisos' })).toBeVisible();
  await expect(avisos).toContainText('Vuelve a activar los avisos');
});

test('con la pestaña visible, un push llega como aviso dentro de la app y no como notificación del sistema (FR-019)', async ({ page, context, server, fake, api }) => {
  await installFakePush(context, fake.origin, server.url);
  await api.saveSchedule(TODAY, week(1395, 420));
  const avisos = await openAvisos(page);
  await avisos.getByRole('button', { name: 'Activar avisos' }).click();
  await expect(avisos.getByText('Este móvil', { exact: true })).toBeVisible();

  await deliverPush(page, {
    kind: 'bedtime', night: TODAY, title: 'Descanso', body: 'es tu hora de dormir', tag: `bedtime-${TODAY}`, url: '/#noche',
  });
  const notice = page.getByRole('status').filter({ hasText: 'Descanso: es tu hora de dormir' });
  await expect(notice).toBeVisible();
  const shown = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).length);
  expect(shown).toBe(0);
  await notice.getByRole('button', { name: 'Cerrar' }).click();
  await expect(notice).toHaveCount(0);
});

test('abrir /#noche-despertar muestra Noche con "Ya desperté" a la vista y con el foco (FR-013)', async ({ page, api }) => {
  await api.saveSchedule(TODAY, week(1395, 420));
  await api.createNight(`${addDays(TODAY, -1)}T23:00`);
  await page.goto('/#noche-despertar');
  const wake = page.getByRole('button', { name: 'Ya desperté' });
  await expect(wake).toBeInViewport();
  await expect(wake).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: 'Noche' })).toHaveAttribute('aria-current', 'page');
  expect(new URL(page.url()).hash).toBe('');
});
