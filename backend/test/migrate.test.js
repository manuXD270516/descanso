const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrate, checksum, MigrationError } = require('../src/migrate');

// Runner de migraciones (US1): cada prueba usa una carpeta de migraciones y una base temporales.
let tmp, dir, backups;
const silent = { info() {}, warn() {} };

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'descanso-migrate-'));
  dir = path.join(tmp, 'migrations');
  backups = path.join(tmp, 'backups');
  fs.mkdirSync(dir);
});
const conns = [];
afterEach(() => {
  for (const c of conns.splice(0)) if (c.open) c.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const write = (name, content) => fs.writeFileSync(path.join(dir, name), content);
const open = (file = path.join(tmp, 'test.db')) => {
  const db = new Database(file);
  conns.push(db);
  return db;
};
const versions = (db) => db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((r) => r.version);
const tables = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);

function baseMigrations() {
  write('001_uno.sql', 'CREATE TABLE sleep_records (id INTEGER PRIMARY KEY, wake_time TEXT);');
  write('002_dos.sql', 'CREATE TABLE b (id INTEGER PRIMARY KEY);');
}

test('base nueva: crea schema_migrations y aplica en orden, con applied_at ISO 8601 con desfase (FR-003)', () => {
  baseMigrations();
  const db = open();
  const r = migrate(db, { dir, backupDir: backups, log: silent });
  assert.deepEqual(r.applied, [1, 2]);
  assert.equal(r.backup, null); // base nueva: nada que respaldar
  const rows = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
  assert.deepEqual(rows.map((x) => x.name), ['001_uno', '002_dos']);
  for (const row of rows) {
    assert.match(row.applied_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
    assert.equal(row.checksum.length, 64);
  }
  assert.ok(tables(db).includes('b'));
});

test('segunda ejecución: no aplica ni escribe nada (FR-006)', () => {
  baseMigrations();
  const db = open();
  migrate(db, { dir, backupDir: backups, log: silent });
  const before = db.prepare('SELECT * FROM schema_migrations').all();
  const r = migrate(db, { dir, backupDir: backups, log: silent });
  assert.deepEqual(r, { applied: [], backup: null });
  assert.deepEqual(db.prepare('SELECT * FROM schema_migrations').all(), before);
  assert.equal(fs.existsSync(backups), false);
});

test('una migración que falla a mitad se deshace entera y no queda registrada; las anteriores siguen (FR-002)', () => {
  write('001_uno.sql', 'CREATE TABLE a (id INTEGER PRIMARY KEY);');
  write('002_falla.sql', 'CREATE TABLE c (id INTEGER PRIMARY KEY); INSERT INTO no_existe VALUES (1);');
  const db = open();
  assert.throws(() => migrate(db, { dir, log: silent }), (e) => e instanceof MigrationError && /002_falla/.test(e.message));
  assert.deepEqual(versions(db), [1]);
  assert.ok(!tables(db).includes('c'), 'el CREATE de la migración fallida se deshizo');
});

test('una migración .js que lanza se deshace y su mensaje llega al error', () => {
  write('001_uno.sql', 'CREATE TABLE a (id INTEGER PRIMARY KEY);');
  write('002_logica.js', "module.exports = { up(db) { db.exec('CREATE TABLE c (id INTEGER)'); throw new Error('Hay 2 noches abiertas'); } };");
  const db = open();
  assert.throws(() => migrate(db, { dir, log: silent }), /002_logica.*Hay 2 noches abiertas/);
  assert.deepEqual(versions(db), [1]);
  assert.ok(!tables(db).includes('c'));
});

test('checksum alterado de una migración aplicada: aborta nombrándola y sin tocar la base (FR-004)', () => {
  baseMigrations();
  const db = open();
  migrate(db, { dir, log: silent });
  write('001_uno.sql', 'CREATE TABLE sleep_records (id INTEGER PRIMARY KEY, wake_time TEXT); -- editada');
  write('003_tres.sql', 'CREATE TABLE d (id INTEGER);');
  assert.throws(() => migrate(db, { dir, log: silent }), (e) => e instanceof MigrationError && /001_uno/.test(e.message) && /checksum/.test(e.message));
  assert.deepEqual(versions(db), [1, 2]);
  assert.ok(!tables(db).includes('d'), 'no se aplicó la pendiente');
});

test('la huella ignora finales de línea CRLF y el BOM (R3)', () => {
  const lf = 'CREATE TABLE a (id INTEGER);\nCREATE TABLE b (id INTEGER);\n';
  assert.equal(checksum(lf.replace(/\n/g, '\r\n')), checksum(lf));
  assert.equal(checksum('\uFEFF' + lf), checksum(lf));
  assert.notEqual(checksum(lf + ' '), checksum(lf));
});

test('numeración: un hueco o una versión duplicada abortan antes de tocar la base', () => {
  write('001_uno.sql', 'CREATE TABLE a (id INTEGER);');
  write('003_tres.sql', 'CREATE TABLE c (id INTEGER);');
  const db = open();
  assert.throws(() => migrate(db, { dir, log: silent }), /002/);
  assert.ok(!tables(db).includes('a'));

  fs.rmSync(path.join(dir, '003_tres.sql'));
  write('001_otra.sql', 'CREATE TABLE z (id INTEGER);');
  assert.throws(() => migrate(db, { dir, log: silent }), /duplicad/);
});

test('versiones registradas sin archivo (una versión más nueva tras un rollback) solo avisan', () => {
  baseMigrations();
  const db = open();
  migrate(db, { dir, log: silent });
  fs.rmSync(path.join(dir, '002_dos.sql'));
  const warns = [];
  const r = migrate(db, { dir, log: { info() {}, warn: (m) => warns.push(m) } });
  assert.deepEqual(r.applied, []);
  assert.equal(warns.length, 1);
  assert.match(warns[0], /002_dos/);
});

test('respaldo previo: solo si hay pendientes y la base tiene datos; se conservan los 3 más recientes (FR-007)', () => {
  write('001_uno.sql', 'CREATE TABLE sleep_records (id INTEGER PRIMARY KEY, wake_time TEXT);');
  const db = open();
  migrate(db, { dir, backupDir: backups, log: silent });
  assert.equal(fs.existsSync(backups), false, 'base nueva: sin respaldo');
  db.prepare('INSERT INTO sleep_records (wake_time) VALUES (?)').run('x');

  for (const v of ['002', '003', '004', '005']) {
    write(`${v}_m.sql`, `CREATE TABLE t${v} (id INTEGER);`);
    const r = migrate(db, { dir, backupDir: backups, log: silent });
    assert.equal(r.backup, path.join(backups, `pre-${v}.db`));
    const copy = new Database(r.backup, { readonly: true });
    assert.equal(copy.prepare('SELECT COUNT(*) AS c FROM sleep_records').get().c, 1);
    assert.equal(copy.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get().c, Number(v) - 1, 'copia tomada antes de migrar');
    copy.close();
  }
  assert.deepEqual(fs.readdirSync(backups).sort(), ['pre-003.db', 'pre-004.db', 'pre-005.db']);
});

test('respaldo repetido para la misma versión (reintento tras un fallo) sobrescribe la copia', () => {
  write('001_uno.sql', 'CREATE TABLE sleep_records (id INTEGER PRIMARY KEY, wake_time TEXT);');
  const db = open();
  migrate(db, { dir, log: silent });
  db.prepare('INSERT INTO sleep_records (wake_time) VALUES (?)').run('x');
  write('002_falla.sql', 'INSERT INTO no_existe VALUES (1);');
  assert.throws(() => migrate(db, { dir, backupDir: backups, log: silent }));
  assert.throws(() => migrate(db, { dir, backupDir: backups, log: silent }), /002_falla/, 'el segundo intento llega a migrar, no falla en el respaldo');
  assert.deepEqual(fs.readdirSync(backups), ['pre-002.db']);
});

test('si el respaldo previo no puede guardarse, no se migra (FR-008)', () => {
  write('001_uno.sql', 'CREATE TABLE sleep_records (id INTEGER PRIMARY KEY, wake_time TEXT);');
  const db = open();
  migrate(db, { dir, log: silent });
  db.prepare('INSERT INTO sleep_records (wake_time) VALUES (?)').run('x');
  write('002_dos.sql', 'CREATE TABLE b (id INTEGER);');
  fs.writeFileSync(backups, 'no soy una carpeta'); // imposible crear backups/
  assert.throws(() => migrate(db, { dir, backupDir: backups, log: silent }), (e) => e instanceof MigrationError && /respaldo/.test(e.message));
  assert.deepEqual(versions(db), [1]);
  assert.ok(!tables(db).includes('b'));
});

test('dos procesos arrancando a la vez sobre la misma base: cada versión se aplica una sola vez (FR-009)', async () => {
  const { execFile } = require('node:child_process');
  write('001_uno.sql', 'CREATE TABLE a (id INTEGER PRIMARY KEY);');
  // Migración lenta (~400 ms) para que los dos arranques se solapen
  write('002_lenta.js', `module.exports = { up(db) {
    const end = Date.now() + 400; while (Date.now() < end) {}
    db.exec('CREATE TABLE b (id INTEGER)');
  } };`);
  const file = path.join(tmp, 'shared.db');
  const script = `
    const Database = require(${JSON.stringify(require.resolve('better-sqlite3'))});
    const { migrate } = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'migrate.js'))});
    const db = new Database(process.argv[1]);
    db.pragma('busy_timeout = 5000');
    const r = migrate(db, { dir: process.argv[2], log: { info() {}, warn() {} } });
    process.stdout.write(JSON.stringify(r.applied));`;
  const run = () => new Promise((resolve, reject) =>
    execFile(process.execPath, ['-e', script, file, dir], (err, out) => (err ? reject(err) : resolve(JSON.parse(out)))));
  const [ra, rb] = await Promise.all([run(), run()]);
  assert.deepEqual([...ra, ...rb].sort(), [1, 2], 'entre los dos aplicaron cada versión exactamente una vez');
  const db = open(file);
  assert.deepEqual(versions(db), [1, 2]);
  db.close();
});
