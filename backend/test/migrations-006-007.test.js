const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrate } = require('../src/migrate');
const { makeLegacyDb } = require('./fixtures/make-legacy-db');
const { migrationsUpTo } = require('./fixtures/migrations-up-to');

// Migraciones 006 (contracción de user_id) y 007 (objetivo de 7 h y bienvenida), feature 005.
let tmp;
const silent = { info() {}, warn() {} };
const MIGRATIONS = path.join(__dirname, '..', 'src', 'migrations');
// Fijado a su era: las migraciones posteriores (008) añaden columnas y cambiarían las huellas
const UP_TO_007 = migrationsUpTo(7);
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'descanso-m006-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const hashAll = (db, table) => crypto.createHash('sha256').update(JSON.stringify(db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())).digest('hex');

/** Base legacy migrada hasta 005, con una segunda persona y su objetivo personalizado. */
function upTo005() {
  const file = makeLegacyDb(path.join(tmp, `${crypto.randomUUID()}.db`));
  const dir = path.join(tmp, `m-${crypto.randomUUID()}`);
  fs.mkdirSync(dir);
  for (const f of fs.readdirSync(MIGRATIONS).filter((f) => Number(f.slice(0, 3)) <= 5)) fs.copyFileSync(path.join(MIGRATIONS, f), path.join(dir, f));
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  migrate(db, { dir, log: silent });
  db.prepare("INSERT INTO users (id, email, role, created_at) VALUES (2, 'b@x.com', 'user', 'x')").run();
  db.prepare("INSERT INTO user_settings (user_id, sleep_goal_min, updated_at) VALUES (2, 450, 'x')").run();
  db.prepare("INSERT INTO sleep_records (user_id, date, bedtime) VALUES (2, '2026-09-30', '2026-09-30T23:00:00-04:00')").run();
  db.prepare("INSERT INTO naps (user_id, date, start_time, end_time) VALUES (2, '2026-09-30', 'a', 'b')").run();
  const maxNap = db.prepare('SELECT MAX(id) AS m FROM naps').get().m;
  db.prepare('DELETE FROM naps WHERE id = ?').run(maxNap); // id usado y borrado
  return { db, maxNap };
}

test('006: contrae user_id sin perder ni alterar filas; sin usuario explícito → error', () => {
  const { db, maxNap } = upTo005();
  const before = Object.fromEntries(['sleep_records', 'naps', 'metrics', 'metric_entries'].map((t) => [t, hashAll(db, t)]));
  migrate(db, { dir: UP_TO_007, log: silent });
  for (const [t, h] of Object.entries(before)) assert.equal(hashAll(db, t), h, `${t} intacta`);
  assert.deepEqual(db.pragma('foreign_key_check'), []);

  for (const t of ['sleep_records', 'naps', 'metrics']) {
    const col = db.prepare(`PRAGMA table_info(${t})`).all().find((c) => c.name === 'user_id');
    assert.equal(col.dflt_value, null, `${t}.user_id sin DEFAULT`);
    assert.equal(col.notnull, 1);
  }
  assert.throws(() => db.prepare("INSERT INTO naps (date, start_time, end_time) VALUES ('2026-09-30', 'a', 'b')").run(), /NOT NULL/);
  assert.throws(
    () => db.prepare("INSERT INTO sleep_records (user_id, date, bedtime) VALUES (2, '2026-10-01', 'x')").run(),
    /ux_sleep_one_open/,
    'el error sigue nombrando el índice (409 en writeNight)',
  );
  const id = db.prepare("INSERT INTO naps (user_id, date, start_time, end_time) VALUES (1, '2026-09-30', 'a', 'b')").run().lastInsertRowid;
  assert.ok(id > maxNap, 'AUTOINCREMENT conservado');
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
  for (const n of ['idx_sleep_date', 'idx_naps_date', 'ux_sleep_one_open']) assert.ok(idx.includes(n), n);
  db.close();
});

test('007: objetivo por defecto 7 h; 480 → 420 sin personalizar, el resto se conserva personalizado', () => {
  const { db } = upTo005();
  migrate(db, { dir: UP_TO_007, log: silent });
  const rows = db.prepare('SELECT user_id, sleep_goal_min, goal_customized, onboarded_at FROM user_settings ORDER BY user_id').all();
  assert.deepEqual(rows, [
    { user_id: 1, sleep_goal_min: 420, goal_customized: 0, onboarded_at: null },
    { user_id: 2, sleep_goal_min: 450, goal_customized: 1, onboarded_at: null },
  ]);
  db.prepare("INSERT INTO users (id, email, role, created_at) VALUES (3, 'c@x.com', 'user', 'x')").run();
  db.prepare("INSERT INTO user_settings (user_id, updated_at) VALUES (3, 'x')").run(); // como lo hace 008
  assert.equal(db.prepare('SELECT sleep_goal_min FROM user_settings WHERE user_id = 3').get().sleep_goal_min, 420);
  assert.throws(() => db.prepare('UPDATE user_settings SET sleep_goal_min = 721 WHERE user_id = 3').run(), /CHECK/);
  db.close();
});
