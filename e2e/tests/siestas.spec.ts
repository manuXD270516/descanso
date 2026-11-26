import type { Page } from '@playwright/test';
import { confirmDialog, expect, fmtDateShort, openTab, setNow, test } from '../support/fixtures';

// US3 · Registrar siestas (specs/001-linea-base/spec.md)

const NOW = '2026-09-08T15:00';

/**
 * Grupo de un día en "Últimos 30 días". La lista no tiene semántica de grupo (no hay
 * role/aria-label por día), así que se usa la clase `.day` filtrada por la fecha visible.
 */
const dayGroup = (page: Page, label: string) => page.locator('.day').filter({ hasText: label });
const newNapForm = (page: Page) => page.locator('section').filter({ has: page.getByRole('heading', { name: 'Nueva siesta' }) });

test.describe('Siestas (US3)', () => {
  test.beforeEach(async ({ page }) => {
    await setNow(page, NOW);
    await page.goto('/');
    await openTab(page, 'Siestas');
  });

  test('US3-1 · el formulario propone los últimos 30 minutos y muestra "Duración: 30 min"', async ({ page }) => {
    const form = newNapForm(page);
    await expect(form.getByLabel(/^Inicio/)).toHaveValue('2026-09-08T14:30');
    await expect(form.getByLabel(/^Fin/)).toHaveValue('2026-09-08T15:00');
    await expect(form.getByText('Duración: 30 min')).toBeVisible();
    await expect(form.getByRole('button', { name: 'Guardar siesta' })).toBeEnabled();
  });

  test('US3-2 · con fin igual o anterior al inicio avisa y no guarda: el error queda en el campo "Fin" (FR-021, 014)', async ({ page, api }) => {
    const form = newNapForm(page);
    const end = form.getByLabel(/^Fin/);
    const save = form.getByRole('button', { name: 'Guardar siesta' });

    for (const value of ['2026-09-08T14:30', '2026-09-08T14:00']) {
      await end.fill(value);
      await expect(form.getByText('El fin debe ser posterior al inicio').first()).toBeVisible();
      await expect(save).toBeEnabled();
      await save.click();
      await expect(end).toBeFocused();
      await expect(end).toHaveAttribute('aria-invalid', 'true');
      await expect(end).toHaveAccessibleDescription('El fin debe ser posterior al inicio.');
      expect(await api.naps()).toHaveLength(0);
    }

    // Al corregir la hora, el error desaparece y la duración se actualiza (aclaración de US3-2)
    await end.fill('2026-09-08T14:50');
    await expect(end).toHaveAttribute('aria-invalid', 'false');
    await expect(form.getByText('Duración: 20 min')).toBeVisible();
    await save.click();
    await expect(page.getByText('1 siesta · 20 min')).toBeVisible();
  });

  test('US3-3 · dos siestas del mismo día (20 y 45 min) se agrupan como "2 siestas · 1 h 05 min"', async ({ page, api }) => {
    const form = newNapForm(page);
    const save = form.getByRole('button', { name: 'Guardar siesta' });

    await form.getByLabel(/^Inicio/).fill('2026-09-08T13:00');
    await form.getByLabel(/^Fin/).fill('2026-09-08T13:20');
    await form.getByLabel('Notas (opcional)').fill('después del almuerzo');
    await save.click();
    // Tras guardar, el formulario vuelve a proponer los últimos 30 minutos
    await expect(form.getByLabel(/^Inicio/)).toHaveValue('2026-09-08T14:30');
    await expect(form.getByLabel('Notas (opcional)')).toHaveValue('');

    await form.getByLabel(/^Inicio/).fill('2026-09-08T09:00');
    await form.getByLabel(/^Fin/).fill('2026-09-08T09:45');
    await save.click();

    const group = dayGroup(page, await fmtDateShort(page, '2026-09-08'));
    await expect(group.getByText('2 siestas · 1 h 05 min')).toBeVisible();
    await expect(group.getByRole('article')).toHaveCount(2);
    await expect(group.getByRole('article').first()).toContainText('13:00 → 13:20');
    await expect(group.getByRole('article').first()).toContainText('después del almuerzo');
    expect((await api.naps()).map((n) => n.date)).toEqual(['2026-09-08', '2026-09-08']);
  });

  test('US3-4 · lista 30 días con hoy incluido, del más reciente al más antiguo; una siesta de hace 31 días no aparece', async ({ page, api }) => {
    await api.createNap('2026-08-08T14:00', '2026-08-08T14:30'); // hace 31 días
    await api.createNap('2026-08-10T14:00', '2026-08-10T14:40'); // hace 29 días: primer día incluido
    await api.createNap('2026-09-07T16:00', '2026-09-07T16:15');
    await page.reload();
    await openTab(page, 'Siestas');

    const groups = page.locator('.day');
    await expect(groups).toHaveCount(2);
    await expect(groups.nth(0)).toContainText(await fmtDateShort(page, '2026-09-07'));
    await expect(groups.nth(0)).toContainText('1 siesta · 15 min');
    await expect(groups.nth(1)).toContainText(await fmtDateShort(page, '2026-08-10'));
    await expect(groups.nth(1)).toContainText('1 siesta · 40 min');
    await expect(dayGroup(page, await fmtDateShort(page, '2026-08-08'))).toHaveCount(0);
  });

  test('US3-5 · editar y eliminar (con confirmación) una siesta actualiza la lista', async ({ page, api }) => {
    await api.createNap('2026-09-08T13:00', '2026-09-08T13:20');
    await page.reload();
    await openTab(page, 'Siestas');

    const nap = page.getByRole('article');
    await nap.getByRole('button', { name: 'Editar' }).click();
    await nap.getByLabel(/^Fin/).fill('2026-09-08T13:50');
    await nap.getByLabel('Notas', { exact: true }).fill('larga');
    await nap.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(nap).toContainText('13:00 → 13:50');
    await expect(nap).toContainText('50 min');
    await expect(nap).toContainText('larga');
    await expect(page.getByText('1 siesta · 50 min')).toBeVisible();

    await nap.getByRole('button', { name: 'Eliminar' }).click();
    expect(await confirmDialog(page, 'Conservar')).toMatch(/^¿Borrar esta siesta\?\nSe borra la siesta del .+\. No se puede recuperar\.$/);
    await expect(nap).toBeVisible();

    await nap.getByRole('button', { name: 'Eliminar' }).click();
    await confirmDialog(page, 'Borrar');
    await expect(page.getByText('Sin siestas registradas todavía.')).toBeVisible();
    expect(await api.naps()).toHaveLength(0);
  });
});
