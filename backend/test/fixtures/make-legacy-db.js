// Genera bases "legacy" deterministas con el inicializador anterior a 003 (legacy-db.js).
//
// Uso como script:  node test/fixtures/make-legacy-db.js <ruta.db> [--realista] [--dos-abiertas]
// Uso en pruebas:   const { makeLegacyDb, hashTables } = require('./fixtures/make-legacy-db');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { openLegacy } = require('./legacy-db');

const pad = (n) => String(n).padStart(2, '0');
const dayOf = (start, i) => {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
};

/**
 * Crea la base en `file` con datos deterministas.
 * - pequeña (por defecto): 30 noches, 10 siestas y valores de las 3 métricas.
 * - realista: 10 años (3.650 noches, ~1.500 siestas, 3 métricas × 3.650 días).
 * - dosAbiertas: añade dos noches sin despertar (estado que 003 no permite).
 */
function makeLegacyDb(file, { realista = false, dosAbiertas = false } = {}) {
  const db = openLegacy(file);
  const nights = realista ? 3650 : 30;
  const start = realista ? '2016-10-01' : '2026-08-01';
  const insNight = db.prepare('INSERT INTO sleep_records (date, bedtime, wake_time, notes) VALUES (?,?,?,?)');
  const insNap = db.prepare('INSERT INTO naps (date, start_time, end_time, notes) VALUES (?,?,?,?)');
  const insEntry = db.prepare('INSERT INTO metric_entries (metric_id, date, value) VALUES (?,?,?)');

  db.transaction(() => {
    for (let i = 0; i < nights; i++) {
      const date = dayOf(start, i);
      const next = dayOf(start, i + 1);
      const bedMin = 22 * 60 + ((i * 37) % 120); // 22:00–23:59
      const wakeMin = 6 * 60 + ((i * 53) % 90); // 06:00–07:29
      insNight.run(
        date,
        `${date}T${pad(Math.floor(bedMin / 60))}:${pad(bedMin % 60)}:00-04:00`,
        `${next}T${pad(Math.floor(wakeMin / 60))}:${pad(wakeMin % 60)}:00-04:00`,
        i % 7 === 0 ? `nota ${i}` : null,
      );
      if (i % (realista ? 2.4 : 3) < 1) {
        insNap.run(next, `${next}T14:${pad(i % 50)}:00-04:00`, `${next}T15:${pad(i % 50)}:00-04:00`, null);
      }
      insEntry.run(1, next, String(1 + (i % 5)));
      insEntry.run(2, next, String(1 + ((i * 3) % 5)));
      insEntry.run(3, next, String(i % 4));
    }
    if (dosAbiertas) {
      insNight.run('2026-09-20', '2026-09-20T23:10:00-04:00', null, null);
      insNight.run('2026-09-21', '2026-09-21T23:20:00-04:00', null, null);
    }
  })();

  db.close();
  return file;
}

/** Huella por tabla de usuario: SHA-256 de todas sus filas en orden de rowid. */
function hashTables(file) {
  const db = new Database(file, { readonly: true });
  const out = {};
  for (const t of ['sleep_records', 'naps', 'metrics', 'metric_entries']) {
    const rows = db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();
    out[t] = crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  }
  db.close();
  return out;
}

module.exports = { makeLegacyDb, hashTables };

if (require.main === module) {
  const [file, ...flags] = process.argv.slice(2);
  if (!file) {
    console.error('Uso: node test/fixtures/make-legacy-db.js <ruta.db> [--realista] [--dos-abiertas]');
    process.exit(1);
  }
  makeLegacyDb(file, { realista: flags.includes('--realista'), dosAbiertas: flags.includes('--dos-abiertas') });
  console.log(`Base legacy creada en ${file}`);
}
