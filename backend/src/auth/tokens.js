// Tokens de un solo uso para invitaciones y enlaces de recuperación (feature 008, research R4).
// El token viaja en el fragmento del enlace (#invitacion= / #restablecer=); en la base solo su huella.
const crypto = require('node:crypto');
const { sha256 } = require('./sessions');

function newToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
}

const hashOf = (token) => sha256(String(token ?? '').trim());
const iso = (ms) => new Date(ms).toISOString();

module.exports = { newToken, hashOf, iso };
