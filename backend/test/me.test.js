const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { otherApi, anon, db, OTHER_ID, OTHER_EMAIL, otherSessionId } = require('./helpers');
const { hashPassword } = require('../src/auth/password');
const { createSession } = require('../src/auth/sessions');

// Mi perfil (feature 008, US3, FR-011…FR-013), como la invitada.
const PASSWORD = 'contraseña de la invitada';
before(async () => {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(PASSWORD), OTHER_ID);
});

test('GET /me devuelve el perfil con el objetivo por defecto y sin datos sensibles', async () => {
  const me = (await otherApi.get('/api/me').expect(200)).body;
  assert.equal(me.email, OTHER_EMAIL);
  assert.equal(me.role, 'user');
  assert.equal(me.display_name, 'Invitada');
  assert.equal(me.sleep_goal_min, 420); // 7 h por defecto desde 005
  assert.equal(me.timezone, null);
  assert.ok(!('password_hash' in me));
});

test('PUT /me valida nombre, zona IANA y objetivo de 4 a 12 h (FR-011)', async () => {
  for (const body of [{ display_name: '' }, { display_name: 'x'.repeat(61) }, { timezone: 'Mars/Base' }, { timezone: 5 }, { sleep_goal_min: 239 }, { sleep_goal_min: 721 }, { sleep_goal_min: 450.5 }]) {
    await otherApi.put('/api/me').send(body).expect(400);
  }
  const me = (await otherApi.put('/api/me').send({ display_name: '  Inés ', timezone: 'Europe/Madrid', sleep_goal_min: 450 }).expect(200)).body;
  assert.deepEqual([me.display_name, me.timezone, me.sleep_goal_min], ['Inés', 'Europe/Madrid', 450]);
  await otherApi.put('/api/me').send({ timezone: 'UTC' }).expect(200);
  assert.equal(db.prepare('SELECT sleep_goal_min FROM user_settings WHERE user_id = ?').get(OTHER_ID).sleep_goal_min, 450);
  assert.equal(db.prepare('SELECT sleep_goal_min FROM user_settings WHERE user_id = 1').get().sleep_goal_min, 420, 'el del propietario no cambia');
});

test('cambiar el email exige la contraseña y no revela de quién es un email ocupado (FR-012)', async () => {
  await otherApi.put('/api/me/email').send({ email: 'nueva@ejemplo.com', password: 'otra cosa' }).expect(401);
  const taken = await otherApi.put('/api/me/email').send({ email: 'PROPIETARIO@descanso.test', password: PASSWORD }).expect(409);
  assert.equal(taken.body.error, 'Ese email no está disponible');
  const ok = await otherApi.put('/api/me/email').send({ email: ' Nueva@Ejemplo.com ', password: PASSWORD }).expect(200);
  assert.equal(ok.body.email, 'nueva@ejemplo.com');
  await otherApi.put('/api/me/email').send({ email: OTHER_EMAIL, password: PASSWORD }).expect(200);
});

test('cambiar la contraseña cierra mis otras sesiones, no la actual ni las de otros (FR-012)', async () => {
  const second = createSession(db, OTHER_ID);
  const ownerSessions = db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE user_id = 1').get().c;
  await otherApi.put('/api/me/password').send({ current: 'mal', password: 'una nueva frase larga' }).expect(401);
  await otherApi.put('/api/me/password').send({ current: PASSWORD, password: 'corta' }).expect(400);
  await otherApi.put('/api/me/password').send({ current: PASSWORD, password: 'una nueva frase larga' }).expect(204);
  await anon.get('/api/me').set('Cookie', `sid=${second}`).expect(401);
  await anon.get('/api/me').set('Cookie', `sid=${otherSessionId}`).expect(200);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE user_id = 1').get().c, ownerSessions);
  await otherApi.put('/api/me/password').send({ current: 'una nueva frase larga', password: PASSWORD }).expect(204);
});

test('los fallos de contraseña actual cuentan para el límite de intentos (FR-013)', async () => {
  require('../src/auth/rate-limit').limiter.reset(`user:${OTHER_ID}`); // los tests anteriores ya fallaron 2 veces
  const tryWrong = () => otherApi.put('/api/me/email').set('Fly-Client-IP', 'ip-perfil').send({ email: 'z@z.com', password: 'mal' });
  for (let i = 0; i < 5; i++) await tryWrong().expect(401);
  await otherApi.put('/api/me/email').set('Fly-Client-IP', 'ip-perfil').send({ email: 'z@z.com', password: PASSWORD }).expect(429);
});

test('ajustes de ciclo (feature 006, FR-009): 90/15 por defecto, rangos, por usuario y sin tocar el objetivo', async () => {
  const me = (await otherApi.get('/api/me').expect(200)).body;
  assert.deepEqual([me.cycle_min, me.latency_min], [90, 15]);
  const customized = db.prepare('SELECT goal_customized FROM user_settings WHERE user_id = ?').get(OTHER_ID).goal_customized;

  const saved = (await otherApi.put('/api/me').send({ cycle_min: 100, latency_min: 20 }).expect(200)).body;
  assert.deepEqual([saved.cycle_min, saved.latency_min], [100, 20]);
  assert.equal(db.prepare('SELECT goal_customized FROM user_settings WHERE user_id = ?').get(OTHER_ID).goal_customized, customized, 'goal_customized intacto');

  for (const cycle_min of [69, 111, 90.5, '90', null]) {
    const r = await otherApi.put('/api/me').send({ cycle_min }).expect(400);
    assert.equal(r.body.error, 'La duración del ciclo debe estar entre 70 y 110 minutos');
  }
  for (const latency_min of [-1, 61, 7.5, '15', null]) {
    const r = await otherApi.put('/api/me').send({ latency_min }).expect(400);
    assert.equal(r.body.error, 'El tiempo en dormirte debe estar entre 0 y 60 minutos');
  }
  await otherApi.put('/api/me').send({ cycle_min: 70, latency_min: 0 }).expect(200);
  await otherApi.put('/api/me').send({ cycle_min: 110, latency_min: 60 }).expect(200);
  assert.deepEqual(db.prepare('SELECT cycle_min, latency_min FROM user_settings WHERE user_id = 1').get(), { cycle_min: 90, latency_min: 15 }, 'el del propietario no cambia');
  await otherApi.put('/api/me').send({ cycle_min: 100, latency_min: 20 }).expect(200);
});
