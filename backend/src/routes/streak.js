// Racha de constancia (feature 011): estado, ajustes y constelaciones vistas. Montado en /api/streak.
const { Router } = require('express');
const repo = require('../repo/streak');
const { MILESTONES } = require('../streak');
const { clientToday, HttpError } = require('../util');

const r = Router();

// GET /api/streak?today=AAAA-MM-DD → sin efectos secundarios (FR-010)
r.get('/', (req, res) => {
  res.json(repo.view(req.user.id, clientToday(req.query.today)));
});

r.put('/settings', (req, res) => {
  const today = clientToday(req.body?.today);
  res.json(repo.saveSettings(req.user.id, today, req.body));
});

r.post('/achievements/:key/seen', (req, res) => {
  const key = Number(req.params.key);
  if (!MILESTONES.includes(key) || !repo.markSeen(req.user.id, key)) throw new HttpError(404, 'Logro no encontrado');
  res.status(204).end();
});

module.exports = r;
