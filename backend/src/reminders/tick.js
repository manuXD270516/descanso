// Un tick del disparador (feature 013, research R4, R7 y R13): recalcula los vencimientos, descarta lo
// que ya no tiene sentido, reclama y envía cada aviso una sola vez y lleva el estado de salud.
// Solo este módulo toca la base (vía repo/push.js) y la red (vía reminders/push.js).
const repo = require('../repo/push');
const pushService = require('./push');
const { dueReminders } = require('./schedule');
const { localParts } = require('./zoned');

const CONCURRENCY = 4; // personas atendidas a la vez (R7)
const STALE_CLAIM_MS = 5 * 60_000; // un reclamo sin terminar tras 5 min = proceso caído
const RETENTION_DAYS = 90; // FR-027

const state = { lastTickAt: null, pendingDues: 0, lastPrune: null };

const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** ¿El minuto de pared `m` cae dentro de "No molestar"? Admite franjas que cruzan medianoche. */
function insideDnd(dnd, m) {
  if (!dnd) return false;
  return dnd.start_min < dnd.end_min ? m >= dnd.start_min && m < dnd.end_min : m >= dnd.start_min || m < dnd.end_min;
}

/** Motivo para no enviar un aviso ya reclamado, comprobado en el momento del envío (R4); null si procede. */
function skipReason(due, user, now) {
  const s = repo.sendState(user.id);
  if ((due.kind === 'prepare' || due.kind === 'bedtime') && s.open) return 'night_open'; // FR-016
  if (s.muted_until && due.nightDate <= s.muted_until) return 'muted'; // FR-018
  if (insideDnd(s.dnd, localParts(now, user.timezone).minuteOfDay)) return 'dnd';
  return null;
}

/** Reclama, comprueba y envía un vencimiento a todos los dispositivos de la persona. */
async function deliver(due, user, now, nowIso, send) {
  if (!repo.claim(user.id, due.kind, due.nightDate, due.dueIso, nowIso)) return; // otro tick ya lo tiene
  try {
    const skip = skipReason(due, user, now);
    if (skip) {
      repo.finish(user.id, due.kind, due.nightDate, 'skipped', skip, nowIso);
      return;
    }
    const devices = repo.sendableDevices(user.id, nowIso);
    if (!devices.length) {
      repo.finish(user.id, due.kind, due.nightDate, 'failed', 'no_devices', nowIso);
      return;
    }
    const payload = pushService.payloadFor(due.kind, due.nightDate, user.lead_min);
    const results = await Promise.all(devices.map(async (device) => {
      try { return await send(device, payload, due.kind); } catch { return 'error'; }
    }));
    devices.forEach((device, i) => {
      if (results[i] === 'ok') repo.markSuccess(user.id, device.id, nowIso);
      else if (results[i] === 'expired') repo.removeDevice(user.id, device.id); // FR-007
    });
    if (results.includes('ok')) repo.finish(user.id, due.kind, due.nightDate, 'sent', null, nowIso);
    else {
      const reason = results.every((r) => r === 'expired') ? 'expired' : results.includes('timeout') ? 'timeout' : 'error';
      repo.finish(user.id, due.kind, due.nightDate, 'failed', reason, nowIso);
    }
  } catch (err) {
    console.error(`Aviso ${due.kind} sin enviar: ${err.message}`);
    repo.finish(user.id, due.kind, due.nightDate, 'failed', 'error', nowIso);
  }
}

/** Ejecuta `tasks` con como mucho `limit` a la vez. */
async function pool(tasks, limit, run) {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) await run(tasks[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

/**
 * @param {{ now?: number, send?: (device, payload, kind) => Promise<'ok'|'expired'|'timeout'|'error'> }} [opts]
 */
async function runTick({ now = Date.now(), send = pushService.send } = {}) {
  const nowIso = new Date(now).toISOString();
  repo.failStaleClaims(new Date(now - STALE_CLAIM_MS).toISOString(), nowIso);

  const users = repo.tickInputs(nowIso);
  const byId = new Map(users.map((u) => [u.id, u]));
  const dues = dueReminders({ now, users });

  for (const d of dues) if (d.state === 'discard') repo.insertSkipped(d.userId, d.kind, d.nightDate, d.dueIso, 'late', nowIso);

  // Un grupo por persona: un fallo o un dispositivo lento no retrasa a las demás (FR-014)
  const toSend = new Map();
  for (const d of dues) if (d.state === 'send') toSend.set(d.userId, [...(toSend.get(d.userId) ?? []), d]);
  let unattended = 0;
  await pool([...toSend.entries()], CONCURRENCY, async ([userId, list]) => {
    const user = byId.get(userId);
    for (const due of list.sort((a, b) => a.dueUtc - b.dueUtc)) {
      try { await deliver(due, user, now, nowIso, send); } catch (err) { unattended++; console.error(`Tick: ${err.message}`); }
    }
  });

  prune(now);
  state.lastTickAt = nowIso;
  state.pendingDues = unattended;
}

/** Poda diaria del registro de envíos (FR-027): una vez por fecha UTC. */
function prune(now) {
  const today = new Date(now).toISOString().slice(0, 10);
  if (state.lastPrune === today) return;
  repo.prune(addDays(today, -RETENTION_DAYS));
  state.lastPrune = today;
}

/** Estado en memoria para la salud de administración. */
const status = () => ({ last_tick_at: state.lastTickAt, pending_dues: state.pendingDues });

/** Solo para pruebas: simula un arranque nuevo del proceso. */
function resetState() {
  state.lastTickAt = null;
  state.pendingDues = 0;
  state.lastPrune = null;
}

module.exports = { runTick, status, resetState, insideDnd };
