const { Router } = require('express');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../db');

const r = Router();

// Compara en tiempo constante; solo se monta si BACKUP_TOKEN está definido (ver app.js)
function authorized(header) {
  const expected = Buffer.from(`Bearer ${process.env.BACKUP_TOKEN}`);
  const given = Buffer.from(String(header || ''));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// Copia consistente de la base con la API de backup online de SQLite: GET /api/admin/backup
r.get('/backup', async (req, res) => {
  if (!authorized(req.get('authorization'))) return res.status(401).json({ error: 'No autorizado' });

  const stamp = new Date().toISOString().replace(/:/g, '').replace(/\.\d{3}/, ''); // 2026-09-29T061214Z
  const tmp = path.join(os.tmpdir(), `descanso-backup-${stamp}-${crypto.randomUUID()}.db`);
  const cleanup = () => fs.rm(tmp, { force: true }, () => {});
  try {
    await db.backup(tmp);
  } catch (err) {
    cleanup();
    throw err;
  }
  res.download(tmp, `descanso-${stamp}.db`, { headers: { 'Content-Type': 'application/octet-stream' } }, cleanup);
});

module.exports = r;
