// Estado de acceso, alta del propietario, entrada y salida (feature 004).
const crypto = require('node:crypto');
const { Router } = require('express');
const db = require('../db');
const { HttpError } = require('../util');
const { hashPassword, verifyPassword, verifyDummy } = require('../auth/password');
const { createSession, loadSession, destroySession, setCookie, clearCookie, sha256 } = require('../auth/sessions');
const { limiter, keysFor } = require('../auth/rate-limit');

const r = Router();

const normalizeEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePassword(password) {
  if (typeof password !== 'string') throw new HttpError(400, 'La contraseña es obligatoria');
  const length = [...password].length; // caracteres, no bytes
  if (length < 12) throw new HttpError(400, 'La contraseña necesita al menos 12 caracteres. Prueba con una frase.');
  if (length > 128) throw new HttpError(400, 'La contraseña admite como máximo 128 caracteres.');
}

function tooMany(res, keys) {
  const wait = limiter.retryAfter(keys);
  if (!wait) return false;
  res.set('Retry-After', String(wait));
  res.status(429).json({ error: `Demasiados intentos. Vuelve a intentarlo en ${Math.ceil(wait / 60)} min.` });
  return true;
}

const owner = () => db.prepare('SELECT id, email, password_hash FROM users WHERE id = 1').get();
const setupRow = () => db.prepare('SELECT token_hash, used_at FROM auth_setup WHERE id = 1').get();

// GET /api/auth/status → qué pantalla mostrar
r.get('/status', (req, res) => {
  const session = loadSession(db, req);
  if (session) {
    if (session.refreshed) setCookie(req, res, session.id);
    return res.json({ state: 'authenticated', email: session.user.email });
  }
  if (owner().password_hash) return res.json({ state: 'login' });
  if (!setupRow().token_hash) return res.json({ state: 'setup-unavailable' });
  res.json({ state: 'setup', nights: db.prepare('SELECT COUNT(*) AS c FROM sleep_records').get().c });
});

// POST /api/auth/setup { token, email, password } → alta del propietario
r.post('/setup', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const keys = keysFor(req, email);
  if (tooMany(res, keys)) return;

  const setup = setupRow();
  if (owner().password_hash || !setup.token_hash || setup.used_at) {
    throw new HttpError(409, 'El alta no está abierta');
  }
  const given = Buffer.from(sha256(String(req.body.token ?? '').trim()), 'hex');
  if (!crypto.timingSafeEqual(given, Buffer.from(setup.token_hash, 'hex'))) {
    limiter.fail(keys);
    throw new HttpError(401, 'Código de alta no válido');
  }
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Escribe un email válido');
  validatePassword(req.body.password);

  const hash = await hashPassword(req.body.password);
  const done = db.transaction(() => {
    const changed = db.prepare('UPDATE users SET email = ?, password_hash = ? WHERE id = 1 AND password_hash IS NULL').run(email, hash).changes;
    if (!changed) return false; // otra petición completó el alta mientras se calculaba el hash
    db.prepare('UPDATE auth_setup SET used_at = ? WHERE id = 1').run(new Date().toISOString());
    return true;
  })();
  if (!done) throw new HttpError(409, 'El alta no está abierta');

  limiter.reset(`email:${email}`);
  setCookie(req, res, createSession(db, 1));
  res.status(201).json({ email });
});

// POST /api/auth/login { email, password }
r.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const keys = keysFor(req, email);
  if (tooMany(res, keys)) return;

  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = email ? db.prepare('SELECT id, email, password_hash FROM users WHERE email = ? AND password_hash IS NOT NULL').get(email) : null;
  const ok = user ? await verifyPassword(password, user.password_hash) : await verifyDummy(password);
  if (!ok) {
    limiter.fail(keys);
    throw new HttpError(401, 'Email o contraseña incorrectos');
  }
  limiter.reset(`email:${email}`);
  setCookie(req, res, createSession(db, user.id));
  res.json({ email: user.email });
});

// POST /api/auth/logout → invalida la sesión en el servidor
r.post('/logout', (req, res) => {
  destroySession(db, req);
  clearCookie(req, res);
  res.status(204).end();
});

module.exports = r;
