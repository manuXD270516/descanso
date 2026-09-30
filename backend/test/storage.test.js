const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api } = require('./helpers');
const { createStorageMonitor } = require('../src/storage');

// Aviso de volumen (US4, FR-022…FR-024). statfs y el reloj se inyectan.
const fakeFs = (usedPct) => () => ({ blocks: 1000, bavail: 1000 - usedPct * 10 });
const HOUR = 60 * 60 * 1000;

function monitor(usedPct, opts = {}) {
  const warns = [];
  let t = 0;
  const status = createStorageMonitor({
    file: '/data/sleep.db',
    statfs: opts.statfs ?? fakeFs(usedPct),
    now: () => t,
    log: { warn: (m) => warns.push(m) },
  });
  return { status, warns, advance: (ms) => { t += ms; } };
}

test('por encima del 70 % → warn con el porcentaje y un aviso en el log (FR-022, FR-023)', () => {
  const m = monitor(71);
  assert.deepEqual(m.status(), { status: 'warn', used_pct: 71 });
  assert.equal(m.warns.length, 1);
  assert.match(m.warns[0], /71 %/);
  assert.doesNotMatch(m.warns[0], /\/data/, 'sin rutas internas');
});

test('el aviso se repite como máximo una vez por hora', () => {
  const m = monitor(85);
  m.status();
  m.advance(HOUR - 1);
  m.status();
  assert.equal(m.warns.length, 1);
  m.advance(1);
  m.status();
  assert.equal(m.warns.length, 2);
});

test('al 70 % o menos → ok y sin avisos', () => {
  for (const pct of [70, 69, 0]) {
    const m = monitor(pct);
    assert.deepEqual(m.status(), { status: 'ok', used_pct: pct });
    assert.equal(m.warns.length, 0);
  }
});

test('si no se puede medir → unknown, sin error', () => {
  const failing = monitor(0, { statfs: () => { throw new Error('ENOSYS'); } });
  assert.deepEqual(failing.status(), { status: 'unknown', used_pct: null });
  const empty = monitor(0, { statfs: () => ({ blocks: 0, bavail: 0 }) });
  assert.deepEqual(empty.status(), { status: 'unknown', used_pct: null });
  const memory = createStorageMonitor({ file: ':memory:', log: { warn() {} } });
  assert.deepEqual(memory(), { status: 'unknown', used_pct: null });
});

test('/api/health incluye storage y responde 200 (FR-023, FR-024)', async () => {
  const res = await api.get('/api/health').expect(200);
  assert.equal(res.body.ok, true);
  // Los tests usan una base en memoria: no hay volumen que medir
  assert.deepEqual(res.body.storage, { status: 'unknown', used_pct: null });
});
