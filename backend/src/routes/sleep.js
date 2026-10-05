const { Router } = require('express');
const repo = require('../repo/sleep');
const streak = require('../repo/streak');
const { isIso, isDate, durationMinutes, localDateOf, parseRange, todayAt, HttpError } = require('../util');

const r = Router();

// Respuestas de la tarjeta "¿Cómo fue la noche?" (feature 006): rangos, no minutos exactos
const BUCKETS = { sol_bucket: ['lt15', '15_30', 'gt30'], awakenings_bucket: ['0', '1_2', '3plus'] };

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
  for (const [key, allowed] of Object.entries(BUCKETS)) {
    if (body[key] === undefined) continue;
    if (body[key] !== null && !allowed.includes(body[key])) throw new HttpError(400, 'Respuesta no válida');
    out[key] = body[key];
  }
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

// Feature 011: las escrituras que pueden subir la racha aplican el trinquete en la misma transacción
// (récord, total y constelaciones; solo con la racha activada). Borrar nunca la sube.
const withRatchet = (userId, iso, fn) => streak.withRatchet(userId, todayAt(iso), fn);

// GET /api/sleep?from=YYYY-MM-DD&to=YYYY-MM-DD
r.get('/', (req, res) => {
  res.json(repo.list(req.user.id, parseRange(req.query)).map(withDuration));
});

// La noche "abierta": me acosté pero aún no registré el despertar
r.get('/open', (req, res) => {
  res.json(withDuration(repo.open(req.user.id)) || null);
});

r.post('/', (req, res) => {
  const d = validate(req.body);
  const create = () => repo.create(req.user.id, d);
  res.status(201).json(withDuration(writeNight(() => (d.wake_time ? withRatchet(req.user.id, d.wake_time, create) : create()))));
});

// Cierra la noche abierta con la hora de despertar
r.post('/wake', (req, res) => {
  const wake_time = req.body.wake_time;
  if (!isIso(wake_time)) throw new HttpError(400, 'wake_time debe ser ISO');
  // Feature 010: confirmar la hora propuesta sin cambiarla queda registrado (lo usará 011)
  const fromProposal = req.body.from_proposal ?? false;
  if (typeof fromProposal !== 'boolean') throw new HttpError(400, 'from_proposal debe ser true o false');
  const open = repo.open(req.user.id);
  if (!open) throw new HttpError(404, 'No hay una noche abierta para cerrar');
  if (durationMinutes(open.bedtime, wake_time) <= 0) throw new HttpError(400, 'La hora de despertar debe ser posterior a la de dormir');
  res.json(withDuration(withRatchet(req.user.id, wake_time, () => repo.setWake(req.user.id, open.id, wake_time, fromProposal))));
});

r.put('/:id', (req, res) => {
  const existing = repo.get(req.user.id, req.params.id);
  if (!existing) throw new HttpError(404, 'Registro no encontrado');
  const d = validate({ ...existing, ...req.body }, false);
  // Feature 010: si ya estaba cerrada, se conserva cuándo se anotó; si se cierra ahora, el repo lo fija
  d.wake_logged_at = existing.wake_time ? existing.wake_logged_at : null;
  d.wake_from_proposal = existing.wake_time ? existing.wake_from_proposal : 0;
  res.json(withDuration(writeNight(() => withRatchet(req.user.id, d.wake_time ?? d.bedtime, () => repo.update(req.user.id, existing.id, d)))));
});

r.delete('/:id', (req, res) => {
  if (!repo.remove(req.user.id, req.params.id)) throw new HttpError(404, 'Registro no encontrado');
  res.status(204).end();
});

module.exports = r;
