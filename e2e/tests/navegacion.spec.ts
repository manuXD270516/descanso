import { expect, openTab, test } from '../support/fixtures';

// FR-027 (001): tres pestañas en español · FR-017 / US5 (002): versión en el pie de página

test.describe('Pestañas y pie de versión (servidor compartido, solo lectura)', () => {
  test.use({ isolate: false });

  test('FR-027 · la app abre en "Noche" y navega entre Noche, Siestas y Métricas', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Descanso');
    const nav = page.getByRole('navigation', { name: 'Secciones' });
    await expect(nav.getByRole('button')).toHaveText(['Noche', 'Siestas', 'Métricas']);
    await expect(nav.getByRole('button', { name: 'Noche' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Últimas 14 noches' })).toBeVisible();

    await openTab(page, 'Siestas');
    await expect(nav.getByRole('button', { name: 'Siestas' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('button', { name: 'Noche' })).not.toHaveAttribute('aria-current');
    await expect(page.getByRole('heading', { name: 'Nueva siesta' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Últimas 14 noches' })).toHaveCount(0);

    await openTab(page, 'Métricas');
    await expect(nav.getByRole('button', { name: 'Métricas' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Configurar métricas' })).toBeVisible();

    await openTab(page, 'Noche');
    await expect(page.getByRole('heading', { name: 'Últimas 14 noches' })).toBeVisible();
  });

  test('002 US5-3 · FR-017 · sin versión inyectada el pie muestra "Versión dev"', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('contentinfo')).toHaveText('Versión dev');
  });

  test('Borde · con el servidor caído la app muestra "No se pudo conectar con el servidor" y oculta la versión', async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort('connectionrefused'));
    await page.goto('/');
    await expect(page.getByRole('alert')).toHaveText('No se pudo conectar con el servidor');
    await expect(page.getByRole('contentinfo')).toHaveCount(0);
  });
});

test.describe('Versión desplegada (servidor propio con APP_VERSION)', () => {
  const sha = '0123456789abcdef0123456789abcdef01234567';
  test.use({ serverEnv: { APP_VERSION: sha } });

  test('002 US5-2 · FR-017 · FR-018 · el pie muestra el SHA corto del commit que expone /api/health', async ({ page, request }) => {
    const health = await (await request.get('/api/health')).json();
    expect(health).toMatchObject({ ok: true, version: sha });

    await page.goto('/');
    await expect(page.getByRole('contentinfo')).toHaveText('Versión 0123456');
  });
});
