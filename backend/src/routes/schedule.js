// Horario, archivo de calendario y pausas (feature 010). Montado en /api; todo por usuario.
const { Router } = require('express');
const schedule = require('../repo/schedule');
const pauses = require('../repo/pauses');
const users = require('../repo/users');
const { scheduleIcs } = require('../ics');
const { isDate, clientToday, HttpError } = require('../util');

const r = Router();

const isMinute = (v) => Number.isInteger(v) && v >= 0 && v <= 1439;

function validateDays(days) {
  if (!Array.isArray(days) || days.length !== 7) throw new HttpError(400, 'El horario debe tener los 7 días');
  const seen = new Set();
  return days.map((d) => {
    if (!d || !Number.isInteger(d.weekday) || d.weekday < 0 || d.weekday > 6 || seen.has(d.weekday)) {
      throw new HttpError(400, 'El horario debe tener los 7 días');
    }
    seen.add(d.weekday);
    if (!isMinute(d.bed_min) || !isMinute(d.wake_min)) throw new HttpError(400, 'Hora no válida');
    if (typeof d.active !== 'boolean') throw new HttpError(400, 'Hora no válida');
    return { weekday: d.weekday, bed_min: d.bed_min, wake_min: d.wake_min, active: d.active };
  });
}

// GET /api/schedule?date=AAAA-MM-DD → versión vigente, aviso y pausa activa en esa fecha
r.get('/schedule', (req, res) => {
  const date = req.query.date;
  if (!isDate(date)) throw new HttpError(400, 'Fecha inválida');
  res.json({ version: schedule.current(req.user.id, date), lead_min: users.leadOf(req.user.id), pause: pauses.activeOn(req.user.id, date) });
});

r.put('/schedule', (req, res) => {
  const today = clientToday(req.body?.today);
  res.json(schedule.save(req.user.id, today, validateDays(req.body.days)));
});

// GET /api/schedule.ics?today=AAAA-MM-DD → archivo de calendario del horario vigente (FR-007…FR-010)
r.get('/schedule.ics', (req, res) => {
  const today = clientToday(req.query.today);
  const v = schedule.current(req.user.id, today);
  if (!v) throw new HttpError(404, 'No tienes horario');
  const ics = scheduleIcs({
    userId: req.user.id,
    versionId: v.id,
    effectiveFrom: today,
    days: v.days,
    everActive: schedule.everActiveBefore(req.user.id, v.id),
    baseUrl: `${req.protocol}://${req.get('host')}`,
    leadMin: users.leadOf(req.user.id),
    now: new Date(),
  });
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="descanso-horario.ics"');
  res.send(ics);
});

r.get('/pauses', (req, res) => res.json(pauses.list(req.user.id)));

r.post('/pauses', (req, res) => {
  const today = clientToday(req.body?.today);
  const { start_date, end_date } = req.body;
  if (!isDate(start_date) || !isDate(end_date)) throw new HttpError(400, 'Fecha inválida');
  res.status(201).json(pauses.create(req.user.id, { start_date, end_date, today }));
});

r.post('/pauses/:id/end', (req, res) => {
  const today = clientToday(req.body?.today);
  const result = pauses.end(req.user.id, Number(req.params.id), today);
  if (result === undefined) throw new HttpError(404, 'Pausa no encontrada');
  if (result === null) return res.status(204).end();
  res.json(result);
});

module.exports = r;
