import { expect, fmtDateShort, setNow, test } from '../support/fixtures';

// US1 · Registrar la noche en curso (specs/001-linea-base/spec.md)
// Incluye la regla de "fecha de la noche" (principio III, SC-003): 23:40 → ese día; 00:30 → el día siguiente.

test.describe('Noche en curso (US1)', () => {
  test('US1-1 · "Me voy a dormir" con la hora propuesta abre la noche en un solo gesto', async ({ page, api }) => {
    await setNow(page, '2026-09-07T23:40');
    await page.goto('/');

    await expect(page.getByLabel('Hora de dormir')).toHaveValue('2026-09-07T23:40');
    await page.getByRole('button', { name: 'Me voy a dormir' }).click();

    await expect(page.getByText('Te acostaste a las 23:40')).toBeVisible();
    await expect(page.getByRole('article')).toContainText('noche abierta');
    const nights = await api.nights();
    expect(nights).toHaveLength(1);
    expect(nights[0]).toMatchObject({ date: '2026-09-07', bedtime: '2026-09-07T23:40:00-04:00', wake_time: null });
  });

  test('US1-2 · con una noche abierta se ve "Te acostaste a las HH:MM" y no "Me voy a dormir", también tras recargar', async ({ page, api }) => {
    await api.createNight('2026-09-07T23:15');
    await setNow(page, '2026-09-08T06:30');
    await page.goto('/');

    await expect(page.getByText('Te acostaste a las 23:15')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ya desperté' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Me voy a dormir' })).toHaveCount(0);

    // Edge case: recargar a mitad de una noche abierta la mantiene abierta
    await page.reload();
    await expect(page.getByText('Te acostaste a las 23:15')).toBeVisible();
  });

  test('US1-3 · US1-6 · dormir 23:40 del lunes y despertar 07:10 del martes: noche del lunes de 7 h 30 min', async ({ page, api }) => {
    await setNow(page, '2026-09-07T23:40'); // lunes
    await page.goto('/');
    await page.getByRole('button', { name: 'Me voy a dormir' }).click();
    await expect(page.getByText('Te acostaste a las 23:40')).toBeVisible();

    // A la mañana siguiente se abre la app: la hora de despertar propuesta es "ahora"
    await setNow(page, '2026-09-08T07:10');
    await page.reload();
    await expect(page.getByLabel('Hora de despertar')).toHaveValue('2026-09-08T07:10');
    await page.getByRole('button', { name: 'Ya desperté' }).click();

    await expect(page.getByRole('button', { name: 'Me voy a dormir' })).toBeVisible();
    const record = page.getByRole('article');
    await expect(record).toContainText(await fmtDateShort(page, '2026-09-07'));
    await expect(record).toContainText('23:40 → 07:10');
    await expect(record).toContainText('7 h 30 min');
    const [night] = await api.nights();
    expect(night).toMatchObject({ date: '2026-09-07', wake_time: '2026-09-08T07:10:00-04:00', duration_min: 450 });
  });

  test('Regla de fecha de noche (SC-003) · acostarse a las 00:30 del martes asigna la noche al martes', async ({ page, api }) => {
    await setNow(page, '2026-09-08T00:30'); // martes, pasada la medianoche
    await page.goto('/');
    await page.getByRole('button', { name: 'Me voy a dormir' }).click();
    await expect(page.getByText('Te acostaste a las 00:30')).toBeVisible();

    await setNow(page, '2026-09-08T08:00');
    await page.reload();
    await page.getByRole('button', { name: 'Ya desperté' }).click();

    await expect(page.getByRole('article')).toContainText(await fmtDateShort(page, '2026-09-08'));
    await expect(page.getByRole('article')).toContainText('7 h 30 min');
    const [night] = await api.nights();
    expect(night.date).toBe('2026-09-08');
  });

  test('US1-4 · despertar a una hora igual o anterior a la de dormir se rechaza y la noche sigue abierta', async ({ page, api }) => {
    await api.createNight('2026-09-07T23:40');
    await setNow(page, '2026-09-08T07:00');
    await page.goto('/');
    const wake = page.getByLabel('Hora de despertar');
    const alert = page.getByRole('alert');

    for (const value of ['2026-09-07T23:40', '2026-09-07T22:00']) {
      await wake.fill(value);
      await page.getByRole('button', { name: 'Ya desperté' }).click();
      await expect(alert).toHaveText('La hora de despertar debe ser posterior a la de dormir');
    }

    await expect(page.getByText('Te acostaste a las 23:40')).toBeVisible();
    const [night] = await api.nights();
    expect(night.wake_time).toBeNull();
  });

  test('US1-5 · cerrar cuando ya no hay noche abierta informa "No hay una noche abierta para cerrar"', async ({ page, api }) => {
    const open = await api.createNight('2026-09-07T23:40');
    await setNow(page, '2026-09-08T07:00');
    await page.goto('/');
    await expect(page.getByText('Te acostaste a las 23:40')).toBeVisible();

    // Otra pestaña/dispositivo elimina la noche mientras esta pantalla sigue abierta
    await api.deleteNight(open.id);
    await page.getByRole('button', { name: 'Ya desperté' }).click();

    await expect(page.getByRole('alert')).toHaveText('No hay una noche abierta para cerrar');
  });

  test('US1-7 · si otra noche se abrió por la API, "Me voy a dormir" muestra el 409 en un role=alert', async ({ page, api }) => {
    await setNow(page, '2026-09-07T23:40');
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Me voy a dormir' })).toBeVisible();

    // Se fuerza una segunda noche abierta desde fuera de esta pantalla
    await api.createNight('2026-09-07T23:00');
    await page.getByRole('button', { name: 'Me voy a dormir' }).click();

    await expect(page.getByRole('alert')).toHaveText('Ya hay una noche abierta. Ciérrala antes de abrir otra.');
    const open = (await api.nights()).filter((n) => n.wake_time === null);
    expect(open).toHaveLength(1);
    expect(open[0].bedtime).toBe('2026-09-07T23:00:00-04:00');
  });

  test('US1-7 · quitar el despertar de otra noche al editarla se rechaza si ya hay una abierta', async ({ page, api }) => {
    await api.createNight('2026-09-06T23:00', '2026-09-07T07:00');
    await api.createNight('2026-09-07T23:40');
    await setNow(page, '2026-09-08T07:00');
    await page.goto('/');

    await page.getByRole('article').filter({ hasText: '23:00 → 07:00' }).getByRole('button', { name: 'Editar' }).click();
    const editing = page.getByRole('article').filter({ has: page.getByRole('button', { name: 'Guardar cambios' }) });
    await editing.getByLabel('Desperté').fill('');
    await editing.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(page.getByRole('alert')).toHaveText('Ya hay una noche abierta. Ciérrala antes de abrir otra.');
    const open = (await api.nights()).filter((n) => n.wake_time === null);
    expect(open).toHaveLength(1);
    expect(open[0].date).toBe('2026-09-07');
  });

  test('Borde · FR-003 · vaciar el despertar al editar reabre la noche si no hay otra abierta', async ({ page, api }) => {
    await api.createNight('2026-09-07T23:00', '2026-09-08T07:00');
    await setNow(page, '2026-09-08T09:00');
    await page.goto('/');

    await page.getByRole('article').getByRole('button', { name: 'Editar' }).click();
    await page.getByRole('article').getByLabel('Desperté').fill('');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(page.getByText('Te acostaste a las 23:00')).toBeVisible();
    await expect(page.getByRole('article')).toContainText('noche abierta');
  });
});
