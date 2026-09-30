const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbFile = path.join(os.tmpdir(), `descanso-persistence-${process.pid}.db`);
const dbModule = path.join(__dirname, '..', 'src', 'db.js');

/** Ejecuta un script en un proceso Node nuevo contra el mismo archivo SQLite (un "arranque"). */
function run(body) {
  const script = `const db = require(${JSON.stringify(dbModule)});\n${body}`;
  const out = execFileSync(process.execPath, ['-e', script], { env: { ...process.env, DB_PATH: dbFile }, encoding: 'utf8' });
  // La última línea es el JSON; antes puede aparecer el log de migraciones
  const last = out.trim().split('\n').pop();
  return last ? JSON.parse(last) : null;
}

const READ_ALL = `process.stdout.write(JSON.stringify({
  sleep: db.prepare('SELECT * FROM sleep_records ORDER BY id').all(),
  naps: db.prepare('SELECT * FROM naps ORDER BY id').all(),
  metrics: db.prepare('SELECT * FROM metrics ORDER BY id').all(),
  entries: db.prepare('SELECT * FROM metric_entries ORDER BY id').all(),
}));`;

after(() => {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbFile + suffix, { force: true });
});

test('los datos sobreviven a un reinicio y las métricas iniciales no se duplican (US6-1, US6-3)', () => {
  const before = run(`
    db.prepare("INSERT INTO sleep_records (date, bedtime, wake_time, notes) VALUES ('2026-09-07','2026-09-07T23:40:00-04:00','2026-09-08T07:10:00-04:00','ok')").run();
    db.prepare("INSERT INTO naps (date, start_time, end_time) VALUES ('2026-09-08','2026-09-08T14:00:00-04:00','2026-09-08T14:30:00-04:00')").run();
    db.prepare("INSERT INTO metric_entries (metric_id, date, value) VALUES (1,'2026-09-08','4')").run();
    ${READ_ALL}
  `);
  assert.equal(before.sleep.length, 1);
  assert.equal(before.naps.length, 1);
  assert.equal(before.entries.length, 1);
  assert.equal(before.metrics.length, 3);

  // Segundo arranque: mismo archivo, proceso nuevo
  const afterRestart = run(READ_ALL);
  assert.deepEqual(afterRestart, before);
  assert.equal(afterRestart.metrics.length, 3);
});
