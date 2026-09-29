const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

require('./db'); // inicializa tablas

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString(), version: process.env.APP_VERSION || 'dev' }));
app.use('/api/sleep', require('./routes/sleep'));
app.use('/api/naps', require('./routes/naps'));
app.use('/api/metrics', require('./routes/metrics'));
app.use('/api/stats', require('./routes/stats'));
// Respaldo para el pipeline: deshabilitado (404) si no hay token configurado
if (process.env.BACKUP_TOKEN) app.use('/api/admin', require('./routes/admin'));

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
