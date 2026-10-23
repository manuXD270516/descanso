process.env.NODE_ENV = 'test';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const webpush = require('web-push');
const push = require('../src/reminders/push');

// Feature 013 (research R5, R6, R8, R17): hosts permitidos, costura de pruebas, etiquetas, textos
// exactos de los avisos y opciones del envío.
const KEYS = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
const sub = (endpoint, keys = KEYS) => ({ endpoint, keys });
const rejects = (fn) => assert.throws(fn, (e) => e.status === 400);

const vapid = webpush.generateVAPIDKeys();
const saved = { ...process.env };
beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
  process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
  process.env.VAPID_SUBJECT = 'mailto:avisos@descanso.test';
  delete process.env.PUSH_TEST_ORIGIN;
});
afterEach(() => {
  for (const k of ['NODE_ENV', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'PUSH_TEST_ORIGIN']) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
});

test('validateSubscription acepta los servicios de push de navegador conocidos', () => {
  for (const endpoint of [
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://web.push.apple.com/QAbc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://db5p.notify.windows.com/?token=abc',
  ]) {
    assert.deepEqual(push.validateSubscription(sub(endpoint)), { endpoint, p256dh: KEYS.p256dh, auth: KEYS.auth }, endpoint);
  }
});

test('validateSubscription rechaza hosts, esquemas, credenciales, puertos y tamaños no permitidos', () => {
  for (const endpoint of [
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com.evil.test/fcm/send/abc',
    'https://evil.test/fcm.googleapis.com',
    'https://127.0.0.1/push',
    'https://localhost/push',
    'http://127.0.0.1:3100/push',
    'https://user:pass@fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://notify.windows.com/x',
    `https://fcm.googleapis.com/${'x'.repeat(1030)}`,
    'no es una url',
    42,
    undefined,
  ]) rejects(() => push.validateSubscription(sub(endpoint)));
  rejects(() => push.validateSubscription());
});

test('validateSubscription rechaza claves mal formadas', () => {
  const endpoint = 'https://fcm.googleapis.com/fcm/send/abc';
  rejects(() => push.validateSubscription(sub(endpoint, { p256dh: 'B'.repeat(86), auth: KEYS.auth })));
  rejects(() => push.validateSubscription(sub(endpoint, { p256dh: `${'B'.repeat(86)}+`, auth: KEYS.auth })));
  rejects(() => push.validateSubscription(sub(endpoint, { p256dh: KEYS.p256dh, auth: 'a'.repeat(21) })));
  rejects(() => push.validateSubscription(sub(endpoint, { p256dh: KEYS.p256dh })));
  rejects(() => push.validateSubscription({ endpoint }));
});

test('costura PUSH_TEST_ORIGIN: solo con NODE_ENV=test y origen de loopback (R6, R17)', () => {
  const local = 'http://127.0.0.1:3100/push/1';
  process.env.PUSH_TEST_ORIGIN = 'http://127.0.0.1:3100';
  assert.equal(push.validateSubscription(sub(local)).endpoint, local);
  rejects(() => push.validateSubscription(sub('http://127.0.0.1:3101/push/1')), 'otro puerto no');
  rejects(() => push.validateSubscription(sub('http://localhost:3100/push/1')), 'otro host no');

  for (const env of ['production', undefined]) {
    if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
    rejects(() => push.validateSubscription(sub(local)));
    assert.equal(push.testOrigin(), null, `NODE_ENV=${env}`);
  }

  process.env.NODE_ENV = 'test';
  for (const origin of ['http://evil.test:3100', 'https://127.0.0.1:3100', 'http://10.0.0.5:3100', 'http://127.0.0.1']) {
    process.env.PUSH_TEST_ORIGIN = origin;
    assert.equal(push.testOrigin(), null, origin);
    rejects(() => push.validateSubscription(sub(`${origin}/push/1`)));
  }
});

