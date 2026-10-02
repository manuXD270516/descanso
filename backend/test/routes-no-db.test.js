const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Feature 008 (research R1): las rutas no consultan la base directamente; todo dato de usuario pasa
// por backend/src/repo, que exige el userId. Excepciones justificadas: auth y admin (identidad y
// respaldo, no datos de usuario).
const ALLOWED = new Set(['auth.js', 'admin.js']);
const dir = path.join(__dirname, '..', 'src', 'routes');

test('ninguna ruta de datos usa db.prepare / db.exec ni importa ../db', () => {
  const offenders = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js') && !ALLOWED.has(f))
    .filter((f) => /\bdb\.(prepare|exec|transaction)\b|require\(['"]\.\.\/db['"]\)/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.deepEqual(offenders, []);
});

test('toda función de repo exige userId', () => {
  const { requireUser } = require('../src/repo/scope');
  for (const bad of [undefined, null, 0, -1, '1', 1.5]) assert.throws(() => requireUser(bad), /userId obligatorio/);
  assert.equal(requireUser(3), 3);
  const sleep = require('../src/repo/sleep');
  assert.throws(() => sleep.list(undefined), /userId obligatorio/);
});
