// Sentencias SQL de la versión 005 (backend/src/repo/* en master antes de 006) que tocan tablas
// cambiadas por 006, congeladas para comprobar expand/contract.
// NO MODIFICAR: representa lo que ejecuta la imagen anterior tras un rollback.
const COLS = 'id, date, bedtime, wake_time, notes, created_at';
const PROFILE = `u.id, u.email, u.role, u.display_name, u.timezone, u.consent_version, u.consent_at,
  u.reset_notice_at, u.created_at, s.sleep_goal_min, s.goal_customized, s.onboarded_at`;

const legacy005 = (db) => ({
  createUser: (email) => {
    const now = new Date().toISOString();
    const id = Number(
      db.prepare("INSERT INTO users (email, password_hash, role, display_name, consent_version, consent_at, created_at) VALUES (?, 'x', 'user', 'N', 'v', ?, ?)")
        .run(email, now, now).lastInsertRowid,
    );
    db.prepare('INSERT INTO user_settings (user_id, updated_at) VALUES (?, ?)').run(id, now);
    return id;
  },
  createNight: (userId, date, bedtime) =>
    db.prepare('INSERT INTO sleep_records (user_id, date, bedtime, wake_time, notes) VALUES (?,?,?,?,?)').run(userId, date, bedtime, null, null).lastInsertRowid,
  setWake: (userId, id, wake) => db.prepare('UPDATE sleep_records SET wake_time = ? WHERE user_id = ? AND id = ?').run(wake, userId, id).changes,
  updateNight: (userId, id, d) =>
    db.prepare('UPDATE sleep_records SET date=?, bedtime=?, wake_time=?, notes=? WHERE user_id = ? AND id = ?')
      .run(d.date, d.bedtime, d.wake_time ?? null, d.notes ?? null, userId, id).changes,
  night: (userId, id) => db.prepare(`SELECT ${COLS} FROM sleep_records WHERE user_id = ? AND id = ?`).get(userId, id),
  createNap: (userId, date) =>
    db.prepare('INSERT INTO naps (user_id, date, start_time, end_time, notes) VALUES (?,?,?,?,?)').run(userId, date, `${date}T14:00:00-04:00`, `${date}T14:30:00-04:00`, null).lastInsertRowid,
  setGoal: (userId, minutes) =>
    db.prepare(`INSERT INTO user_settings (user_id, sleep_goal_min, goal_customized, updated_at) VALUES (?, ?, 1, ?)
      ON CONFLICT(user_id) DO UPDATE SET sleep_goal_min = excluded.sleep_goal_min, goal_customized = 1, updated_at = excluded.updated_at`)
      .run(userId, minutes, new Date().toISOString()),
  completeOnboarding: (userId) => {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO user_settings (user_id, onboarded_at, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET onboarded_at = COALESCE(onboarded_at, excluded.onboarded_at), updated_at = excluded.updated_at`).run(userId, now, now);
  },
  profile: (userId) => db.prepare(`SELECT ${PROFILE} FROM users u LEFT JOIN user_settings s ON s.user_id = u.id WHERE u.id = ?`).get(userId),
  exportNights: (userId) =>
    db.prepare('SELECT id, date, bedtime, wake_time, notes, created_at FROM sleep_records WHERE user_id = ? ORDER BY id').all(userId),
  deleteUser: (userId) => db.prepare('DELETE FROM users WHERE id = ?').run(userId).changes,
});

module.exports = { legacy005 };
