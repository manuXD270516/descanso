import { readFileSync } from 'node:fs';
import { test, expect, setNow, openTab } from '../support/fixtures';

// Feature 010: horario en la bienvenida, Mi horario con el archivo de calendario y la guía, "¿Ya
// despertaste?" con horario, modo pausa y aviso con la app abierta. Zona de los tests: -04:00.
const OFFSET_MS = 4 * 3600_000;
/** Fecha y minutos de reloj de pared (-04:00) de un instante real. */
const wall = (d: Date) => {
  const s = new Date(d.getTime() - OFFSET_MS).toISOString();
  return { date: s.slice(0, 10), min: Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16)), hhmm: s.slice(11, 16) };
};
const TODAY = wall(new Date()).date;
const week = (bed: number, wake: number) => [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, bed_min: bed, wake_min: wake, active: true }));

test.describe('bienvenida con horario (US1)', () => {
  test.use({ onboarded: false });

  test('objetivo 7 h 30 → levantarse 7:00 propone 23:15; fin de semana 9:00 → 1:15; Guardar deja el horario vigente', async ({ page, api }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '7 h 30 · 5 ciclos' }).click();
    await page.getByLabel('¿A qué hora quieres levantarte?').fill('07:00');
    await expect(page.getByLabel('Hora de acostarte')).toHaveValue('23:15');
    await page.getByLabel('Distinto el fin de semana').check();
    await page.getByLabel('Levantarte', { exact: true }).fill('09:00');
    await expect(page.getByLabel('Acostarte', { exact: true })).toHaveValue('01:15');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible();

    const s = await api.schedule(TODAY);
    const by = (w: number) => s.version!.days.find((d) => d.weekday === w)!;
    expect([by(1).bed_min, by(1).wake_min]).toEqual([1395, 420]); // noche del lunes
    expect([by(6).bed_min, by(6).wake_min]).toEqual([75, 540]); //   noche del sábado (fin de semana)
    expect([by(0).bed_min, by(0).wake_min]).toEqual([75, 540]); //   noche del domingo (fin de semana)
  });
});

test('Mi horario: descarga el archivo de calendario con UID estable, alarma y enlace; guía de Android primero (US2)', async ({ page, api }) => {
  await api.saveSchedule(TODAY, week(1395, 420));
  await page.goto('/');
  await page.getByText('Cuenta', { exact: true }).click();
  await page.getByRole('button', { name: 'Mi horario' }).click();
  await expect(page.getByRole('heading', { name: 'Mi horario' })).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Añadir a mi calendario' }).click()]);
  expect(download.suggestedFilename()).toBe('descanso-horario.ics');
  const ics = readFileSync((await download.path())!, 'utf8');
  expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(7);
  expect(ics).toMatch(/UID:sched-1-1@descanso-sleep\.fly\.dev/);
  expect(ics).toContain('TRIGGER:-PT30M');
  expect(ics).toMatch(/DESCRIPTION:Abrir Descanso: http:\/\/[^\r]+\/#noche/);
  expect(ics).not.toMatch(/notas|siesta|calidad/i);

  await expect(page.locator('app-calendar-guide summary').first()).toHaveText('Android');
  await expect(page.locator('app-calendar-guide')).toContainText('notificación por defecto 30 minutos antes');
  await expect(page.locator('app-calendar-guide')).toContainText('No molestar');
});

test('el enlace del evento (#noche) abre Noche con "Me voy a dormir" a la vista (FR-010)', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Cuenta', { exact: true }).click();
  await page.getByRole('button', { name: 'Mi horario' }).click();
  await page.goto('/#noche');
  await expect(page.getByRole('button', { name: 'Me voy a dormir' })).toBeInViewport();
  await expect(page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: 'Noche' })).toHaveAttribute('aria-current', 'page');
});

test('"¿Ya despertaste?" 61 min después de la hora agendada; confirmarla cierra la noche como "Anotado después" (US3)', async ({ page, api }) => {
  // Hora de levantarse agendada hace 61 min y te acostaste 8 h antes: vale a cualquier hora del día
  const now = Date.now();
  const wakeAt = wall(new Date(now - 61 * 60_000));
  const bedAt = wall(new Date(now - 61 * 60_000 - 8 * 3600_000));
  await api.saveSchedule(TODAY, week(bedAt.min, wakeAt.min));
  await api.createNight(`${bedAt.date}T${bedAt.hhmm}`);
  await page.goto('/');
  const reminder = page.getByRole('status').filter({ hasText: '¿Ya despertaste?' });
  await expect(reminder).toBeVisible();
  await expect(reminder.getByLabel('Hora en que desperté')).toHaveValue(`${wakeAt.date}T${wakeAt.hhmm}`);
  await reminder.getByRole('button', { name: 'Sí, desperté a esa hora' }).click();
  await expect(reminder).toHaveCount(0);
  const [n] = (await api.nights()) as unknown as { wake_from_proposal: number; wake_logged_at: string }[];
  expect(n.wake_from_proposal).toBe(1);
  expect(n.wake_logged_at).toBeTruthy();
  await expect(page.locator('app-night')).toContainText('Anotado después');
});

test('modo pausa: 15 días se rechaza; 5 días desde hoy se activa y se puede terminar (US4)', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Cuenta', { exact: true }).click();
  await page.getByRole('button', { name: 'Mi horario' }).click();
  const until = (days: number) => wall(new Date(Date.now() + days * 86400_000)).date;
  await page.getByLabel('Desde').fill(TODAY);
  await page.getByLabel('Hasta').fill(until(14));
  await page.getByRole('button', { name: 'Activar pausa' }).click();
  await expect(page.getByRole('alert')).toHaveText('La pausa dura como máximo 14 días');
  await page.getByLabel('Hasta').fill(until(4));
  await page.getByRole('button', { name: 'Activar pausa' }).click();
  await expect(page.locator('.paused')).toContainText('En pausa hasta el');
  await page.locator('.paused').getByRole('button', { name: 'Terminar hoy' }).click();
  await expect(page.locator('.paused')).toContainText('En pausa hasta el'); // termina hoy: sigue activa hasta el final del día
});

test('aviso con la app abierta a la hora de prepararse: "En 30 min es tu hora de dormir" (US5)', async ({ page, api }) => {
  await api.saveSchedule(TODAY, week(1335, 420)); // acostarse 22:15
  await setNow(page, `${TODAY}T21:45`);
  await page.goto('/');
  await expect(page.locator('app-bedtime-notice').getByRole('status')).toHaveText(/En 30 min es tu hora de dormir/);
  await openTab(page, 'Tendencias');
  await page.locator('app-bedtime-notice').getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.locator('app-bedtime-notice').getByRole('status')).toHaveCount(0);
});
