const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrate } = require('../src/migrate');
const { makeLegacyDb } = require('./fixtures/make-legacy-db');
const { legacy004 } = require('./fixtures/legacy-004-statements');

// Expand/contract (feature 008): el código de 004 funciona sobre el esquema de 008.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'descanso-compat008-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('las sentencias de 004 (alta, entrada, rotación, sesiones y datos) operan sobre el esquema de 008', () => {
  const db = new Database(makeLegacyDb(path.join(tmp, 'sleep.db')));
  db.pragma('foreign_keys = ON');
  migrate(db, { log: { info() {}, warn() {} } });
  const v4 = legacy004(db);

  try {
    assert.deepEqual(v4.setupRow(), { token_hash: null, used_at: null });
    assert.equal(v4.setOwnerCredentials('yo@ejemplo.com', 'scrypt$x'), 1);
    assert.equal(v4.userForLogin('YO@ejemplo.com').id, 1, 'email NOCASE');
    v4.createSession('h1', 1);
    assert.equal(v4.loadSession('h1').email, 'yo@ejemplo.com');

    const night = v4.createNight('2026-09-30', '2026-09-30T23:00:00-04:00');
    assert.equal(db.prepare('SELECT user_id FROM sleep_records WHERE id = ?').get(night).user_id, 1);
    const metric = v4.createMetric('Pasos');
    assert.equal(db.prepare('SELECT user_id FROM metrics WHERE id = ?').get(metric).user_id, 1);
    assert.ok(v4.exportNights().length > 0);

    // La rotación de 004 cierra todas las sesiones: no rompe el esquema nuevo
    v4.rotate('otro');
    assert.equal(v4.owner().password_hash, null);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM sessions').get().c, 0);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    db.close();
  }
});