test('con NODE_ENV=production la costura se ignora y el envío no sale al origen de pruebas', async () => {
  const hits = [];
  const server = http.createServer((req, res) => { hits.push(req.url); res.statusCode = 201; res.end(); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.PUSH_TEST_ORIGIN = `http://127.0.0.1:${server.address().port}`;
  process.env.NODE_ENV = 'production';
  try {
    const out = await push.send({ endpoint: `${process.env.PUSH_TEST_ORIGIN}/push/1`, ...KEYS }, push.payloadFor('test'), 'test');
    assert.equal(out, 'error');
    assert.deepEqual(hits, []);
  } finally {
    server.close();
  }
});

test('deviceLabel reconoce navegador y sistema, sin guardar el User-Agent', () => {
  const ua = {
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 16; HONOR 400) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36',
    firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0',
    samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
    edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    chromeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  };
  assert.equal(push.deviceLabel(ua.chromeAndroid), 'Chrome en Android');
  assert.equal(push.deviceLabel(ua.firefoxAndroid), 'Firefox en Android');
  assert.equal(push.deviceLabel(ua.samsung), 'Samsung Internet en Android');
  assert.equal(push.deviceLabel(ua.edgeWindows), 'Edge en Windows');
  assert.equal(push.deviceLabel(ua.chromeWindows), 'Chrome en Windows');
  assert.equal(push.deviceLabel(ua.safari), 'Safari en iPhone');
  for (const unknown of ['curl/8.0', '', undefined, null, 42]) assert.equal(push.deviceLabel(unknown), 'Navegador');
  for (const u of Object.values(ua)) assert.ok(push.deviceLabel(u).length <= 40);
});

test('payloadFor: textos exactos, tag, url y ningún término prohibido ni la racha (FR-022, SC-006)', () => {
  const norm = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const cases = [
    [['prepare', '2026-10-05', 45], { body: 'en 45 min es tu hora de dormir', tag: 'prepare-2026-10-05', url: '/#noche', night: '2026-10-05' }],
    [['bedtime', '2026-10-05', 30], { body: 'es tu hora de dormir', tag: 'bedtime-2026-10-05', url: '/#noche', night: '2026-10-05' }],
    [['wake_check', '2026-10-05', 30], { body: '¿ya despertaste?', tag: 'wake_check-2026-10-05', url: '/#noche-despertar', night: '2026-10-05' }],
    [['test', null, 30], { body: 'aviso de prueba', tag: 'test', url: '/#noche', night: null }],
  ];
  const terms = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'sdd', 'terminos-prohibidos.txt'), 'utf8')
    .split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean).map((t) => norm(t).replace(/\*$/, ''));
  for (const [args, want] of cases) {
    const p = push.payloadFor(...args);
    assert.deepEqual(p, { kind: args[0], title: 'Descanso', ...want });
    const text = norm(`${p.title}: ${p.body}`);
    assert.ok(!text.includes('racha') && !text.includes('constancia'), text);
    for (const t of terms) assert.ok(!text.includes(t), `${text} contiene ${t}`);
  }
  assert.equal(`${push.payloadFor('prepare', '2026-10-05', 45).title}: ${push.payloadFor('prepare', '2026-10-05', 45).body}`, 'Descanso: en 45 min es tu hora de dormir');
  assert.throws(() => push.payloadFor('otro', '2026-10-05', 30));
});

test('fingerprint: 16 hexadecimales estables del endpoint', () => {
  const f = push.fingerprint('https://fcm.googleapis.com/fcm/send/abc');
  assert.match(f, /^[0-9a-f]{16}$/);
  assert.equal(f, push.fingerprint('https://fcm.googleapis.com/fcm/send/abc'));
  assert.notEqual(f, push.fingerprint('https://fcm.googleapis.com/fcm/send/abd'));
});

test('available exige las tres variables VAPID', () => {
  assert.equal(push.available(), true);
  for (const k of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) {
    const v = process.env[k];
    delete process.env[k];
    assert.equal(push.available(), false, k);
    process.env[k] = v;
  }
});

