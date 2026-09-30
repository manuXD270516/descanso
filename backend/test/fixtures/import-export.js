// Reconstruye una base (ya migrada y vacía) a partir del JSON de /api/export.json (feature 004,
// SC-007). Herramienta de pruebas: no es una funcionalidad para el usuario.
function importExport(db, json) {
  if (json.format !== 'descanso-export' || json.version !== 1) throw new Error('Formato de exportación desconocido');
  const insertAll = (table, rows) => {
    for (const row of rows) {
      const cols = Object.keys(row);
      db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => row[c]));
    }
  };
  db.transaction(() => {
    db.exec('DELETE FROM metric_entries; DELETE FROM metrics; DELETE FROM naps; DELETE FROM sleep_records;');
    insertAll('metrics', json.metrics);
    insertAll('metric_entries', json.metric_entries);
    insertAll('sleep_records', json.sleep_records);
    insertAll('naps', json.naps);
  })();
}

module.exports = { importExport };
