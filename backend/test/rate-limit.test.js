const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { anon, db } = require('./helpers');
const { hashPassword } = require('../src/auth/password');
const { createRateLimiter } = require('../src/auth/rate-limit');

// Límite de intentos (US3, FR-015).
const MIN = 60 * 1000;

test('5 fallos en 15 min por una clave → bloqueo con segundos de espera; se libera al pasar la ventana', () => {
  let t = 0;
  const rl = createRateLimiter({ now: () => t });
  const keys = ['ip:1.2.3.4', 'email:a@b.c'];
  for (let i = 0; i < 5; i++) {
    assert.equal(rl.retryAfter(keys), 0);
    rl.fail(keys);
    t += MIN;
  }
  assert.equal(rl.retryAfter(keys), 10 * 60); // ahora t = 5 min; el primer fallo (t=0) sale de la ventana a los 15
  t = 15 * MIN + 1;
  assert.equal(rl.retryAfter(keys), 0);
});

test('la IP y el email cuentan por separado; un acierto limpia solo el email', () => {
  const rl = createRateLimiter({ now: () => 0 });
  for (let i = 0; i < 5; i++) rl.fail(['ip:1.1.1.1', `email:u${i}@b.c`]);
  assert.ok(rl.retryAfter(['ip:1.1.1.1', 'email:nuevo@b.c']) > 0, 'misma IP con otros emails');
  assert.equal(rl.retryAfter(['ip:2.2.2.2', 'email:u0@b.c']), 0, 'otra IP, email con 1 fallo');
  for (let i = 0; i < 5; i++) rl.fail(['ip:3.3.3.3', 'email:x@b.c']);
  rl.reset('email:x@b.c');
  assert.equal(rl.retryAfter(['email:x@b.c']), 0);
});

test('nunca guarda más de maxKeys claves (memoria acotada)', () => {
  const rl = createRateLimiter({ now: () => 0, maxKeys: 100 });
  for (let i = 0; i < 1000; i++) rl.fail([`ip:${i}`]);
  assert.equal(rl.size(), 100);
});

const EMAIL = 'yo@ejemplo.com';
const PASSWORD = 'mi frase de doce o más';
before(async () => {
  db.prepare('UPDATE users SET email = ?, password_hash = ? WHERE id = 1').run(EMAIL, await hashPassword(PASSWORD));
});

test('por HTTP: el 6.º intento tras 5 fallos es 429 con Retry-After, aunque la contraseña sea correcta (US3-3)', async () => {
  const from = (ip) => (body) => anon.post('/api/auth/login').set('Fly-Client-IP', ip).send(body);
  const attacker = from('203.0.113.7');
  for (let i = 0; i < 5; i++) await attacker({ email: EMAIL, password: 'no es la buena' }).expect(401);
  const blocked = await attacker({ email: EMAIL, password: PASSWORD }).expect(429);
  assert.match(blocked.body.error, /^Demasiados intentos\. Vuelve a intentarlo en \d+ min\.$/);
  assert.ok(Number(blocked.headers['retry-after']) > 0);
  // El email también quedó bloqueado desde otra IP
  await from('198.51.100.1')({ email: EMAIL, password: PASSWORD }).expect(429);
});
