// Valores de métricas de un usuario (feature 008). metric_entries no tiene user_id: pertenece al
// usuario a través de su métrica, así que toda operación comprueba metrics.user_id (corrige el IDOR
// de DELETE /metrics/:id/entries/:date).
const db = require('../db');
const { requireUser, rangeClause } = require('./scope');

const COLS = 'e.id, e.metric_id, e.date, e.value, e.created_at';

function list(userId, range = {}) {
  const params = [requireUser(userId)];
  const sql = `SELECT ${COLS} FROM metric_entries e JOIN metrics m ON m.id = e.metric_id
    WHERE m.user_id = ? AND m.archived = 0${rangeClause('e.date', range, params)} ORDER BY e.date DESC`;
  return db.prepare(sql).all(...params);
}

const get = (userId, metricId, date) =>
  db.prepare(`SELECT ${COLS} FROM metric_entries e JOIN metrics m ON m.id = e.metric_id WHERE m.user_id = ? AND e.metric_id = ? AND e.date = ?`)
    .get(requireUser(userId), metricId, date);

/** Solo después de comprobar con metrics.get(userId, metricId) que la métrica es suya. */
function upsert(userId, metricId, date, value) {
  db.prepare(`INSERT INTO metric_entries (metric_id, date, value)
    SELECT id, ?, ? FROM metrics WHERE user_id = ? AND id = ?
    ON CONFLICT(metric_id, date) DO UPDATE SET value = excluded.value`).run(date, value, requireUser(userId), metricId);
  return get(userId, metricId, date);
}

const remove = (userId, metricId, date) =>
  db.prepare('DELETE FROM metric_entries WHERE metric_id = (SELECT id FROM metrics WHERE user_id = ? AND id = ?) AND date = ?')
    .run(requireUser(userId), metricId, date).changes;

module.exports = { list, get, upsert, remove };
