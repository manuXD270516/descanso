// Identidad y perfil de usuarios (feature 008). Datos de un usuario: siempre por su id.
const db = require('../db');
const { requireUser } = require('./scope');
const metrics = require('./metrics');

const PROFILE = `u.id, u.email, u.role, u.display_name, u.timezone, u.consent_version, u.consent_at,
  u.reset_notice_at, u.created_at, s.sleep_goal_min`;

const profile = (userId) =>
  db.prepare(`SELECT ${PROFILE} FROM users u LEFT JOIN user_settings s ON s.user_id = u.id WHERE u.id = ?`).get(requireUser(userId));

const byEmailForLogin = (email) =>
  db.prepare('SELECT id, email, password_hash, role, display_name, reset_notice_at FROM users WHERE email = ? AND password_hash IS NOT NULL').get(email);

const passwordHash = (userId) => db.prepare('SELECT password_hash FROM users WHERE id = ?').get(requireUser(userId))?.password_hash;

const emailTaken = (email, exceptId = 0) => !!db.prepare('SELECT 1 FROM users WHERE email = ? AND id <> ?').get(email, exceptId);

/** Alta de una persona invitada con su configuración y sus 3 métricas iniciales (en la transacción del llamante). */
function createUser({ email, passwordHash: hash, displayName, consentVersion }) {
  const now = new Date().toISOString();
  const id = Number(
    db.prepare(`INSERT INTO users (email, password_hash, role, display_name, consent_version, consent_at, created_at)
      VALUES (?, ?, 'user', ?, ?, ?, ?)`).run(email, hash, displayName, consentVersion, now, now).lastInsertRowid,
  );
  db.prepare('INSERT INTO user_settings (user_id, updated_at) VALUES (?, ?)').run(id, now);
  metrics.seedDefaults(id);
  return id;
}

function updateProfile(userId, { display_name, timezone, sleep_goal_min }) {
  const now = new Date().toISOString();
  db.transaction(() => {
    if (display_name !== undefined) db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(display_name, requireUser(userId));
    if (timezone !== undefined) db.prepare('UPDATE users SET timezone = ? WHERE id = ?').run(timezone, requireUser(userId));
    if (sleep_goal_min !== undefined) {
      db.prepare(`INSERT INTO user_settings (user_id, sleep_goal_min, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET sleep_goal_min = excluded.sleep_goal_min, updated_at = excluded.updated_at`)
        .run(requireUser(userId), sleep_goal_min, now);
    }
  })();
  return profile(userId);
}

const setEmail = (userId, email) => db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, requireUser(userId));
const setPassword = (userId, hash) => db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, requireUser(userId));
const setResetNotice = (userId, at) => db.prepare('UPDATE users SET reset_notice_at = ? WHERE id = ?').run(at, requireUser(userId));

/** Cambia la contraseña y cierra las demás sesiones del usuario, conservando la actual (FR-012). */
function changePassword(userId, hash, keepSessionHash) {
  db.transaction(() => {
    setPassword(userId, hash);
    closeSessions(userId, keepSessionHash);
  })();
}

/** Cierra las sesiones de un usuario; con exceptHash conserva la actual. */
const closeSessions = (userId, exceptHash = null) =>
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id_hash IS NOT ?').run(requireUser(userId), exceptHash).changes;

/** Personas de la instalación, sin ningún dato de salud (panel del propietario). */
const listPeople = () => db.prepare('SELECT id, display_name, email, role, created_at FROM users ORDER BY id').all();

const roleOf = (userId) => db.prepare('SELECT role FROM users WHERE id = ?').get(userId)?.role;

const othersExist = (userId) => !!db.prepare('SELECT 1 FROM users WHERE id <> ?').get(requireUser(userId));

/** Borra la cuenta: las FK ON DELETE CASCADE eliminan todo lo suyo (feature 008, R8). */
const deleteUser = (userId) => db.prepare('DELETE FROM users WHERE id = ?').run(requireUser(userId)).changes;

module.exports = {
  profile, byEmailForLogin, passwordHash, emailTaken, createUser, updateProfile, setEmail, setPassword,
  setResetNotice, changePassword, closeSessions, listPeople, roleOf, othersExist, deleteUser,
};
