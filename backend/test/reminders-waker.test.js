const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { startWaker } = require('../src/reminders/waker');

// Feature 013 (research R1): el disparador con temporizadores simulados.
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('tick inmediato al arrancar y uno por intervalo', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    let calls = 0;
    const waker = startWaker(async () => { calls++; }, { intervalMs: 30_000 });
    assert.equal(calls, 1, 'tick inmediato');
    await flush();
    mock.timers.tick(30_000);
    await flush();
    mock.timers.tick(30_000);
    await flush();
    assert.equal(calls, 3);
    waker.stop();
  } finally {
    mock.timers.reset();
  }
});

test('si un tick sigue en curso, el siguiente se salta', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    let calls = 0;
    let release;
    const waker = startWaker(() => { calls++; return new Promise((r) => { release = r; }); }, { intervalMs: 1000 });
    mock.timers.tick(3000); // pasan tres intervalos con el primer tick sin terminar
    await flush();
    assert.equal(calls, 1);
    release();
    await flush();
    mock.timers.tick(1000);
    await flush();
    assert.equal(calls, 2, 'al terminar, el siguiente intervalo vuelve a ejecutar');
    release();
    waker.stop();
  } finally {
    mock.timers.reset();
  }
});

test('stop() detiene los ticks', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    let calls = 0;
    const waker = startWaker(async () => { calls++; }, { intervalMs: 1000 });
    await flush();
    waker.stop();
    mock.timers.tick(5000);
    await flush();
    assert.equal(calls, 1);
  } finally {
    mock.timers.reset();
  }
});

test('un tick que lanza se registra y no detiene el disparador', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try {
    let calls = 0;
    const waker = startWaker(async () => { calls++; throw new Error('boom'); }, { intervalMs: 1000 });
    await flush();
    mock.timers.tick(1000);
    await flush();
    assert.equal(calls, 2);
    assert.ok(logged.length >= 2 && logged[0].includes('boom'));
    waker.stop();
  } finally {
    console.error = original;
    mock.timers.reset();
  }
});
