const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrate } = require('../src/migrate');
const { migrationsUpTo } = require('./fixtures/migrations-up-to');
const { makeLegacyDb } = require('./fixtures/make-legacy-db');
const { legacy006 } = require('./fixtures/legacy-006-statements');

// Expand/contract (feature 013): el código de 011 (master antes de 013) funciona sobre el esquema de 013.
const DIR = migrationsUpTo(11);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'descanso-compat013-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// Sentencias de 011 (backend/src/repo/* y auth/sessions.js en master antes de 013) que tocan tablas
// cambiadas por 013. NO MODIFICAR: representan lo que ejecuta la imagen anterior tras un rollback.
const legacy011 = (db) => ({
  createSession: (userId, hash) =>
    db.prepare('INSERT INTO sessions (id_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?,?,?,?,?)')
      .run(hash, userId, new Date().toISOString(), new Date().toISOString(), '2099-01-01T00:00:00.000Z'),
  destroySession: (hash) => db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(hash).changes,
  purgeExpiredSessions: (iso) => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(iso).changes,
  changePassword: (userId, hash, keep) => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
    return db.prepare('DELETE FROM sessions WHERE user_id = ? AND id_hash IS NOT ?').run(userId, keep).changes;
  },
  setLead: (userId, lead) =>
    db.prepare(`INSERT INTO user_settings (user_id, lead_min, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET lead_min = excluded.lead_min, updated_at = excluded.updated_at`).run(userId, lead, new Date().toISOString()),
  leadOf: (userId) => db.prepare('SELECT lead_min FROM user_settings WHERE user_id = ?').get(userId)?.lead_min,
  enableStreak: (userId, today) =>
    db.prepare('UPDATE user_settings SET streak_enabled = 1, streak_since = ?, streak_total_base = streak_total, updated_at = ? WHERE user_id = ?')
      .run(today, new Date().toISOString(), userId),
  streakSettings: (userId) =>
    db.prepare('SELECT streak_enabled, streak_margin_min, streak_since, streak_best, streak_total FROM user_settings WHERE user_id = ?').get(userId),
  exportNights: (userId) =>
    db.prepare('SELECT id, date, bedtime, wake_time, notes, sol_bucket, awakenings_bucket, wake_logged_at, wake_from_proposal, created_at FROM sleep_records WHERE user_id = ?').all(userId),
});

test('las sentencias de 011 operan sobre el esquema de 013; la fila nueva queda con los tres avisos activos', () => {
  const db = new Database(makeLegacyDb(path.join(tmp, 'sleep.db')));
  db.pragma('foreign_keys = ON');
  migrate(db, { dir: DIR, log: { info() {}, warn() {} } });
  const v6 = legacy006(db);
  const v11 = legacy011(db);
  try {
    const id = v6.createUser('b@x.com');
    const other = v6.createUser('c@x.com');
    const s = db.prepare('SELECT push_prepare, push_bedtime, push_wake_check, dnd_start_min, dnd_end_min, muted_until FROM user_settings WHERE user_id = ?').get(id);
    assert.deepEqual(s, { push_prepare: 1, push_bedtime: 1, push_wake_check: 1, dnd_start_min: null, dnd_end_min: null, muted_until: null });
    v11.setLead(id, 45);
    assert.equal(v11.leadOf(id), 45);
    v11.enableStreak(id, '2026-10-04');
    assert.equal(v11.streakSettings(id).streak_enabled, 1);
    const night = v6.createNight(id, '2026-10-04', '2026-10-04T23:00:00-04:00');
    assert.equal(v6.setWake(id, night, '2026-10-05T07:00:00-04:00'), 1);
    assert.equal(v11.exportNights(id).length, 1);

    // Dispositivos ligados a sesiones: el código de 011 borra sesiones y la FK borra el dispositivo
    for (const [hash, user] of [['s1', id], ['s2', id], ['s3', other]]) v11.createSession(user, hash);
    const device = db.prepare('INSERT INTO push_subscriptions (user_id, session_hash, endpoint, p256dh, auth, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    device.run(id, 's1', 'https://fcm.googleapis.com/1', 'k', 'a', 'Chrome en Android', 'x');
    device.run(id, 's2', 'https://fcm.googleapis.com/2', 'k', 'a', 'Chrome en Android', 'x');
    device.run(other, 's3', 'https://fcm.googleapis.com/3', 'k', 'a', 'Chrome en Android', 'x');
    assert.equal(v11.destroySession('s1'), 1);
    const left = () => db.prepare('SELECT endpoint FROM push_subscriptions ORDER BY id').all().map((r) => r.endpoint);
    assert.deepEqual(left(), ['https://fcm.googleapis.com/2', 'https://fcm.googleapis.com/3'], 'borra solo el dispositivo de esa sesión');
    assert.equal(v11.changePassword(id, 'nuevo', 's-actual'), 1, 'cierra las demás sesiones de la persona');
    assert.deepEqual(left(), ['https://fcm.googleapis.com/3'], 'y con ellas sus dispositivos');
    v11.createSession(other, 's4');
    db.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id_hash = 's3'").run();
    assert.equal(v11.purgeExpiredSessions(new Date().toISOString()), 1);
    assert.deepEqual(left(), []);

    // Borrar la cuenta desde 011 arrastra entregas y dispositivos
    v11.createSession(id, 's5');
    device.run(id, 's5', 'https://fcm.googleapis.com/5', 'k', 'a', 'Chrome en Android', 'x');
    db.prepare("INSERT INTO reminder_deliveries (user_id, kind, night_date, due_at, status, updated_at) VALUES (?, 'prepare', '2026-10-04', 'x', 'sent', 'x')").run(id);
    assert.equal(v6.deleteUser(id), 1);
    for (const t of ['sleep_records', 'user_settings', 'push_subscriptions', 'reminder_deliveries']) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE user_id = ?`).get(id).c, 0, t);
    }
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    db.close();
  }
});
