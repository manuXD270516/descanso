const { Router } = require('express');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../db');
const pushRepo = require('../repo/push');
const push = require('../reminders/push');
const tick = require('../reminders/tick');
const waker = require('../reminders/waker');
const { createRateLimiter, clientIp } = require('../auth/rate-limit');

const r = Router();

// Compara en tiempo constante; solo se monta si BACKUP_TOKEN está definido (ver app.js)
function authorized(header) {
  const expected = Buffer.from(`Bearer ${process.env.BACKUP_TOKEN}`);
  const given = Buffer.from(String(header || ''));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// Límite propio de admin (no comparte el de auth): 5 intentos fallidos en 15 min por IP.
// Se comprueba antes de comparar el token, así un token correcto tampoco responde mientras dure el bloqueo.
const limiter = createRateLimiter();

// Una línea por acceso: ruta, resultado e IP. Nunca el token ni la cabecera Authorization.
function logAccess(route, result, ip) {
  const line = `admin ${route} ${result} ip=${ip}`;
  if (result === 'ok') console.log(line);
  else console.warn(line);
}

function guard(route) {
  return (req, res, next) => {
    const ip = clientIp(req);
    const keys = [`ip:${ip}`];
    const wait = limiter.retryAfter(keys);
    if (wait > 0) {
      logAccess(route, '429', ip);
      res.set('Retry-After', String(wait));
      return res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo más tarde.' });
    }
    if (!authorized(req.get('authorization'))) {
      limiter.fail(keys);
      logAccess(route, '401', ip);
      return res.status(401).json({ error: 'No autorizado' });
    }
    logAccess(route, 'ok', ip);
    next();
  };
}

// Copia consistente de la base con la API de backup online de SQLite: GET /api/admin/backup
r.get('/backup', guard('backup'), async (req, res) => {
  const stamp = new Date().toISOString().replace(/:/g, '').replace(/\.\d{3}/, ''); // 2026-09-29T061214Z
  const tmp = path.join(os.tmpdir(), `descanso-backup-${stamp}-${crypto.randomUUID()}.db`);
  const cleanup = () => fs.rm(tmp, { force: true }, () => {});
  try {
    await db.backup(tmp);
  } catch (err) {
    cleanup();
    throw err;
  }
  res.download(tmp, `descanso-${stamp}.db`, { headers: { 'Content-Type': 'application/octet-stream' } }, cleanup);
});

// Salud de los avisos push (feature 013, FR-026): sin datos personales, solo contadores y estado del tick
r.get('/health', guard('health'), (req, res) => {
  const { last_tick_at, pending_dues } = tick.status();
  const { skipped, failed } = pushRepo.counts24h(new Date().toISOString());
  res.json({
    reminders: { enabled: push.available() && waker.isRunning(), last_tick_at, pending_dues, skipped_24h: skipped, failed_24h: failed },
  });
});

module.exports = r;
