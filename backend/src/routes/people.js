// Personas de la instalación (feature 008): solo el propietario. Nunca expone datos de salud.
const { Router } = require('express');
const users = require('../repo/users');
const invites = require('../repo/invites');
const audit = require('../repo/audit');
const { requireOwner } = require('../auth/middleware');
const { HttpError } = require('../util');

const r = Router();
r.use(requireOwner);

r.get('/', (_req, res) => res.json(users.listPeople()));

r.get('/invites', (_req, res) => res.json(invites.list()));

// El frontend compone el enlace /#invitacion=<token>; el token solo se muestra ahora
r.post('/invites', (req, res) => res.status(201).json(invites.create(req.user.id)));

r.delete('/invites/:id', (req, res) => {
  if (!invites.revoke(req.params.id)) throw new HttpError(404, 'Invitación no encontrada o ya no está pendiente');
  res.status(204).end();
});

// Enlace de recuperación de 30 min para una persona invitada (US4); el propietario usa la rotación de 004
r.post('/:id/reset-link', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || users.roleOf(id) !== 'user') throw new HttpError(404, 'Persona no encontrada');
  res.status(201).json(audit.createReset(id, req.user.id));
});

module.exports = r;
