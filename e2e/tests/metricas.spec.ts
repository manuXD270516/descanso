import type { Page } from '@playwright/test';
import { addDays } from '../support/api';
import { answerNextDialog, expect, fmtDateShort, openTab, setNow, test } from '../support/fixtures';

// US5 · Métricas personalizables (specs/001-linea-base/spec.md)

const TODAY = '2026-09-29';
const YESTERDAY = addDays(TODAY, -1);

/** Tarjeta de registro diario de una métrica (article con su nombre como encabezado). */
const card = (page: Page, name: string) =>
  page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
/** Fila de la métrica en el panel "Configurar métricas". */
const configItem = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name });
/** Celdas (7 días, de la fecha seleccionada hacia atrás) de la métrica en el historial. */
const historyCells = (page: Page, name: string) =>
  page.getByRole('table').getByRole('row').filter({ hasText: name }).getByRole('cell');

async function createMetric(page: Page, name: string, type: RegExp, extra?: () => Promise<void>) {
  await page.getByRole('button', { name: 'Nueva métrica' }).click();
  await page.getByLabel('Nombre').fill(name);
  await page.getByRole('button', { name: type }).click();
  await extra?.();
  await page.getByRole('button', { name: 'Crear métrica' }).click();
  await expect(card(page, name)).toBeVisible();
}

