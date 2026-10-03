// Reconstruye una base (ya migrada y vacía) a partir del JSON de /api/export.json (feature 004,
// SC-007). Herramienta de pruebas: no es una funcionalidad para el usuario.
// Desde 005 toda fila de datos exige un usuario explícito: se asignan al usuario indicado
// (por defecto el propietario, id 1); metric_entries cuelga de su métrica.
function importExport(db, json, userId = 1) {
  if (json.format !== 'descanso-export' || json.version !== 1) throw new Error('Formato de exportación desconocido');
  const insertAll = (table, rows, owned) => {
    for (const row of rows) {
      const data = owned ? { ...row, user_id: userId } : row;
      const cols = Object.keys(data);
      db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => data[c]));
    }
  };
  db.transaction(() => {
    db.exec('DELETE FROM metric_entries; DELETE FROM metrics; DELETE FROM naps; DELETE FROM sleep_records;');
    insertAll('metrics', json.metrics, true);
    insertAll('metric_entries', json.metric_entries, false);
    insertAll('sleep_records', json.sleep_records, true);
    insertAll('naps', json.naps, true);
  })();
}

module.exports = { importExport };
