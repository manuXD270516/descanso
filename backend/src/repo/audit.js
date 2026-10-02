// Registro de auditoría y enlaces de recuperación (feature 008, US4).
const db = require('../db');
const { requireUser } = require('./scope');
const { newToken, iso } = require('../auth/tokens');

const RESET_TTL_MS = 30 * 60 * 1000;

const log = (userId, actorId, action, now = Date.now()) =>
  db.prepare('INSERT INTO audit_log (user_id, actor_user_id, action, created_at) VALUES (?, ?, ?, ?)').run(requireUser(userId), actorId, action, iso(now));

/** Actividad de la cuenta de un usuario: qué hizo quién y cuándo. */
const activity = (userId) =>
  db.prepare(`SELECT a.action, COALESCE(u.display_name, u.email, 'Alguien que ya no tiene cuenta') AS actor, a.created_at
    FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.user_id = ? ORDER BY a.id DESC`).all(requireUser(userId));

/** Enlace de recuperación de 30 min; invalida los anteriores sin usar de esa persona. */
function createReset(userId, ownerId, now = Date.now()) {
  const { token, hash } = newToken();
  db.transaction(() => {
    db.prepare('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(iso(now), requireUser(userId));
    db.prepare('INSERT INTO password_resets (token_hash, user_id, created_by, expires_at) VALUES (?, ?, ?, ?)').run(hash, userId, ownerId, iso(now + RESET_TTL_MS));
    log(userId, ownerId, 'reset_link_created', now);
  })();
  return { token, expires_at: iso(now + RESET_TTL_MS) };
}

/** Canje atómico del enlace: devuelve el usuario y su creador, o undefined si no sirve. */
function redeemReset(hash, now = Date.now()) {
  const row = db.prepare('SELECT user_id, created_by FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').get(hash, iso(now));
  if (!row) return undefined;
  const changed = db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL').run(iso(now), hash).changes;
  return changed ? row : undefined;
}

module.exports = { log, activity, createReset, redeemReset, RESET_TTL_MS };
