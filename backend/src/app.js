const express = require('express');
const path = require('path');
const fs = require('fs');

require('./db'); // aplica las migraciones pendientes antes de crear la app
const { storageStatus } = require('./storage');
const { requireAuth, csrf, securityHeaders } = require('./auth/middleware');

const app = express();
app.set('trust proxy', 1); // Fly termina TLS: req.secure sale de X-Forwarded-Proto
app.use(securityHeaders);
app.use(express.json());

// Públicas: salud y respaldo del pipeline (con su propio token Bearer, sin cookie)
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString(), version: process.env.APP_VERSION || 'dev', storage: storageStatus() }));
// Respaldo para el pipeline: deshabilitado (404) si no hay token configurado
if (process.env.BACKUP_TOKEN) app.use('/api/admin', require('./routes/admin'));
else app.use('/api/admin', (_req, res) => res.status(404).json({ error: 'No encontrado' })); // contrato de 002, también sin sesión

// El resto de la API: escrituras solo desde el propio sitio y, salvo /auth, con sesión (feature 004)
app.use('/api', csrf);
app.use('/api/auth', require('./routes/auth'));
app.use('/api', requireAuth);
app.use('/api/sleep', require('./routes/sleep'));
app.use('/api/naps', require('./routes/naps'));
app.use('/api/metrics', require('./routes/metrics'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api', require('./routes/export'));
app.use('/api/people', require('./routes/people'));
app.use('/api/me', require('./routes/me'));

// Sirve el frontend compilado de Angular si existe (despliegue en un solo servicio)
const distDir = process.env.FRONTEND_DIST || path.join(__dirname, '..', '..', 'frontend', 'dist', 'frontend', 'browser');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

// Manejo de errores uniforme
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Error interno' : err.message });
});

module.exports = app;
