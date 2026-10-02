import { expect, test } from '../support/fixtures';
import { GUEST_EMAIL, GUEST_PASSWORD } from '../support/env';

// Feature 008 · Mi cuenta: perfil, recuperación por enlace del propietario y borrado.

test.describe('Cuenta (008)', () => {
  test('US3 · el perfil guarda nombre, zona y objetivo; el nombre aparece en el menú', async ({ guest }) => {
    const p = guest.page;
    await p.goto('/');
    await p.getByText('Cuenta', { exact: true }).click();
    await p.getByRole('button', { name: 'Mi perfil' }).click();
    await expect(p.getByText('Propuesta desde tu navegador')).toBeVisible();
    await p.getByLabel('Nombre visible').fill('Inés');
    await p.getByLabel('Zona horaria').fill('Europe/Madrid');
    await p.getByLabel('Horas').fill('7');
    await p.getByLabel('Minutos').fill('30');
    await p.getByRole('button', { name: 'Guardar perfil' }).click();
    await expect(p.getByRole('status').filter({ hasText: 'Perfil guardado.' })).toBeVisible();
    await p.reload();
    await p.getByText('Cuenta', { exact: true }).click();
    await expect(p.locator('.account-email')).toHaveText('Inés');
    const me = await (await guest.api.request.get('/api/me')).json();
    expect([me.timezone, me.sleep_goal_min]).toEqual(['Europe/Madrid', 450]);
  });

  test('US4 · recuperación: enlace del propietario, contraseña nueva, aviso al entrar y actividad', async ({ api, guest, browser, server }) => {
    const t0 = Date.now();
    const { token } = await api.resetLink(guest.id);
    const ctx = await browser.newContext({ baseURL: server.url, locale: 'es-ES' });
    await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
    const p = await ctx.newPage();
    await p.goto(`/#restablecer=${token}`);
    await p.locator('input[name="password"]').fill('una contraseña recuperada');
    await p.getByRole('button', { name: 'Guardar contraseña' }).click();
    await p.getByRole('button', { name: 'Ir a Entrar' }).click();

    // La sesión anterior de la invitada se cerró
    expect((await guest.api.request.get('/api/me')).status()).toBe(401);

    await p.getByLabel('Email').fill(GUEST_EMAIL);
    await p.getByLabel('Contraseña').fill('una contraseña recuperada');
    await p.getByRole('button', { name: 'Entrar' }).click();
    await expect(p.getByRole('status').filter({ hasText: 'Tu contraseña fue restablecida' })).toBeVisible();
    expect(Date.now() - t0).toBeLessThan(5 * 60 * 1000); // SC-006
    await p.getByRole('button', { name: 'Entendido' }).click();
    await p.getByText('Cuenta', { exact: true }).click();
    await p.getByRole('button', { name: 'Mi perfil' }).click();
    await expect(p.getByText(/tu contraseña se restableció/)).toBeVisible();
    await ctx.close();
  });

  test('US5 · borrar mi cuenta pide contraseña y confirmación, y vuelve a "Entrar"', async ({ api, guest }) => {
    await guest.api.createNight('2026-09-05T23:00', '2026-09-06T07:00', 'mía');
    const p = guest.page;
    await p.goto('/');
    await p.getByText('Cuenta', { exact: true }).click();
    await p.getByRole('button', { name: 'Mi perfil' }).click();
    await expect(p.getByText('máximo de 14 días')).toBeVisible();
    const del = p.getByRole('button', { name: 'Borrar mi cuenta' });
    await expect(del).toBeDisabled();
    await p.locator('input[name="deletePassword"]').fill(GUEST_PASSWORD);
    await p.getByLabel('Entiendo que es definitivo.').check();
    await del.click();
    await expect(p.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    expect((await api.people()).some((x) => x.email === GUEST_EMAIL)).toBe(false);
  });

  test('"¿Olvidaste tu contraseña?" explica que hay que pedir un enlace, sin consultar cuentas', async ({ page, api }) => {
    await api.request.post('/api/auth/logout');
    await page.context().clearCookies();
    await page.goto('/');
    await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click();
    await expect(page.getByRole('heading', { name: '¿Olvidaste tu contraseña?' })).toBeVisible();
    await expect(page.getByText('enlace de recuperación')).toBeVisible();
  });
});
