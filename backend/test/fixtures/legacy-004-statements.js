// Sentencias SQL de la versión 004 (backend/src/{auth,routes}/* en master antes de 008) que tocan
// tablas cambiadas por 008, congeladas para comprobar expand/contract.
// NO MODIFICAR: representa lo que ejecuta la imagen anterior tras un rollback.
const legacy004 = (db) => ({
  // routes/auth.js
  owner: () => db.prepare('SELECT id, email, password_hash FROM users WHERE id = 1').get(),
  setupRow: () => db.prepare('SELECT token_hash, used_at FROM auth_setup WHERE id = 1').get(),
  setOwnerCredentials: (email, hash) =>
    db.prepare('UPDATE users SET email = ?, password_hash = ? WHERE id = 1 AND password_hash IS NULL').run(email, hash).changes,
  userForLogin: (email) => db.prepare('SELECT id, email, password_hash FROM users WHERE email = ? AND password_hash IS NOT NULL').get(email),
  // auth/bootstrap.js de 004 (rotación del código de alta)
  rotate: (hash) =>
    db.transaction(() => {
      db.prepare('UPDATE auth_setup SET token_hash = ?, used_at = NULL WHERE id = 1').run(hash);
      db.prepare('UPDATE users SET password_hash = NULL WHERE id = 1').run();
      db.prepare('DELETE FROM sessions').run();
    })(),
  // auth/sessions.js
  createSession: (idHash, userId) =>
    db.prepare('INSERT INTO sessions (id_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?,?,?,?,?)').run(idHash, userId, 'a', 'a', '2099-01-01'),
  loadSession: (idHash) =>
    db.prepare('SELECT s.id_hash, s.user_id, s.last_seen_at, s.expires_at, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?').get(idHash),
  // routes de datos de 004: sin user_id (DEFAULT 1)
  createNight: (date, bedtime) => db.prepare('INSERT INTO sleep_records (date, bedtime, wake_time, notes) VALUES (?,?,?,?)').run(date, bedtime, null, null).lastInsertRowid,
  createMetric: (name) =>
    db.prepare('INSERT INTO metrics (name,type,unit,min_value,max_value,color,sort_order,archived) VALUES (?,?,?,?,?,?,?,?)').run(name, 'number', null, null, null, '#5b6ee1', 0, 0).lastInsertRowid,
  exportNights: () => db.prepare('SELECT id, date, bedtime, wake_time, notes, created_at FROM sleep_records ORDER BY id').all(),
});

module.exports = { legacy004 };