test.describe('Métricas (US5)', () => {
  test.beforeEach(async ({ page }) => {
    await setNow(page, `${TODAY}T10:00`);
    await page.goto('/');
    await openTab(page, 'Métricas');
  });

  test('US5-1 · una instalación nueva trae "Calidad del sueño", "Energía al despertar" (1–5) y "Cafés" (tazas, mín. 0)', async ({ page }) => {
    await expect(page.getByRole('article').getByRole('heading')).toHaveText([
      'Calidad del sueño',
      'Energía al despertar',
      'Cafés',
    ]);
    for (const name of ['Calidad del sueño', 'Energía al despertar']) {
      await expect(card(page, name).getByRole('radiogroup', { name }).getByRole('radio')).toHaveText(['1', '2', '3', '4', '5']);
      await expect(configItem(page, name)).toContainText('1–5');
    }
    await expect(card(page, 'Cafés')).toContainText('tazas');
    await expect(card(page, 'Cafés').getByRole('spinbutton', { name: 'Cafés' })).toHaveAttribute('min', '0');
    await expect(configItem(page, 'Cafés')).toContainText('tazas');
  });

  test('US5-2 · crear una escala sin nombre o con mínimo ≥ máximo se rechaza', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Nueva métrica' }).click();
    const create = page.getByRole('button', { name: 'Crear métrica' });
    await expect(create).toBeDisabled(); // sin nombre
    await page.getByLabel('Nombre').fill('   ');
    await expect(create).toBeDisabled(); // solo espacios

    await page.getByLabel('Nombre').fill('Ánimo');
    for (const [min, max] of [['5', '1'], ['3', '3']]) {
      await page.getByLabel('Mínimo', { exact: true }).fill(min);
      await page.getByLabel('Máximo', { exact: true }).fill(max);
      await create.click();
      await expect(page.getByRole('alert')).toHaveText('Una escala necesita mínimo y máximo (mínimo < máximo)');
    }
    expect((await api.metrics()).map((m) => m.name)).not.toContain('Ánimo');
  });

  test('US5-3 · pulsar un valor de escala lo guarda para el día; pulsarlo otra vez lo borra', async ({ page, api }) => {
    const scale = card(page, 'Calidad del sueño');
    const four = scale.getByRole('radio', { name: '4', exact: true });

    await four.click();
    await expect(four).toBeChecked();
    await expect(historyCells(page, 'Calidad del sueño').first()).toHaveText('4');
    const metric = await api.metric('Calidad del sueño');
    expect(await api.entries(TODAY, TODAY)).toEqual([expect.objectContaining({ metric_id: metric.id, date: TODAY, value: '4' })]);

    await four.click();
    await expect(four).not.toBeChecked();
    await expect(historyCells(page, 'Calidad del sueño').first()).toHaveText('·');
    expect(await api.entries(TODAY, TODAY)).toEqual([]);
  });

  test('US5-4 · una métrica numérica con mínimo 0 rechaza -1 con "Mínimo 0" y acepta 2', async ({ page, api }) => {
    const coffees = card(page, 'Cafés').getByRole('spinbutton', { name: 'Cafés' });

    await coffees.fill('-1');
    await expect(page.getByRole('alert')).toHaveText('Mínimo 0');
    expect(await api.entries(TODAY, TODAY)).toEqual([]);

    await coffees.fill('2');
    await expect(historyCells(page, 'Cafés').first()).toHaveText('2');
  });

  test('US5-5 · una métrica sí/no empieza "Sin registrar" y alterna entre "Sí" y "No"', async ({ page }) => {
    await createMetric(page, 'Ejercicio', /^Sí \/ No/);
    const toggle = card(page, 'Ejercicio').getByRole('button');
    const today = historyCells(page, 'Ejercicio').first();

    await expect(toggle).toHaveText('Sin registrar');
    await toggle.click();
    await expect(toggle).toHaveText('Sí');
    await expect(today).toHaveText('✓');
    await toggle.click();
    await expect(toggle).toHaveText('No');
    await expect(today).toHaveText('✗');
    await toggle.click();
    await expect(toggle).toHaveText('Sí');
    await expect(configItem(page, 'Ejercicio')).toContainText('sí/no');
  });

  test('FR-016 · crear una métrica de texto y otra numérica con unidad, registrar valores y editar el nombre', async ({ page }) => {
    await createMetric(page, 'Diario', /^Texto/);
    await card(page, 'Diario').getByRole('textbox', { name: 'Diario' }).fill('dormí bien');
    await expect(historyCells(page, 'Diario').first()).toHaveText('dormí bien');
    await expect(configItem(page, 'Diario')).toContainText('texto');

    await createMetric(page, 'Siestas cortas', /^Número/, async () => {
      await page.getByLabel('Mínimo (opcional)').fill('0');
      await page.getByLabel('Máximo (opcional)').fill('3');
      await page.getByLabel('Unidad').fill('veces');
    });
    await expect(card(page, 'Siestas cortas')).toContainText('veces');
    await card(page, 'Siestas cortas').getByRole('spinbutton').fill('4');
    await expect(page.getByRole('alert')).toHaveText('Máximo 3');

    await configItem(page, 'Diario').getByRole('button', { name: 'Editar' }).click();
    await expect(page.getByRole('heading', { name: 'Editar métrica' })).toBeVisible();
    await page.getByLabel('Nombre').fill('Diario de sueño');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(card(page, 'Diario de sueño')).toBeVisible();
    await expect(historyCells(page, 'Diario de sueño').first()).toHaveText('dormí bien');
  });

  test('US5-6 · subir una métrica cambia el orden y se conserva al recargar', async ({ page }) => {
    const headings = page.getByRole('article').getByRole('heading');
    await expect(configItem(page, 'Calidad del sueño').getByRole('button', { name: 'Subir' })).toBeDisabled();
    await expect(configItem(page, 'Cafés').getByRole('button', { name: 'Bajar' })).toBeDisabled();

    await configItem(page, 'Cafés').getByRole('button', { name: 'Subir' }).click();
    await expect(headings).toHaveText(['Calidad del sueño', 'Cafés', 'Energía al despertar']);

    await page.reload();
    await openTab(page, 'Métricas');
    await expect(headings).toHaveText(['Calidad del sueño', 'Cafés', 'Energía al despertar']);
    await expect(page.getByRole('table').getByRole('rowheader')).toHaveText(['Calidad del sueño', 'Cafés', 'Energía al despertar']);
  });

  test('US5-7 · archivar oculta la métrica del registro y del historial, conserva sus valores y se puede restaurar', async ({ page }) => {
    await card(page, 'Energía al despertar').getByRole('radio', { name: '3', exact: true }).click();
    await expect(historyCells(page, 'Energía al despertar').first()).toHaveText('3');

    await configItem(page, 'Energía al despertar').getByRole('button', { name: 'Archivar' }).click();
    await expect(card(page, 'Energía al despertar')).toHaveCount(0);
    await expect(page.getByRole('table').getByRole('row').filter({ hasText: 'Energía al despertar' })).toHaveCount(0);

    await page.getByRole('button', { name: '1 archivada' }).click();
    await configItem(page, 'Energía al despertar').getByRole('button', { name: 'Restaurar' }).click();

    await expect(card(page, 'Energía al despertar').getByRole('radio', { name: '3', exact: true })).toBeChecked();
    await expect(historyCells(page, 'Energía al despertar').first()).toHaveText('3');
  });

  test('US5-8 · eliminar una métrica archivada pide confirmación y la borra con sus valores', async ({ page, api }) => {
    await card(page, 'Cafés').getByRole('spinbutton', { name: 'Cafés' }).fill('2');
    await expect(historyCells(page, 'Cafés').first()).toHaveText('2');
    await configItem(page, 'Cafés').getByRole('button', { name: 'Archivar' }).click();
    await page.getByRole('button', { name: '1 archivada' }).click();
    const archived = configItem(page, 'Cafés');

    const cancelled = answerNextDialog(page, false);
    await archived.getByRole('button', { name: 'Eliminar' }).click();
    expect(await cancelled).toBe('confirm: ¿Eliminar "Cafés" y todos sus registros? Esta acción no se puede deshacer.');
    await expect(archived).toBeVisible();

    const accepted = answerNextDialog(page, true);
    await archived.getByRole('button', { name: 'Eliminar' }).click();
    await accepted;
    await expect(archived).toHaveCount(0);
    await expect(page.getByRole('button', { name: /archivada/ })).toHaveCount(0);
    expect((await api.metrics()).map((m) => m.name)).toEqual(['Calidad del sueño', 'Energía al despertar']);
    expect(await api.entries()).toEqual([]);
  });

  test('US5-9 · FR-023 · FR-024 · hoy no se puede avanzar; se navega hacia atrás y el historial de 7 días termina en el día elegido', async ({ page, api }) => {
    const quality = await api.metric('Calidad del sueño');
    await api.setEntry(quality.id, addDays(TODAY, -6), 5); // último día de la ventana de hoy
    await api.setEntry(quality.id, addDays(TODAY, -7), 1); // fuera de la ventana de hoy
    await page.reload();
    await openTab(page, 'Métricas');

    const next = page.getByRole('button', { name: 'Día siguiente' });
    const dateInput = page.getByLabel('Fecha', { exact: true });
    await expect(page.getByText('Hoy', { exact: true })).toBeVisible();
    await expect(next).toBeDisabled();
    await expect(dateInput).toHaveAttribute('max', TODAY);
    await expect(historyCells(page, 'Calidad del sueño')).toHaveText(['·', '·', '·', '·', '·', '·', '5']);

    await page.getByRole('button', { name: 'Día anterior' }).click();
    await expect(dateInput).toHaveValue(YESTERDAY);
    await expect(page.getByText(await fmtDateShort(page, YESTERDAY), { exact: true })).toBeVisible();
    await expect(next).toBeEnabled();
    await expect(historyCells(page, 'Calidad del sueño')).toHaveText(['·', '·', '·', '·', '·', '5', '1']);

    // Un valor registrado con el día anterior seleccionado queda en ese día
    await card(page, 'Calidad del sueño').getByRole('radio', { name: '2', exact: true }).click();
    await expect(historyCells(page, 'Calidad del sueño').first()).toHaveText('2');
    expect(await api.entries(YESTERDAY, YESTERDAY)).toEqual([expect.objectContaining({ metric_id: quality.id, value: '2' })]);

    await next.click();
    await expect(page.getByText('Hoy', { exact: true })).toBeVisible();
    await expect(next).toBeDisabled();
    await expect(historyCells(page, 'Calidad del sueño')).toHaveText(['·', '2', '·', '·', '·', '·', '5']);
  });
});
