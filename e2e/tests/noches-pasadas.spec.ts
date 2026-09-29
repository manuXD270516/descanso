import type { Page } from '@playwright/test';
import { answerNextDialog, expect, fmtDateShort, setNow, test } from '../support/fixtures';

// US2 · Registrar, editar y eliminar noches pasadas (specs/001-linea-base/spec.md)

const NOW = '2026-09-08T12:00';

/** Tarjeta de un registro de noche identificada por su tramo "HH:MM → HH:MM". */
const record = (page: Page, span: string) => page.getByRole('article').filter({ hasText: span });
/** La única tarjeta en modo edición. */
const editing = (page: Page) =>
  page.getByRole('article').filter({ has: page.getByRole('button', { name: 'Guardar cambios' }) });

test.describe('Noches pasadas (US2)', () => {
  test.beforeEach(async ({ page }) => {
    await setNow(page, NOW);
  });

  test('US2-2 · "Guardar noche" está deshabilitado mientras falte dormir o despertar', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Registrar una noche pasada' }).click();
    const save = page.getByRole('button', { name: 'Guardar noche' });

    await expect(save).toBeDisabled();
    await page.getByLabel('Me dormí').fill('2026-09-05T22:15');
    await expect(save).toBeDisabled();
    await page.getByLabel('Me dormí').fill('');
    await page.getByLabel('Desperté').fill('2026-09-06T06:45');
    await expect(save).toBeDisabled();
    await page.getByLabel('Me dormí').fill('2026-09-05T22:15');
    await expect(save).toBeEnabled();
  });

  test('US2-1 · una noche pasada válida queda cerrada con la fecha del día en que se acostó', async ({ page, api }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Registrar una noche pasada' }).click();
    await page.getByLabel('Me dormí').fill('2026-09-05T22:15');
    await page.getByLabel('Desperté').fill('2026-09-06T06:45');
    await page.getByLabel('Notas (opcional)').fill('me desperté dos veces');
    await page.getByRole('button', { name: 'Guardar noche' }).click();

    // El formulario se cierra y aparece el registro
    await expect(page.getByRole('button', { name: 'Registrar una noche pasada' })).toBeVisible();
    const card = record(page, '22:15 → 06:45');
    await expect(card).toContainText(await fmtDateShort(page, '2026-09-05'));
    await expect(card).toContainText('8 h 30 min');
    await expect(card).toContainText('me desperté dos veces');
    const [night] = await api.nights();
    expect(night).toMatchObject({ date: '2026-09-05', bedtime: '2026-09-05T22:15:00-04:00', wake_time: '2026-09-06T06:45:00-04:00' });
  });

  test('US2-3 · editar horas y notas actualiza la lista y la duración', async ({ page, api }) => {
    await api.createNight('2026-09-05T23:00', '2026-09-06T07:00', 'antes');
    await page.goto('/');
    await record(page, '23:00 → 07:00').getByRole('button', { name: 'Editar' }).click();

    const form = editing(page);
    await expect(form.getByLabel('Fecha de la noche')).toHaveValue('2026-09-05');
    await expect(form.getByLabel('Me dormí')).toHaveValue('2026-09-05T23:00');
    await form.getByLabel('Me dormí').fill('2026-09-05T22:30');
    await form.getByLabel('Desperté').fill('2026-09-06T06:15');
    await form.getByLabel('Notas').fill('después');
    await form.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(editing(page)).toHaveCount(0);
    const card = record(page, '22:30 → 06:15');
    await expect(card).toContainText('7 h 45 min');
    await expect(card).toContainText('después');
    await expect(record(page, '23:00 → 07:00')).toHaveCount(0);
  });

  test('US2-4 · "Eliminar" pide confirmación: cancelar no cambia nada, confirmar la quita', async ({ page, api }) => {
    await api.createNight('2026-09-05T23:00', '2026-09-06T07:00');
    await page.goto('/');
    const card = record(page, '23:00 → 07:00');
    const expected = `¿Eliminar la noche del ${await fmtDateShort(page, '2026-09-05')}?`;

    const cancelled = answerNextDialog(page, false);
    await card.getByRole('button', { name: 'Eliminar' }).click();
    expect(await cancelled).toBe(`confirm: ${expected}`);
    await expect(card).toBeVisible();
    expect(await api.nights()).toHaveLength(1);

    const accepted = answerNextDialog(page, true);
    await card.getByRole('button', { name: 'Eliminar' }).click();
    await accepted;
    await expect(card).toHaveCount(0);
    await expect(page.getByText('Aún no hay noches registradas.')).toBeVisible();
    expect(await api.nights()).toHaveLength(0);
  });

  test('US2-5 · una edición con despertar no posterior a dormir se rechaza y el registro no cambia', async ({ page, api }) => {
    await api.createNight('2026-09-05T23:00', '2026-09-06T07:00');
    await page.goto('/');
    await record(page, '23:00 → 07:00').getByRole('button', { name: 'Editar' }).click();
    await editing(page).getByLabel('Desperté').fill('2026-09-05T22:00');
    await editing(page).getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(page.getByRole('alert')).toHaveText('La hora de despertar debe ser posterior a la de dormir');
    const [night] = await api.nights();
    expect(night).toMatchObject({ bedtime: '2026-09-05T23:00:00-04:00', wake_time: '2026-09-06T07:00:00-04:00' });
  });

  test('US2-6 · una nota de más de 500 caracteres se guarda recortada a los primeros 500', async ({ page, api }) => {
    const long = 'a'.repeat(499) + 'bXYZ'; // 503 caracteres: el 500.º es la "b"
    await page.goto('/');
    await page.getByRole('button', { name: 'Registrar una noche pasada' }).click();
    await page.getByLabel('Me dormí').fill('2026-09-05T23:00');
    await page.getByLabel('Desperté').fill('2026-09-06T07:00');
    await page.getByLabel('Notas (opcional)').fill(long);
    await page.getByRole('button', { name: 'Guardar noche' }).click();

    await expect(record(page, '23:00 → 07:00').getByText(long.slice(0, 500), { exact: true })).toBeVisible();
    const [night] = await api.nights();
    expect(night.notes).toBe(long.slice(0, 500));
  });
});
