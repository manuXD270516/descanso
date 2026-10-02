// Middlewares de acceso (feature 004): sesión obligatoria, CSRF por origen y cabeceras de seguridad.
const db = require('../db');
const { loadSession, setCookie } = require('./sessions');

/** Toda la API exige sesión, salvo lo que se monta antes (health, auth, admin). FR-003. */
function requireAuth(req, res, next) {
  const session = loadSession(db, req);
  if (!session) return res.status(401).json({ error: 'Necesitas iniciar sesión' });
  if (session.refreshed) setCookie(req, res, session.id);
  req.user = session.user;
  next();
}

/** Solo el propietario (feature 008): invitaciones, personas y enlaces de recuperación. */
function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') return res.status(403).json({ error: 'Solo el propietario puede hacer esto' });
  next();
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Rechaza escrituras que no vienen del propio sitio (research R8). FR-013. */
function csrf(req, res, next) {
  if (SAFE.has(req.method)) return next();
  const site = req.get('Sec-Fetch-Site');
  let ok;
  if (site) {
    ok = site === 'same-origin' || site === 'none';
  } else {
    const origin = req.get('Origin');
    try {
      ok = !!origin && new URL(origin).host === req.get('Host');
    } catch {
      ok = false;
    }
  }
  if (!ok) return res.status(403).json({ error: 'Petición rechazada: origen no permitido' });
  next();
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** Cabeceras de seguridad en todas las respuestas (research R9). FR-017. */
function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
}

module.exports = { requireAuth, requireOwner, csrf, securityHeaders };
