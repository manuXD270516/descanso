import { test, expect, openTab } from '../support/fixtures';

// Feature 011: racha de constancia. El trinquete usa el reloj real del servidor, así que las noches se
// crean relativas a hoy (zona de los tests: -04:00). La activación con fecha pasada se prepara con SQL
// porque la API solo activa "desde hoy".
const OFFSET_MS = 4 * 3600_000;
const wallDate = (d: Date) => new Date(d.getTime() - OFFSET_MS).toISOString().slice(0, 10);
const TODAY = wallDate(new Date());
const day = (k: number) => wallDate(new Date(Date.parse(`${TODAY}T12:00:00Z`) + k * 86400_000));
const week = (bed: number, wake: number) => [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, bed_min: bed, wake_min: wake, active: true }));

test('oferta tras la tercera noche: "Ahora no" la oculta y se activa en Mi horario (US3)', async ({ page, api }) => {
  for (const k of [-4, -3, -2]) await api.createNight(`${day(k)}T23:00`, `${day(k + 1)}T07:00`);
  await api.createNight(`${day(-1)}T23:00`);
  await page.goto('/');
  // Pantalla con la noche abierta: aún nada de la racha
  await expect(page.locator('app-night')).not.toContainText('constancia');
  await page.getByRole('button', { name: 'Ya desperté' }).click();
  const offer = page.locator('app-streak-offer');
  await expect(offer).toContainText('¿Quieres llevar una racha de constancia?');
  await offer.getByRole('button', { name: 'Ahora no' }).click();
  await expect(offer).toHaveCount(0);

  await page.getByText('Cuenta', { exact: true }).click();
  await page.getByRole('button', { name: 'Mi horario' }).click();
  await page.getByLabel('Llevar una racha de constancia').check();
  await expect(page.getByRole('status').filter({ hasText: 'Racha activada' })).toBeVisible();
});

test('7 días de constancia: línea tras "Ya desperté", constelación una sola vez y permanente (US1, US2)', async ({ page, api, server }) => {
  for (let k = -7; k <= -2; k++) await api.createNight(`${day(k)}T23:00`, `${day(k + 1)}T07:00`);
  await api.createNight(`${day(-1)}T23:00`);
  await page.goto('/');
  await page.getByText('Cuenta', { exact: true }).click();
  await page.getByRole('button', { name: 'Mi horario' }).click();
  await page.getByLabel('Llevar una racha de constancia').check();
  await expect(page.getByRole('status').filter({ hasText: 'Racha activada' })).toBeVisible();
  server.sql('UPDATE user_settings SET streak_since = ?', day(-7));

  await openTab(page, 'Noche');
  await page.getByRole('button', { name: 'Ya desperté' }).click();
  const morning = page.locator('app-streak-morning');
  await expect(morning).toContainText('Día 7 de constancia ★');
  const card = morning.locator('app-streak-card').filter({ hasText: 'Constelación de 7 días' });
  await expect(card.getByRole('status')).toContainText(/Tu hora de levantarte varió solo ±\d+ min/);
  await card.getByRole('button', { name: 'Cerrar' }).click();
  await expect(card).toHaveCount(0);

  // Recargar: pantalla de acostarse, sin rastro de la racha (SC-003)
  await page.reload();
  await expect(page.getByRole('button', { name: 'Me voy a dormir' })).toBeVisible();
  await expect(page.locator('app-night')).not.toContainText('constancia');

  // Borrar noches que la produjeron no retira la constelación (SC-005) ni la vuelve a mostrar como nueva
  for (const n of (await api.nights()).slice(0, 3)) await api.deleteNight(n.id);
  await openTab(page, 'Tendencias');
  const panel = page.locator('app-streak-panel');
  await expect(panel.locator('summary')).toContainText('Constancia');
  await expect(panel.locator('.collection')).toContainText('Constelación de 7 días');
  await expect(panel.locator('app-streak-card').filter({ hasText: 'Constelación de 7 días' })).toHaveCount(0);
  await expect(panel).toContainText('Tu récord: 7');
});

test('día fuera de horario con su motivo, estrella "en pausa" y desactivar lo oculta todo (US4, US5)', async ({ page, api, server }) => {
  await api.saveSchedule(TODAY, week(1380, 420));
  server.sql("UPDATE schedule_versions SET effective_from = '2020-01-01'");
  await api.createNight(`${day(-1)}T23:00`);
  await page.goto('/');
  await page.getByText('Cuenta', { exact: true }).click();
  await page.getByRole('button', { name: 'Mi horario' }).click();
  await page.getByLabel('Llevar una racha de constancia').check();
  await expect(page.getByRole('status').filter({ hasText: 'Racha activada' })).toBeVisible();
  server.sql('UPDATE user_settings SET streak_since = ?', day(-1));

  await openTab(page, 'Noche');
  await page.getByLabel('Hora de despertar').fill(`${TODAY}T09:10`);
  await page.getByRole('button', { name: 'Ya desperté' }).click();
  await expect(page.locator('app-streak-morning')).toContainText('Te levantaste a las 9:10 (fuera de tu horario)');

  // Pausa desde hoy: la estrella de hoy se ve "en pausa", con texto y no solo color
  await page.getByText('Cuenta', { exact: true }).click();
  await page.getByRole('button', { name: 'Mi horario' }).click();
  await page.getByLabel('Desde').fill(TODAY);
  await page.getByLabel('Hasta').fill(day(2));
  await page.getByRole('button', { name: 'Activar pausa' }).click();
  await expect(page.locator('.paused')).toContainText('En pausa hasta el');
  await openTab(page, 'Tendencias');
  await expect(page.locator('app-streak-panel .week li[aria-label*="en pausa"]')).not.toHaveCount(0);

  // Desactivar: desaparece de Tendencias
  await page.getByText('Cuenta', { exact: true }).click();
  await page.getByRole('button', { name: 'Mi horario' }).click();
  await page.getByLabel('Llevar una racha de constancia').uncheck();
  await expect(page.getByRole('status').filter({ hasText: 'Racha desactivada' })).toBeVisible();
  await openTab(page, 'Tendencias');
  await expect(page.getByRole('heading', { name: 'Horas dormidas' })).toBeVisible();
  await expect(page.locator('app-streak-panel')).not.toContainText('Constancia');
});
