// Feature 006: ajustes de ciclo de cada persona y respuestas opcionales de la tarjeta "¿Cómo fue la
// noche?". Solo expand: columnas nuevas con DEFAULT o NULL, sin reconstruir; el código de 005 sigue
// funcionando porque nombra sus columnas. NULL en las respuestas = sin respuesta (principio VIII).
// NO EDITAR: una migración aplicada es inmutable (ver docs/sdd/guia-migraciones.md).
const COLUMNS = [
  ['user_settings', 'cycle_min', 'INTEGER NOT NULL DEFAULT 90 CHECK (cycle_min BETWEEN 70 AND 110)'],
  ['user_settings', 'latency_min', 'INTEGER NOT NULL DEFAULT 15 CHECK (latency_min BETWEEN 0 AND 60)'],
  ['sleep_records', 'sol_bucket', "TEXT CHECK (sol_bucket IN ('lt15', '15_30', 'gt30'))"],
  ['sleep_records', 'awakenings_bucket', "TEXT CHECK (awakenings_bucket IN ('0', '1_2', '3plus'))"],
];

module.exports = {
  up(db) {
    for (const [table, column, definition] of COLUMNS) {
      const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
      if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  },
};
