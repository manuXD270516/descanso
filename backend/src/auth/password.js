// Hash de contraseñas con crypto.scrypt (feature 004, research R1). Sin dependencias.
// - Un solo hash a la vez (cada uno usa 32 MiB): 10 intentos simultáneos no agotan 256 MB.
// - verifyDummy() gasta lo mismo que un verify real cuando el email no existe.
const crypto = require('node:crypto');

const PRODUCTION = { N: 2 ** 15, r: 8, p: 3 };
const TESTING = { N: 2 ** 10, r: 8, p: 1 }; // solo NODE_ENV=test, para que la suite sea rápida
const MAXMEM = 64 * 1024 * 1024;
const KEYLEN = 64;

const params = () => (process.env.NODE_ENV === 'test' ? TESTING : PRODUCTION);

// Semáforo de concurrencia 1: cola de promesas
let queue = Promise.resolve();
const stats = { active: 0, maxActive: 0 };
function serial(fn) {
  const run = queue.then(async () => {
    stats.active++;
    stats.maxActive = Math.max(stats.maxActive, stats.active);
    try {
      return await fn();
    } finally {
      stats.active--;
    }
  });
  queue = run.catch(() => {});
  return run;
}

const scrypt = (password, salt, { N, r, p }) =>
  serial(
    () =>
      new Promise((resolve, reject) =>
        crypto.scrypt(password.normalize('NFC'), salt, KEYLEN, { N, r, p, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key))),
      ),
  );

async function hashPassword(password) {
  const prm = params();
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, prm);
  return `scrypt$${prm.N}$${prm.r}$${prm.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), { N: Number(N), r: Number(r), p: Number(p) });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// Hash ficticio calculado al cargar el módulo, con los mismos parámetros que los reales
const dummy = hashPassword(crypto.randomBytes(16).toString('hex'));
async function verifyDummy(password) {
  await verifyPassword(password, await dummy);
  return false;
}

module.exports = { hashPassword, verifyPassword, verifyDummy, params, PRODUCTION, _stats: stats };
