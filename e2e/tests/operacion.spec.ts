import { expect, test } from '../support/fixtures';

// Operación del servicio real (002-pipeline-ci-cd): chequeo de salud y respaldo protegido.
// Los tests unitarios del backend ya cubren la lógica; aquí se comprueba que el proceso
// real (`node backend/src/server.js`) respeta sus variables de entorno de despliegue.

test.describe('Salud y respaldo sin token configurado (servidor compartido)', () => {
  test.use({ isolate: false });

  test('FR-029 (001) · FR-018 · /api/health responde ok con la versión "dev"', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, version: 'dev' });
  });

  test('FR-021 · sin BACKUP_TOKEN el endpoint de respaldo no existe (404)', async ({ request }) => {
    const res = await request.get('/api/admin/backup', { headers: { Authorization: 'Bearer cualquiera' } });
    expect(res.status()).toBe(404);
  });
});

test.describe('Respaldo con BACKUP_TOKEN (servidor propio)', () => {
  const token = 'token-de-prueba-e2e';
  test.use({ serverEnv: { BACKUP_TOKEN: token } });

  test('002 US3-7 · FR-021 · sin token o con uno inválido responde 401 sin datos; con el válido entrega la base SQLite', async ({ request, api }) => {
    await api.createNight('2026-09-07T23:40', '2026-09-08T07:10');

    const rejected: Record<string, string>[] = [{}, { Authorization: 'Bearer otro-token' }, { Authorization: token }];
    for (const headers of rejected) {
      const res = await request.get('/api/admin/backup', { headers });
      expect(res.status(), JSON.stringify(headers)).toBe(401);
      expect(await res.json()).toEqual({ error: 'No autorizado' });
    }

    const ok = await request.get('/api/admin/backup', { headers: { Authorization: `Bearer ${token}` } });
    expect(ok.status()).toBe(200);
    expect(ok.headers()['content-disposition']).toMatch(/attachment; filename="descanso-.*\.db"/);
    const body = await ok.body();
    expect(body.subarray(0, 16).toString('latin1')).toBe('SQLite format 3\0');
    expect(body.length).toBeGreaterThan(4096);
  });
});
