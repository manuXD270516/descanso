// Estado de acceso, alta del propietario, registro por invitación, entrada, salida y recuperación
// (features 004 y 008).
const crypto = require('node:crypto');
const { Router } = require('express');
const db = require('../db');
const { HttpError } = require('../util');
const { hashPassword, verifyPassword, verifyDummy } = require('../auth/password');
const { createSession, loadSession, destroySession, setCookie, clearCookie, sha256 } = require('../auth/sessions');
const { limiter, keysFor } = require('../auth/rate-limit');
const { hashOf } = require('../auth/tokens');
const users = require('../repo/users');
const invites = require('../repo/invites');
const audit = require('../repo/audit');
const { POLICY_VERSION } = require('../policy');

const r = Router();

const normalizeEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email) {
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Escribe un email válido');
}

function validatePassword(password) {
  if (typeof password !== 'string') throw new HttpError(400, 'La contraseña es obligatoria');
  const length = [...password].length; // caracteres, no bytes
  if (length < 12) throw new HttpError(400, 'La contraseña necesita al menos 12 caracteres. Prueba con una frase.');
  if (length > 128) throw new HttpError(400, 'La contraseña admite como máximo 128 caracteres.');
}

function validateDisplayName(name) {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value || [...value].length > 60) throw new HttpError(400, 'El nombre visible debe tener entre 1 y 60 caracteres');
  return value;
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
const sessionUser = (u) => ({ email: u.email, role: u.role, display_name: u.display_name });

// GET /api/auth/status → qué pantalla mostrar
r.get('/status', (req, res) => {
  const session = loadSession(db, req);
  if (session) {
    if (session.refreshed) setCookie(req, res, session.id);
    return res.json({ state: 'authenticated', ...sessionUser(session.user), onboarded: users.isOnboarded(session.user.id) });
  }
  if (owner().password_hash) return res.json({ state: 'login' });
  if (!setupRow().token_hash) return res.json({ state: 'setup-unavailable' });
  res.json({ state: 'setup', nights: db.prepare('SELECT COUNT(*) AS c FROM sleep_records').get().c });
});

// POST /api/auth/setup { token, email, password } → alta del propietario (004)
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
  validateEmail(email);
  validatePassword(req.body.password);

  const hash = await hashPassword(req.body.password);
  const done = db.transaction(() => {
    const changed = db.prepare('UPDATE users SET email = ?, password_hash = ? WHERE id = 1 AND password_hash IS NULL').run(email, hash).changes;
    if (!changed) return false; // otra petición completó el alta mientras se calculaba el hash
    db.prepare('UPDATE auth_setup SET used_at = ? WHERE id = 1').run(new Date().toISOString());
    db.prepare("UPDATE users SET display_name = COALESCE(display_name, substr(email, 1, instr(email, '@') - 1)) WHERE id = 1").run();
    return true;
  })();
  if (!done) throw new HttpError(409, 'El alta no está abierta');

  limiter.reset(`email:${email}`);
  setCookie(req, res, createSession(db, 1));
  res.status(201).json({ email });
});

// POST /api/auth/register → alta de una persona invitada (008, US1)
r.post('/register', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const keys = keysFor(req, email);
  if (tooMany(res, keys)) return;
  if (loadSession(db, req)) throw new HttpError(409, 'Cierra tu sesión antes de crear otra cuenta');

  const inviteHash = hashOf(req.body.invite);
  if (!invites.isUsable(inviteHash)) {
    limiter.fail(keys);
    throw new HttpError(403, 'Esta invitación no es válida');
  }
  const displayName = validateDisplayName(req.body.display_name);
  validateEmail(email);
  validatePassword(req.body.password);
  if (req.body.accept_policy !== true || req.body.policy_version !== POLICY_VERSION) {
    throw new HttpError(400, 'Para registrarte tienes que aceptar la política de privacidad vigente');
  }
  if (users.emailTaken(email)) throw new HttpError(409, 'Ese email ya tiene una cuenta'); // la invitación no se gasta

  const hash = await hashPassword(req.body.password);
  let userId;
  try {
    db.transaction(() => {
      userId = users.createUser({ email, passwordHash: hash, displayName, consentVersion: POLICY_VERSION });
      if (!invites.redeem(inviteHash, userId)) throw new HttpError(403, 'Esta invitación no es válida'); // la ganó otro registro
    })();
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new HttpError(409, 'Ese email ya tiene una cuenta');
    if (e.status === 403) limiter.fail(keys);
    throw e;
  }
  setCookie(req, res, createSession(db, userId));
  res.status(201).json({ email, role: 'user', display_name: displayName, onboarded: false });
});

// POST /api/auth/login { email, password }
r.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const keys = keysFor(req, email);
  if (tooMany(res, keys)) return;

  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = email ? users.byEmailForLogin(email) : null;
  const ok = user ? await verifyPassword(password, user.password_hash) : await verifyDummy(password);
  if (!ok) {
    limiter.fail(keys);
    throw new HttpError(401, 'Email o contraseña incorrectos');
  }
  limiter.reset(`email:${email}`);
  setCookie(req, res, createSession(db, user.id));
  res.json({ ...sessionUser(user), reset_notice_at: user.reset_notice_at, onboarded: users.isOnboarded(user.id) });
});

// POST /api/auth/logout → invalida la sesión en el servidor
r.post('/logout', (req, res) => {
  destroySession(db, req);
  clearCookie(req, res);
  res.status(204).end();
});

// POST /api/auth/reset { token, password } → contraseña nueva con un enlace del propietario (008, US4)
r.post('/reset', async (req, res) => {
  const keys = keysFor(req);
  if (tooMany(res, keys)) return;
  const hash = hashOf(req.body.token);
  const invalid = () => {
    limiter.fail(keys);
    return new HttpError(403, 'Este enlace de recuperación no es válido o ha caducado');
  };
  if (!db.prepare('SELECT 1 FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').get(hash, new Date().toISOString())) {
    throw invalid();
  }
  validatePassword(req.body.password);
  const passwordHash = await hashPassword(req.body.password);

  const done = db.transaction(() => {
    const row = audit.redeemReset(hash);
    if (!row) return false;
    const now = new Date().toISOString();
    users.setPassword(row.user_id, passwordHash);
    users.closeSessions(row.user_id);
    users.setResetNotice(row.user_id, now);
    audit.log(row.user_id, row.created_by, 'password_reset');
    return true;
  })();
  if (!done) throw invalid();
  res.status(204).end();
});

module.exports = r;
module.exports.validatePassword = validatePassword;
module.exports.validateEmail = validateEmail;
module.exports.validateDisplayName = validateDisplayName;
module.exports.normalizeEmail = normalizeEmail;
module.exports.tooMany = tooMany;
