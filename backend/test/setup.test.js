const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { anon, api, db, iso } = require('./helpers');
const { bootstrap } = require('../src/auth/bootstrap');

// Alta y recuperación del propietario sin terminal (US2, FR-008…FR-012).
const silent = { info() {} };
const PASSWORD = 'mi frase de doce o más';
let n = 0;

/** Reabre el alta con un código nuevo, como si se rotara el secreto en Fly y se reiniciara. */
function rotate() {
  const token = `codigo-${++n}`;
  bootstrap(db, token, silent);
  return token;
}
const setup = (body) => anon.post('/api/auth/setup').send(body);

beforeEach(() => db.exec('DELETE FROM sleep_records'));

test('sin contraseña: status "setup" con el número de noches y la API responde 401 (US2-1, US2-4)', async () => {
  db.prepare('INSERT INTO sleep_records (date, bedtime, wake_time) VALUES (?,?,?)').run('2026-09-01', iso('2026-09-01T23:00'), iso('2026-09-02T07:00'));
  rotate();
  const { body } = await anon.get('/api/auth/status').expect(200);
  assert.deepEqual(body, { state: 'setup', nights: 1 });
  await anon.get('/api/sleep').expect(401);
  await api.get('/api/sleep').expect(401); // la sesión de helpers se cerró al rotar
});

test('alta con el código correcto: 201, sesión iniciada, código gastado y email normalizado (US2-2)', async () => {
  const token = rotate();
  const r = await setup({ token: `  ${token} `, email: '  Yo@Ejemplo.COM ', password: PASSWORD }).expect(201);
  assert.equal(r.body.email, 'yo@ejemplo.com');
  const cookie = r.headers['set-cookie'][0];
  assert.match(cookie, /^sid=[\w-]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/);
  assert.ok(db.prepare('SELECT used_at FROM auth_setup').get().used_at);
  const me = await anon.get('/api/auth/status').set('Cookie', cookie.split(';')[0]).expect(200);
  assert.deepEqual(me.body, { state: 'authenticated', email: 'yo@ejemplo.com' });
  // El código ya no sirve
  await setup({ token, email: 'otro@ejemplo.com', password: PASSWORD }).expect(409);
});

test('código incorrecto → 401 sin crear nada; contraseña fuera de 12..128 → 400 (US2-3, FR-011)', async () => {
  const token = rotate();
  const bad = await setup({ token: 'incorrecto', email: 'yo@ejemplo.com', password: PASSWORD }).expect(401);
  assert.equal(bad.body.error, 'Código de alta no válido');
  const short = await setup({ token, email: 'yo@ejemplo.com', password: 'once letras' }).expect(400);
  assert.equal(short.body.error, 'La contraseña necesita al menos 12 caracteres. Prueba con una frase.');
  await setup({ token, email: 'yo@ejemplo.com', password: 'x'.repeat(129) }).expect(400);
  await setup({ token, email: 'no-es-email', password: PASSWORD }).expect(400);
  // 12 caracteres con acentos cuentan como 12, no como bytes
  await setup({ token, email: 'yo@ejemplo.com', password: 'ñandú lúcido' }).expect(201);
});

test('rotar el código cierra todas las sesiones y borra la contraseña sin tocar los datos (US2-5, FR-010)', async () => {
  let token = rotate();
  const r = await setup({ token, email: 'yo@ejemplo.com', password: PASSWORD }).expect(201);
  const cookie = r.headers['set-cookie'][0].split(';')[0];
  db.prepare('INSERT INTO sleep_records (date, bedtime, wake_time) VALUES (?,?,?)').run('2026-09-01', iso('2026-09-01T23:00'), iso('2026-09-02T07:00'));
  const before = db.prepare('SELECT * FROM sleep_records').all();

  // Mismo código: nada cambia
  assert.deepEqual(bootstrap(db, token, silent), { changed: false });
  await anon.get('/api/sleep').set('Cookie', cookie).expect(200);

  token = rotate();
  await anon.get('/api/sleep').set('Cookie', cookie).expect(401);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM sessions').get().c, 0);
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE id = 1').get().password_hash, null);
  assert.deepEqual(db.prepare('SELECT * FROM sleep_records').all(), before);
  assert.deepEqual((await anon.get('/api/auth/status')).body, { state: 'setup', nights: 1 });
  await setup({ token, email: 'yo@ejemplo.com', password: 'otra frase distinta' }).expect(201);
});

test('sin código configurado nunca: "setup-unavailable" y no se puede dar de alta (US2-7)', async () => {
  db.prepare('UPDATE auth_setup SET token_hash = NULL, used_at = NULL').run();
  db.prepare('UPDATE users SET password_hash = NULL').run();
  assert.deepEqual((await anon.get('/api/auth/status')).body, { state: 'setup-unavailable' });
  await setup({ token: '', email: 'yo@ejemplo.com', password: PASSWORD }).expect(409);
  assert.deepEqual(bootstrap(db, '   ', silent), { changed: false }, 'un token vacío no cuenta');
});
