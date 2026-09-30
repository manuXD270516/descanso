// Aviso de ocupación del volumen de datos (feature 003, US4). Sin temporizadores: se evalúa al
// arrancar y en cada /api/health, así la máquina puede seguir apagándose sin tráfico.
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');

const THRESHOLD = 70;
const WARN_EVERY_MS = 60 * 60 * 1000;
const UNKNOWN = Object.freeze({ status: 'unknown', used_pct: null });

function createStorageMonitor({ file, statfs = fs.statfsSync, now = Date.now, log = console }) {
  let lastWarn = null;
  return function storageStatus() {
    if (file === ':memory:') return { ...UNKNOWN };
    let used_pct;
    try {
      const s = statfs(path.dirname(file));
      used_pct = Math.round(100 * (1 - s.bavail / s.blocks));
    } catch {
      return { ...UNKNOWN };
    }
    if (!Number.isFinite(used_pct)) return { ...UNKNOWN };

    const status = used_pct > THRESHOLD ? 'warn' : 'ok';
    if (status === 'warn' && (lastWarn === null || now() - lastWarn >= WARN_EVERY_MS)) {
      lastWarn = now();
      log.warn(`[almacenamiento] el volumen de datos está al ${used_pct} % (aviso a partir del ${THRESHOLD} %). Amplíalo con flyctl volumes extend.`);
    }
    return { status, used_pct };
  };
}

// db.name es la ruta con la que se abrió la base (o ":memory:")
const storageStatus = createStorageMonitor({ file: db.name });

module.exports = { createStorageMonitor, storageStatus };
