process.env.BACKUP_TOKEN = 't0k3n';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { api, iso } = require('./helpers');

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const leftovers = () => fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('descanso-backup-'));

test('sin cabecera Authorization → 401 sin datos (FR-021)', async () => {
  const res = await api.get('/api/admin/backup').expect(401);
  assert.deepEqual(res.body, { error: 'No autorizado' });
});

test('con un token inválido → 401', async () => {
  await api.get('/api/admin/backup').set('Authorization', 'Bearer otro').expect(401);
  await api.get('/api/admin/backup').set('Authorization', 't0k3n').expect(401);
});

test('con el token correcto entrega una copia SQLite consistente con los datos (FR-010)', async () => {
  const before = new Set(leftovers());
  await api.post('/api/sleep').send({
    date: '2026-09-28', bedtime: iso('2026-09-28T23:00'), wake_time: iso('2026-09-29T07:00'), notes: 'control',
  }).expect(201);

  const res = await api.get('/api/admin/backup')
    .set('Authorization', 'Bearer t0k3n')
    .buffer(true).parse(binary)
    .expect(200);
  assert.equal(res.headers['content-type'], 'application/octet-stream');
  assert.match(res.headers['content-disposition'], /attachment; filename="descanso-\d{4}-\d{2}-\d{2}T\d{6}Z\.db"/);

  const file = path.join(os.tmpdir(), `admin-test-${process.pid}.db`);
  fs.writeFileSync(file, res.body);
  try {
    const copy = new Database(file, { readonly: true });
    assert.equal(copy.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(copy.prepare("SELECT COUNT(*) AS c FROM sleep_records WHERE notes = 'control'").get().c, 1);
    assert.equal(copy.prepare('SELECT COUNT(*) AS c FROM metrics').get().c, 3);
    copy.close();
  } finally {
    fs.rmSync(file, { force: true });
  }

  // El temporal del servicio se borra al terminar la descarga
  for (let i = 0; i < 20 && leftovers().some((f) => !before.has(f)); i++) await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(leftovers().filter((f) => !before.has(f)), []);
});
