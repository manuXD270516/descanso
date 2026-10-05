// Sentencias SQL de la versión 006 (backend/src/repo/* en master antes de 010) que tocan tablas
// cambiadas por 010, congeladas para comprobar expand/contract.
// NO MODIFICAR: representa lo que ejecuta la imagen anterior tras un rollback.
const COLS = 'id, date, bedtime, wake_time, notes, sol_bucket, awakenings_bucket, created_at';
const PROFILE = `u.id, u.email, u.role, u.display_name, u.timezone, u.consent_version, u.consent_at,
  u.reset_notice_at, u.created_at, s.sleep_goal_min, s.goal_customized, s.onboarded_at,
  COALESCE(s.cycle_min, 90) AS cycle_min, COALESCE(s.latency_min, 15) AS latency_min`;

const legacy006 = (db) => ({
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
    db.prepare('UPDATE sleep_records SET date=?, bedtime=?, wake_time=?, notes=?, sol_bucket=?, awakenings_bucket=? WHERE user_id = ? AND id = ?')
      .run(d.date, d.bedtime, d.wake_time ?? null, d.notes ?? null, d.sol_bucket ?? null, d.awakenings_bucket ?? null, userId, id).changes,
  night: (userId, id) => db.prepare(`SELECT ${COLS} FROM sleep_records WHERE user_id = ? AND id = ?`).get(userId, id),
  setCycleSettings: (userId, cycle, latency) =>
    db.prepare(`INSERT INTO user_settings (user_id, cycle_min, latency_min, updated_at) VALUES (?, COALESCE(?, 90), COALESCE(?, 15), ?)
      ON CONFLICT(user_id) DO UPDATE SET cycle_min = COALESCE(?, cycle_min), latency_min = COALESCE(?, latency_min), updated_at = excluded.updated_at`)
      .run(userId, cycle, latency, new Date().toISOString(), cycle, latency),
  profile: (userId) => db.prepare(`SELECT ${PROFILE} FROM users u LEFT JOIN user_settings s ON s.user_id = u.id WHERE u.id = ?`).get(userId),
  exportNights: (userId) =>
    db.prepare('SELECT id, date, bedtime, wake_time, notes, created_at, sol_bucket, awakenings_bucket FROM sleep_records WHERE user_id = ? ORDER BY id').all(userId),
  deleteUser: (userId) => db.prepare('DELETE FROM users WHERE id = ?').run(userId).changes,
});

module.exports = { legacy006 };
