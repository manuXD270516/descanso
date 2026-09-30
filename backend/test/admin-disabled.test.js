delete process.env.BACKUP_TOKEN;

const { test } = require('node:test');
const { api, anon } = require('./helpers');

test('sin BACKUP_TOKEN configurado el endpoint de respaldo no existe (FR-021)', async () => {
  await api.get('/api/admin/backup').expect(404);
  await api.get('/api/admin/backup').set('Authorization', 'Bearer undefined').expect(404);
  // También sin sesión: 404, no 401 (feature 004 no cambia este contrato de 002)
  await anon.get('/api/admin/backup').expect(404);
});
