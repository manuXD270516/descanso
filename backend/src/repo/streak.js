// Racha de constancia de un usuario (feature 011, research R4–R6). Solo se guarda lo que no debe
// bajar nunca (récord, total y constelaciones); el resto se calcula al consultar, sin escribir.
const db = require('../db');
const { requireUser } = require('./scope');
const schedule = require('./schedule');
const pauses = require('./pauses');
const dashboard = require('./dashboard');
const { computeStreak, MILESTONES } = require('../streak');
const { addDays, buildDays, summary } = require('../analytics');
const { HttpError } = require('../util');

const OFFER_AFTER_NIGHTS = 3;
const MIN_NIGHTS_FOR_AVG = 3; // principio VIII: la media solo con 3 o más noches cerradas (FR-025)

const SETTINGS = `COALESCE(streak_enabled, 0) AS enabled, COALESCE(streak_margin_min, 30) AS margin_min,
  streak_since AS since, streak_offered_at AS offered_at, COALESCE(streak_best, 0) AS best,
  COALESCE(streak_total, 0) AS total, COALESCE(streak_total_base, 0) AS total_base,
  streak_summary_dismissed AS summary_dismissed`;
const DEFAULTS = { enabled: 0, margin_min: 30, since: null, offered_at: null, best: 0, total: 0, total_base: 0, summary_dismissed: null };

const settings = (userId) => db.prepare(`SELECT ${SETTINGS} FROM user_settings WHERE user_id = ?`).get(requireUser(userId)) ?? { ...DEFAULTS };

const closedNights = (userId) => db.prepare('SELECT COUNT(*) AS c FROM sleep_records WHERE user_id = ? AND wake_time IS NOT NULL').get(requireUser(userId)).c;

/** Lo que ve la racha desactivada (y lo que devuelven los ajustes): sin calcular nada (SC-006). */
function off(userId, s = settings(userId)) {
  const offered = s.offered_at !== null;
  return { enabled: s.enabled === 1, offered, margin_min: s.margin_min, offer: s.enabled !== 1 && !offered && closedNights(userId) >= OFFER_AFTER_NIGHTS };
}

const mondayOf = (date) => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));

/** Cálculo al vuelo desde la activación (R1). */
function compute(userId, today, s) {
  const nights = db
    .prepare('SELECT date, bedtime, wake_time, wake_logged_at, wake_from_proposal FROM sleep_records WHERE user_id = ? AND date >= ? AND date <= ?')
    .all(userId, s.since, addDays(today, 1));
  return computeStreak({ nights, versions: schedule.all(userId), pauses: pauses.list(userId), since: s.since, today, marginMin: s.margin_min });
}

/**
 * Trinquete (R4): con la racha activada, sube el récord y el total y desbloquea las constelaciones
 * alcanzadas. Lo llaman las escrituras de noches dentro de su transacción; nunca baja nada.
 */
function ratchet(userId, today) {
  const s = settings(userId);
  if (s.enabled !== 1 || !s.since) return;
  const r = compute(userId, today, s);
  db.prepare('UPDATE user_settings SET streak_best = MAX(streak_best, ?), streak_total = MAX(streak_total, ?) WHERE user_id = ?')
    .run(r.current, s.total_base + r.total, userId);
  const insert = db.prepare(`INSERT OR IGNORE INTO streak_achievements (user_id, key, achieved_on, wake_spread_min, created_at)
    VALUES (?, ?, ?, ?, ?)`);
  for (const key of MILESTONES) if (key <= r.current) insert.run(userId, key, today, r.spreadMin ?? 0, new Date().toISOString());
}

/** Ejecuta una escritura de noche y el trinquete en una sola transacción (FR-009, FR-013). */
const withRatchet = (userId, today, write) =>
  db.transaction(() => {
    const row = write();
    ratchet(userId, today);
    return row;
  })();

const achievements = (userId) =>
  db.prepare('SELECT key, achieved_on, wake_spread_min, seen_at FROM streak_achievements WHERE user_id = ? ORDER BY key')
    .all(requireUser(userId))
    .map(({ seen_at, ...a }) => ({ ...a, seen: seen_at !== null }));

