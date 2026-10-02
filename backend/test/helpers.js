// Cada archivo de test corre en su propio proceso (node --test), así que cada uno
// obtiene una base en memoria nueva, con el esquema y las métricas iniciales.
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test'; // scrypt con coste bajo (ver src/auth/password.js)

const supertest = require('supertest');
const app = require('../src/app');
const db = require('../src/db');
const { bootstrap } = require('../src/auth/bootstrap');
const { createSession } = require('../src/auth/sessions');

// Propietario ya dado de alta y una sesión: la API exige sesión desde la feature 004.
// El hash no es real: los tests de entrada crean el suyo con hashPassword().
const OWNER_EMAIL = 'propietario@descanso.test';
bootstrap(db, 'test-token', { info() {} });
db.prepare("UPDATE users SET email = ?, password_hash = 'scrypt$helpers' WHERE id = 1").run(OWNER_EMAIL);
db.prepare('UPDATE auth_setup SET used_at = ? WHERE id = 1').run(new Date().toISOString());
const sessionId = createSession(db, 1);

/** Cliente con sesión y cabecera de mismo origen (CSRF), como un navegador en la app. */
const api = supertest.agent(app).set('Cookie', `sid=${sessionId}`).set('Sec-Fetch-Site', 'same-origin');

// Segundo usuario (feature 008): una persona invitada, con sus propias métricas iniciales.
const OTHER_EMAIL = 'invitada@descanso.test';
const OTHER_ID = Number(
  db.prepare("INSERT INTO users (email, password_hash, role, display_name, created_at) VALUES (?, 'scrypt$helpers', 'user', 'Invitada', ?)")
    .run(OTHER_EMAIL, new Date().toISOString()).lastInsertRowid,
);
db.prepare('INSERT INTO user_settings (user_id, updated_at) VALUES (?, ?)').run(OTHER_ID, new Date().toISOString());
require('../src/repo/metrics').seedDefaults(OTHER_ID);
const otherSessionId = createSession(db, OTHER_ID);
/** Cliente con la sesión del segundo usuario. */
const otherApi = supertest.agent(app).set('Cookie', `sid=${otherSessionId}`).set('Sec-Fetch-Site', 'same-origin');
/** Cliente sin sesión (mismo origen) que no guarda cookies entre peticiones. */
const anon = Object.fromEntries(
  ['get', 'post', 'put', 'delete'].map((m) => [m, (url) => supertest(app)[m](url).set('Sec-Fetch-Site', 'same-origin')]),
);

/** "2026-09-07T23:40" + "-04:00" → "2026-09-07T23:40:00-04:00" */
const iso = (local, offset = '-04:00') => `${local}:00${offset}`;

/** Vacía noches, siestas y valores de métricas de todos los usuarios (las métricas se conservan). */
function reset() {
  db.exec('DELETE FROM sleep_records; DELETE FROM naps; DELETE FROM metric_entries;');
}

module.exports = { api, anon, app, db, iso, reset, OWNER_EMAIL, sessionId, otherApi, OTHER_ID, OTHER_EMAIL, otherSessionId };
