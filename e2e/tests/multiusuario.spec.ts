import { expect, setNow, test } from '../support/fixtures';
import { GUEST_PASSWORD, OWNER_EMAIL } from '../support/env';

// Feature 008 · Multiusuario: invitación por la UI y aislamiento entre dos navegadores.

test.describe('Multiusuario (008)', () => {
  test('US2 · dos navegadores: cada persona solo ve lo suyo; un id ajeno por API → 404', async ({ page, api, guest }) => {
    // A (propietario) registra una noche con nota; los dos navegadores "viven" el 8 de septiembre
    const night = await api.createNight('2026-09-05T23:00', '2026-09-06T07:00', 'noche de A');
    await setNow(page, '2026-09-08T12:00');
    await setNow(guest.page, '2026-09-08T12:00');
    await page.goto('/');
    await expect(page.getByText('noche de A')).toBeVisible();

    // B (invitada) entra en su navegador: app vacía, sus 3 métricas, nada de A
    await guest.page.goto('/');
    await expect(guest.page.getByRole('button', { name: 'Me voy a dormir' })).toBeVisible();
    await expect(guest.page.getByText('noche de A')).toHaveCount(0);
    expect(await guest.api.nights()).toEqual([]);
    expect((await guest.api.metrics()).map((m) => m.name)).toEqual(['Calidad del sueño', 'Energía al despertar', 'Cafés']);

    // B intenta tocar la noche de A por id: como si no existiera
    expect((await guest.api.request.put(`/api/sleep/${night.id}`, { data: { notes: 'intrusa' } })).status()).toBe(404);
    expect((await guest.api.request.delete(`/api/sleep/${night.id}`)).status()).toBe(404);
    expect((await api.nights())[0].notes).toBe('noche de A');

    // B duerme a la vez que A: la noche abierta es por persona
    await api.createNight('2026-09-07T23:00');
    await guest.page.getByRole('button', { name: 'Me voy a dormir' }).click();
    await expect(guest.page.getByRole('button', { name: 'Ya desperté' })).toBeVisible();
  });

  test('US1 · el propietario invita desde Personas y la persona se registra desde el enlace', async ({ page, browser, server, api }) => {
    await page.goto('/');
    await page.getByText('Cuenta', { exact: true }).click();
    await page.getByRole('button', { name: 'Personas' }).click();
    await page.getByRole('button', { name: 'Invitar a alguien' }).click();
    const link = await page.getByRole('textbox', { name: 'Enlace para compartir' }).inputValue();
    expect(link).toMatch(/\/#invitacion=[\w-]{43}$/);

    // La persona invitada abre el enlace en su navegador (sin sesión)
    const ctx = await browser.newContext({ baseURL: server.url, locale: 'es-ES' });
    await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
    const p2 = await ctx.newPage();
    const t0 = Date.now();
    await p2.goto(link);
    await expect(p2.getByRole('heading', { name: 'Te han invitado a Descanso' })).toBeVisible();
    await expect(p2.locator('.notice')).toContainText('Quien administra el servidor tiene acceso técnico');
    expect(new URL(p2.url()).hash).toBe(''); // el token se borró de la barra de direcciones

    await p2.getByLabel('Tu nombre').fill('Ana');
    await p2.getByLabel('Email').fill('ana@descanso.test');
    await p2.getByLabel('Contraseña').fill(GUEST_PASSWORD);
    await expect(p2.getByRole('button', { name: 'Crear mi cuenta' })).toBeDisabled();
    await p2.getByLabel(/He leído y acepto la política/).check();
    await p2.getByRole('button', { name: 'Crear mi cuenta' }).click();

    await p2.getByRole('button', { name: 'Me voy a dormir' }).click();
    await expect(p2.getByRole('button', { name: 'Ya desperté' })).toBeVisible();
    expect(Date.now() - t0).toBeLessThan(3 * 60 * 1000); // SC-003

    // El mismo enlace ya no sirve
    await p2.context().clearCookies();
    await p2.goto(link);
    await p2.getByLabel('Tu nombre').fill('Otra');
    await p2.getByLabel('Email').fill('otra@descanso.test');
    await p2.getByLabel('Contraseña').fill(GUEST_PASSWORD);
    await p2.getByLabel(/He leído y acepto la política/).check();
    await p2.getByRole('button', { name: 'Crear mi cuenta' }).click();
    await expect(p2.getByRole('alert')).toHaveText('Esta invitación no es válida');
    await ctx.close();

    // En Personas aparece Ana; el propietario no ve sus datos
    expect((await api.people()).map((p) => p.email)).toEqual([OWNER_EMAIL, 'ana@descanso.test']);
    expect(await api.nights()).toEqual([]);
  });
});
