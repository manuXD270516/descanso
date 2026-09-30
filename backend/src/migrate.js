// Runner de migraciones versionadas (feature 003). Contrato: specs/003-fundaciones-datos/contracts/migraciones.md
//
// Es síncrono a propósito: db.js lo ejecuta antes de exportar la conexión, así que la app no
// atiende ninguna petición hasta que el esquema está al día.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DIR = path.join(__dirname, 'migrations');
const FILE_RE = /^(\d{3})_([a-z0-9_]+)\.(sql|js)$/;
const KEEP_BACKUPS = 3;

class MigrationError extends Error {}

/** SHA-256 del contenido, sin BOM y con finales de línea \n (misma huella en Windows y Linux). */
const checksum = (content) =>
  crypto.createHash('sha256').update(content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')).digest('hex');

const pad3 = (n) => String(n).padStart(3, '0');

function readMigrations(dir) {
  const list = fs
    .readdirSync(dir)
    .map((file) => ({ file, m: FILE_RE.exec(file) }))
    .filter((x) => x.m)
    .map(({ file, m }) => {
      const full = path.join(dir, file);
      const content = fs.readFileSync(full, 'utf8');
      return { version: Number(m[1]), name: file.replace(/\.(sql|js)$/, ''), ext: m[3], full, content, checksum: checksum(content) };
    })
    .sort((a, b) => a.version - b.version);

  list.forEach((m, i) => {
    if (i > 0 && m.version === list[i - 1].version) {
      throw new MigrationError(`Versión de migración duplicada: ${list[i - 1].name} y ${m.name}`);
    }
    if (m.version !== i + 1) throw new MigrationError(`Falta la migración ${pad3(i + 1)} (hay un hueco antes de ${m.name})`);
  });
  return list;
}

/** Copia completa y consistente antes de migrar; conserva solo las KEEP_BACKUPS más recientes. */
function backupBefore(db, backupDir, version) {
  const file = path.join(backupDir, `pre-${pad3(version)}.db`);
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.rmSync(file, { force: true }); // VACUUM INTO no sobrescribe; un reintento repite la copia
    db.prepare('VACUUM INTO ?').run(file);
  } catch (e) {
    throw new MigrationError(`No se pudo guardar el respaldo previo a la migración ${pad3(version)} en ${backupDir}: ${e.message}. No se migró nada.`);
  }
  const old = fs
    .readdirSync(backupDir)
    .filter((f) => /^pre-\d{3}\.db$/.test(f))
    .sort()
    .reverse()
    .slice(KEEP_BACKUPS);
  for (const f of old) fs.rmSync(path.join(backupDir, f), { force: true });
  return file;
}

const hasTable = (db, name) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);

function migrate(db, { dir = DEFAULT_DIR, backupDir = null, log = console } = {}) {
  const files = readMigrations(dir);
  // Se lee el historial sin crear nada todavía: el respaldo previo debe ser una copia exacta
  const applied = new Map(
    hasTable(db, 'schema_migrations')
      ? db.prepare('SELECT version, name, checksum FROM schema_migrations').all().map((r) => [r.version, r])
      : [],
  );

  for (const m of files) {
    const a = applied.get(m.version);
    if (a && a.checksum !== m.checksum) {
      throw new MigrationError(`La migración ${m.name} cambió después de aplicarse (checksum distinto). Restaura el archivo original.`);
    }
  }
  for (const [version, a] of applied) {
    if (!files.some((m) => m.version === version)) {
      log.warn(`[migraciones] la base tiene aplicada ${a.name}, que no existe en esta versión (¿rollback?); se ignora`);
    }
  }

  const pending = files.filter((m) => !applied.has(m.version));
  if (!pending.length) return { applied: [], backup: null };

  const backup = backupDir && hasTable(db, 'sleep_records') ? backupBefore(db, backupDir, pending[0].version) : null;

  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const done = [];
  const isApplied = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?');
  const record = db.prepare('INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?,?,?,?)');
  for (const m of pending) {
    const run = db.transaction(() => {
      if (isApplied.get(m.version)) return false; // otro proceso la aplicó mientras esperábamos
      if (m.ext === 'sql') db.exec(m.content);
      else require(m.full).up(db);
      record.run(m.version, m.name, m.checksum, new Date().toISOString());
      return true;
    });
    try {
      if (run.immediate()) done.push(m.version);
    } catch (e) {
      throw new MigrationError(`La migración ${m.name} falló y se deshizo: ${e.message}`, { cause: e });
    }
  }

  if (done.length) log.info(`[migraciones] aplicadas: ${done.join(', ')}${backup ? ` (respaldo previo: ${path.basename(backup)})` : ''}`);
  return { applied: done, backup };
}

module.exports = { migrate, checksum, MigrationError };
