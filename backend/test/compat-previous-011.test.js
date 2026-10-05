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

// Expand/contract (feature 011): el código de 010 (y el de 006) funciona sobre el esquema de 011.
const DIR = migrationsUpTo(10);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'descanso-compat011-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// Sentencias de 010 (backend/src/repo/* en master antes de 011) que tocan tablas cambiadas por 011.
// NO MODIFICAR: representan lo que ejecuta la imagen anterior tras un rollback.
const legacy010 = (db) => ({
  saveSchedule: (userId, today) => {
    const id = db.prepare('INSERT INTO schedule_versions (user_id, effective_from, created_at) VALUES (?, ?, ?)').run(userId, today, new Date().toISOString()).lastInsertRowid;
    const insert = db.prepare('INSERT INTO schedule_days (version_id, weekday, bed_min, wake_min, active) VALUES (?, ?, ?, ?, ?)');
    for (let w = 0; w < 7; w++) insert.run(id, w, 1380, 420, 1);
    return id;
  },
  createPause: (userId, start, end) =>
    db.prepare('INSERT INTO pauses (user_id, start_date, end_date, created_at) VALUES (?, ?, ?, ?)').run(userId, start, end, new Date().toISOString()).lastInsertRowid,
  setLead: (userId, lead) =>
    db.prepare(`INSERT INTO user_settings (user_id, lead_min, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET lead_min = excluded.lead_min, updated_at = excluded.updated_at`).run(userId, lead, new Date().toISOString()),
  leadOf: (userId) => db.prepare('SELECT lead_min FROM user_settings WHERE user_id = ?').get(userId)?.lead_min,
  setWake: (userId, id, wake, fromProposal) =>
    db.prepare('UPDATE sleep_records SET wake_time = ?, wake_logged_at = ?, wake_from_proposal = ? WHERE user_id = ? AND id = ?')
      .run(wake, new Date().toISOString(), fromProposal ? 1 : 0, userId, id).changes,
  exportNights: (userId) =>
    db.prepare('SELECT id, date, bedtime, wake_time, notes, sol_bucket, awakenings_bucket, wake_logged_at, wake_from_proposal, created_at FROM sleep_records WHERE user_id = ?').all(userId),
});

test('las sentencias de 010 y 006 operan sobre el esquema de 011; la fila nueva queda con la racha desactivada', () => {
  const db = new Database(makeLegacyDb(path.join(tmp, 'sleep.db')));
  db.pragma('foreign_keys = ON');
  migrate(db, { dir: DIR, log: { info() {}, warn() {} } });
  const v6 = legacy006(db);
  const v10 = legacy010(db);
  try {
    const id = v6.createUser('b@x.com');
    const s = db.prepare('SELECT streak_enabled, streak_margin_min, streak_best, streak_total FROM user_settings WHERE user_id = ?').get(id);
    assert.deepEqual(s, { streak_enabled: 0, streak_margin_min: 30, streak_best: 0, streak_total: 0 });
    v10.saveSchedule(id, '2026-10-04');
    v10.createPause(id, '2026-10-06', '2026-10-07');
    v10.setLead(id, 45);
    assert.equal(v10.leadOf(id), 45);
    const night = v6.createNight(id, '2026-10-04', '2026-10-04T23:00:00-04:00');
    assert.equal(v10.setWake(id, night, '2026-10-05T07:00:00-04:00', true), 1);
    assert.equal(v10.exportNights(id)[0].wake_from_proposal, 1);
    db.prepare("INSERT INTO streak_achievements (user_id, key, achieved_on, wake_spread_min, created_at) VALUES (?, 7, '2026-10-05', 9, 'x')").run(id);
    assert.equal(v6.deleteUser(id), 1, 'borrar la cuenta desde 010 arrastra los logros');
    for (const t of ['sleep_records', 'user_settings', 'schedule_versions', 'pauses', 'streak_achievements']) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE user_id = ?`).get(id).c, 0, t);
    }
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    db.close();
  }
});
