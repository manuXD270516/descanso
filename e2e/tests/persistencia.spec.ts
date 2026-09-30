import type { Page } from '@playwright/test';
import type { Api } from '../support/api';
import { TIMEZONE } from '../support/env';
import { expect, openTab, setNow, test } from '../support/fixtures';

// US6 · Persistencia de los datos (specs/001-linea-base/spec.md), SC-004

const NOW = '2026-09-08T12:00';

/** Registra desde la interfaz una noche pasada, una siesta y un valor de métrica. */
async function recordFromUi(page: Page) {
  await page.getByRole('button', { name: 'Registrar una noche pasada' }).click();
  await page.getByLabel('Me dormí').fill('2026-09-07T23:10');
  await page.getByLabel('Desperté').fill('2026-09-08T06:55');
  await page.getByLabel('Notas (opcional)').fill('noche tranquila');
  await page.getByRole('button', { name: 'Guardar noche' }).click();
  await expect(page.getByRole('article').filter({ hasText: '23:10 → 06:55' })).toBeVisible();

  await openTab(page, 'Siestas');
  await page.getByRole('button', { name: 'Guardar siesta' }).click(); // 11:30 → 12:00 propuesta
  await expect(page.getByText('1 siesta · 30 min')).toBeVisible();

  await openTab(page, 'Métricas');
  const four = page.getByRole('radiogroup', { name: 'Calidad del sueño' }).getByRole('radio', { name: '4' });
  await four.click();
  await expect(four).toBeChecked();
}

/** Comprueba en la interfaz que los tres registros siguen ahí. */
async function expectRecordsVisible(page: Page) {
  await openTab(page, 'Noche');
  const night = page.getByRole('article').filter({ hasText: '23:10 → 06:55' });
  await expect(night).toContainText('7 h 45 min');
  await expect(night).toContainText('noche tranquila');
  await openTab(page, 'Siestas');
  await expect(page.getByText('1 siesta · 30 min')).toBeVisible();
  await openTab(page, 'Métricas');
  await expect(page.getByRole('radiogroup', { name: 'Calidad del sueño' }).getByRole('radio', { name: '4' })).toBeChecked();
}

/** Todo lo que guarda el servicio, para comparar antes y después. */
async function snapshot(api: Api) {
  return { nights: await api.nights(), naps: await api.naps(), metrics: await api.metrics(), entries: await api.entries() };
}

test.describe('Persistencia (US6)', () => {
  test('US6-1 · US6-3 · tras reiniciar el servicio el 100 % de los datos sigue igual y no se duplican las métricas iniciales', async ({ page, api, server }) => {
    await setNow(page, NOW);
    await page.goto('/');
    await recordFromUi(page);
    const before = await snapshot(api);
    expect(before.metrics).toHaveLength(3);

    await server.restart(); // proceso nuevo sobre el mismo archivo SQLite
    await page.reload();

    await expectRecordsVisible(page);
    expect(await snapshot(api)).toEqual(before);
  });

  test('US6-2 · los datos registrados en un navegador se ven en otro', async ({ page, browser, server, api }) => {
    await setNow(page, NOW);
    await page.goto('/');
    await recordFromUi(page);

    // Otro navegador: contexto nuevo, sin estado compartido con el primero
    const other = await browser.newContext({ baseURL: server.url, timezoneId: TIMEZONE, locale: 'es-ES' });
    await other.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
    // Feature 004: en el otro dispositivo también has entrado con tu cuenta
    await other.addCookies((await api.request.storageState()).cookies);
    try {
      const page2 = await other.newPage();
      await setNow(page2, NOW);
      await page2.goto('/');
      await expectRecordsVisible(page2);
    } finally {
      await other.close();
    }
  });
});
