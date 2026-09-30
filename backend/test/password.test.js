const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

process.env.NODE_ENV = 'test';
const { hashPassword, verifyPassword, verifyDummy, _stats } = require('../src/auth/password');

// Hash de contraseñas (US2/US3, FR-016, research R1).

test('hash y verificación; formato versionado con sal aleatoria', async () => {
  const h = await hashPassword('una frase bastante larga');
  assert.match(h, /^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.notEqual(h, await hashPassword('una frase bastante larga'), 'sal distinta');
  assert.equal(await verifyPassword('una frase bastante larga', h), true);
  assert.equal(await verifyPassword('otra frase bastante larga', h), false);
  assert.equal(await verifyPassword('x', 'no-es-un-hash'), false);
  // Unicode normalizado: "ñ" compuesta y descompuesta son la misma contraseña
  const u = await hashPassword('mañana duermo mejor');
  assert.equal(await verifyPassword('mañana duermo mejor', u), true);
});

test('en producción los parámetros son N=2^15, r=8, p=3', () => {
  const out = execFileSync(process.execPath, ['-e', "process.stdout.write(JSON.stringify(require('./src/auth/password').params()))"], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'production' },
    encoding: 'utf8',
  });
  assert.deepEqual(JSON.parse(out), { N: 32768, r: 8, p: 3 });
});

test('nunca se calcula más de un hash a la vez (semáforo)', async () => {
  const h = await hashPassword('una frase bastante larga');
  _stats.maxActive = 0;
  await Promise.all(Array.from({ length: 10 }, () => verifyPassword('una frase bastante larga', h)));
  assert.equal(_stats.maxActive, 1);
});

// Determinista (medir milisegundos es inestable en CI): verifyDummy hace el mismo trabajo que un
// verify real, un único scrypt con los mismos parámetros, así que tarda lo mismo.
test('verifyDummy devuelve false y hace el mismo trabajo que un verify real (no revela emails)', async () => {
  const h = await hashPassword('una frase bastante larga');
  const work = async (fn) => {
    const before = _stats.calls;
    await fn();
    return { calls: _stats.calls - before, params: _stats.lastParams };
  };
  const real = await work(() => verifyPassword('una frase bastante larga', h));
  const fake = await work(() => verifyDummy('una frase bastante larga'));
  assert.deepEqual(fake, real);
  assert.equal(real.calls, 1);
  assert.equal(await verifyDummy('lo que sea'), false);
});
