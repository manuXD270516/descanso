const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Feature 013 (research R11, contracts/service-worker.md): el service worker en un contexto `vm` con
// `self`, `clients` y `registration` simulados.
const FILE = path.join(__dirname, '..', '..', 'frontend', 'public', 'push-sw.js');
const source = fs.readFileSync(FILE, 'utf8');

function load({ windows = [], openWindow } = {}) {
  const handlers = {};
  const shown = [];
  const opened = [];
  const messages = [];
  const log = { shown, opened, messages, claimed: 0, skipped: 0 };
  const self = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => { log.skipped++; },
  };
  const clientsApi = {
    matchAll: async (opts) => { log.matchOptions = opts; return windows; },
    openWindow: async (url) => { opened.push(url); return openWindow; },
    claim: async () => { log.claimed++; },
  };
  const registration = { showNotification: async (title, options) => { shown.push({ title, options }); } };
  vm.runInNewContext(source, { self, clients: clientsApi, registration }, { filename: 'push-sw.js' });
  /** Dispara un evento y espera a lo que registró con waitUntil. */
  async function fire(type, event) {
    let pending;
    await handlers[type]({ ...event, waitUntil: (p) => { pending = p; } });
    await pending;
  }
  return { handlers, log, fire, messages };
}

// Los objetos creados dentro del `vm` tienen otro prototipo: se comparan como JSON
const plain = (v) => JSON.parse(JSON.stringify(v));
const win = (visibilityState, extra = {}) => {
  const calls = [];
  return { visibilityState, calls, postMessage: (m) => calls.push(['postMessage', m]), focus: async () => { calls.push(['focus']); }, navigate: async (u) => { calls.push(['navigate', u]); }, ...extra };
};
const pushEvent = (obj) => ({ data: { json: () => { if (obj === undefined) throw new Error('vacía'); return obj; } } });
const PAYLOAD = { kind: 'bedtime', night: '2026-10-05', title: 'Descanso', body: 'es tu hora de dormir', tag: 'bedtime-2026-10-05', url: '/#noche' };

test('no registra manejador fetch: no intercepta nada ni cachea', () => {
  const sw = load();
  assert.deepEqual(Object.keys(sw.handlers).sort(), ['activate', 'install', 'notificationclick', 'push']);
  assert.ok(!/addEventListener\(\s*['"]fetch['"]/.test(source));
  assert.ok(!/caches\./.test(source));
});

test('push sin ventana visible: muestra la notificación con título, cuerpo, tag, icono y url', async () => {
  const sw = load({ windows: [win('hidden')] });
  await sw.fire('push', pushEvent(PAYLOAD));
  assert.deepEqual(plain(sw.log.shown), [{ title: 'Descanso', options: { icon: '/favicon.ico', body: 'es tu hora de dormir', tag: 'bedtime-2026-10-05', data: { url: '/#noche' } } }]);
  const none = load({ windows: [] });
  await none.fire('push', pushEvent(PAYLOAD));
  assert.equal(none.log.shown.length, 1);
  assert.deepEqual(plain(none.log.matchOptions), { type: 'window', includeUncontrolled: true });
});

test('push con una ventana visible: la avisa con postMessage y no muestra notificación (FR-019)', async () => {
  const visible = win('visible');
  const sw = load({ windows: [win('hidden'), visible] });
  await sw.fire('push', pushEvent(PAYLOAD));
  assert.deepEqual(plain(visible.calls), [['postMessage', { type: 'descanso-push', ...PAYLOAD }]]);
  assert.deepEqual(plain(sw.log.shown), []);
});

test('push con carga ilegible: aviso genérico "Descanso"', async () => {
  for (const windows of [[], [win('visible')]]) {
    const sw = load({ windows });
    await sw.fire('push', pushEvent(undefined));
    assert.deepEqual(plain(sw.log.shown), [{ title: 'Descanso', options: { icon: '/favicon.ico' } }]);
  }
  const noData = load();
  await noData.fire('push', {});
  assert.equal(noData.log.shown[0].title, 'Descanso');
});

test('notificationclick con una ventana abierta: la enfoca y la navega a la url (la misma pestaña)', async () => {
  const open = win('hidden');
  const sw = load({ windows: [open] });
  let closed = 0;
  await sw.fire('notificationclick', { notification: { close: () => { closed++; }, data: { url: '/#noche-despertar' } } });
  assert.equal(closed, 1);
  assert.deepEqual(plain(open.calls), [['focus'], ['navigate', '/#noche-despertar']]);
  assert.deepEqual(sw.log.opened, []);
});

test('notificationclick sin ventanas: abre una con la url del aviso; sin url, /#noche', async () => {
  const sw = load({ windows: [] });
  await sw.fire('notificationclick', { notification: { close() {}, data: { url: '/#noche-despertar' } } });
  await sw.fire('notificationclick', { notification: { close() {}, data: undefined } });
  assert.deepEqual(sw.log.opened, ['/#noche-despertar', '/#noche']);
});

test('una ventana que no se puede navegar se queda enfocada sin fallar', async () => {
  const stuck = win('hidden', { navigate: async () => { throw new Error('sin controlar'); } });
  const sw = load({ windows: [stuck] });
  await sw.fire('notificationclick', { notification: { close() {}, data: { url: '/#noche' } } });
  assert.deepEqual(plain(stuck.calls), [['focus']]);
  assert.deepEqual(sw.log.opened, []);
});

test('install toma el control sin esperar y activate reclama las pestañas abiertas', async () => {
  const sw = load();
  await sw.fire('install', {});
  await sw.fire('activate', {});
  assert.equal(sw.log.skipped, 1);
  assert.equal(sw.log.claimed, 1);
});
