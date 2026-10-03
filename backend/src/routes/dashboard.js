// Tendencias del usuario (feature 005): GET /api/dashboard?days=7|30|90&to=AAAA-MM-DD
const { Router } = require('express');
const repo = require('../repo/dashboard');
const users = require('../repo/users');
const a = require('../analytics');
const { isDate, HttpError } = require('../util');

const r = Router();
const PERIODS = new Set([7, 30, 90]);

r.get('/', (req, res) => {
  const days = Number(req.query.days);
  if (!PERIODS.has(days)) throw new HttpError(400, 'El periodo debe ser 7, 30 o 90 días');
  const to = req.query.to;
  // El cliente envía la fecha de la noche de hoy (su zona horaria); hoy + 1 día en UTC cubre cualquier zona
  if (!isDate(to) || to > a.addDays(new Date().toISOString().slice(0, 10), 1)) throw new HttpError(400, 'Fecha inválida');

  const from = a.addDays(to, -(days - 1));
  const from14 = a.addDays(to, -13);
  const fetchFrom = from < from14 ? from : from14;
  const nights = repo.nights(req.user.id, fetchFrom, to);
  const naps = repo.naps(req.user.id, fetchFrom, to);
  const goal = users.goalOf(req.user.id);
  const cycle = users.cycleOf(req.user.id); // feature 006: el ciclo de cada persona
  const period = a.buildDays(nights, naps, from, to);

  res.json({
    goal_min: goal,
    cycle_min: cycle,
    period: { from, to, days },
    days: period,
    summary: a.summary(period, goal),
    pending14: a.pending(a.buildDays(nights, naps, from14, to), goal),
    regularity: a.regularity(nights.filter((n) => n.date >= from)),
    cycles: a.cycles(goal, cycle),
  });
});

module.exports = r;