/** Estado de la racha en `today`, sin efectos secundarios (FR-010). */
function view(userId, today) {
  const s = settings(userId);
  const base = off(userId, s);
  if (s.enabled !== 1 || !s.since) return base;
  const r = compute(userId, today, s);
  const pauseList = pauses.list(userId);
  const neutral = (date, state) => ({ date, state, reason: null, bed_time: null, wake_time: null, late_logged: false });
  // Noches futuras de la semana: "en pausa" si ya hay una pausa programada; si no, "aún no"
  const dayAt = (date) =>
    date < s.since ? neutral(date, 'off')
      : date > today ? neutral(date, pauseList.some((p) => p.start_date <= date && date <= p.end_date) ? 'paused' : 'pending')
        : r.days.get(date);
  const monday = mondayOf(today);
  const week = Array.from({ length: 7 }, (_, i) => dayAt(addDays(monday, i)));
  const best = Math.max(s.best, r.current);
  return {
    ...base,
    current: r.current,
    best,
    total: Math.max(s.total, s.total_base + r.total),
    cut: r.current === 0 && best > 0,
    week,
    last_night: dayAt(addDays(today, -1)),
    achievements: achievements(userId),
    summary: s.summary_dismissed === monday ? null : weekSummary(userId, addDays(monday, -7), dayAt, s),
  };
}

/** Resumen de la semana anterior (FR-025): cumplidos sobre días decididos y no pausados, y la media. */
function weekSummary(userId, from, dayAt, s) {
  const to = addDays(from, 6);
  if (to < s.since) return null;
  const days = Array.from({ length: 7 }, (_, i) => dayAt(addDays(from, i)));
  const nights = dashboard.nights(userId, from, to);
  const closed = nights.filter((n) => n.wake_time).length;
  const avg = closed >= MIN_NIGHTS_FOR_AVG ? summary(buildDays(nights, dashboard.naps(userId, from, to), from, to), 0).avg_min : null;
  return {
    week_start: from,
    met: days.filter((d) => d.state === 'met').length,
    of: days.filter((d) => d.state === 'met' || d.state === 'missed').length,
    avg_min: avg,
  };
}

const ALLOWED = new Set(['today', 'enabled', 'margin_min', 'offered', 'dismiss_summary']);

/** Activar, desactivar, responder a la oferta, cambiar el margen o descartar el resumen (R5). */
function saveSettings(userId, today, patch) {
  requireUser(userId);
  if (Object.keys(patch).some((k) => !ALLOWED.has(k))) throw new HttpError(400, 'Ajuste no válido');
  const { enabled, margin_min, offered, dismiss_summary } = patch;
  if (enabled !== undefined && typeof enabled !== 'boolean') throw new HttpError(400, 'Ajuste no válido');
  if (offered !== undefined && offered !== true) throw new HttpError(400, 'Ajuste no válido');
  if (dismiss_summary !== undefined && dismiss_summary !== true) throw new HttpError(400, 'Ajuste no válido');
  if (margin_min !== undefined && !(Number.isInteger(margin_min) && margin_min >= 15 && margin_min <= 60)) {
    throw new HttpError(400, 'El margen debe ser entre 15 y 60 minutos');
  }
  const now = new Date().toISOString();
  return db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO user_settings (user_id, updated_at) VALUES (?, ?)').run(userId, now);
    const s = settings(userId);
    const set = (sql, ...args) => db.prepare(`UPDATE user_settings SET ${sql}, updated_at = ? WHERE user_id = ?`).run(...args, now, userId);
    if (enabled === true && s.enabled !== 1) {
      set('streak_enabled = 1, streak_since = ?, streak_total_base = streak_total, streak_offered_at = COALESCE(streak_offered_at, ?)', today, now);
    }
    if (enabled === false) set('streak_enabled = 0');
    if (offered) set('streak_offered_at = COALESCE(streak_offered_at, ?)', now);
    if (margin_min !== undefined) set('streak_margin_min = ?', margin_min);
    if (dismiss_summary) set('streak_summary_dismissed = ?', mondayOf(today));
    return off(userId);
  })();
}

/** Marca una constelación como vista; false si no existe para este usuario. */
const markSeen = (userId, key) =>
  db.prepare('UPDATE streak_achievements SET seen_at = COALESCE(seen_at, ?) WHERE user_id = ? AND key = ?')
    .run(new Date().toISOString(), requireUser(userId), key).changes > 0;

/** Ajustes y constelaciones para la exportación (FR-026). */
function exportData(userId) {
  const { enabled, margin_min, since, offered_at, best, total } = settings(userId);
  return { settings: { enabled: enabled === 1, margin_min, since, offered_at, best, total }, achievements: achievements(userId) };
}

module.exports = { settings, view, ratchet, withRatchet, saveSettings, markSeen, exportData };
