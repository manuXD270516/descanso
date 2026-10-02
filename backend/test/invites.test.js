const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api, otherApi, anon, db } = require('./helpers');
const { POLICY_VERSION } = require('../src/policy');
const { sha256 } = require('../src/auth/sessions');

// Invitaciones y registro (feature 008, US1, FR-001…FR-006).
const PASSWORD = 'una frase larga de prueba';
let n = 0;
const invite = async () => (await api.post('/api/people/invites').expect(201)).body;
const register = (body, from = 'ip-registro') =>
  anon.post('/api/auth/register').set('Fly-Client-IP', from).send({
    display_name: 'Ana', email: `ana${++n}@ejemplo.com`, password: PASSWORD, accept_policy: true, policy_version: POLICY_VERSION, ...body,
  });

test('solo el propietario crea, lista y revoca invitaciones (FR-001)', async () => {
  await otherApi.post('/api/people/invites').expect(403);
  await otherApi.get('/api/people/invites').expect(403);
  await otherApi.get('/api/people').expect(403);
  const inv = await invite();
  await otherApi.delete(`/api/people/invites/${inv.id}`).expect(403);
  const list = (await api.get('/api/people/invites').expect(200)).body;
  assert.equal(list.find((i) => i.id === inv.id).status, 'pendiente');
  await api.delete(`/api/people/invites/${inv.id}`).expect(204);
  assert.equal((await api.get('/api/people/invites')).body.find((i) => i.id === inv.id).status, 'revocada');
  await api.delete(`/api/people/invites/${inv.id}`).expect(404);
});

test('la base guarda solo la huella del token; caduca a las 72 h (FR-002)', async () => {
  const inv = await invite();
  assert.ok(db.prepare('SELECT 1 FROM invites WHERE token_hash = ?').get(sha256(inv.token)));
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM invites WHERE token_hash = ?').get(inv.token).c, 0);
  const row = db.prepare('SELECT created_at, expires_at FROM invites WHERE id = ?').get(inv.id);
  assert.equal(Date.parse(row.expires_at) - Date.parse(row.created_at), 72 * 3600 * 1000);
});

test('registro válido: 201, sesión, rol user, consentimiento, 3 métricas y objetivo propios (FR-004, FR-005)', async () => {
  const inv = await invite();
  const r = await register({ invite: ` ${inv.token} `, email: '  Lucia@Ejemplo.com ', display_name: '  Lucía ' }).expect(201);
  assert.deepEqual(r.body, { email: 'lucia@ejemplo.com', role: 'user', display_name: 'Lucía' });
  const cookie = r.headers['set-cookie'][0].split(';')[0];
  const u = db.prepare('SELECT id, role, consent_version, consent_at FROM users WHERE email = ?').get('lucia@ejemplo.com');
  assert.equal(u.role, 'user');
  assert.equal(u.consent_version, POLICY_VERSION);
  assert.ok(u.consent_at);
  const metrics = (await anon.get('/api/metrics').set('Cookie', cookie).expect(200)).body;
  assert.deepEqual(metrics.map((m) => m.name), ['Calidad del sueño', 'Energía al despertar', 'Cafés']);
  assert.deepEqual((await anon.get('/api/sleep').set('Cookie', cookie).expect(200)).body, []);
  assert.equal(db.prepare('SELECT sleep_goal_min FROM user_settings WHERE user_id = ?').get(u.id).sleep_goal_min, 480);
  assert.equal(db.prepare('SELECT used_by FROM invites WHERE id = ?').get(inv.id).used_by, u.id);
  await anon.get('/api/people').set('Cookie', cookie).expect(403); // no es propietaria
});

test('sin aceptar la política o con otra versión → 400 y la invitación sigue sirviendo (FR-004)', async () => {
  const inv = await invite();
  await register({ invite: inv.token, accept_policy: false }).expect(400);
  await register({ invite: inv.token, accept_policy: 'true' }).expect(400);
  await register({ invite: inv.token, policy_version: '2020-01-01' }).expect(400);
  await register({ invite: inv.token, display_name: '' }).expect(400);
  await register({ invite: inv.token, password: 'corta' }).expect(400);
  await register({ invite: inv.token }).expect(201);
});

test('invitación usada, revocada, caducada o inventada → 403 sin crear nada (FR-003)', async () => {
  const users = () => db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const used = await invite();
  await register({ invite: used.token }, 'ip-a').expect(201);
  const revoked = await invite();
  await api.delete(`/api/people/invites/${revoked.id}`).expect(204);
  const expired = await invite();
  db.prepare("UPDATE invites SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(expired.id);
  const before = users();
  for (const [token, ip] of [[used.token, 'ip-b'], [revoked.token, 'ip-c'], [expired.token, 'ip-d'], ['inventada', 'ip-e']]) {
    const r = await register({ invite: token }, ip).expect(403);
    assert.equal(r.body.error, 'Esta invitación no es válida');
  }
  assert.equal(users(), before);
});

test('email ya registrado (sin distinguir mayúsculas) → 409 sin gastar la invitación', async () => {
  const inv = await invite();
  await register({ invite: inv.token, email: 'INVITADA@descanso.test' }).expect(409);
  assert.equal(db.prepare('SELECT used_at FROM invites WHERE id = ?').get(inv.id).used_at, null);
});

test('dos registros simultáneos con el mismo enlace: solo uno crea cuenta', async () => {
  const inv = await invite();
  const [a, b] = await Promise.all([register({ invite: inv.token }, 'ip-x'), register({ invite: inv.token }, 'ip-y')]);
  assert.deepEqual([a.status, b.status].sort(), [201, 403]);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM users WHERE id IN (SELECT used_by FROM invites WHERE id = ?)').get(inv.id).c, 1);
});

test('con una sesión abierta no se puede registrar otra cuenta (caso límite)', async () => {
  const inv = await invite();
  const cookie = `sid=${require('./helpers').otherSessionId}`;
  await anon.post('/api/auth/register').set('Cookie', cookie).send({ invite: inv.token, display_name: 'X', email: 'x9@e.com', password: PASSWORD, accept_policy: true, policy_version: POLICY_VERSION }).expect(409);
});

test('los fallos de invitación cuentan para el límite de intentos', async () => {
  for (let i = 0; i < 5; i++) await register({ invite: 'mala' }, 'ip-limite').expect(403);
  const inv = await invite();
  await register({ invite: inv.token }, 'ip-limite').expect(429);
});
