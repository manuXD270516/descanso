import type { Locator, Page } from '@playwright/test';
import { addDays } from '../support/api';
import { expect, fmtDateShort, setNow, test } from '../support/fixtures';

// US4 · Resumen de 14 días y cinta de noches (specs/001-linea-base/spec.md)
//
// El resumen y la cinta no tienen roles propios (son <div>/<span>), así que aquí se usan las
// clases .summary y .ribbon-row como anclas y el atributo title de cada barra.

const TODAY = '2026-09-29';

/** Cifra del resumen junto a su etiqueta ("promedio por noche", "siestas en 14 días"...). */
const stat = (page: Page, label: string): Locator =>
  page.locator('.summary > div').filter({ has: page.getByText(label, { exact: true }) }).locator('.num');

const ribbonRow = (page: Page, label: string) => page.locator('.ribbon-row').filter({ hasText: label });

/** Posición y ancho (%) de una barra de la cinta, tal y como los pinta la app. */
const geometry = (bar: Locator) =>
  bar.evaluate((el: HTMLElement) => ({ x: parseFloat(el.style.left), w: parseFloat(el.style.width) }));

test.describe('Resumen y cinta (US4)', () => {
  test.beforeEach(async ({ page }) => {
    await setNow(page, `${TODAY}T10:00`);
  });

  test('US4-5 · sin datos: horas medias "—", duración media "0 min" y 0 siestas', async ({ page }) => {
    await page.goto('/');
    await expect(stat(page, 'promedio por noche')).toHaveText('0 min');
    await expect(stat(page, 'hora media de dormir')).toHaveText('—');
    await expect(stat(page, 'hora media de despertar')).toHaveText('—');
    await expect(stat(page, 'siestas en 14 días')).toHaveText('0');
  });

  test('US4-1 · US4-2 · US4-3 · promedio 7 h 30 min, hora media de dormir 00:00 (circular) y la noche abierta no cuenta', async ({ page, api }) => {
    await api.createNight('2026-09-20T23:30', '2026-09-21T06:30'); // 7 h, se acuesta 23:30
    await api.createNight('2026-09-22T00:30', '2026-09-22T08:30'); // 8 h, se acuesta 00:30
    await api.createNight('2026-09-10T22:00', '2026-09-11T03:00'); // fuera de los 14 días
    await api.createNight('2026-09-28T23:00'); // abierta dentro del rango (US4-3)
    await page.goto('/');

    await expect(stat(page, 'promedio por noche')).toHaveText('7 h 30 min');
    await expect(stat(page, 'hora media de dormir')).toHaveText('00:00');
    await expect(stat(page, 'hora media de despertar')).toHaveText('07:30');
  });

  test('US4-4 · 3 siestas en el rango se muestran como "3 siestas en 14 días"', async ({ page, api }) => {
    await api.createNap('2026-09-16T14:00', '2026-09-16T14:20'); // primer día del rango
    await api.createNap('2026-09-25T15:00', '2026-09-25T15:30');
    await api.createNap(`${TODAY}T08:00`, `${TODAY}T08:10`);
    await api.createNap('2026-09-15T14:00', '2026-09-15T14:20'); // fuera del rango
    await page.goto('/');

    await expect(stat(page, 'siestas en 14 días')).toHaveText('3');
  });

  test('US4-6 · la cinta tiene 14 filas (hoy arriba); la noche 23:00–07:00 empieza al ~46 % y ocupa un tercio; la siesta va en la fila de su día', async ({ page, api }) => {
    await api.createNight('2026-09-27T23:00', '2026-09-28T07:00');
    await api.createNap('2026-09-28T14:00', '2026-09-28T14:30');
    await page.goto('/');

    const rows = page.locator('.ribbon-row');
    await expect(rows).toHaveCount(14);
    await expect(rows.first()).toContainText(await fmtDateShort(page, TODAY));
    await expect(rows.last()).toContainText(await fmtDateShort(page, addDays(TODAY, -13)));

    const sleep = ribbonRow(page, await fmtDateShort(page, '2026-09-27')).getByTitle('23:00 → 07:00, 8 h');
    await expect(sleep).toBeVisible();
    const s = await geometry(sleep);
    expect(s.x).toBeCloseTo((11 / 24) * 100, 1); // 45,83 %
    expect(s.w).toBeCloseTo(100 / 3, 1);

    const nap = ribbonRow(page, await fmtDateShort(page, '2026-09-28')).getByTitle('Siesta 14:00 → 14:30');
    await expect(nap).toBeVisible();
    expect((await geometry(nap)).x).toBeCloseTo((2 / 24) * 100, 1); // 14:00 = 2 h después de las 12:00
  });

  test('Borde · dos noches cerradas con la misma fecha se suman en el resumen y la cinta muestra las dos (DT-11, corregido en 003)', async ({ page, api }) => {
    await api.createNight('2026-09-27T01:00', '2026-09-27T05:00'); // 4 h, fecha 27
    await api.createNight('2026-09-27T23:00', '2026-09-28T03:00'); // 4 h, fecha 27
    await page.goto('/');

    await expect(stat(page, 'promedio por noche')).toHaveText('8 h'); // un solo día con 480 min
    await expect(ribbonRow(page, await fmtDateShort(page, '2026-09-27')).locator('.bar.sleep')).toHaveCount(2);
  });

  test('Borde · una noche que termina después de las 12:00 del día siguiente se recorta al final del eje', async ({ page, api }) => {
    await api.createNight('2026-09-27T23:00', '2026-09-28T14:00'); // 15 h: pasaría del final
    await page.goto('/');

    const bar = ribbonRow(page, await fmtDateShort(page, '2026-09-27')).getByTitle('23:00 → 14:00, 15 h');
    const g = await geometry(bar);
    expect(g.x + g.w).toBeCloseTo(100, 1);
  });
});
