// Dispositivos con avisos, preferencias y entregas de un usuario (feature 013). Todo por userId; las
// únicas funciones sin usuario son las de mantenimiento del disparador (reclamos caducados, poda y
// contadores de salud), que solo tocan el registro operativo reminder_deliveries y no devuelven
// datos de nadie.
const db = require('../db');
const { requireUser } = require('./scope');
const schedule = require('./schedule');
const pauses = require('./pauses');
const sleep = require('./sleep');
const { HttpError } = require('../util');
const { fingerprint } = require('../reminders/push');

const MAX_DEVICES = 5;

const publicDevice = (d) => ({ id: d.id, label: d.label, created_at: d.created_at, fingerprint: fingerprint(d.endpoint) });

/** Dispositivos de la persona: sin endpoint ni claves (FR-006). */
const devices = (userId) =>
  db.prepare('SELECT id, label, created_at, endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY id').all(requireUser(userId)).map(publicDevice);

/**
 * Alta idempotente por endpoint (R8). Como mucho 5 por persona, contados en la misma transacción.
 * Si el endpoint era de otra persona, pasa a ser de quien lo activa.
 */
function upsertDevice(userId, sessionHash, { endpoint, p256dh, auth, label }) {
  requireUser(userId);
  return db.transaction(() => {
    const own = db.prepare('SELECT COUNT(*) AS c FROM push_subscriptions WHERE user_id = ? AND endpoint <> ?').get(userId, endpoint).c;
    if (own >= MAX_DEVICES) throw new HttpError(409, `Ya tienes ${MAX_DEVICES} dispositivos con avisos; quita uno para añadir este`);
    db.prepare(`INSERT INTO push_subscriptions (user_id, session_hash, endpoint, p256dh, auth, label, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, session_hash = excluded.session_hash,
        p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label, created_at = excluded.created_at`)
      .run(userId, sessionHash, endpoint, p256dh, auth, label, new Date().toISOString());
    return publicDevice(db.prepare('SELECT id, label, created_at, endpoint FROM push_subscriptions WHERE endpoint = ?').get(endpoint));
  }).immediate();
}

/** Quita un dispositivo propio; 0 si no existe o es de otra persona. */
const removeDevice = (userId, id) => db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND id = ?').run(requireUser(userId), id).changes;

/** Dispositivo propio con sus credenciales, solo para enviarle un aviso. */
const deviceForSend = (userId, id) =>
  db.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ? AND id = ?').get(requireUser(userId), id);

const markSuccess = (userId, id, at) =>
  db.prepare('UPDATE push_subscriptions SET last_success_at = ? WHERE user_id = ? AND id = ?').run(at, requireUser(userId), id);

/** Dispositivos a los que se puede enviar: su sesión sigue vigente (004 borra las caducadas de forma perezosa). */
const sendableDevices = (userId, nowIso) =>
  db.prepare(`SELECT p.id, p.endpoint, p.p256dh, p.auth FROM push_subscriptions p
    JOIN sessions s ON s.id_hash = p.session_hash AND s.expires_at > ? WHERE p.user_id = ? ORDER BY p.id`).all(nowIso, requireUser(userId));

const PREFS = `COALESCE(push_prepare, 1) AS prepare, COALESCE(push_bedtime, 1) AS bedtime, COALESCE(push_wake_check, 1) AS wake_check,
  dnd_start_min, dnd_end_min, muted_until`;

function shapePreferences(r) {
  return {
    kinds: { prepare: r.prepare === 1, bedtime: r.bedtime === 1, wake_check: r.wake_check === 1 },
    dnd: r.dnd_start_min === null || r.dnd_end_min === null ? null : { start_min: r.dnd_start_min, end_min: r.dnd_end_min },
    muted_until: r.muted_until,
  };
}

/** Preferencias de avisos; los tres tipos activos y sin silencios si la persona no tiene fila. */
const preferences = (userId) =>
  shapePreferences(db.prepare(`SELECT ${PREFS} FROM user_settings WHERE user_id = ?`).get(requireUser(userId))
    ?? { prepare: 1, bedtime: 1, wake_check: 1, dnd_start_min: null, dnd_end_min: null, muted_until: null });

/** Cambia solo lo recibido: kinds, dnd (objeto, o null para desactivarlo) y muted_until (fecha o null). */
function setPreferences(userId, { kinds, dnd, muted_until }) {
  requireUser(userId);
  return db.transaction(() => {
    const now = new Date().toISOString();
    db.prepare('INSERT OR IGNORE INTO user_settings (user_id, updated_at) VALUES (?, ?)').run(userId, now);
    const sets = [];
    const args = [];
    const set = (sql, ...a) => { sets.push(sql); args.push(...a); };
    for (const k of ['prepare', 'bedtime', 'wake_check']) if (kinds?.[k] !== undefined) set(`push_${k} = ?`, kinds[k] ? 1 : 0);
    if (dnd !== undefined) set('dnd_start_min = ?, dnd_end_min = ?', dnd ? dnd.start_min : null, dnd ? dnd.end_min : null);
    if (muted_until !== undefined) set('muted_until = ?', muted_until);
    if (sets.length) db.prepare(`UPDATE user_settings SET ${sets.join(', ')}, updated_at = ? WHERE user_id = ?`).run(...args, now, userId);
    return preferences(userId);
  })();
}

