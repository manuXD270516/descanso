import type { Page } from '@playwright/test';
import { expect, openTab, setNow, test } from '../support/fixtures';
import { expandTab, TABS, waitForTab } from '../support/tabs';

// Accesibilidad básica · FR-027 (001) y principio VII de la constitución:
// español, responsive, foco visible y movimiento reducido.

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
      await waitForTab(page, tab);
      // La lista puede volver a pintarse al llegar los datos: si un índice desaparece,
      // toPass vuelve a tomar la foto de los controles en lugar de fallar.
      await expect(async () => {
        // Solo los visibles: los del menú Cuenta cerrado no están en el árbol de accesibilidad
        const controls = await page.locator('button:visible, input:visible').all();
        expect(controls.length, `sin controles en ${tab}`).toBeGreaterThan(0);
        for (const control of controls) {
          await expect(control, `control sin nombre en ${tab}`).toHaveAccessibleName(/\S/, { timeout: 1_000 });
        }
      }).toPass({ timeout: 10_000 });
    }
  });

  test('FR-027 · se navega con teclado y el foco es visible', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Secciones' });

    await page.keyboard.press('Tab');
    await expect(nav.getByRole('button', { name: 'Noche' })).toBeFocused();
    expect(await focusOutline(page)).toBe('solid 2px');

    await page.keyboard.press('Tab');
    await expect(nav.getByRole('button', { name: 'Tendencias' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(nav.getByRole('button', { name: 'Siestas' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(nav.getByRole('button', { name: 'Siestas' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Nueva siesta' })).toBeVisible();

    // El foco sigue al contenido: Métricas y luego el primer campo del formulario
    await page.keyboard.press('Tab');
    await expect(nav.getByRole('button', { name: 'Métricas' })).toBeFocused();
    await page.keyboard.press('Tab');
    // Feature 004: el menú Cuenta va tras las pestañas
    await expect(page.getByText('Cuenta', { exact: true })).toBeFocused();
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

// Feature 014 · accesibilidad base (US2): texto al 200 %, objetivos de 44 px, foco único,
// movimiento reducido y aviso médico.
test.describe('Accesibilidad base 014 (servidor compartido, solo lectura)', () => {
  test.use({ isolate: false });

  test('SC-006 · con el texto al 200 % y 320 px no hay scroll horizontal ni texto cortado', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { font-size: 200% }' });
    const check = async (where: string) => {
      const problems = await page.evaluate(() => {
        const out: string[] = [];
        const doc = document.documentElement;
        if (doc.scrollWidth - doc.clientWidth > 0) out.push(`documento: ${doc.scrollWidth - doc.clientWidth}px de scroll horizontal`);
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('.btn, .tab, h2'))) {
          if (!el.checkVisibility()) continue; // oculto (p. ej. el menú Cuenta cerrado)
          if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.tagName.toLowerCase()}.${el.className} "${(el.textContent ?? '').trim().slice(0, 30)}" recortado`);
        }
        return out;
      });
      expect(problems, where).toEqual([]);
    };
    for (const tab of TABS) {
      await openTab(page, tab);
      await expandTab(page, tab);
      await waitForTab(page, tab);
      await check(tab);
    }
    await page.getByText('Cuenta', { exact: true }).click();
    await page.getByRole('button', { name: 'Mi perfil' }).click();
    await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible();
    await check('Mi perfil');
  });

  test('SC-010 · a 375 px pestañas, botones y el menú Cuenta miden al menos 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    for (const tab of TABS) {
      await openTab(page, tab);
      await expandTab(page, tab);
      await waitForTab(page, tab);
      const small = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, summary, .btn, .tab'))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.height < 43.5 || r.width < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        return out;
      });
      expect(small, `objetivos pequeños en ${tab}`).toEqual([]);
    }
  });

  test('FR-007 · el menú Cuenta muestra el mismo anillo de foco que las pestañas', async ({ page }) => {
    await page.goto('/');
    const ring = () => page.evaluate(() => {
      const s = getComputedStyle(document.activeElement as Element);
      return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`;
    });
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: 'Noche' }).focus();
    await page.keyboard.press('Tab'); // se mueve por el teclado: :focus-visible aplica
    const tabRing = await ring();
    await page.getByText('Cuenta', { exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByText('Cuenta', { exact: true })).toBeFocused();
    expect(await ring()).toBe(tabRing);
  });

  test('SC-009 · con movimiento reducido botones y pestañas no tienen transición ni animación', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const durations = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.btn, .tab')).map((el) => {
        const s = getComputedStyle(el);
        return `${s.transitionDuration}|${s.animationDuration}`;
      }));
    expect(durations.length).toBeGreaterThan(0);
    for (const d of durations) expect(d).toMatch(/^0s(, 0s)*\|0s(, 0s)*$/);
  });

  test('FR-012 · el aviso médico está visible y no se puede cerrar en Noche, Tendencias y Siestas', async ({ page }) => {
    await page.goto('/');
    for (const tab of ['Noche', 'Tendencias', 'Siestas'] as const) {
      await openTab(page, tab);
      const notice = page.getByRole('note').filter({ hasText: 'No es un dispositivo médico' });
      await expect(notice, `aviso en ${tab}`).toBeVisible();
      await expect(notice.getByRole('button')).toHaveCount(0);
    }
  });

  test('FR-023 · a 1280 px con el texto al 200 % el resumen de Noche tiene menos columnas', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    const columns = () => page.evaluate(() => {
      const el = document.querySelector('.summary');
      return el ? getComputedStyle(el).gridTemplateColumns.split(' ').length : 0;
    });
    await expect(page.locator('.summary')).toBeVisible();
    const normal = await columns();
    await page.addStyleTag({ content: 'html { font-size: 200% }' });
    expect(await columns()).toBeLessThan(normal);
  });

  test('SC-006 · sin scroll horizontal en las cuatro pestañas a 320, 375, 768 y 1280 px', async ({ page }) => {
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      for (const tab of TABS) {
        await openTab(page, tab);
        await expandTab(page, tab);
        await waitForTab(page, tab);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `scroll horizontal en ${tab} a ${width} px`).toBeLessThanOrEqual(0);
      }
    }
  });
});
