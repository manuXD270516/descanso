delete process.env.BACKUP_TOKEN;

const { test } = require('node:test');
const { api } = require('./helpers');

test('sin BACKUP_TOKEN configurado el endpoint de respaldo no existe (FR-021)', async () => {
  await api.get('/api/admin/backup').expect(404);
  await api.get('/api/admin/backup').set('Authorization', 'Bearer undefined').expect(404);
});
