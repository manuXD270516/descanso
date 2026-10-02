const { Router } = require('express');
const repo = require('../repo/naps');
const { isIso, isDate, durationMinutes, localDateOf, parseRange, HttpError } = require('../util');

const r = Router();
const withDuration = (row) => row && { ...row, duration_min: durationMinutes(row.start_time, row.end_time) };

function validate(body) {
  if (!isDate(body.date)) throw new HttpError(400, 'date debe tener formato YYYY-MM-DD');
  if (!isIso(body.start_time) || !isIso(body.end_time)) throw new HttpError(400, 'start_time y end_time deben ser ISO');
  if (durationMinutes(body.start_time, body.end_time) <= 0) throw new HttpError(400, 'La siesta debe terminar después de empezar');
  // Igual que las noches: la fecha es el día (local) en que empezó (principio III, DT-04)
  if (body.date !== localDateOf(body.start_time)) {
    throw new HttpError(400, `La fecha de la siesta debe ser ${localDateOf(body.start_time) ?? 'el día de su inicio'} (el día en que empezó)`);
  }
  return {
    date: body.date,
    start_time: body.start_time,
    end_time: body.end_time,
    notes: body.notes ? String(body.notes).slice(0, 500) : null,
  };
}

r.get('/', (req, res) => {
  res.json(repo.list(req.user.id, parseRange(req.query)).map(withDuration));
});

r.post('/', (req, res) => {
  res.status(201).json(withDuration(repo.create(req.user.id, validate(req.body))));
});

r.put('/:id', (req, res) => {
  const existing = repo.get(req.user.id, req.params.id);
  if (!existing) throw new HttpError(404, 'Siesta no encontrada');
  res.json(withDuration(repo.update(req.user.id, existing.id, validate({ ...existing, ...req.body }))));
});

r.delete('/:id', (req, res) => {
  if (!repo.remove(req.user.id, req.params.id)) throw new HttpError(404, 'Siesta no encontrada');
  res.status(204).end();
});

module.exports = r;