// --- send con webpush.sendNotification simulado ---
const device = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', ...KEYS };
async function sendWith(impl, kind = 'prepare') {
  const calls = [];
  const original = webpush.sendNotification;
  webpush.sendNotification = async (...args) => { calls.push(args); return impl(...args); };
  try {
    const result = await push.send(device, push.payloadFor(kind, '2026-10-05', 30), kind);
    return { result, calls };
  } finally {
    webpush.sendNotification = original;
  }
}

test('send: TTL = ventana, topic = tipo, urgency high y timeout de 10 s', async () => {
  for (const [kind, ttl] of [['prepare', 600], ['bedtime', 600], ['wake_check', 3600], ['test', 60]]) {
    const { result, calls } = await sendWith(() => ({ statusCode: 201 }), kind);
    assert.equal(result, 'ok');
    const [subscription, body, options] = calls[0];
    assert.deepEqual(subscription, { endpoint: device.endpoint, keys: KEYS });
    assert.equal(JSON.parse(body).kind, kind);
    assert.deepEqual(options, { TTL: ttl, topic: kind, urgency: 'high', timeout: 10_000 });
  }
});

test('send: 404 y 410 → expired; timeout → timeout; 500 y red → error; nunca lanza', async () => {
  const failing = (props) => () => { throw Object.assign(new Error('fallo'), props); };
  assert.equal((await sendWith(failing({ statusCode: 410 }))).result, 'expired');
  assert.equal((await sendWith(failing({ statusCode: 404 }))).result, 'expired');
  assert.equal((await sendWith(failing({ message: 'Socket timeout' }))).result, 'timeout');
  assert.equal((await sendWith(failing({ statusCode: 500 }))).result, 'error');
  assert.equal((await sendWith(failing({ statusCode: 403 }))).result, 'error');
  assert.equal((await sendWith(failing({ code: 'ECONNRESET' }))).result, 'error');
});

test('send: un endpoint no permitido o sin VAPID no sale a la red', async () => {
  const original = webpush.sendNotification;
  let called = 0;
  webpush.sendNotification = async () => { called++; return {}; };
  try {
    assert.equal(await push.send({ endpoint: 'https://evil.test/x', ...KEYS }, push.payloadFor('test'), 'test'), 'error');
    delete process.env.VAPID_SUBJECT;
    assert.equal(await push.send(device, push.payloadFor('test'), 'test'), 'error');
    assert.equal(called, 0);
  } finally {
    webpush.sendNotification = original;
  }
});

test('send al origen de pruebas: firma VAPID y cabeceras TTL, Topic y Urgency (R17)', async () => {
  const received = [];
  const server = http.createServer((req, res) => {
    received.push({ url: req.url, headers: req.headers });
    req.resume();
    res.statusCode = req.url.endsWith('/gone') ? 410 : 201;
    res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.PUSH_TEST_ORIGIN = origin;
  const { generateKeyPairSync, randomBytes } = require('node:crypto');
  const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' });
  const p256dh = Buffer.concat([Buffer.from([4]), Buffer.from(ec.x, 'base64url'), Buffer.from(ec.y, 'base64url')]).toString('base64url');
  const keys = { p256dh, auth: randomBytes(16).toString('base64url') };
  try {
    assert.equal(await push.send({ endpoint: `${origin}/push/1`, ...keys }, push.payloadFor('test'), 'test'), 'ok');
    assert.equal(await push.send({ endpoint: `${origin}/push/gone`, ...keys }, push.payloadFor('test'), 'test'), 'expired');
    const h = received[0].headers;
    assert.equal(h.ttl, '60');
    assert.equal(h.topic, 'test');
    assert.equal(h.urgency, 'high');
    assert.match(h.authorization, /^vapid /);
  } finally {
    server.close();
  }
});
