process.env.BACKUP_TOKEN = 't0k3n';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { api, db, iso } = require('./helpers');

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
  assert.match(res.headers['content-disposition'], /attachment; filename="?descanso-\d{4}-\d{2}-\d{2}T\d{6}Z\.db"?/);

  const file = path.join(os.tmpdir(), `admin-test-${process.pid}.db`);
  fs.writeFileSync(file, res.body);
  try {
    const copy = new Database(file, { readonly: true });
    assert.equal(copy.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(copy.prepare("SELECT COUNT(*) AS c FROM sleep_records WHERE notes = 'control'").get().c, 1);
    // El respaldo es la base completa: incluye las métricas de todos los usuarios (feature 008)
    const metrics = copy.prepare('SELECT COUNT(*) AS c FROM metrics').get().c;
    copy.close();
    assert.equal(metrics, db.prepare('SELECT COUNT(*) AS c FROM metrics').get().c);
  } finally {
    fs.rmSync(file, { force: true });
  }

  // El temporal del servicio se borra al terminar la descarga
  for (let i = 0; i < 20 && leftovers().some((f) => !before.has(f)); i++) await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(leftovers().filter((f) => !before.has(f)), []);
});

// Salud de los avisos push (feature 013, FR-026)
test('GET /api/admin/health: token incorrecto → 401; sin cabecera → 401', async () => {
  // IP propia: el límite de fallos es por IP y estos tests comparten proceso
  await api.get('/api/admin/health').set('Fly-Client-IP', '10.9.0.1').expect(401);
  await api.get('/api/admin/health').set('Fly-Client-IP', '10.9.0.1').set('Authorization', 'Bearer otro').expect(401);
});

test('GET /api/admin/health: estado del disparador y contadores, sin datos personales', async () => {
  const { runTick, resetState } = require('../src/reminders/tick');
  const { startWaker } = require('../src/reminders/waker');
  resetState();
  db.exec('DELETE FROM reminder_deliveries');
  const none = (await api.get('/api/admin/health').set('Authorization', 'Bearer t0k3n').expect(200)).body;
  assert.deepEqual(none, { reminders: { enabled: false, last_tick_at: null, pending_dues: 0, skipped_24h: 0, failed_24h: 0 } });

  const now = Date.now();
  const insert = db.prepare("INSERT INTO reminder_deliveries (user_id, kind, night_date, due_at, status, reason, updated_at) VALUES (1, ?, ?, 'x', ?, ?, ?)");
  insert.run('prepare', '2026-10-01', 'skipped', 'late', new Date(now - 3600_000).toISOString());
  insert.run('bedtime', '2026-10-01', 'skipped', 'dnd', new Date(now - 7200_000).toISOString());
  insert.run('wake_check', '2026-10-01', 'failed', 'error', new Date(now - 60_000).toISOString());
  insert.run('prepare', '2026-09-20', 'failed', 'error', new Date(now - 3 * 86_400_000).toISOString()); // fuera de las 24 h
  insert.run('prepare', '2026-09-21', 'sent', null, new Date(now - 1000).toISOString());
  await runTick({ now });
  const waker = startWaker(async () => {}, { intervalMs: 1e9 });
  process.env.VAPID_PUBLIC_KEY = 'x'; process.env.VAPID_PRIVATE_KEY = 'y'; process.env.VAPID_SUBJECT = 'mailto:a@b.test';
  try {
    const res = (await api.get('/api/admin/health').set('Authorization', 'Bearer t0k3n').expect(200)).body;
    assert.deepEqual(res, { reminders: { enabled: true, last_tick_at: new Date(now).toISOString(), pending_dues: 0, skipped_24h: 2, failed_24h: 1 } });
    const text = JSON.stringify(res);
    assert.ok(!/user_id|email|endpoint|@/.test(text));
  } finally {
    waker.stop();
    delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; delete process.env.VAPID_SUBJECT;
    db.exec('DELETE FROM reminder_deliveries');
    resetState();
  }
});

test('/api/health público no cambia con los avisos', async () => {
  const res = await api.get('/api/health').expect(200);
  assert.deepEqual(Object.keys(res.body).sort(), ['ok', 'storage', 'time', 'version']);
});

// Límite de intentos y registro de accesos (runbook de despliegue, fase 2, punto 4)
test('límite: 5 fallos por IP y el 6.º → 429 con Retry-After; el token correcto también queda bloqueado', async () => {
  const ip = '10.0.0.1';
  for (let i = 0; i < 5; i++) {
    await api.get('/api/admin/health').set('Fly-Client-IP', ip).set('Authorization', 'Bearer malo').expect(401);
  }
  const res = await api.get('/api/admin/health').set('Fly-Client-IP', ip).set('Authorization', 'Bearer malo').expect(429);
  assert.ok(Number(res.headers['retry-after']) > 0);
  assert.equal(typeof res.body.error, 'string');
  // Sin oráculo: con el token correcto sigue bloqueada, en ambas rutas
  await api.get('/api/admin/health').set('Fly-Client-IP', ip).set('Authorization', 'Bearer t0k3n').expect(429);
  await api.get('/api/admin/backup').set('Fly-Client-IP', ip).set('Authorization', 'Bearer t0k3n').expect(429);
});

test('límite: otra IP no resulta afectada y un acceso válido no limpia los fallos ajenos', async () => {
  const bad = '10.0.0.2';
  for (let i = 0; i < 5; i++) await api.get('/api/admin/health').set('Fly-Client-IP', bad).expect(401);
  await api.get('/api/admin/health').set('Fly-Client-IP', '10.0.0.3').set('Authorization', 'Bearer t0k3n').expect(200);
  await api.get('/api/admin/health').set('Fly-Client-IP', bad).expect(429);
});

test('registro: una línea por acceso con ruta, resultado e IP, sin el token', async (t) => {
  const lines = [];
  t.mock.method(console, 'log', (...a) => lines.push(a.join(' ')));
  t.mock.method(console, 'warn', (...a) => lines.push(a.join(' ')));
  const ip = '10.0.0.4';
  await api.get('/api/admin/health').set('Fly-Client-IP', ip).set('Authorization', 'Bearer secreto-mal').expect(401);
  await api.get('/api/admin/health').set('Fly-Client-IP', ip).set('Authorization', 'Bearer t0k3n').expect(200);
  for (let i = 0; i < 4; i++) await api.get('/api/admin/backup').set('Fly-Client-IP', ip).set('Authorization', 'Bearer secreto-mal').expect(401);
  await api.get('/api/admin/backup').set('Fly-Client-IP', ip).set('Authorization', 'Bearer t0k3n').expect(429);
  const text = lines.join('\n');
  assert.match(text, /admin health 401 ip=10\.0\.0\.4/);
  assert.match(text, /admin health ok ip=10\.0\.0\.4/);
  assert.match(text, /admin backup 429 ip=10\.0\.0\.4/);
  assert.ok(!text.includes('t0k3n') && !text.includes('secreto-mal') && !/bearer/i.test(text));
});
