// Sesiones en SQLite (feature 004, research R2 y R3). En la base solo va la huella del id.
const crypto = require('node:crypto');

const DAY = 24 * 60 * 60 * 1000;
const TTL = 30 * DAY; // deslizante desde el último uso
const REFRESH_EVERY = 60 * 60 * 1000; // last_seen_at se escribe como máximo una vez por hora

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const iso = (ms) => new Date(ms).toISOString();

/** __Host-sid exige Secure: solo en HTTPS (Fly). En HTTP local, "sid". */
const cookieName = (req) => (req.secure ? '__Host-sid' : 'sid');

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function setCookie(req, res, id, maxAgeSec = TTL / 1000) {
  const secure = req.secure ? '; Secure' : '';
  res.append('Set-Cookie', `${cookieName(req)}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`);
}
const clearCookie = (req, res) => setCookie(req, res, '', 0);

function createSession(db, userId, now = Date.now()) {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(iso(now));
  const id = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (id_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?,?,?,?,?)')
    .run(sha256(id), userId, iso(now), iso(now), iso(now + TTL));
  return id;
}

/** Sesión vigente de la petición, renovada si pasó más de 1 h; null si no hay o caducó. */
function loadSession(db, req, now = Date.now()) {
  const id = readCookie(req, cookieName(req));
  if (!id) return null;
  const hash = sha256(id);
  const row = db
    .prepare('SELECT s.id_hash, s.user_id, s.last_seen_at, s.expires_at, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?')
    .get(hash);
  if (!row) return null;
  if (Date.parse(row.expires_at) <= now) {
    db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(hash);
    return null;
  }
  let refreshed = false;
  if (now - Date.parse(row.last_seen_at) > REFRESH_EVERY) {
    db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id_hash = ?').run(iso(now), iso(now + TTL), hash);
    refreshed = true;
  }
  return { id, user: { id: row.user_id, email: row.email }, refreshed };
}

function destroySession(db, req) {
  const id = readCookie(req, cookieName(req));
  if (id) db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(sha256(id));
}

module.exports = { createSession, loadSession, destroySession, setCookie, clearCookie, cookieName, sha256, TTL, REFRESH_EVERY };
