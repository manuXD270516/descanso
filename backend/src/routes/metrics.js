const { Router } = require('express');
const db = require('../db');
const { isDate, HttpError } = require('../util');

const r = Router();
const TYPES = ['number', 'scale', 'boolean', 'text'];

function validateMetric(body) {
  const name = String(body.name || '').trim();
  if (!name) throw new HttpError(400, 'El nombre es obligatorio');
  if (!TYPES.includes(body.type)) throw new HttpError(400, `type debe ser uno de: ${TYPES.join(', ')}`);
  const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
  const min = num(body.min_value);
  const max = num(body.max_value);
  if (body.type === 'scale' && (min === null || max === null || min >= max)) {
    throw new HttpError(400, 'Una escala necesita mínimo y máximo (mínimo < máximo)');
  }
  return {
    name: name.slice(0, 60),
    type: body.type,
    unit: body.unit ? String(body.unit).slice(0, 20) : null,
    min_value: min,
    max_value: max,
    color: /^#[0-9a-fA-F]{6}$/.test(body.color || '') ? body.color : '#5b6ee1',
    sort_order: Number.isInteger(body.sort_order) ? body.sort_order : 0,
    archived: body.archived ? 1 : 0,
  };
}

function validateValue(metric, raw) {
  switch (metric.type) {
    case 'boolean':
      return raw === true || raw === 'true' || raw === 1 || raw === '1' ? '1' : '0';
    case 'number':
    case 'scale': {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new HttpError(400, 'El valor debe ser numérico');
      if (metric.min_value !== null && n < metric.min_value) throw new HttpError(400, `Mínimo ${metric.min_value}`);
      if (metric.max_value !== null && n > metric.max_value) throw new HttpError(400, `Máximo ${metric.max_value}`);
      return String(n);
    }
    default:
      return String(raw ?? '').slice(0, 500);
  }
}

r.get('/', (req, res) => {
  const all = req.query.all === '1';
  res.json(db.prepare(`SELECT * FROM metrics ${all ? '' : 'WHERE archived = 0'} ORDER BY sort_order, id`).all());
});

r.post('/', (req, res) => {
  const m = validateMetric(req.body);
  const info = db.prepare(
    'INSERT INTO metrics (name,type,unit,min_value,max_value,color,sort_order,archived) VALUES (?,?,?,?,?,?,?,?)'
  ).run(m.name, m.type, m.unit, m.min_value, m.max_value, m.color, m.sort_order, m.archived);
  res.status(201).json(db.prepare('SELECT * FROM metrics WHERE id = ?').get(info.lastInsertRowid));
});

r.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM metrics WHERE id = ?').get(req.params.id);
  if (!existing) throw new HttpError(404, 'Métrica no encontrada');
  const m = validateMetric({ ...existing, ...req.body });
  db.prepare(
    'UPDATE metrics SET name=?,type=?,unit=?,min_value=?,max_value=?,color=?,sort_order=?,archived=? WHERE id=?'
  ).run(m.name, m.type, m.unit, m.min_value, m.max_value, m.color, m.sort_order, m.archived, existing.id);
  res.json(db.prepare('SELECT * FROM metrics WHERE id = ?').get(existing.id));
});

r.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM metrics WHERE id = ?').run(req.params.id);
  if (!info.changes) throw new HttpError(404, 'Métrica no encontrada');
  res.status(204).end();
});

// Registros de todas las métricas en un rango: GET /api/metrics/entries?from&to
r.get('/entries', (req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT e.* FROM metric_entries e JOIN metrics m ON m.id = e.metric_id WHERE m.archived = 0';
  const params = [];
  if (from) { sql += ' AND e.date >= ?'; params.push(from); }
  if (to) { sql += ' AND e.date <= ?'; params.push(to); }
  sql += ' ORDER BY e.date DESC';
  res.json(db.prepare(sql).all(...params));
});

// Upsert de un valor para un día: PUT /api/metrics/:id/entries/:date  { value }
r.put('/:id/entries/:date', (req, res) => {
  const metric = db.prepare('SELECT * FROM metrics WHERE id = ?').get(req.params.id);
  if (!metric) throw new HttpError(404, 'Métrica no encontrada');
  if (!isDate(req.params.date)) throw new HttpError(400, 'Fecha inválida');
  const value = validateValue(metric, req.body.value);
  db.prepare(
    `INSERT INTO metric_entries (metric_id, date, value) VALUES (?,?,?)
     ON CONFLICT(metric_id, date) DO UPDATE SET value = excluded.value`
  ).run(metric.id, req.params.date, value);
  res.json(db.prepare('SELECT * FROM metric_entries WHERE metric_id = ? AND date = ?').get(metric.id, req.params.date));
});

r.delete('/:id/entries/:date', (req, res) => {
  const info = db.prepare('DELETE FROM metric_entries WHERE metric_id = ? AND date = ?').run(req.params.id, req.params.date);
  if (!info.changes) throw new HttpError(404, 'Registro no encontrado');
  res.status(204).end();
});

module.exports = r;
