const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('./helpers');
const repo = require('../src/repo/push');
const scheduleRepo = require('../src/repo/schedule');
const sleepRepo = require('../src/repo/sleep');
const { runTick, status, resetState, insideDnd } = require('../src/reminders/tick');

// Feature 013 (research R4, R7, R13): el tick con reloj falso y `send` simulado.
const MADRID = 'Europe/Madrid';
const at = (iso) => Date.parse(iso);
const LONG_AGO = '2026-10-01T00:00:00.000Z';

let seq = 0;
function newUser(timezone = MADRID, { bed = 1395, wake = 420, lead = 30 } = {}) {
  const id = Number(db.prepare("INSERT INTO users (email, password_hash, role, display_name, timezone, created_at) VALUES (?, 'x', 'user', 'T', ?, 'x')")
    .run(`tick${++seq}@descanso.test`, timezone).lastInsertRowid);
  db.prepare('INSERT INTO user_settings (user_id, lead_min, updated_at) VALUES (?, ?, ?)').run(id, lead, 'x');
  if (bed !== null) {
    scheduleRepo.save(id, '2026-09-01', [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, bed_min: bed, wake_min: wake, active: weekday >= 1 && weekday <= 5 })));
  }
  return id;
}

function addDevice(userId, name = 'a', { created = LONG_AGO, expires = '2099-01-01T00:00:00.000Z' } = {}) {
  const hash = `t-${userId}-${name}`;
  db.prepare("INSERT INTO sessions (id_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, 'x', 'x', ?)").run(hash, userId, expires);
  const endpoint = `https://fcm.googleapis.com/fcm/send/u${userId}-${name}`;
  db.prepare('INSERT INTO push_subscriptions (user_id, session_hash, endpoint, p256dh, auth, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(userId, hash, endpoint, 'k', 'a', 'Chrome en Android', created);
  return endpoint;
}

const deliveries = (userId) => db.prepare('SELECT kind, night_date, status, reason FROM reminder_deliveries WHERE user_id = ? ORDER BY due_at, kind').all(userId);
const devicesOf = (userId) => db.prepare('SELECT endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY id').all(userId).map((r) => r.endpoint);

/** `send` simulado que anota las llamadas y responde según el endpoint (por defecto 'ok'). */
function fakeSend(results = {}, { delay = 0 } = {}) {
  const calls = [];
  let inFlight = 0;
  const stats = { max: 0 };
  const send = async (device, payload, kind) => {
    calls.push({ endpoint: device.endpoint, payload, kind });
    inFlight++;
    stats.max = Math.max(stats.max, inFlight);
    if (delay) await new Promise((r) => setTimeout(r, delay));
    inFlight--;
    return results[device.endpoint] ?? 'ok';
  };
  return { send, calls, stats };
}

beforeEach(() => {
  db.exec('DELETE FROM push_subscriptions; DELETE FROM reminder_deliveries; DELETE FROM sleep_records; DELETE FROM pauses; DELETE FROM schedule_versions;');
  db.exec("DELETE FROM sessions WHERE id_hash LIKE 't-%'");
  db.exec('DELETE FROM users WHERE email LIKE \'tick%\'');
  db.exec('UPDATE user_settings SET push_prepare = 1, push_bedtime = 1, push_wake_check = 1, dnd_start_min = NULL, dnd_end_min = NULL, muted_until = NULL');
  resetState();
});

const MON_2246 = at('2026-10-05T22:46:00+02:00');

test('exactamente una vez (SC-002): ticks concurrentes, repetidos y tras "reiniciar" no duplican el aviso', async () => {
  const user = newUser();
  addDevice(user, 'a');
  addDevice(user, 'b');
  const s = fakeSend();
  await Promise.all([runTick({ now: MON_2246, send: s.send }), runTick({ now: MON_2246, send: s.send })]);
  assert.equal(s.calls.length, 2, 'un envío por dispositivo');
  assert.deepEqual(s.calls.map((c) => c.kind), ['prepare', 'prepare']);
  assert.deepEqual(deliveries(user), [{ kind: 'prepare', night_date: '2026-10-05', status: 'sent', reason: null }]);
  await runTick({ now: MON_2246 + 5000, send: s.send });
  resetState(); // un reinicio del proceso o un despliegue
  await runTick({ now: MON_2246 + 10_000, send: s.send });
  assert.equal(s.calls.length, 2);
});

test('la carga es la del tipo, con la noche y el aviso de la persona (FR-008, FR-022)', async () => {
  const user = newUser(MADRID, { lead: 45 });
  addDevice(user);
  const s = fakeSend();
  await runTick({ now: at('2026-10-05T22:30:30+02:00'), send: s.send });
  assert.equal(s.calls[0].payload.body, 'en 45 min es tu hora de dormir');
  assert.equal(s.calls[0].payload.tag, 'prepare-2026-10-05');
  assert.equal(s.calls[0].payload.url, '/#noche');
});

test('recuperación (SC-003, FR-011): lo que sigue en ventana se envía y lo demás se descarta, sin enviarse nunca', async () => {
  const user = newUser();
  addDevice(user);
  // Sin ticks de 22:40 a 22:50: el prepare de las 22:45 aún está en ventana
  let s = fakeSend();
  await runTick({ now: at('2026-10-05T22:40:00+02:00'), send: s.send });
  assert.equal(s.calls.length, 0);
  await runTick({ now: at('2026-10-05T22:50:00+02:00'), send: s.send });
  assert.deepEqual(s.calls.map((c) => c.kind), ['prepare']);
  await runTick({ now: at('2026-10-05T23:15:10+02:00'), send: s.send });
  assert.deepEqual(s.calls.map((c) => c.kind), ['prepare', 'bedtime'], 'el bedtime llega a su hora');

  // Sin ticks de 22:40 a 23:00 (otro día): el prepare queda descartado y nunca se envía
  db.exec('DELETE FROM reminder_deliveries');
  s = fakeSend();
  await runTick({ now: at('2026-10-06T22:40:00+02:00'), send: s.send });
  await runTick({ now: at('2026-10-06T23:00:00+02:00'), send: s.send });
  assert.equal(s.calls.length, 0);
  assert.deepEqual(deliveries(user).filter((d) => d.night_date === '2026-10-06'), [{ kind: 'prepare', night_date: '2026-10-06', status: 'skipped', reason: 'late' }]);
  await runTick({ now: at('2026-10-06T23:16:00+02:00'), send: s.send });
  assert.deepEqual(s.calls.map((c) => c.kind), ['bedtime']);
});

test('con 3 min caído se envía todo lo que sigue en ventana y se descarta el resto', async () => {
  const user = newUser();
  addDevice(user);
  const s = fakeSend();
  await runTick({ now: at('2026-10-05T23:12:00+02:00'), send: s.send });
  await runTick({ now: at('2026-10-05T23:18:00+02:00'), send: s.send }); // prepare ya fuera de ventana, bedtime en ella
  assert.deepEqual(s.calls.map((c) => c.kind), ['bedtime']);
  assert.deepEqual(deliveries(user).map((d) => [d.kind, d.status, d.reason]), [['prepare', 'skipped', 'late'], ['bedtime', 'sent', null]]);
});

test('noche abierta antes de prepare o bedtime → skipped night_open (FR-016)', async () => {
  const user = newUser();
  addDevice(user);
  sleepRepo.create(user, { date: '2026-10-05', bedtime: '2026-10-05T22:40:00+02:00' });
  const s = fakeSend();
  await runTick({ now: MON_2246, send: s.send });
  await runTick({ now: at('2026-10-05T23:16:00+02:00'), send: s.send });
  assert.equal(s.calls.length, 0);
  assert.deepEqual(deliveries(user).map((d) => [d.kind, d.status, d.reason]), [['prepare', 'skipped', 'night_open'], ['bedtime', 'skipped', 'night_open']]);
});

test('wake_check solo con la noche abierta, a hora de levantarse + 60 min', async () => {
  const user = newUser();
  addDevice(user);
  const s = fakeSend();
  await runTick({ now: at('2026-10-06T08:00:30+02:00'), send: s.send });
  assert.equal(s.calls.filter((c) => c.kind === 'wake_check').length, 0, 'noche cerrada');
  sleepRepo.create(user, { date: '2026-10-05', bedtime: '2026-10-05T23:20:00+02:00' });
  await runTick({ now: at('2026-10-06T08:00:40+02:00'), send: s.send });
  const wake = s.calls.find((c) => c.kind === 'wake_check');
  assert.equal(wake.payload.body, '¿ya despertaste?');
  assert.equal(wake.payload.url, '/#noche-despertar');
  assert.equal(wake.payload.tag, 'wake_check-2026-10-05');
});

test('varios dispositivos: llega a todos; sent si alguno acepta; failed expired si ninguno; un 410 borra el dispositivo', async () => {
  const user = newUser();
  const a = addDevice(user, 'a');
  const b = addDevice(user, 'b');
  let s = fakeSend({ [a]: 'expired' });
  await runTick({ now: MON_2246, send: s.send });
  assert.deepEqual(s.calls.map((c) => c.endpoint).sort(), [a, b]);
  assert.equal(deliveries(user)[0].status, 'sent');
  assert.deepEqual(devicesOf(user), [b], 'el 410 borra solo ese dispositivo');
  assert.ok(db.prepare('SELECT last_success_at FROM push_subscriptions WHERE endpoint = ?').get(b).last_success_at);

  s = fakeSend({ [b]: 'expired' });
  await runTick({ now: at('2026-10-05T23:16:00+02:00'), send: s.send });
  assert.deepEqual(deliveries(user).filter((d) => d.kind === 'bedtime'), [{ kind: 'bedtime', night_date: '2026-10-05', status: 'failed', reason: 'expired' }]);
  assert.deepEqual(devicesOf(user), []);

  // Sin dispositivos que lo reciban: la persona deja de entrar en el tick
  const s2 = fakeSend();
  await runTick({ now: at('2026-10-06T22:46:00+02:00'), send: s2.send });
  assert.equal(s2.calls.length, 0);
});

test('motivos de fallo: timeout y error', async () => {
  const user = newUser();
  const a = addDevice(user, 'a');
  await runTick({ now: MON_2246, send: fakeSend({ [a]: 'timeout' }).send });
  await runTick({ now: at('2026-10-05T23:16:00+02:00'), send: fakeSend({ [a]: 'error' }).send });
  assert.deepEqual(deliveries(user).map((d) => [d.kind, d.status, d.reason]), [['prepare', 'failed', 'timeout'], ['bedtime', 'failed', 'error']]);
  // Un send que lanza no rompe el tick
  db.exec('DELETE FROM reminder_deliveries');
  await runTick({ now: MON_2246 + 1000, send: async () => { throw new Error('boom'); } });
  assert.deepEqual(deliveries(user).map((d) => [d.status, d.reason]), [['failed', 'error']]);
});

test('aislamiento del envío (SC-004): 20 personas, un 410 y un timeout no retrasan a las otras 18; concurrencia ≤ 4', async () => {
  const users = Array.from({ length: 20 }, () => newUser());
  const endpoints = users.map((u) => addDevice(u));
  const s = fakeSend({ [endpoints[3]]: 'expired', [endpoints[11]]: 'timeout' }, { delay: 5 });
  const t0 = Date.now();
  await runTick({ now: MON_2246, send: s.send });
  assert.ok(Date.now() - t0 < 5000);
  const states = users.map((u) => deliveries(u)[0]);
  assert.equal(states.filter((d) => d.status === 'sent').length, 18);
  assert.deepEqual(states[3], { kind: 'prepare', night_date: '2026-10-05', status: 'failed', reason: 'expired' });
  assert.deepEqual(states[11], { kind: 'prepare', night_date: '2026-10-05', status: 'failed', reason: 'timeout' });
  assert.ok(s.stats.max <= 4 && s.stats.max >= 2, `concurrencia ${s.stats.max}`);
});

test('un reclamo de hace más de 5 min pasa a failed interrupted y no se reenvía (FR-010)', async () => {
  const user = newUser();
  addDevice(user);
  db.prepare("INSERT INTO reminder_deliveries (user_id, kind, night_date, due_at, status, updated_at) VALUES (?, 'prepare', '2026-10-05', '2026-10-05T22:45:00+02:00', 'claimed', ?)")
    .run(user, new Date(MON_2246 - 6 * 60_000).toISOString());
  const s = fakeSend();
  await runTick({ now: MON_2246, send: s.send });
  assert.equal(s.calls.length, 0);
  assert.deepEqual(deliveries(user), [{ kind: 'prepare', night_date: '2026-10-05', status: 'failed', reason: 'interrupted' }]);
  // Uno reciente no se toca
  db.exec('DELETE FROM reminder_deliveries');
  db.prepare("INSERT INTO reminder_deliveries (user_id, kind, night_date, due_at, status, updated_at) VALUES (?, 'prepare', '2026-10-05', 'x', 'claimed', ?)")
    .run(user, new Date(MON_2246 - 60_000).toISOString());
  await runTick({ now: MON_2246, send: s.send });
  assert.equal(deliveries(user)[0].status, 'claimed');
});

test('dos personas: la carga de A nunca llega a un dispositivo de B', async () => {
  const a = newUser(MADRID, { lead: 45 });
  const b = newUser(MADRID, { lead: 20 });
  addDevice(a, 'm');
  addDevice(b, 'm');
  const s = fakeSend();
  await runTick({ now: at('2026-10-05T22:30:30+02:00'), send: s.send }); // prepare de A (22:30); el de B es a las 22:55
  assert.deepEqual(s.calls.map((c) => [c.endpoint, c.payload.body]), [[`https://fcm.googleapis.com/fcm/send/u${a}-m`, 'en 45 min es tu hora de dormir']]);
  await runTick({ now: at('2026-10-05T22:55:30+02:00'), send: s.send });
  assert.deepEqual(s.calls[1].endpoint, `https://fcm.googleapis.com/fcm/send/u${b}-m`);
  assert.equal(s.calls[1].payload.body, 'en 20 min es tu hora de dormir');
});

test('un dispositivo cuya sesión caducó, o una persona sin zona horaria, no reciben nada', async () => {
  const expired = newUser();
  addDevice(expired, 'a', { expires: '2026-10-05T00:00:00.000Z' });
  const noZone = newUser(null);
  addDevice(noZone);
  db.prepare('UPDATE users SET timezone = NULL WHERE id = ?').run(noZone);
  const s = fakeSend();
  await runTick({ now: MON_2246, send: s.send });
  assert.equal(s.calls.length, 0);
  assert.deepEqual(db.prepare('SELECT COUNT(*) AS c FROM reminder_deliveries').get(), { c: 0 });
});

test('lo anterior al alta del dispositivo no se descarta ni se envía', async () => {
  const user = newUser();
  addDevice(user, 'a', { created: new Date(at('2026-10-05T22:50:00+02:00')).toISOString() });
  const s = fakeSend();
  await runTick({ now: at('2026-10-05T23:16:00+02:00'), send: s.send });
  assert.deepEqual(s.calls.map((c) => c.kind), ['bedtime']);
  assert.deepEqual(deliveries(user).map((d) => d.kind), ['bedtime']);
});

test('estado en memoria: last_tick_at y pending_dues', async () => {
  assert.deepEqual(status(), { last_tick_at: null, pending_dues: 0 });
  await runTick({ now: MON_2246, send: fakeSend().send });
  assert.deepEqual(status(), { last_tick_at: new Date(MON_2246).toISOString(), pending_dues: 0 });
});

test('tipos (US3, FR-017): sin prepare no hay prepare y sí bedtime; reactivado rige el siguiente aviso no enviado', async () => {
  const user = newUser();
  addDevice(user);
  repo.setPreferences(user, { kinds: { prepare: false } });
  const s = fakeSend();
  await runTick({ now: MON_2246, send: s.send });
  assert.equal(s.calls.length, 0);
  repo.setPreferences(user, { kinds: { prepare: true } });
  await runTick({ now: MON_2246 + 30_000, send: s.send });
  assert.deepEqual(s.calls.map((c) => c.kind), ['prepare'], 'un cambio de hoy rige ya el aviso de esta noche');
  repo.setPreferences(user, { kinds: { prepare: false, bedtime: false } });
  await runTick({ now: at('2026-10-05T23:16:00+02:00'), send: s.send });
  assert.equal(s.calls.length, 1);
  repo.setPreferences(user, { kinds: { prepare: true, bedtime: true } });
  await runTick({ now: at('2026-10-06T22:46:00+02:00'), send: s.send });
  assert.deepEqual(s.calls.map((c) => c.kind), ['prepare', 'prepare'], 'la noche siguiente vuelve el prepare');
});

test('"Silenciar hoy" (SC-009): silencia prepare, bedtime y el wake_check de la mañana; mañana vuelve', async () => {
  const user = newUser();
  addDevice(user);
  repo.setPreferences(user, { muted_until: '2026-10-05' }); // lunes a las 20:00
  const s = fakeSend();
  await runTick({ now: MON_2246, send: s.send });
  await runTick({ now: at('2026-10-05T23:16:00+02:00'), send: s.send });
  sleepRepo.create(user, { date: '2026-10-05', bedtime: '2026-10-05T23:20:00+02:00' });
  await runTick({ now: at('2026-10-06T08:00:30+02:00'), send: s.send });
  assert.equal(s.calls.length, 0);
  assert.deepEqual(deliveries(user).map((d) => [d.kind, d.status, d.reason]), [['prepare', 'skipped', 'muted'], ['bedtime', 'skipped', 'muted'], ['wake_check', 'skipped', 'muted']]);
  sleepRepo.setWake(user, sleepRepo.open(user).id, '2026-10-06T07:00:00+02:00');
  await runTick({ now: at('2026-10-06T22:46:00+02:00'), send: s.send });
  assert.deepEqual(s.calls.map((c) => c.kind), ['prepare'], 'el martes vuelve a llegar');
});

test('"Silenciar hoy" por la mañana silencia el wake_check pendiente de la noche anterior', async () => {
  const user = newUser();
  addDevice(user);
  sleepRepo.create(user, { date: '2026-10-05', bedtime: '2026-10-05T23:20:00+02:00' });
  repo.setPreferences(user, { muted_until: '2026-10-06' }); // martes por la mañana
  const s = fakeSend();
  await runTick({ now: at('2026-10-06T08:00:30+02:00'), send: s.send });
  assert.equal(s.calls.filter((c) => c.kind === 'wake_check').length, 0);
  assert.ok(deliveries(user).some((d) => d.kind === 'wake_check' && d.reason === 'muted'));
});

test('"No molestar" 23:00–07:00 (SC-009): llega el de las 22:45, el de las 23:15 queda dnd y no se aplaza', async () => {
  const user = newUser();
  addDevice(user);
  repo.setPreferences(user, { dnd: { start_min: 1380, end_min: 420 } });
  const s = fakeSend();
  await runTick({ now: at('2026-10-05T22:45:30+02:00'), send: s.send });
  await runTick({ now: at('2026-10-05T23:15:30+02:00'), send: s.send });
  await runTick({ now: at('2026-10-05T23:30:00+02:00'), send: s.send });
  assert.deepEqual(s.calls.map((c) => c.kind), ['prepare']);
  assert.deepEqual(deliveries(user).map((d) => [d.kind, d.status, d.reason]), [['prepare', 'sent', null], ['bedtime', 'skipped', 'dnd']]);
});

test('"No molestar" se comprueba al enviar: una franja cambiada tras calcular, pero antes de enviar, rige', async () => {
  const user = newUser();
  addDevice(user);
  const original = repo.sendState;
  repo.sendState = (id) => {
    repo.setPreferences(id, { dnd: { start_min: 22 * 60, end_min: 23 * 60 } }); // la persona la activa justo ahora
    return original(id);
  };
  try {
    const s = fakeSend();
    await runTick({ now: MON_2246, send: s.send });
    assert.equal(s.calls.length, 0);
    assert.equal(deliveries(user)[0].reason, 'dnd');
  } finally {
    repo.sendState = original;
  }
});

test('insideDnd: franja normal, franja que cruza medianoche y sin franja', () => {
  assert.equal(insideDnd(null, 600), false);
  const day = { start_min: 600, end_min: 780 };
  assert.deepEqual([599, 600, 779, 780].map((m) => insideDnd(day, m)), [false, true, true, false]);
  const night = { start_min: 1380, end_min: 420 };
  assert.deepEqual([1379, 1380, 1439, 0, 419, 420, 720].map((m) => insideDnd(night, m)), [false, true, true, true, true, false, false]);
});

test('"No molestar" usa la hora de pared de la zona de la persona', async () => {
  const user = newUser('America/Santiago');
  addDevice(user);
  repo.setPreferences(user, { dnd: { start_min: 1395, end_min: 420 } }); // desde las 23:15
  const s = fakeSend();
  // 23:20 en Santiago (-03:00) es la 04:20 UTC del día siguiente; en Madrid serían las 6:20
  await runTick({ now: at('2026-10-05T23:20:00-03:00'), send: s.send });
  assert.equal(s.calls.length, 0);
  assert.equal(deliveries(user).find((d) => d.kind === 'bedtime').reason, 'dnd');
});

test('poda a los 90 días, una sola vez al día (FR-027)', async () => {
  const user = newUser();
  const insert = (night) => db.prepare("INSERT INTO reminder_deliveries (user_id, kind, night_date, due_at, status, updated_at) VALUES (?, 'bedtime', ?, 'x', 'sent', 'x')").run(user, night);
  insert('2026-07-01'); // 96 días
  insert('2026-07-10'); // 87 días
  await runTick({ now: MON_2246, send: fakeSend().send });
  assert.deepEqual(deliveries(user).map((d) => d.night_date).filter((n) => n < '2026-10-01'), ['2026-07-10']);
  insert('2026-06-01');
  await runTick({ now: MON_2246 + 60_000, send: fakeSend().send });
  assert.ok(deliveries(user).some((d) => d.night_date === '2026-06-01'), 'no se vuelve a podar el mismo día');
  await runTick({ now: MON_2246 + 86_400_000, send: fakeSend().send });
  assert.ok(!deliveries(user).some((d) => d.night_date === '2026-06-01'), 'al día siguiente sí');
});
