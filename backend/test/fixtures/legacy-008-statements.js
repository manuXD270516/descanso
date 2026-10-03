// Sentencias SQL de la versión 008 (backend/src/repo/* en master antes de 005) que tocan tablas
// cambiadas por 005, congeladas para comprobar expand/contract.
// NO MODIFICAR: representa lo que ejecuta la imagen anterior tras un rollback.
const legacy008 = (db) => ({
  createNight: (userId, date, bedtime) =>
    db.prepare('INSERT INTO sleep_records (user_id, date, bedtime, wake_time, notes) VALUES (?,?,?,?,?)').run(userId, date, bedtime, null, null).lastInsertRowid,
  createNap: (userId, date) =>
    db.prepare('INSERT INTO naps (user_id, date, start_time, end_time, notes) VALUES (?,?,?,?,?)').run(userId, date, `${date}T14:00:00-04:00`, `${date}T14:30:00-04:00`, null).lastInsertRowid,
  seedMetric: (userId) =>
    db.prepare('INSERT INTO metrics (user_id, name, type, unit, min_value, max_value, color, sort_order) VALUES (?,?,?,?,?,?,?,?)').run(userId, 'Cafés', 'number', 'tazas', 0, null, '#8a5a3c', 2).lastInsertRowid,
  // repo/users.createUser de 008
  createUser: (email) => {
    const now = new Date().toISOString();
    const id = Number(
      db.prepare("INSERT INTO users (email, password_hash, role, display_name, consent_version, consent_at, created_at) VALUES (?, 'x', 'user', 'N', 'v', ?, ?)")
        .run(email, now, now).lastInsertRowid,
    );
    db.prepare('INSERT INTO user_settings (user_id, updated_at) VALUES (?, ?)').run(id, now);
    return id;
  },
  // repo/users.updateProfile (objetivo) de 008
  setGoal: (userId, goal) =>
    db.prepare(`INSERT INTO user_settings (user_id, sleep_goal_min, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET sleep_goal_min = excluded.sleep_goal_min, updated_at = excluded.updated_at`).run(userId, goal, new Date().toISOString()),
  profile: (userId) =>
    db.prepare('SELECT u.id, u.email, u.role, u.display_name, u.timezone, s.sleep_goal_min FROM users u LEFT JOIN user_settings s ON s.user_id = u.id WHERE u.id = ?').get(userId),
  deleteUser: (userId) => db.prepare('DELETE FROM users WHERE id = ?').run(userId).changes,
});

module.exports = { legacy008 };
