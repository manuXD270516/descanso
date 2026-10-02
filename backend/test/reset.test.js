const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api, otherApi, anon, db, OTHER_ID, OTHER_EMAIL } = require('./helpers');
const { createSession } = require('../src/auth/sessions');
const { bootstrap } = require('../src/auth/bootstrap');

// Recuperación por enlace del propietario y auditoría (feature 008, US4, FR-014…FR-018).
const NEW_PASSWORD = 'una contraseña recuperada';
const link = async (id = OTHER_ID) => (await api.post(`/api/people/${id}/reset-link`).expect(201)).body;
const reset = (token, password = NEW_PASSWORD, ip = 'ip-reset') => anon.post('/api/auth/reset').set('Fly-Client-IP', ip).send({ token, password });

test('solo el propietario genera enlaces, solo para usuarios; caduca a los 30 min (FR-014)', async () => {
  await otherApi.post(`/api/people/${OTHER_ID}/reset-link`).expect(403);
  await api.post('/api/people/1/reset-link').expect(404); // el propietario usa la rotación de 004
  await api.post('/api/people/999/reset-link').expect(404);
  const l = await link();
  assert.ok(Math.abs(Date.parse(l.expires_at) - Date.now() - 30 * 60 * 1000) < 5000);
});

test('un enlace nuevo invalida el anterior; caducado, usado o inventado → 403 con el mismo mensaje (FR-015)', async () => {
  const first = await link();
  const second = await link();
  const r1 = await reset(first.token, NEW_PASSWORD, 'ip-1').expect(403);
  const expired = await link();
  db.prepare("UPDATE password_resets SET expires_at = '2000-01-01T00:00:00.000Z' WHERE used_at IS NULL").run();
  const r2 = await reset(expired.token, NEW_PASSWORD, 'ip-2').expect(403);
  const r3 = await reset('inventado', NEW_PASSWORD, 'ip-3').expect(403);
  assert.equal(r1.body.error, 'Este enlace de recuperación no es válido o ha caducado');
  assert.deepEqual(r1.body, r2.body);
  assert.deepEqual(r2.body, r3.body);
  void second;
});

test('usar el enlace fija la contraseña, cierra TODAS las sesiones de la persona y deja aviso y auditoría (FR-015, FR-016)', async () => {
  const extra = createSession(db, OTHER_ID);
  const l = await link();
  await reset(l.token, 'corta', 'ip-4').expect(400);
  await reset(l.token, NEW_PASSWORD, 'ip-4').expect(204);
  await reset(l.token, NEW_PASSWORD, 'ip-5').expect(403); // un solo uso
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?').get(OTHER_ID).c, 0);
  await anon.get('/api/me').set('Cookie', `sid=${extra}`).expect(401);

  const login = await anon.post('/api/auth/login').send({ email: OTHER_EMAIL, password: NEW_PASSWORD }).expect(200);
  assert.ok(login.body.reset_notice_at, 'el login informa del restablecimiento');
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  const activity = (await anon.get('/api/me/activity').set('Cookie', cookie).expect(200)).body;
  assert.deepEqual(activity.map((a) => a.action).slice(0, 2), ['password_reset', 'reset_link_created']);
  assert.ok(activity.every((a) => a.actor && a.created_at));
  await anon.post('/api/me/reset-notice/ack').set('Cookie', cookie).expect(204);
  const again = await anon.post('/api/auth/login').send({ email: OTHER_EMAIL, password: NEW_PASSWORD }).expect(200);
  assert.equal(again.body.reset_notice_at, null);
});

test('la actividad de una persona no incluye la de otras', async () => {
  const mine = (await api.get('/api/me/activity').expect(200)).body;
  assert.deepEqual(mine, []);
});

test('rotar el código de alta solo afecta al propietario (FR-018)', () => {
  const s = createSession(db, OTHER_ID);
  const otherHash = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(OTHER_ID).password_hash;
  bootstrap(db, 'codigo-rotado-reset', { info() {} });
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE id = 1').get().password_hash, null);
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE id = ?').get(OTHER_ID).password_hash, otherHash);
  assert.ok(db.prepare('SELECT 1 FROM sessions WHERE user_id = ? AND id_hash IS NOT NULL').get(OTHER_ID));
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE user_id = 1').get().c, 0);
  void s;
});
