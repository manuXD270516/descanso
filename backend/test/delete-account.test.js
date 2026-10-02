const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { api, otherApi, anon, db, iso, OTHER_ID, otherSessionId } = require('./helpers');
const { hashPassword } = require('../src/auth/password');
const { POLICY_VERSION } = require('../src/policy');

// Borrar mi cuenta (feature 008, US5, FR-019…FR-021) y exportación por usuario.
const PASSWORD = 'contraseña de la invitada';
const OWNER_PASSWORD = 'contraseña del propietario';

/** Filas de un usuario en TODAS las tablas con user_id, más sus hijas (generado desde el esquema). */
function rowsOf(userId) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  const out = {};
  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    if (cols.includes('user_id')) out[t] = db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE user_id = ?`).get(userId).c;
  }
  out.metric_entries = db.prepare('SELECT COUNT(*) AS c FROM metric_entries e JOIN metrics m ON m.id = e.metric_id WHERE m.user_id = ?').get(userId).c;
  out.invites_used = db.prepare('SELECT COUNT(*) AS c FROM invites WHERE used_by = ?').get(userId).c;
  out.users = db.prepare('SELECT COUNT(*) AS c FROM users WHERE id = ?').get(userId).c;
  return out;
}

before(async () => {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(PASSWORD), OTHER_ID);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = 1').run(await hashPassword(OWNER_PASSWORD));
  for (const c of [api, otherApi]) {
    await c.post('/api/sleep').send({ date: '2026-09-05', bedtime: iso('2026-09-05T23:00'), wake_time: iso('2026-09-06T07:00') }).expect(201);
    await c.post('/api/naps').send({ date: '2026-09-06', start_time: iso('2026-09-06T14:00'), end_time: iso('2026-09-06T14:30') }).expect(201);
    const m = (await c.get('/api/metrics').expect(200)).body[0];
    await c.put(`/api/metrics/${m.id}/entries/2026-09-06`).send({ value: 3 }).expect(200);
  }
  db.prepare("INSERT INTO invites (token_hash, created_by, created_at, expires_at, used_by, used_at) VALUES ('usada-por-b', 1, 'x', 'y', ?, 'z')").run(OTHER_ID);
  db.prepare("INSERT INTO audit_log (user_id, actor_user_id, action, created_at) VALUES (?, 1, 'reset_link_created', 'x')").run(OTHER_ID);
});

test('la exportación de cada uno solo contiene lo suyo (FR-019)', async () => {
  const a = (await api.get('/api/export.json').expect(200)).body;
  const b = (await otherApi.get('/api/export.json').expect(200)).body;
  const ids = (x) => new Set(x.sleep_records.map((r) => r.id));
  assert.ok([...ids(a)].every((id) => !ids(b).has(id)));
  assert.equal(b.metrics.length, 3);
});

test('borrar la cuenta exige la contraseña (FR-020)', async () => {
  await otherApi.delete('/api/me').send({ password: 'mal' }).expect(401);
  await otherApi.delete('/api/me').send({}).expect(401);
  assert.equal(rowsOf(OTHER_ID).users, 1);
});

test('el propietario no puede borrar su cuenta mientras haya otros usuarios (FR-021)', async () => {
  const r = await api.delete('/api/me').send({ password: OWNER_PASSWORD }).expect(409);
  assert.match(r.body.error, /otras personas/);
});

test('borrar la cuenta de B deja 0 filas suyas y no toca las de A (FR-020, SC-004)', async () => {
  const aBefore = rowsOf(1);
  assert.ok(Object.values(rowsOf(OTHER_ID)).some((c) => c > 0));
  const r = await otherApi.delete('/api/me').send({ password: PASSWORD }).expect(204);
  assert.match(r.headers['set-cookie'][0], /Max-Age=0/);
  const after = rowsOf(OTHER_ID);
  assert.ok(Object.values(after).every((c) => c === 0), JSON.stringify(after));
  assert.deepEqual(rowsOf(1), aBefore);
  await anon.get('/api/me').set('Cookie', `sid=${otherSessionId}`).expect(401);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});

test('sin otros usuarios, el propietario sí puede borrar su cuenta', async () => {
  const r = await api.delete('/api/me').send({ password: OWNER_PASSWORD }).expect(204);
  assert.match(r.headers['set-cookie'][0], /Max-Age=0/);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM users').get().c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM sleep_records').get().c, 0);
  void POLICY_VERSION;
});
