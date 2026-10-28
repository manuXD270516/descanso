// Avisos push (feature 013, research R10): dispositivos con avisos, preferencias, aviso de prueba.
// Montado en /api/push después de csrf y requireAuth; lo ajeno responde 404.
const { Router } = require('express');
const repo = require('../repo/push');
const push = require('../reminders/push');
const { localParts } = require('../reminders/zoned');
const { createRateLimiter } = require('../auth/rate-limit');
const { sessionHash } = require('../auth/sessions');
const { HttpError } = require('../util');

const r = Router();

const TIMEZONES = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);
const KIND_KEYS = ['prepare', 'bedtime', 'wake_check'];
const DND_ERROR = 'La franja de No molestar necesita inicio y fin distintos';
const OFF = 'Los avisos no están disponibles';

// FR-021: como mucho 3 avisos de prueba por minuto y persona; cada intento cuenta
const testLimiter = createRateLimiter({ max: 3, windowMs: 60_000 });

const requireAvailable = () => {
  if (!push.available()) throw new HttpError(503, OFF);
};

const isMinute = (v) => Number.isInteger(v) && v >= 0 && v <= 1439;

/** Estado del bloque "Avisos en este móvil" en una sola carga. */
r.get('/', (req, res) => {
  const available = push.available();
  res.json({
    available,
    public_key: available ? process.env.VAPID_PUBLIC_KEY : null,
    timezone: repo.timezoneOf(req.user.id),
    preferences: repo.preferences(req.user.id),
    devices: repo.devices(req.user.id),
  });
});

/** Tipos activos, "No molestar" y "Silenciar hoy": solo cambia lo enviado (FR-017, FR-018). */
r.put('/preferences', (req, res) => {
  const body = req.body ?? {};
  if (Object.keys(body).some((k) => !['kinds', 'dnd', 'mute_today'].includes(k))) throw new HttpError(400, 'Ajuste no válido');
  const change = {};
  if (body.kinds !== undefined) {
    const kinds = body.kinds;
    if (!kinds || typeof kinds !== 'object' || Array.isArray(kinds)) throw new HttpError(400, 'Ajuste no válido');
    for (const [k, v] of Object.entries(kinds)) {
      if (!KIND_KEYS.includes(k) || typeof v !== 'boolean') throw new HttpError(400, 'Ajuste no válido');
    }
    change.kinds = kinds;
  }
  if (body.dnd !== undefined) {
    if (body.dnd !== null) {
      const { start_min, end_min } = body.dnd ?? {};
      if (!isMinute(start_min) || !isMinute(end_min) || start_min === end_min) throw new HttpError(400, DND_ERROR);
      change.dnd = { start_min, end_min };
    } else {
      change.dnd = null;
    }
  }
  if (body.mute_today !== undefined) {
    if (typeof body.mute_today !== 'boolean') throw new HttpError(400, 'Ajuste no válido');
    if (body.mute_today) {
      const timezone = repo.timezoneOf(req.user.id);
      if (!timezone) throw new HttpError(400, 'Fija tu zona horaria para silenciar los avisos');
      change.muted_until = localParts(Date.now(), timezone).date; // "hoy" de la persona, no del servidor
    } else {
      change.muted_until = null;
    }
  }
  res.json(repo.setPreferences(req.user.id, change));
});

/** Activa los avisos en este dispositivo (idempotente por endpoint; ligado a la sesión actual). */
r.post('/subscriptions', (req, res) => {
  requireAvailable();
  const body = req.body ?? {};
  if (Object.keys(body).some((k) => !['endpoint', 'keys', 'timezone'].includes(k))) throw new HttpError(400, 'Datos del dispositivo no válidos');
  const sub = push.validateSubscription(body);
  if (body.timezone !== undefined && (typeof body.timezone !== 'string' || !TIMEZONES.has(body.timezone))) throw new HttpError(400, 'Zona horaria desconocida');
  if (!repo.timezoneOf(req.user.id)) {
    if (body.timezone === undefined) throw new HttpError(400, 'Indica tu zona horaria para activar los avisos');
  }
  const device = repo.upsertDevice(req.user.id, sessionHash(req), { ...sub, label: push.deviceLabel(req.get('User-Agent')) });
  if (body.timezone !== undefined) repo.setTimezoneIfEmpty(req.user.id, body.timezone); // solo si el perfil no tenía (R14)
  res.status(201).json(device);
});

const deviceId = (req) => {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

r.delete('/subscriptions/:id', (req, res) => {
  const id = deviceId(req);
  if (!id || !repo.removeDevice(req.user.id, id)) throw new HttpError(404, 'Dispositivo no encontrado');
  res.status(204).end();
});

/** Aviso de prueba a un dispositivo propio; ignora "No molestar" y "Silenciar hoy" (FR-020). */
r.post('/subscriptions/:id/test', async (req, res) => {
  requireAvailable();
  const keys = [`user:${req.user.id}`];
  const wait = testLimiter.retryAfter(keys);
  if (wait) {
    res.set('Retry-After', String(wait));
    throw new HttpError(429, 'Espera un momento antes de probar otra vez');
  }
  testLimiter.fail(keys); // cuenta cada intento
  const id = deviceId(req);
  const device = id && repo.deviceForSend(req.user.id, id);
  if (!device) throw new HttpError(404, 'Dispositivo no encontrado');
  const outcome = await push.send(device, push.payloadFor('test'), 'test');
  if (outcome === 'ok') {
    repo.markSuccess(req.user.id, device.id, new Date().toISOString());
    return res.json({ result: 'sent' });
  }
  if (outcome === 'expired') {
    repo.removeDevice(req.user.id, device.id); // US4-2
    return res.json({ result: 'expired' });
  }
  res.json({ result: 'failed' });
});

module.exports = r;
