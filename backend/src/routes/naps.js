const { Router } = require('express');
const db = require('../db');
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
  const { from, to } = parseRange(req.query);
  let sql = 'SELECT * FROM naps';
  const params = [];
  const where = [];
  if (from) { where.push('date >= ?'); params.push(from); }
  if (to) { where.push('date <= ?'); params.push(to); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY start_time DESC';
  res.json(db.prepare(sql).all(...params).map(withDuration));
});

r.post('/', (req, res) => {
  const d = validate(req.body);
  const info = db.prepare('INSERT INTO naps (date, start_time, end_time, notes) VALUES (?,?,?,?)')
    .run(d.date, d.start_time, d.end_time, d.notes);
  res.status(201).json(withDuration(db.prepare('SELECT * FROM naps WHERE id = ?').get(info.lastInsertRowid)));
});

r.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM naps WHERE id = ?').get(req.params.id);
  if (!existing) throw new HttpError(404, 'Siesta no encontrada');
  const d = validate({ ...existing, ...req.body });
  db.prepare('UPDATE naps SET date=?, start_time=?, end_time=?, notes=? WHERE id=?')
    .run(d.date, d.start_time, d.end_time, d.notes, existing.id);
  res.json(withDuration(db.prepare('SELECT * FROM naps WHERE id = ?').get(existing.id)));
});

r.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM naps WHERE id = ?').run(req.params.id);
  if (!info.changes) throw new HttpError(404, 'Siesta no encontrada');
  res.status(204).end();
});

module.exports = r;
