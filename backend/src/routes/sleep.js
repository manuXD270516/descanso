const { Router } = require('express');
const db = require('../db');
const { isIso, isDate, durationMinutes, localDateOf, parseRange, HttpError } = require('../util');

const r = Router();

function withDuration(row) {
  return row && { ...row, duration_min: row.wake_time ? durationMinutes(row.bedtime, row.wake_time) : null };
}

function validate(body, partial = false) {
  const out = {};
  if (!partial || body.date !== undefined) {
    if (!isDate(body.date)) throw new HttpError(400, 'date debe tener formato YYYY-MM-DD');
    out.date = body.date;
  }
  if (!partial || body.bedtime !== undefined) {
    if (!isIso(body.bedtime)) throw new HttpError(400, 'bedtime debe ser una fecha/hora ISO válida');
    out.bedtime = body.bedtime;
  }
  if (body.wake_time !== undefined) {
    if (body.wake_time !== null && !isIso(body.wake_time)) throw new HttpError(400, 'wake_time debe ser ISO o null');
    out.wake_time = body.wake_time;
  }
  if (body.notes !== undefined) out.notes = body.notes ? String(body.notes).slice(0, 500) : null;
  if (out.bedtime && out.wake_time && durationMinutes(out.bedtime, out.wake_time) <= 0) {
    throw new HttpError(400, 'La hora de despertar debe ser posterior a la de dormir');
  }
  // La fecha de la noche es el día (local) en que te acostaste: principio III, DT-04
  if (!partial && out.date !== localDateOf(out.bedtime)) {
    throw new HttpError(400, `La fecha de la noche debe ser ${localDateOf(out.bedtime) ?? 'el día de la hora de dormir'} (el día en que te acostaste)`);
  }
  return out;
}

// Solo puede haber una noche abierta a la vez (FR-003): lo garantiza el índice ux_sleep_one_open
// (migración 002); aquí se traduce su error a 409.
function writeNight(fn) {
  try {
    return fn();
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' && e.message.includes('ux_sleep_one_open')) {
      throw new HttpError(409, 'Ya hay una noche abierta. Ciérrala antes de abrir otra.');
    }
    throw e;
  }
}

// GET /api/sleep?from=YYYY-MM-DD&to=YYYY-MM-DD
r.get('/', (req, res) => {
  const { from, to } = parseRange(req.query);
  let sql = 'SELECT * FROM sleep_records';
  const params = [];
  const where = [];
  if (from) { where.push('date >= ?'); params.push(from); }
  if (to) { where.push('date <= ?'); params.push(to); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY bedtime DESC';
  res.json(db.prepare(sql).all(...params).map(withDuration));
});

// La noche "abierta": me acosté pero aún no registré el despertar
r.get('/open', (_req, res) => {
  const row = db.prepare('SELECT * FROM sleep_records WHERE wake_time IS NULL ORDER BY bedtime DESC LIMIT 1').get();
  res.json(withDuration(row) || null);
});

r.post('/', (req, res) => {
  const d = validate(req.body);
  const info = writeNight(() =>
    db
      .prepare('INSERT INTO sleep_records (date, bedtime, wake_time, notes) VALUES (?,?,?,?)')
      .run(d.date, d.bedtime, d.wake_time ?? null, d.notes ?? null),
  );
  res.status(201).json(withDuration(db.prepare('SELECT * FROM sleep_records WHERE id = ?').get(info.lastInsertRowid)));
});

// Cierra la noche abierta con la hora de despertar
r.post('/wake', (req, res) => {
  const wake_time = req.body.wake_time;
  if (!isIso(wake_time)) throw new HttpError(400, 'wake_time debe ser ISO');
  const open = db.prepare('SELECT * FROM sleep_records WHERE wake_time IS NULL ORDER BY bedtime DESC LIMIT 1').get();
  if (!open) throw new HttpError(404, 'No hay una noche abierta para cerrar');
  if (durationMinutes(open.bedtime, wake_time) <= 0) throw new HttpError(400, 'La hora de despertar debe ser posterior a la de dormir');
  db.prepare('UPDATE sleep_records SET wake_time = ? WHERE id = ?').run(wake_time, open.id);
  res.json(withDuration(db.prepare('SELECT * FROM sleep_records WHERE id = ?').get(open.id)));
});

r.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM sleep_records WHERE id = ?').get(req.params.id);
  if (!existing) throw new HttpError(404, 'Registro no encontrado');
  const d = validate({ ...existing, ...req.body }, false);
  writeNight(() =>
    db.prepare('UPDATE sleep_records SET date=?, bedtime=?, wake_time=?, notes=? WHERE id=?')
      .run(d.date, d.bedtime, d.wake_time ?? null, d.notes ?? null, existing.id),
  );
  res.json(withDuration(db.prepare('SELECT * FROM sleep_records WHERE id = ?').get(existing.id)));
});

r.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM sleep_records WHERE id = ?').run(req.params.id);
  if (!info.changes) throw new HttpError(404, 'Registro no encontrado');
  res.status(204).end();
});

module.exports = r;
