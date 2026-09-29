// Cada archivo de test corre en su propio proceso (node --test), así que cada uno
// obtiene una base en memoria nueva, con el esquema y las métricas iniciales.
process.env.DB_PATH = ':memory:';

const supertest = require('supertest');
const app = require('../src/app');
const db = require('../src/db');

const api = supertest(app);

/** "2026-09-07T23:40" + "-04:00" → "2026-09-07T23:40:00-04:00" */
const iso = (local, offset = '-04:00') => `${local}:00${offset}`;

/** Vacía noches, siestas y valores de métricas (las métricas se conservan). */
function reset() {
  db.exec('DELETE FROM sleep_records; DELETE FROM naps; DELETE FROM metric_entries;');
}

module.exports = { api, db, iso, reset };
