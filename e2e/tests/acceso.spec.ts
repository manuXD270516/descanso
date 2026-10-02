import { expect, test } from '../support/fixtures';
import { OWNER_EMAIL, OWNER_PASSWORD, SETUP_TOKEN } from '../support/env';

// Feature 004 · Acceso protegido: alta, entrada, salida y sesión caducada.
// Cada test tiene su propio servidor (base vacía) y empieza SIN sesión.
test.use({ authenticated: false });

test.describe('Acceso protegido (004)', () => {
  test('US2-1/US2-2 · la primera vez se crea la cuenta con el código de alta y se entra', async ({ page, api }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Crea tu contraseña' })).toBeVisible();
    await expect(page.getByText('Tus 0 noches están a salvo')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Secciones' })).toHaveCount(0);

    await page.getByLabel('Código de alta').fill(SETUP_TOKEN);
    await page.getByLabel('Email').fill(OWNER_EMAIL);
    await page.getByLabel('Contraseña nueva').fill('corta');
    await expect(page.getByRole('button', { name: 'Crear cuenta' })).toBeDisabled();
    await page.getByLabel('Contraseña nueva').fill(OWNER_PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Me voy a dormir' })).toBeVisible();
    // La API sin sesión (el cliente `api` no tiene cookie) sigue cerrada
    expect((await api.request.get('/api/sleep')).status()).toBe(401);
  });

  test('US1-1/US1-5/US1-6 · entrar, error genérico, y cerrar sesión la invalida', async ({ page, api }) => {
    await api.setupOwner();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();

    await page.getByLabel('Email').fill(OWNER_EMAIL);
    await page.getByLabel('Contraseña').fill('no es la contraseña');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toHaveText('Email o contraseña incorrectos');

    await page.getByLabel('Contraseña').fill(OWNER_PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    // Feature 005: la primera entrada pasa por la bienvenida, con el menú Cuenta disponible
    await expect(page.getByRole('heading', { name: '¿Cuántas horas quieres dormir?' })).toBeVisible();

    await page.getByText('Cuenta', { exact: true }).click();
    // Feature 008: el menú muestra el nombre visible (al dar de alta: la parte local del email)
    await expect(page.locator('.account-email')).toHaveText(OWNER_EMAIL.split('@')[0]);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  });

  test('FR-006 · US1-4 · dormir sin contraseña; si la sesión caduca con la noche abierta, al entrar se ve "Ya desperté"', async ({ page, context, api }) => {
    await api.setupOwner();
    await page.goto('/');
    await page.getByLabel('Email').fill(OWNER_EMAIL);
    await page.getByLabel('Contraseña').fill(OWNER_PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    // Feature 005: la primera entrada pasa por la bienvenida
    await page.getByRole('button', { name: 'Saltar (7 h)' }).click();

    await page.getByRole('button', { name: 'Me voy a dormir' }).click();
    await expect(page.getByRole('button', { name: 'Ya desperté' })).toBeVisible();

    // La sesión "caduca": el navegador pierde la cookie
    await context.clearCookies();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    await page.getByLabel('Email').fill(OWNER_EMAIL);
    await page.getByLabel('Contraseña').fill(OWNER_PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('button', { name: 'Ya desperté' })).toBeVisible();
  });

  test('US5 · con sesión, el menú Cuenta descarga la exportación JSON', async ({ page, api }) => {
    await api.signIn();
    await page.context().addCookies((await api.request.storageState()).cookies);
    await api.createNight('2026-09-05T23:00', '2026-09-06T07:00');
    await page.goto('/');
    await page.getByText('Cuenta', { exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Todo (JSON)' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^descanso-\d{4}-\d{2}-\d{2}\.json$/);
    const body = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8')));
    expect(body.format).toBe('descanso-export');
    expect(body.sleep_records).toHaveLength(1);
  });
});
