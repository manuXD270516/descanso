// Invitaciones de un solo uso (feature 008, US1). Solo la huella del token se guarda.
const db = require('../db');
const { newToken, iso } = require('../auth/tokens');

const TTL_MS = 72 * 60 * 60 * 1000;

function create(ownerId, now = Date.now()) {
  const { token, hash } = newToken();
  const id = Number(
    db.prepare('INSERT INTO invites (token_hash, created_by, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(hash, ownerId, iso(now), iso(now + TTL_MS)).lastInsertRowid,
  );
  return { id, token, expires_at: iso(now + TTL_MS) };
}

function status(row, now) {
  if (row.used_at) return 'usada';
  if (row.revoked_at) return 'revocada';
  if (Date.parse(row.expires_at) <= now) return 'caducada';
  return 'pendiente';
}

function list(now = Date.now()) {
  return db
    .prepare(`SELECT i.id, i.created_at, i.expires_at, i.used_at, i.revoked_at, u.display_name AS used_by_name
      FROM invites i LEFT JOIN users u ON u.id = i.used_by ORDER BY i.id DESC`)
    .all()
    .map((r) => ({ id: r.id, status: status(r, now), created_at: r.created_at, expires_at: r.expires_at, used_by_name: r.used_by_name }));
}

/** ¿Sirve todavía para registrarse? (sin gastarla) */
const isUsable = (hash, now = Date.now()) =>
  !!db.prepare('SELECT 1 FROM invites WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?').get(hash, iso(now));

/** Canje atómico: devuelve true si esta petición la gastó (dos registros simultáneos: solo uno gana). */
const redeem = (hash, userId, now = Date.now()) =>
  db.prepare(`UPDATE invites SET used_by = ?, used_at = ?
    WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`).run(userId, iso(now), hash, iso(now)).changes === 1;

/** Revoca una invitación pendiente; 0 si no existe o ya no está pendiente. */
const revoke = (id, now = Date.now()) =>
  db.prepare('UPDATE invites SET revoked_at = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?')
    .run(iso(now), id, iso(now)).changes;

module.exports = { create, list, isUsable, redeem, revoke, TTL_MS };
