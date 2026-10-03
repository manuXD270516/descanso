import { test, expect, setNow, openTab } from '../support/fixtures';
import { iso } from '../support/api';

// Feature 006: calculadora de ciclos, ajustes, tarjeta "¿Cómo fue la noche?", recordatorio de noche
// abierta, aviso de no dispositivo médico, insignias de origen y sección "Fases".

test('calculadora: 23:00 con 90/15 → 3 ventanas estimadas con el texto fijo (US2)', async ({ page }) => {
  await setNow(page, '2026-09-29T20:00');
  await page.goto('/');
  await page.getByLabel('Hora de dormir').fill('2026-09-29T23:00');
  const calc = page.locator('app-cycle-calculator');
  await expect(calc.locator('li')).toHaveText([
    /4 ciclos entre 5:00 y 5:30 \(mañana\)/,
    /5 ciclos entre 6:30 y 7:00 \(mañana\)/,
    /6 ciclos entre 8:00 y 8:30 \(mañana\)/,
  ]);
  await expect(calc).toContainText('Estimado');
  await expect(calc).toContainText('Estimación, no medición; no está demostrado que despertar al final de un ciclo mejore cómo te sientes.');
});

test('ajustes de ciclo: 100/20 se guardan y se conservan; 120 → error con el rango; el objetivo usa ciclos de 100 (US2, FR-009, FR-010)', async ({ page, api }) => {
  await setNow(page, '2026-09-29T20:00');
  await page.goto('/');
  const calc = page.locator('app-cycle-calculator');
  await calc.getByText(/^Ajustar/).click();
  await calc.getByLabel('Duración del ciclo (min)').fill('120');
  await calc.getByRole('button', { name: 'Guardar ajustes' }).click();
  await expect(calc.getByRole('alert')).toHaveText('La duración del ciclo debe estar entre 70 y 110 minutos');

  await calc.getByLabel('Duración del ciclo (min)').fill('100');
  await calc.getByLabel('Tiempo en dormirte (min)').fill('20');
  await calc.getByRole('button', { name: 'Guardar ajustes' }).click();
  await expect(calc.getByRole('status')).toHaveText('Ajustes guardados.');
  await page.getByLabel('Hora de dormir').fill('2026-09-29T23:00');
  await expect(calc.locator('li').first()).toContainText('entre 5:45 y 6:15'); // 23:00 + 20 + 4 × 100

  await page.reload();
  await expect(page.locator('app-cycle-calculator summary')).toContainText('ciclo de 100 min, 20 min para dormirte');
  expect(((await (await api.request.get('/api/me')).json()) as { cycle_min: number }).cycle_min).toBe(100);

  await openTab(page, 'Tendencias');
  await page.getByRole('button', { name: 'Editar objetivo' }).click();
  await expect(page.locator('app-goal-editor').getByRole('button', { name: /ciclos/ })).toHaveText(['5 h · 3 ciclos', '6 h 40 · 4 ciclos', '8 h 20 · 5 ciclos']);
});

test('dormir y despertar siguen siendo 1 toque; después, la tarjeta guarda las respuestas (US5, SC-004, SC-005)', async ({ page, api }) => {
  await setNow(page, '2026-09-29T23:00');
  await page.goto('/');
  await page.getByRole('button', { name: 'Me voy a dormir' }).click();
  await expect(page.getByRole('button', { name: 'Ya desperté' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '¿Cómo fue la noche?' })).toHaveCount(0);

  await page.getByLabel('Hora de despertar').fill('2026-09-30T07:00');
  await page.getByRole('button', { name: 'Ya desperté' }).click();
  const card = page.locator('app-night-card');
  await expect(card.getByRole('heading', { name: '¿Cómo fue la noche?' })).toBeVisible();
  expect((await api.nights())[0].wake_time).toBe(iso('2026-09-30T07:00')); // ya cerrada antes de responder

  await card.getByRole('button', { name: '15–30 min' }).click();
  await expect(card.getByRole('button', { name: '15–30 min' })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('button', { name: '1–2', exact: true }).click();
  await expect(card.getByRole('button', { name: '1–2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const [n] = (await api.nights()) as unknown as { sol_bucket: string; awakenings_bucket: string }[];
  expect([n.sol_bucket, n.awakenings_bucket]).toEqual(['15_30', '1_2']);
  await expect(page.locator('.answers')).toHaveText('Tardé 15–30 min en dormirme · Desperté 1–2 veces');

  await card.getByRole('button', { name: 'Cerrar' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.locator('app-night-card')).toHaveCount(0);
});

test('noche abierta desde hace 15 h: aviso con dormir + objetivo y cierre con esa hora (US4)', async ({ page, api }) => {
  await api.createNight('2026-09-29T23:00');
  await setNow(page, '2026-09-30T14:00');
  await page.goto('/');
  const reminder = page.getByRole('status').filter({ hasText: '¿Olvidaste marcar que despertaste?' });
  await expect(reminder).toBeVisible();
  await expect(reminder.getByLabel('Hora en que desperté')).toHaveValue('2026-09-30T06:00'); // 23:00 + 7 h

  await openTab(page, 'Siestas');
  await openTab(page, 'Noche');
  await expect(reminder).toBeVisible();
  await reminder.getByRole('button', { name: 'Sí, desperté a esa hora' }).click();
  await expect(reminder).toHaveCount(0);
  expect((await api.nights())[0].wake_time).toBe(iso('2026-09-30T06:00'));
  await expect(page.locator('app-night-card')).toBeVisible();
});

test('"Aún no" oculta el aviso hasta volver a abrir la app (US4)', async ({ page, api }) => {
  await api.createNight('2026-09-29T23:00');
  await setNow(page, '2026-09-30T14:00');
  await page.goto('/');
  const reminder = page.getByRole('status').filter({ hasText: '¿Olvidaste marcar que despertaste?' });
  await reminder.getByRole('button', { name: 'Aún no' }).click();
  await expect(reminder).toHaveCount(0);
  await openTab(page, 'Siestas');
  await openTab(page, 'Noche');
  await expect(reminder).toHaveCount(0);
  await page.reload();
  await expect(reminder).toBeVisible();
});

test('aviso de no dispositivo médico en Noche, Tendencias y Siestas, no en Métricas; insignias y "Fases" (US1, US3)', async ({ page, api }) => {
  await api.createNight('2026-09-28T23:00', '2026-09-29T07:00');
  await setNow(page, '2026-09-29T20:00');
  await page.goto('/');
  const notice = page.getByRole('note');
  await expect(notice).toContainText('No es un dispositivo médico');
  await expect(page.locator('app-night .block-head').first()).toContainText('Anotado por ti');

  await openTab(page, 'Tendencias');
  await expect(notice).toContainText('No es un dispositivo médico');
  await expect(page.locator('.trends-panel .block-head')).toContainText('Anotado por ti');
  const phases = page.locator('details.phases');
  await phases.locator('summary').click();
  await expect(phases).toContainText('Descanso aún no importa datos de relojes');
  await expect(phases.locator('svg')).toHaveCount(0);

  await openTab(page, 'Siestas');
  await expect(notice).toContainText('No es un dispositivo médico');
  await openTab(page, 'Métricas');
  await expect(notice).toHaveCount(0);
});
