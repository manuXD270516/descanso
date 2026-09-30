const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrate } = require('../src/migrate');
const { makeLegacyDb, hashTables } = require('./fixtures/make-legacy-db');

// Línea base sobre bases reales creadas por la versión anterior (US1, US3-8).
let tmp;
const silent = { info() {}, warn() {} };
// Todas las versiones existentes (crece con cada feature que añade migraciones)
const ALL = fs.readdirSync(path.join(__dirname, '..', 'src', 'migrations')).map((f) => Number(f.slice(0, 3))).sort((a, b) => a - b);
const backend = path.join(__dirname, '..');

before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'descanso-legacy-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const versions = (file) => {
  const db = new Database(file, { readonly: true });
  const v = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((r) => r.version);
  db.close();
  return v;
};

test('base legacy: la huella de todas las filas es idéntica y quedan registradas todas las versiones (SC-001, FR-005)', () => {
  const file = makeLegacyDb(path.join(tmp, 'legacy.db'));
  const before = hashTables(file);
  const db = new Database(file);
  const r = migrate(db, { backupDir: path.join(tmp, 'backups'), log: silent });
  db.close();
  assert.deepEqual(r.applied, ALL);
  assert.equal(r.backup, path.join(tmp, 'backups', 'pre-001.db'));
  assert.deepEqual(hashTables(file), before);
  assert.deepEqual(versions(file), ALL);
  assert.deepEqual(hashTables(r.backup), before, 'el respaldo previo es una copia fiel');
  const copy = new Database(r.backup, { readonly: true });
  const hasMigrations = copy.prepare("SELECT 1 FROM sqlite_master WHERE name = 'schema_migrations'").get();
  copy.close();
  assert.equal(hasMigrations, undefined, 'el respaldo es el estado exacto anterior, sin la tabla de control');
});

test('base realista (10 años): migración y respaldo en menos de 20 s (SC-004)', () => {
  const file = makeLegacyDb(path.join(tmp, 'realista.db'), { realista: true });
  const db = new Database(file);
  const t0 = performance.now();
  migrate(db, { backupDir: path.join(tmp, 'backups-realista'), log: silent });
  const ms = performance.now() - t0;
  const nights = db.prepare('SELECT COUNT(*) AS c FROM sleep_records').get().c;
  db.close();
  assert.equal(nights, 3650);
  assert.ok(ms < 20_000, `tardó ${Math.round(ms)} ms`);
});

test('base con dos noches abiertas: la migración 002 aborta nombrándolas y sin tocar datos (FR-020)', () => {
  const file = makeLegacyDb(path.join(tmp, 'dos-abiertas.db'), { dosAbiertas: true });
  const before = hashTables(file);
  const db = new Database(file);
  assert.throws(
    () => migrate(db, { log: silent }),
    (e) => /002_una_noche_abierta/.test(e.message) && /2026-09-20/.test(e.message) && /2026-09-21/.test(e.message) && /id \d+/.test(e.message),
  );
  db.close();
  assert.deepEqual(hashTables(file), before);
  assert.deepEqual(versions(file), [1], 'la versión 2 no quedó registrada');
});

test('base nueva vía db.js: esquema completo y las 3 métricas iniciales (FR-005)', () => {
  const file = path.join(tmp, 'nueva', 'nueva.db');
  const out = execFileSync(
    process.execPath,
    ['-e', "const db = require('./src/db'); process.stdout.write(JSON.stringify(db.prepare('SELECT name FROM metrics ORDER BY id').all()))"],
    { cwd: backend, env: { ...process.env, DB_PATH: file }, encoding: 'utf8' },
  );
  assert.deepEqual(JSON.parse(out.trim().split('\n').pop()).map((m) => m.name), ['Calidad del sueño', 'Energía al despertar', 'Cafés']);
  assert.deepEqual(versions(file), ALL);
  assert.equal(fs.existsSync(path.join(tmp, 'nueva', 'backups')), false, 'base nueva: sin respaldo');
});

test('si una migración aplicada no coincide, la app no llega a crearse ni a escuchar (FR-001)', () => {
  const file = path.join(tmp, 'alterada.db');
  const db = new Database(file);
  migrate(db, { log: silent });
  db.prepare("UPDATE schema_migrations SET checksum = 'otro' WHERE version = 1").run();
  db.close();
  const r = spawnSync(process.execPath, ['src/server.js'], {
    cwd: backend,
    env: { ...process.env, DB_PATH: file, PORT: '0' },
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /001_esquema_inicial/);
  assert.doesNotMatch(r.stdout, /escuchando/);
});
