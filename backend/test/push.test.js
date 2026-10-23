const { test, before, beforeEach, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const webpush = require('web-push');
const { api, otherApi, anon, app, db, OTHER_ID } = require('./helpers');
const { createSession } = require('../src/auth/sessions');

// Feature 013: rutas de /api/push (dispositivos, preferencias, aviso de prueba).
const KEYS = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 16; HONOR 400) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36';
const vapid = webpush.generateVAPIDKeys();
const saved = {};

let n = 0;
const body = (extra = {}) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/dev${++n}`, keys: KEYS, ...extra });
const setZone = (id, tz) => db.prepare('UPDATE users SET timezone = ? WHERE id = ?').run(tz, id);
const zoneOf = (id) => db.prepare('SELECT timezone FROM users WHERE id = ?').get(id).timezone;
const count = (id) => db.prepare('SELECT COUNT(*) AS c FROM push_subscriptions WHERE user_id = ?').get(id).c;

before(() => {
  for (const k of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) saved[k] = process.env[k];
  process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
  process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
  process.env.VAPID_SUBJECT = 'mailto:avisos@descanso.test';
});
after(() => {
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
beforeEach(() => {
  db.exec('DELETE FROM push_subscriptions; DELETE FROM reminder_deliveries;');
  db.exec('UPDATE user_settings SET push_prepare = 1, push_bedtime = 1, push_wake_check = 1, dnd_start_min = NULL, dnd_end_min = NULL, muted_until = NULL');
  setZone(1, null);
  setZone(OTHER_ID, null);
});

/** `webpush.sendNotification` simulado: anota las llamadas y responde con `impl`. */
async function withSend(impl, fn) {
  const calls = [];
  const original = webpush.sendNotification;
  webpush.sendNotification = async (...args) => { calls.push(args); return impl(...args); };
  try { await fn(calls); } finally { webpush.sendNotification = original; }
}
const failing = (props) => () => { throw Object.assign(new Error('fallo'), props); };

// --- Dispositivos (US1) ---

test('GET /api/push: sin dispositivos devuelve la clave pública, los valores por defecto y no expone credenciales', async () => {
  const res = await api.get('/api/push').expect(200);
  assert.deepEqual(res.body, {
    available: true,
    public_key: vapid.publicKey,
    timezone: null,
    preferences: { kinds: { prepare: true, bedtime: true, wake_check: true }, dnd: null, muted_until: null },
    devices: [],
  });
});

test('sin credenciales VAPID: available false, public_key null y las escrituras responden 503', async () => {
  const original = process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  try {
    const res = await api.get('/api/push').expect(200);
    assert.equal(res.body.available, false);
    assert.equal(res.body.public_key, null);
    const post = await api.post('/api/push/subscriptions').send(body({ timezone: 'Europe/Madrid' })).expect(503);
    assert.equal(post.body.error, 'Los avisos no están disponibles');
    await api.post('/api/push/subscriptions/1/test').expect(503);
  } finally {
    process.env.VAPID_PRIVATE_KEY = original;
  }
});

test('POST /api/push/subscriptions: 201 con la etiqueta del User-Agent; repetir el endpoint no duplica; la lista no expone endpoint ni claves', async () => {
  setZone(1, 'Europe/Madrid');
  const sub = body();
  const res = await api.post('/api/push/subscriptions').set('User-Agent', CHROME_ANDROID).send(sub).expect(201);
  assert.equal(res.body.label, 'Chrome en Android');
  assert.match(res.body.fingerprint, /^[0-9a-f]{16}$/);
  assert.deepEqual(Object.keys(res.body).sort(), ['created_at', 'fingerprint', 'id', 'label']);
  const again = await api.post('/api/push/subscriptions').set('User-Agent', CHROME_ANDROID).send(sub).expect(201);
  assert.equal(again.body.id, res.body.id);
  assert.equal(count(1), 1);
  const list = (await api.get('/api/push').expect(200)).body;
  assert.equal(list.devices.length, 1);
  const text = JSON.stringify(list);
  assert.ok(!text.includes('endpoint') && !text.includes(sub.endpoint) && !text.includes(KEYS.p256dh) && !text.includes(KEYS.auth));
  assert.ok(!JSON.stringify(res.body).includes('user_id'));
});

test('el dispositivo queda ligado a la sesión que lo activó', async () => {
  setZone(1, 'Europe/Madrid');
  await api.post('/api/push/subscriptions').send(body()).expect(201);
  const { session_hash } = db.prepare('SELECT session_hash FROM push_subscriptions').get();
  const { sha256 } = require('../src/auth/sessions');
  assert.equal(session_hash, sha256(require('./helpers').sessionId));
});

test('host no permitido, claves mal formadas o campos extra → 400', async () => {
  setZone(1, 'Europe/Madrid');
  const bad = await api.post('/api/push/subscriptions').send(body({ endpoint: 'https://evil.test/push' })).expect(400);
  assert.equal(bad.body.error, 'Este navegador no usa un servicio de avisos compatible');
  await api.post('/api/push/subscriptions').send(body({ endpoint: 'http://fcm.googleapis.com/x' })).expect(400);
  const keys = await api.post('/api/push/subscriptions').send(body({ keys: { p256dh: 'corta', auth: KEYS.auth } })).expect(400);
  assert.equal(keys.body.error, 'Datos del dispositivo no válidos');
  await api.post('/api/push/subscriptions').send({ endpoint: body().endpoint }).expect(400);
  await api.post('/api/push/subscriptions').send(body({ extra: 1 })).expect(400);
  assert.equal(count(1), 0);
});

test('el sexto dispositivo → 409; reactivar uno que ya tengo no cuenta como sexto', async () => {
  setZone(1, 'Europe/Madrid');
  const subs = Array.from({ length: 5 }, () => body());
  for (const s of subs) await api.post('/api/push/subscriptions').send(s).expect(201);
  const sixth = await api.post('/api/push/subscriptions').send(body()).expect(409);
  assert.equal(sixth.body.error, 'Ya tienes 5 dispositivos con avisos; quita uno para añadir este');
  await api.post('/api/push/subscriptions').send(subs[2]).expect(201);
  assert.equal(count(1), 5);
});

test('el mismo endpoint activado por otra persona pasa a ser suyo y desaparece de la lista de la primera', async () => {
  setZone(1, 'Europe/Madrid');
  setZone(OTHER_ID, 'Europe/Madrid');
  const shared = body();
  await api.post('/api/push/subscriptions').send(shared).expect(201);
  await otherApi.post('/api/push/subscriptions').send(shared).expect(201);
  assert.equal((await api.get('/api/push').expect(200)).body.devices.length, 0);
  assert.equal((await otherApi.get('/api/push').expect(200)).body.devices.length, 1);
  assert.equal(count(1) + count(OTHER_ID), 1);
});

test('zona horaria: sin zona en el perfil se pide y se guarda; con zona fijada se ignora; una desconocida → 400', async () => {
  const missing = await api.post('/api/push/subscriptions').send(body()).expect(400);
  assert.equal(missing.body.error, 'Indica tu zona horaria para activar los avisos');
  await api.post('/api/push/subscriptions').send(body({ timezone: 'Mordor/Barad-dur' })).expect(400);
  assert.equal(zoneOf(1), null);
  await api.post('/api/push/subscriptions').send(body({ timezone: 'America/Santiago' })).expect(201);
  assert.equal(zoneOf(1), 'America/Santiago');
  await api.post('/api/push/subscriptions').send(body({ timezone: 'Asia/Tokyo' })).expect(201);
  assert.equal(zoneOf(1), 'America/Santiago', 'la del perfil manda');
  assert.equal((await api.get('/api/push').expect(200)).body.timezone, 'America/Santiago');
  // Con la zona del perfil, la petición no necesita traerla
  await api.post('/api/push/subscriptions').send(body()).expect(201);
});

test('DELETE /api/push/subscriptions/:id: 204; el de otra persona o inexistente → 404 y sigue ahí', async () => {
  setZone(1, 'Europe/Madrid');
  setZone(OTHER_ID, 'Europe/Madrid');
  const mine = (await api.post('/api/push/subscriptions').send(body()).expect(201)).body;
  const theirs = (await otherApi.post('/api/push/subscriptions').send(body()).expect(201)).body;
  await api.delete(`/api/push/subscriptions/${theirs.id}`).expect(404);
  await api.delete('/api/push/subscriptions/999999').expect(404);
  await api.delete('/api/push/subscriptions/abc').expect(404);
  assert.equal(count(OTHER_ID), 1);
  await api.delete(`/api/push/subscriptions/${mine.id}`).expect(204);
  assert.equal(count(1), 0);
});

test('cerrar sesión borra el dispositivo de esa sesión y no el de otra sesión de la misma persona', async () => {
  setZone(1, 'Europe/Madrid');
  const second = supertest.agent(app).set('Cookie', `sid=${createSession(db, 1)}`).set('Sec-Fetch-Site', 'same-origin');
  const keep = (await api.post('/api/push/subscriptions').send(body()).expect(201)).body;
  await second.post('/api/push/subscriptions').send(body()).expect(201);
  assert.equal(count(1), 2);
  await second.post('/api/auth/logout').expect(204);
  assert.deepEqual(db.prepare('SELECT id FROM push_subscriptions').all().map((r) => r.id), [keep.id]);
});

test('sin sesión → 401 y una escritura sin origen propio → 403 (CSRF)', async () => {
  await anon.get('/api/push').expect(401);
  await anon.put('/api/push/preferences').send({}).expect(401);
  await anon.post('/api/push/subscriptions').send(body()).expect(401);
  await anon.delete('/api/push/subscriptions/1').expect(401);
  await anon.post('/api/push/subscriptions/1/test').expect(401);
  const { sessionId } = require('./helpers');
  for (const [method, url] of [['post', '/api/push/subscriptions'], ['put', '/api/push/preferences'], ['delete', '/api/push/subscriptions/1'], ['post', '/api/push/subscriptions/1/test']]) {
    await supertest(app)[method](url).set('Cookie', `sid=${sessionId}`).set('Sec-Fetch-Site', 'cross-site').send({}).expect(403);
  }
});

// --- Preferencias (US3, US5) ---

test('PUT /api/push/preferences: cambia solo los tipos enviados', async () => {
  const res = await api.put('/api/push/preferences').send({ kinds: { prepare: false } }).expect(200);
  assert.deepEqual(res.body, { kinds: { prepare: false, bedtime: true, wake_check: true }, dnd: null, muted_until: null });
  const more = await api.put('/api/push/preferences').send({ kinds: { wake_check: false } }).expect(200);
  assert.deepEqual(more.body.kinds, { prepare: false, bedtime: true, wake_check: false });
  assert.deepEqual((await api.get('/api/push').expect(200)).body.preferences.kinds, { prepare: false, bedtime: true, wake_check: false });
  await api.put('/api/push/preferences').send({}).expect(200);
});

test('tipos no booleanos, desconocidos o campos extra → 400; las preferencias son por persona', async () => {
  for (const kinds of [{ prepare: 'no' }, { prepare: 1 }, { otro: true }, [], 'x', null]) {
    await api.put('/api/push/preferences').send({ kinds }).expect(400);
  }
  await api.put('/api/push/preferences').send({ extra: true }).expect(400);
  await api.put('/api/push/preferences').send({ mute_today: 'si' }).expect(400);
  await api.put('/api/push/preferences').send({ kinds: { bedtime: false } }).expect(200);
  assert.equal((await otherApi.get('/api/push').expect(200)).body.preferences.kinds.bedtime, true);
});

test('"No molestar": se guarda, se desactiva con null y rechaza franjas incompletas, fuera de rango o iguales', async () => {
  const set = await api.put('/api/push/preferences').send({ dnd: { start_min: 1380, end_min: 420 } }).expect(200);
  assert.deepEqual(set.body.dnd, { start_min: 1380, end_min: 420 });
  assert.deepEqual((await api.get('/api/push').expect(200)).body.preferences.dnd, { start_min: 1380, end_min: 420 });
  assert.equal((await api.put('/api/push/preferences').send({ dnd: null }).expect(200)).body.dnd, null);
  for (const dnd of [{ start_min: 1380 }, { end_min: 420 }, { start_min: 1440, end_min: 0 }, { start_min: -1, end_min: 10 }, { start_min: 600, end_min: 600 }, { start_min: 1.5, end_min: 10 }, { start_min: '600', end_min: 700 }, {}]) {
    const bad = await api.put('/api/push/preferences').send({ dnd }).expect(400);
    assert.equal(bad.body.error, 'La franja de No molestar necesita inicio y fin distintos');
  }
  assert.equal((await api.get('/api/push').expect(200)).body.preferences.dnd, null);
});

test('"Silenciar hoy" fija muted_until = hoy de la persona (también cerca de medianoche) y deshacer lo vacía', async () => {
  setZone(1, 'Europe/Madrid');
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-05T22:30:00Z') }); // en Madrid ya es el 6 a las 00:30
  try {
    assert.equal((await api.put('/api/push/preferences').send({ mute_today: true }).expect(200)).body.muted_until, '2026-10-06');
    setZone(1, 'America/Santiago'); // 19:30 del 5 en Santiago (-03:00)
    assert.equal((await api.put('/api/push/preferences').send({ mute_today: true }).expect(200)).body.muted_until, '2026-10-05');
  } finally {
    mock.timers.reset();
  }
  assert.equal((await api.get('/api/push').expect(200)).body.preferences.muted_until, '2026-10-05');
  assert.equal((await api.put('/api/push/preferences').send({ mute_today: false }).expect(200)).body.muted_until, null);
});

test('"Silenciar hoy" sin zona horaria en el perfil → 400', async () => {
  await api.put('/api/push/preferences').send({ mute_today: true }).expect(400);
});

// --- Aviso de prueba (US4) ---

test('aviso de prueba: sent con la carga test y TTL 60, aunque haya "No molestar" y "Silenciar hoy" (FR-020)', async () => {
  setZone(1, 'Europe/Madrid');
  const device = (await api.post('/api/push/subscriptions').send(body()).expect(201)).body;
  await api.put('/api/push/preferences').send({ dnd: { start_min: 0, end_min: 1439 }, mute_today: true }).expect(200);
  await withSend(() => ({ statusCode: 201 }), async (calls) => {
    const res = await api.post(`/api/push/subscriptions/${device.id}/test`).expect(200);
    assert.deepEqual(res.body, { result: 'sent' });
    const [, payload, options] = calls[0];
    assert.deepEqual(JSON.parse(payload), { kind: 'test', night: null, title: 'Descanso', body: 'aviso de prueba', tag: 'test', url: '/#noche' });
    assert.equal(options.TTL, 60);
    assert.equal(options.topic, 'test');
  });
  assert.ok(db.prepare('SELECT last_success_at FROM push_subscriptions WHERE id = ?').get(device.id).last_success_at);
});

test('aviso de prueba: 410 → expired y el dispositivo ya no está; timeout → failed', async () => {
  setZone(1, 'Europe/Madrid');
  const gone = (await api.post('/api/push/subscriptions').send(body()).expect(201)).body;
  await withSend(failing({ statusCode: 410 }), async () => {
    assert.deepEqual((await api.post(`/api/push/subscriptions/${gone.id}/test`).expect(200)).body, { result: 'expired' });
  });
  assert.equal(count(1), 0);
  assert.equal((await api.get('/api/push').expect(200)).body.devices.length, 0);
  const slow = (await api.post('/api/push/subscriptions').send(body()).expect(201)).body;
  await withSend(failing({ message: 'Socket timeout' }), async () => {
    assert.deepEqual((await api.post(`/api/push/subscriptions/${slow.id}/test`).expect(200)).body, { result: 'failed' });
  });
  assert.equal(count(1), 1, 'un fallo que no es 404/410 no borra el dispositivo');
});

test('aviso de prueba: de otra persona → 404 sin enviar; el cuarto intento en un minuto → 429 (cuentan todos)', async () => {
  setZone(1, 'Europe/Madrid');
  setZone(OTHER_ID, 'Europe/Madrid');
  const a = (await api.post('/api/push/subscriptions').send(body()).expect(201)).body;
  const b = (await otherApi.post('/api/push/subscriptions').send(body()).expect(201)).body;
  await withSend(() => ({ statusCode: 201 }), async (calls) => {
    await otherApi.post(`/api/push/subscriptions/${a.id}/test`).expect(404); // intento 1 de B
    assert.equal(calls.length, 0);
    await otherApi.post(`/api/push/subscriptions/${b.id}/test`).expect(200); // 2
    await otherApi.post(`/api/push/subscriptions/${b.id}/test`).expect(200); // 3
    const limited = await otherApi.post(`/api/push/subscriptions/${b.id}/test`).expect(429); // 4
    assert.equal(limited.body.error, 'Espera un momento antes de probar otra vez');
    assert.ok(Number(limited.headers['retry-after']) > 0);
    assert.equal(calls.length, 2);
  });
});
