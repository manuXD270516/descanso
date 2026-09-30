const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrate } = require('../src/migrate');
const { makeLegacyDb, hashTables } = require('./fixtures/make-legacy-db');

// Migraciones 003–004 (feature 004): usuarios y user_id por reconstrucción verificada (US4).
let tmp;
const silent = { info() {}, warn() {} };
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'descanso-m004-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function migrated(name, opts) {
  const file = makeLegacyDb(path.join(tmp, name), opts);
  const hashes = hashTables(file);
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  const t0 = performance.now();
  migrate(db, { log: silent });
  return { db, file, hashes, ms: performance.now() - t0 };
}

test('recuentos y contenido idénticos; metric_entries intacta; todo pertenece al propietario (SC-003, FR-012, FR-018)', () => {
  const { db, file, hashes } = migrated('legacy.db');
  const entries = db.prepare('SELECT COUNT(*) AS c FROM metric_entries').get().c;
  db.close();
  assert.deepEqual(hashTables(file), hashes);
  assert.ok(entries > 0, 'el fixture tiene valores de métricas');

  const ro = new Database(file, { readonly: true });
  for (const t of ['sleep_records', 'naps', 'metrics']) {
    assert.equal(ro.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE user_id IS NOT 1`).get().c, 0, t);
  }
  assert.deepEqual(ro.prepare('SELECT id, email, password_hash, role FROM users').all(), [{ id: 1, email: null, password_hash: null, role: 'owner' }]);
  assert.deepEqual(ro.pragma('foreign_key_check'), []);
  assert.deepEqual(ro.prepare('SELECT * FROM auth_setup').all(), [{ id: 1, token_hash: null, used_at: null }]);
  ro.close();
});

test('las filas nuevas sin user_id van al propietario (DEFAULT 1) y la FK protege contra usuarios inexistentes', () => {
  const { db } = migrated('default.db');
  const id = db.prepare("INSERT INTO naps (date, start_time, end_time) VALUES ('2026-09-30','2026-09-30T14:00:00-04:00','2026-09-30T14:30:00-04:00')").run().lastInsertRowid;
  assert.equal(db.prepare('SELECT user_id FROM naps WHERE id = ?').get(id).user_id, 1);
  assert.throws(
    () => db.prepare("INSERT INTO naps (date, start_time, end_time, user_id) VALUES ('2026-09-30','x','y', 99)").run(),
    /FOREIGN KEY/,
  );
  db.close();
});

test('una sola noche abierta por usuario; el error nombra el índice ux_sleep_one_open (FR-019)', () => {
  const { db } = migrated('open.db');
  db.prepare("INSERT INTO users (id, role, created_at) VALUES (2, 'owner', 'x')").run(); // solo para la prueba
  const ins = db.prepare('INSERT INTO sleep_records (date, bedtime, user_id) VALUES (?, ?, ?)');
  ins.run('2026-09-30', '2026-09-30T23:00:00-04:00', 1);
  assert.throws(() => ins.run('2026-10-01', '2026-10-01T23:00:00-04:00', 1), /ux_sleep_one_open/);
  assert.doesNotThrow(() => ins.run('2026-09-30', '2026-09-30T23:30:00-04:00', 2), 'otro usuario puede tener la suya');
  db.close();
});

test('se conservan los índices por fecha y el contador AUTOINCREMENT (no se reutilizan ids borrados)', () => {
  const file = makeLegacyDb(path.join(tmp, 'seq.db'));
  const pre = new Database(file);
  const maxId = pre.prepare('SELECT MAX(id) AS m FROM naps').get().m;
  pre.prepare('DELETE FROM naps WHERE id = ?').run(maxId); // el último id queda "usado"
  pre.close();
  const db = new Database(file);
  migrate(db, { log: silent });
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
  for (const name of ['idx_sleep_date', 'idx_naps_date', 'idx_entries_date', 'ux_sleep_one_open', 'idx_sessions_user']) assert.ok(idx.includes(name), name);
  const newId = db.prepare("INSERT INTO naps (date, start_time, end_time) VALUES ('2026-09-30','a','b')").run().lastInsertRowid;
  assert.ok(newId > maxId, `id nuevo ${newId} > ${maxId}`);
  db.close();
});

test('base realista (10 años): migraciones en menos de 20 s', () => {
  const { db, ms } = migrated('realista.db', { realista: true });
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM sleep_records').get().c, 3650);
  db.close();
  assert.ok(ms < 20_000, `tardó ${Math.round(ms)} ms`);
});
