process.env.BACKUP_TOKEN = 'token-de-respaldo';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { api, anon, app, sessionId } = require('./helpers');

// Defensas (US3): CSRF, CORS, cabeceras y 401 en todas las rutas (FR-003, FR-013, FR-014, FR-017, SC-001).
const raw = () => supertest(app);
const withSession = (req) => req.set('Cookie', `sid=${sessionId}`);

test('escrituras desde otro origen → 403 y no cambia nada (FR-013)', async () => {
  const before = (await api.get('/api/metrics').expect(200)).body.length;
  const cases = [
    (r) => r.set('Origin', 'https://evil.example'),
    (r) => r.set('Sec-Fetch-Site', 'cross-site'),
    (r) => r.set('Sec-Fetch-Site', 'same-site'),
    (r) => r, // sin Origin ni Sec-Fetch-Site
    (r) => r.set('Origin', 'null'),
  ];
  for (const decorate of cases) {
    const res = await decorate(withSession(raw().post('/api/metrics'))).send({ name: 'X', type: 'number' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'Petición rechazada: origen no permitido');
  }
  await decorate403(withSession(raw().delete('/api/sleep/1')).set('Origin', 'https://evil.example'));
  await decorate403(raw().post('/api/auth/login').set('Origin', 'https://evil.example').send({ email: 'a@b.c', password: 'x' }));
  assert.equal((await api.get('/api/metrics').expect(200)).body.length, before);
});
const decorate403 = async (req) => assert.equal((await req).status, 403);

test('escrituras del propio sitio: Sec-Fetch-Site same-origin, o Origin igual al host', async () => {
  await withSession(raw().post('/api/metrics')).set('Sec-Fetch-Site', 'same-origin').send({ name: 'A', type: 'number' }).expect(201);
  const res = await withSession(raw().post('/api/metrics')).set('Host', 'descanso-sleep.fly.dev').set('Origin', 'https://descanso-sleep.fly.dev').send({ name: 'B', type: 'number' });
  assert.equal(res.status, 201);
});

test('el respaldo del pipeline sigue funcionando con su token, sin cookie ni cabeceras de origen', async () => {
  await raw().get('/api/admin/backup').set('Authorization', 'Bearer token-de-respaldo').expect(200);
});

test('sin cabeceras CORS: otros orígenes no pueden leer la API (FR-014)', async () => {
  const res = await withSession(raw().get('/api/sleep')).set('Origin', 'https://evil.example').expect(200);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
  const pre = await raw().options('/api/sleep').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
  assert.equal(pre.headers['access-control-allow-origin'], undefined);
});

test('cabeceras de seguridad en todas las respuestas; HSTS solo en HTTPS (FR-017)', async () => {
  for (const url of ['/api/health', '/api/sleep', '/api/auth/status']) {
    const res = await raw().get(url);
    assert.match(res.headers['content-security-policy'], /default-src 'self'.*script-src 'self'.*frame-ancestors 'none'/);
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['referrer-policy'], 'same-origin');
    assert.equal(res.headers['strict-transport-security'], undefined);
  }
  const https = await raw().get('/api/health').set('X-Forwarded-Proto', 'https');
  assert.equal(https.headers['strict-transport-security'], 'max-age=31536000');
});

/** Rutas de un router de Express 5 (método + path) para recorrerlas todas. */
function routesOf(router, prefix) {
  return router.stack
    .filter((l) => l.route)
    .flatMap((l) => Object.keys(l.route.methods).map((m) => [m, prefix + l.route.path]));
}

test('todas las rutas de datos responden 401 sin sesión (SC-001, FR-003)', async () => {
  const mounts = {
    '/api/sleep': require('../src/routes/sleep'),
    '/api/naps': require('../src/routes/naps'),
    '/api/metrics': require('../src/routes/metrics'),
    '/api/stats': require('../src/routes/stats'),
    '/api': require('../src/routes/export'),
  };
  const routes = Object.entries(mounts).flatMap(([prefix, router]) => routesOf(router, prefix));
  assert.ok(routes.length >= 20, `se recorren ${routes.length} rutas`);
  for (const [method, path] of routes) {
    const url = path.replace(':id', '1').replace(':date', '2026-09-01').replace(':tipo', 'noches');
    const res = await anon[method](url).send({});
    assert.equal(res.status, 401, `${method.toUpperCase()} ${url}`);
  }
  // Excepciones públicas
  await anon.get('/api/health').expect(200);
  await anon.get('/api/auth/status').expect(200);
});
