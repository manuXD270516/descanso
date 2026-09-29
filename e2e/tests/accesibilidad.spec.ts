import type { Page } from '@playwright/test';
import { expect, openTab, setNow, test } from '../support/fixtures';

// Accesibilidad básica · FR-027 (001) y principio VII de la constitución:
// español, responsive, foco visible y movimiento reducido.

const TABS = ['Noche', 'Siestas', 'Métricas'] as const;

/** Abre las secciones plegables de cada pestaña para revisar también sus controles. */
async function expandTab(page: Page, tab: (typeof TABS)[number]) {
  if (tab === 'Noche') await page.getByRole('button', { name: 'Registrar una noche pasada' }).click();
  if (tab === 'Métricas') await page.getByRole('button', { name: 'Nueva métrica' }).click();
}

/** Estilo del contorno del elemento con el foco. */
const focusOutline = (page: Page) =>
  page.evaluate(() => {
    const s = getComputedStyle(document.activeElement as Element);
    return `${s.outlineStyle} ${s.outlineWidth}`;
  });

test.describe('Accesibilidad básica (servidor compartido, solo lectura)', () => {
  test.use({ isolate: false });

  test('FR-027 · el documento declara lang="es" y todos los botones y campos tienen nombre accesible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');

    for (const tab of TABS) {
      await openTab(page, tab);
      await expandTab(page, tab);
      for (const control of await page.locator('button, input').all()) {
        await expect(control, `control sin nombre en ${tab}`).toHaveAccessibleName(/\S/);
      }
    }
  });

  test('FR-027 · se navega con teclado y el foco es visible', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Secciones' });

    await page.keyboard.press('Tab');
    await expect(nav.getByRole('button', { name: 'Noche' })).toBeFocused();
    expect(await focusOutline(page)).toBe('solid 2px');

    await page.keyboard.press('Tab');
    await expect(nav.getByRole('button', { name: 'Siestas' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(nav.getByRole('button', { name: 'Siestas' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Nueva siesta' })).toBeVisible();

    // El foco sigue al contenido: Métricas y luego el primer campo del formulario
    await page.keyboard.press('Tab');
    await expect(nav.getByRole('button', { name: 'Métricas' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Inicio', { exact: true })).toBeFocused();
    expect(await focusOutline(page)).toBe('solid 2px');
  });

  test('FR-027 · respeta prefers-reduced-motion: sin transiciones en los botones', async ({ page }) => {
    await page.goto('/');
    const button = page.getByRole('button', { name: 'Me voy a dormir' });
    const transition = () => button.evaluate((el) => getComputedStyle(el).transitionDuration);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(await transition()).not.toMatch(/^0s(, 0s)*$/);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await transition()).toMatch(/^0s(, 0s)*$/);
  });
});

test.describe('Móvil 375 px (servidor propio con datos)', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('FR-027 · ninguna pestaña tiene scroll horizontal a 375 px, con datos y formularios abiertos', async ({ page, api }) => {
    await api.createNight('2026-09-27T23:10', '2026-09-28T07:05', 'me desperté una vez a las tres y tardé en volver a dormir');
    await api.createNight('2026-09-28T23:40');
    await api.createNap('2026-09-28T14:00', '2026-09-28T14:45', 'después del almuerzo, en el sofá');
    const quality = await api.metric('Calidad del sueño');
    await api.setEntry(quality.id, '2026-09-28', 4);
    await api.createMetric({ name: 'Minutos de lectura antes de dormir', type: 'number', unit: 'minutos', min_value: 0 });

    await setNow(page, '2026-09-29T08:00');
    await page.goto('/');
    for (const tab of TABS) {
      await openTab(page, tab);
      await expandTab(page, tab);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `scroll horizontal en ${tab}`).toBeLessThanOrEqual(0);
    }
  });
});
