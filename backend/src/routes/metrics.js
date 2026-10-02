const { Router } = require('express');
const metrics = require('../repo/metrics');
const entries = require('../repo/entries');
const { isDate, parseRange, HttpError } = require('../util');

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
      // Solo sí o no: antes cualquier otro valor se guardaba como "No" (DT-08)
      if (raw === true || raw === 'true' || raw === 1 || raw === '1') return '1';
      if (raw === false || raw === 'false' || raw === 0 || raw === '0') return '0';
      throw new HttpError(400, 'El valor debe ser sí o no');
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
  res.json(metrics.list(req.user.id, { all: req.query.all === '1' }));
});

r.post('/', (req, res) => {
  res.status(201).json(metrics.create(req.user.id, validateMetric(req.body)));
});

r.put('/:id', (req, res) => {
  const existing = metrics.get(req.user.id, req.params.id);
  if (!existing) throw new HttpError(404, 'Métrica no encontrada');
  res.json(metrics.update(req.user.id, existing.id, validateMetric({ ...existing, ...req.body })));
});

r.delete('/:id', (req, res) => {
  if (!metrics.remove(req.user.id, req.params.id)) throw new HttpError(404, 'Métrica no encontrada');
  res.status(204).end();
});

// Registros de todas las métricas en un rango: GET /api/metrics/entries?from&to
r.get('/entries', (req, res) => {
  res.json(entries.list(req.user.id, parseRange(req.query)));
});

// Upsert de un valor para un día: PUT /api/metrics/:id/entries/:date  { value }
r.put('/:id/entries/:date', (req, res) => {
  const metric = metrics.get(req.user.id, req.params.id);
  if (!metric) throw new HttpError(404, 'Métrica no encontrada');
  if (!isDate(req.params.date)) throw new HttpError(400, 'Fecha inválida');
  const value = validateValue(metric, req.body.value);
  res.json(entries.upsert(req.user.id, metric.id, req.params.date, value));
});

r.delete('/:id/entries/:date', (req, res) => {
  // Solo valores de métricas propias: antes borraba por metric_id sin comprobar el dueño (IDOR)
  if (!entries.remove(req.user.id, req.params.id, req.params.date)) throw new HttpError(404, 'Registro no encontrado');
  res.status(204).end();
});

module.exports = r;
