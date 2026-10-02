// Alta y recuperación del propietario (feature 004, research R4; ajustado en 008).
// Al arrancar: si OWNER_SETUP_TOKEN cambió respecto al último visto, se reabre el alta, se borra la
// contraseña del propietario y se cierran SUS sesiones. No toca a los demás usuarios ni ningún dato.
const { sha256 } = require('./sessions');

function bootstrap(db, token = process.env.OWNER_SETUP_TOKEN, log = console) {
  const value = (token || '').trim();
  if (!value) return { changed: false };
  const hash = sha256(value);
  const current = db.prepare('SELECT token_hash FROM auth_setup WHERE id = 1').get();
  if (current.token_hash === hash) return { changed: false };

  db.transaction(() => {
    db.prepare('UPDATE auth_setup SET token_hash = ?, used_at = NULL WHERE id = 1').run(hash);
    db.prepare('UPDATE users SET password_hash = NULL WHERE id = 1').run();
    db.prepare('DELETE FROM sessions WHERE user_id = 1').run(); // feature 008: solo el propietario
  })();
  log.info('[acceso] código de alta nuevo: alta del propietario abierta y sus sesiones cerradas');
  return { changed: true };
}

module.exports = { bootstrap };
