const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { anon, db, iso } = require('./helpers');
const { hashPassword } = require('../src/auth/password');
const { loadSession, createSession, sha256, TTL } = require('../src/auth/sessions');

// Contrato de entrada y sesión (US1, FR-001…FR-007).
const EMAIL = 'yo@ejemplo.com';
const PASSWORD = 'mi frase de doce o más';
const login = (email, password, headers = {}) => anon.post('/api/auth/login').set(headers).send({ email, password });
const cookieOf = (r) => r.headers['set-cookie'][0].split(';')[0];

before(async () => {
  db.prepare('UPDATE users SET email = ?, password_hash = ? WHERE id = 1').run(EMAIL, await hashPassword(PASSWORD));
});

test('entrar: 200 y cookie sid HttpOnly, SameSite=Lax, 30 días; en HTTPS __Host-sid con Secure (FR-001, FR-007)', async () => {
  const r = await login(' YO@ejemplo.com ', PASSWORD).expect(200);
  // 008 añade role, display_name y reset_notice_at a la respuesta
  assert.deepEqual(r.body, { email: EMAIL, role: 'owner', display_name: null, reset_notice_at: null, onboarded: false });
  assert.match(r.headers['set-cookie'][0], /^sid=[\w-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/);
  const s = await login(EMAIL, PASSWORD, { 'X-Forwarded-Proto': 'https' }).expect(200);
  assert.match(s.headers['set-cookie'][0], /^__Host-sid=[\w-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure$/);
});

test('la base guarda solo la huella del identificador de sesión (FR-007)', async () => {
  const id = cookieOf(await login(EMAIL, PASSWORD).expect(200)).split('=')[1];
  assert.ok(db.prepare('SELECT 1 FROM sessions WHERE id_hash = ?').get(sha256(id)));
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE id_hash = ?').get(id).c, 0);
});

test('credenciales incorrectas: mismo 401 y mensaje exista o no el email (FR-005)', async () => {
  const a = await login(EMAIL, 'contraseña equivocada').expect(401);
  const b = await login('nadie@ejemplo.com', PASSWORD).expect(401);
  assert.equal(a.body.error, 'Email o contraseña incorrectos');
  assert.deepEqual(a.body, b.body);
});

test('con sesión se usa la API y dormir/despertar no piden contraseña (FR-006)', async () => {
  const cookie = cookieOf(await login(EMAIL, PASSWORD).expect(200));
  await anon.post('/api/sleep').set('Cookie', cookie).send({ date: '2026-09-29', bedtime: iso('2026-09-29T23:00') }).expect(201);
  await anon.post('/api/sleep/wake').set('Cookie', cookie).send({ wake_time: iso('2026-09-30T07:00') }).expect(200);
  db.exec('DELETE FROM sleep_records');
});

test('sesión deslizante: se renueva solo si pasó más de 1 h; caducada → null y se borra (FR-002)', () => {
  const t0 = Date.parse('2026-09-30T00:00:00Z');
  const id = createSession(db, 1, t0);
  const req = { headers: { cookie: `sid=${id}` }, secure: false };
  const row = () => db.prepare('SELECT last_seen_at, expires_at FROM sessions WHERE id_hash = ?').get(sha256(id));

  assert.equal(loadSession(db, req, t0 + 30 * 60 * 1000).refreshed, false);
  assert.equal(row().last_seen_at, new Date(t0).toISOString());
  const later = t0 + 2 * 60 * 60 * 1000;
  assert.equal(loadSession(db, req, later).refreshed, true);
  assert.equal(row().expires_at, new Date(later + TTL).toISOString());
  assert.equal(loadSession(db, req, later + TTL + 1), null);
  assert.equal(row(), undefined, 'la sesión caducada se borró');
});

test('cerrar sesión la invalida en el servidor; la cookie deja de servir (FR-004)', async () => {
  const cookie = cookieOf(await login(EMAIL, PASSWORD).expect(200));
  await anon.get('/api/sleep').set('Cookie', cookie).expect(200);
  const out = await anon.post('/api/auth/logout').set('Cookie', cookie).expect(204);
  assert.match(out.headers['set-cookie'][0], /^sid=; .*Max-Age=0/);
  await anon.get('/api/sleep').set('Cookie', cookie).expect(401);
  await anon.post('/api/auth/logout').expect(204); // idempotente sin sesión
});

test('sin sesión: 401 con mensaje en español; status → login (FR-003)', async () => {
  const r = await anon.get('/api/sleep').expect(401);
  assert.equal(r.body.error, 'Necesitas iniciar sesión');
  assert.deepEqual((await anon.get('/api/auth/status')).body, { state: 'login' });
  await anon.get('/api/sleep').set('Cookie', 'sid=inventada').expect(401);
});
