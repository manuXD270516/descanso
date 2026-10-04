// Horario de sueño versionado de un usuario (feature 010). Horas de reloj de pared por noche de la
// semana (0 = domingo); la versión vigente en una fecha es la de mayor effective_from ≤ esa fecha y,
// entre las de un mismo día, la última guardada (id mayor). Nada se borra: el pasado no cambia.
const db = require('../db');
const { requireUser } = require('./scope');

function daysOf(versionId) {
  return db
    .prepare('SELECT weekday, bed_min, wake_min, active FROM schedule_days WHERE version_id = ? ORDER BY weekday')
    .all(versionId)
    .map((d) => ({ ...d, active: d.active === 1 }));
}

/** Versión vigente en `date` (o null), con sus 7 días. */
function current(userId, date) {
  const v = db
    .prepare('SELECT id, effective_from FROM schedule_versions WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC, id DESC LIMIT 1')
    .get(requireUser(userId), date);
  return v ? { ...v, days: daysOf(v.id) } : null;
}

/**
 * Guarda el horario vigente desde `today` como versión nueva (id mayor: el SEQUENCE del calendario
 * crece). Guardar otra vez el mismo día deja vigente la última; las anteriores no cambian (FR-004).
 */
function save(userId, today, days) {
  requireUser(userId);
  return db.transaction(() => {
    const id = db
      .prepare('INSERT INTO schedule_versions (user_id, effective_from, created_at) VALUES (?, ?, ?)')
      .run(userId, today, new Date().toISOString()).lastInsertRowid;
    const insert = db.prepare('INSERT INTO schedule_days (version_id, weekday, bed_min, wake_min, active) VALUES (?, ?, ?, ?, ?)');
    for (const d of days) insert.run(id, d.weekday, d.bed_min, d.wake_min, d.active ? 1 : 0);
    return current(userId, today);
  })();
}

/** Noches de la semana que estuvieron activas en alguna versión anterior a `versionId`. */
function everActiveBefore(userId, versionId) {
  const rows = db
    .prepare(`SELECT DISTINCT d.weekday FROM schedule_days d JOIN schedule_versions v ON v.id = d.version_id
      WHERE v.user_id = ? AND v.id < ? AND d.active = 1`)
    .all(requireUser(userId), versionId);
  return new Set(rows.map((r) => r.weekday));
}

/** Todas las versiones con sus días, para la exportación. */
function all(userId) {
  return db
    .prepare('SELECT id, effective_from, created_at FROM schedule_versions WHERE user_id = ? ORDER BY effective_from, id')
    .all(requireUser(userId))
    .map((v) => ({ ...v, days: daysOf(v.id) }));
}

module.exports = { current, save, everActiveBefore, all };
