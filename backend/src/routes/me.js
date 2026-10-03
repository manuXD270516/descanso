// Mi cuenta (feature 008): perfil, cambios sensibles con la contraseña actual, actividad y borrado.
const { Router } = require('express');
const users = require('../repo/users');
const audit = require('../repo/audit');
const { HttpError } = require('../util');
const { hashPassword, verifyPassword } = require('../auth/password');
const { limiter, keysFor } = require('../auth/rate-limit');
const { sha256, cookieName, clearCookie } = require('../auth/sessions');
const { validatePassword, validateEmail, validateDisplayName, normalizeEmail, tooMany } = require('./auth');

const r = Router();

const TIMEZONES = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);

/** Comprueba la contraseña actual; los fallos cuentan para el límite (por IP y por usuario). */
async function confirmPassword(req, res, password) {
  const keys = [...keysFor(req), `user:${req.user.id}`];
  if (tooMany(res, keys)) return false;
  const ok = await verifyPassword(typeof password === 'string' ? password : '', users.passwordHash(req.user.id) || '');
  if (!ok) {
    limiter.fail(keys);
    throw new HttpError(401, 'La contraseña actual no es correcta');
  }
  return true;
}

const currentSessionHash = (req) => {
  const cookie = (req.headers.cookie || '').split(';').map((p) => p.trim()).find((p) => p.startsWith(`${cookieName(req)}=`));
  return cookie ? sha256(cookie.slice(cookieName(req).length + 1)) : null;
};

r.get('/', (req, res) => res.json(users.profile(req.user.id)));

r.put('/', (req, res) => {
  const changes = {};
  if (req.body.display_name !== undefined) changes.display_name = validateDisplayName(req.body.display_name);
  if (req.body.timezone !== undefined) {
    if (typeof req.body.timezone !== 'string' || !TIMEZONES.has(req.body.timezone)) throw new HttpError(400, 'Zona horaria desconocida');
    changes.timezone = req.body.timezone;
  }
  if (req.body.sleep_goal_min !== undefined) {
    const goal = req.body.sleep_goal_min;
    if (!Number.isInteger(goal) || goal < 240 || goal > 720) throw new HttpError(400, 'El objetivo de sueño debe estar entre 4 y 12 horas');
    changes.sleep_goal_min = goal;
  }
  // Calculadora de ciclos (feature 006, FR-009)
  if (req.body.cycle_min !== undefined) {
    const v = req.body.cycle_min;
    if (!Number.isInteger(v) || v < 70 || v > 110) throw new HttpError(400, 'La duración del ciclo debe estar entre 70 y 110 minutos');
    changes.cycle_min = v;
  }
  if (req.body.latency_min !== undefined) {
    const v = req.body.latency_min;
    if (!Number.isInteger(v) || v < 0 || v > 60) throw new HttpError(400, 'El tiempo en dormirte debe estar entre 0 y 60 minutos');
    changes.latency_min = v;
  }
  res.json(users.updateProfile(req.user.id, changes));
});

r.put('/email', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  validateEmail(email);
  if (!(await confirmPassword(req, res, req.body.password))) return;
  if (users.emailTaken(email, req.user.id)) throw new HttpError(409, 'Ese email no está disponible');
  users.setEmail(req.user.id, email);
  res.json(users.profile(req.user.id));
});

r.put('/password', async (req, res) => {
  validatePassword(req.body.password);
  if (!(await confirmPassword(req, res, req.body.current))) return;
  const hash = await hashPassword(req.body.password);
  users.changePassword(req.user.id, hash, currentSessionHash(req)); // la sesión actual sigue abierta
  res.status(204).end();
});

r.get('/activity', (req, res) => res.json(audit.activity(req.user.id)));

// Bienvenida vista (feature 005): una vez por usuario; opcionalmente fija el objetivo
r.post('/onboarding', (req, res) => {
  const goal = req.body?.sleep_goal_min;
  if (goal !== undefined && (!Number.isInteger(goal) || goal < 240 || goal > 720)) {
    throw new HttpError(400, 'El objetivo de sueño debe estar entre 4 y 12 horas');
  }
  res.json(users.completeOnboarding(req.user.id, goal));
});

r.post('/reset-notice/ack', (req, res) => {
  users.setResetNotice(req.user.id, null);
  res.status(204).end();
});

// Borrar mi cuenta (US5): contraseña obligatoria; el propietario solo si no quedan otros usuarios
r.delete('/', async (req, res) => {
  if (!(await confirmPassword(req, res, req.body?.password))) return;
  if (req.user.role === 'owner' && users.othersExist(req.user.id)) {
    throw new HttpError(409, 'No puedes borrar la cuenta del propietario mientras haya otras personas usando Descanso');
  }
  users.deleteUser(req.user.id); // ON DELETE CASCADE: noches, siestas, métricas, valores, sesiones…
  clearCookie(req, res);
  res.status(204).end();
});

module.exports = r;