const timezoneOf = (userId) => db.prepare('SELECT timezone FROM users WHERE id = ?').get(requireUser(userId))?.timezone || null;

/** Guarda la zona solo si el perfil no tenía (R14); devuelve la zona vigente. */
function setTimezoneIfEmpty(userId, timezone) {
  db.prepare("UPDATE users SET timezone = ? WHERE id = ? AND (timezone IS NULL OR timezone = '')").run(timezone, requireUser(userId));
  return timezoneOf(userId);
}

// --- Entradas y registro del disparador (reminders/tick.js) ---

/**
 * Personas con algún dispositivo cuya sesión sigue vigente y con zona horaria, con todo lo que
 * necesita `dueReminders` (research R2). `since` = alta del dispositivo activo más antiguo.
 */
function tickInputs(nowIso) {
  const people = db.prepare(`SELECT u.id, u.timezone, COALESCE(s.lead_min, 30) AS lead_min,
      COALESCE(s.push_prepare, 1) AS prepare, COALESCE(s.push_bedtime, 1) AS bedtime, COALESCE(s.push_wake_check, 1) AS wake_check,
      MIN(p.created_at) AS since
    FROM users u
    JOIN push_subscriptions p ON p.user_id = u.id
    JOIN sessions se ON se.id_hash = p.session_hash AND se.expires_at > ?
    LEFT JOIN user_settings s ON s.user_id = u.id
    WHERE u.timezone IS NOT NULL AND u.timezone <> ''
    GROUP BY u.id ORDER BY u.id`).all(nowIso);
  // Las entregas de las últimas noches candidatas (hoy − 2 … hoy cabe en 4 días de margen sobre UTC)
  const from = new Date(Date.parse(nowIso) - 4 * 86_400_000).toISOString().slice(0, 10);
  const delivered = db.prepare('SELECT kind, night_date FROM reminder_deliveries WHERE user_id = ? AND night_date >= ?');
  return people.map((u) => ({
    id: u.id,
    timezone: u.timezone,
    lead_min: u.lead_min,
    kinds: { prepare: u.prepare === 1, bedtime: u.bedtime === 1, wake_check: u.wake_check === 1 },
    since: u.since,
    versions: schedule.all(u.id),
    pauses: pauses.list(u.id),
    openNight: sleep.open(u.id) ?? null,
    deliveries: delivered.all(u.id, from).map((d) => `${d.kind}|${d.night_date}`),
  }));
}

/** Lo que se comprueba justo antes de enviar (R4): noche abierta, "Silenciar hoy" y "No molestar". */
function sendState(userId) {
  return { ...preferences(userId), open: !!sleep.open(userId) };
}

/** Reclamo atómico: solo quien inserta (true) envía (FR-010). */
const claim = (userId, kind, night, dueIso, nowIso) =>
  db.prepare(`INSERT INTO reminder_deliveries (user_id, kind, night_date, due_at, status, updated_at)
    VALUES (?, ?, ?, ?, 'claimed', ?) ON CONFLICT DO NOTHING`).run(requireUser(userId), kind, night, dueIso, nowIso).changes === 1;

/** Cierra un reclamo propio: 'sent', 'skipped' o 'failed' con su motivo. */
const finish = (userId, kind, night, status, reason, nowIso) =>
  db.prepare("UPDATE reminder_deliveries SET status = ?, reason = ?, updated_at = ? WHERE user_id = ? AND kind = ? AND night_date = ? AND status = 'claimed'")
    .run(status, reason ?? null, nowIso, requireUser(userId), kind, night).changes;

/** Vencimiento fuera de su ventana: queda registrado como descartado. */
const insertSkipped = (userId, kind, night, dueIso, reason, nowIso) =>
  db.prepare(`INSERT INTO reminder_deliveries (user_id, kind, night_date, due_at, status, reason, updated_at)
    VALUES (?, ?, ?, ?, 'skipped', ?, ?) ON CONFLICT DO NOTHING`).run(requireUser(userId), kind, night, dueIso, reason, nowIso).changes === 1;

/** Reclamos de un proceso que murió a mitad: pasan a failed/interrupted y no se reintentan. */
const failStaleClaims = (beforeIso, nowIso) =>
  db.prepare("UPDATE reminder_deliveries SET status = 'failed', reason = 'interrupted', updated_at = ? WHERE status = 'claimed' AND updated_at < ?")
    .run(nowIso, beforeIso).changes;

/** Poda el registro operativo anterior a la fecha de noche dada (FR-027). */
const prune = (beforeDate) => db.prepare('DELETE FROM reminder_deliveries WHERE night_date < ?').run(beforeDate).changes;

/** Contadores de salud de administración, sin datos personales (FR-026). */
function counts24h(nowIso) {
  const since = new Date(Date.parse(nowIso) - 86_400_000).toISOString();
  const rows = db.prepare('SELECT status, COUNT(*) AS c FROM reminder_deliveries WHERE updated_at >= ? GROUP BY status').all(since);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.c]));
  return { skipped: by.skipped ?? 0, failed: by.failed ?? 0 };
}

module.exports = {
  MAX_DEVICES, devices, upsertDevice, removeDevice, deviceForSend, markSuccess, sendableDevices, preferences, setPreferences,
  timezoneOf, setTimezoneIfEmpty, tickInputs, sendState, claim, finish, insertSkipped, failStaleClaims, prune, counts24h,
};
