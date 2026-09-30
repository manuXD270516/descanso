// Sentencias SQL de las rutas de la versión 003 (backend/src/routes/* en master antes de 004),
// congeladas para comprobar que siguen funcionando sobre el esquema de 004 (expand/contract).
// NO MODIFICAR: representa lo que ejecuta la imagen anterior tras un rollback.

/** writeNight() de 003: traduce el error del índice a 409 buscando su nombre en el mensaje. */
function writeNight(fn) {
  try {
    return fn();
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' && e.message.includes('ux_sleep_one_open')) {
      const err = new Error('Ya hay una noche abierta. Ciérrala antes de abrir otra.');
      err.status = 409;
      throw err;
    }
    throw e;
  }
}

const legacy003 = (db) => ({
  createNight: (d) =>
    writeNight(() =>
      db.prepare('INSERT INTO sleep_records (date, bedtime, wake_time, notes) VALUES (?,?,?,?)').run(d.date, d.bedtime, d.wake_time ?? null, d.notes ?? null),
    ).lastInsertRowid,
  openNight: () => db.prepare('SELECT * FROM sleep_records WHERE wake_time IS NULL ORDER BY bedtime DESC LIMIT 1').get(),
  wake: (id, wake_time) => db.prepare('UPDATE sleep_records SET wake_time = ? WHERE id = ?').run(wake_time, id),
  updateNight: (id, d) =>
    writeNight(() =>
      db.prepare('UPDATE sleep_records SET date=?, bedtime=?, wake_time=?, notes=? WHERE id=?').run(d.date, d.bedtime, d.wake_time ?? null, d.notes ?? null, id),
    ),
  deleteNight: (id) => db.prepare('DELETE FROM sleep_records WHERE id = ?').run(id).changes,
  listNights: (from, to) => db.prepare('SELECT * FROM sleep_records WHERE date >= ? AND date <= ? ORDER BY bedtime DESC').all(from, to),
  createNap: (d) =>
    db.prepare('INSERT INTO naps (date, start_time, end_time, notes) VALUES (?,?,?,?)').run(d.date, d.start_time, d.end_time, d.notes ?? null).lastInsertRowid,
  listNaps: (from, to) => db.prepare('SELECT * FROM naps WHERE date >= ? AND date <= ? ORDER BY start_time DESC').all(from, to),
  deleteNap: (id) => db.prepare('DELETE FROM naps WHERE id = ?').run(id).changes,
  createMetric: (m) =>
    db
      .prepare('INSERT INTO metrics (name,type,unit,min_value,max_value,color,sort_order,archived) VALUES (?,?,?,?,?,?,?,?)')
      .run(m.name, m.type, m.unit ?? null, m.min_value ?? null, m.max_value ?? null, '#5b6ee1', 0, 0).lastInsertRowid,
  updateMetric: (id, name) =>
    db.prepare('UPDATE metrics SET name=?,type=?,unit=?,min_value=?,max_value=?,color=?,sort_order=?,archived=? WHERE id=?').run(name, 'number', null, 0, null, '#5b6ee1', 1, 0, id),
  upsertEntry: (metricId, date, value) =>
    db.prepare(`INSERT INTO metric_entries (metric_id, date, value) VALUES (?,?,?)
      ON CONFLICT(metric_id, date) DO UPDATE SET value = excluded.value`).run(metricId, date, value),
  listEntries: (from, to) =>
    db.prepare('SELECT e.* FROM metric_entries e JOIN metrics m ON m.id = e.metric_id WHERE m.archived = 0 AND e.date >= ? AND e.date <= ? ORDER BY e.date DESC').all(from, to),
  deleteMetric: (id) => db.prepare('DELETE FROM metrics WHERE id = ?').run(id).changes,
  statsNights: (from, to) => db.prepare('SELECT * FROM sleep_records WHERE wake_time IS NOT NULL AND date >= ? AND date <= ?').all(from, to),
});

module.exports = { legacy003 };
