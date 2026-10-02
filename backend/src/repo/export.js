// Exportación de los datos de un usuario (features 004 y 008): solo lo suyo, sin user_id.
const db = require('../db');
const { requireUser } = require('./scope');

const QUERIES = {
  sleep_records: 'SELECT id, date, bedtime, wake_time, notes, created_at FROM sleep_records WHERE user_id = ? ORDER BY id',
  naps: 'SELECT id, date, start_time, end_time, notes, created_at FROM naps WHERE user_id = ? ORDER BY id',
  metrics: 'SELECT id, name, type, unit, min_value, max_value, color, sort_order, archived, created_at FROM metrics WHERE user_id = ? ORDER BY id',
  metric_entries:
    'SELECT e.id, e.metric_id, e.date, e.value, e.created_at FROM metric_entries e JOIN metrics m ON m.id = e.metric_id WHERE m.user_id = ? ORDER BY e.id',
};

const TABLES = Object.keys(QUERIES);

/** Filas de una colección como objetos (JSON) o como arrays (CSV). */
function rows(userId, table, { raw = false } = {}) {
  const stmt = db.prepare(QUERIES[table]);
  return (raw ? stmt.raw() : stmt).all(requireUser(userId));
}

module.exports = { TABLES, rows };
