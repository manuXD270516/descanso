const { Router } = require('express');
const repo = require('../repo/stats');
const { durationMinutes, parseRange, circularAvg } = require('../util');

const r = Router();

// GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD  → resumen diario + promedios
r.get('/', (req, res) => {
  const { from, to } = parseRange(req.query, { required: true });
  const sleep = repo.nightsInRange(req.user.id, from, to);
  const naps = repo.napsInRange(req.user.id, from, to);

  const days = {};
  const day = (d) => (days[d] ||= { date: d, sleep_min: 0, nap_min: 0, naps: 0, bedtime: null, wake_time: null });

  for (const s of sleep) {
    const d = day(s.date);
    d.sleep_min += durationMinutes(s.bedtime, s.wake_time);
    d.bedtime = s.bedtime;
    d.wake_time = s.wake_time;
  }
  for (const n of naps) {
    const d = day(n.date);
    d.nap_min += durationMinutes(n.start_time, n.end_time);
    d.naps += 1;
  }

  const list = Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
  const nights = list.filter((d) => d.sleep_min > 0);
  const avg = (arr, key) => (arr.length ? Math.round(arr.reduce((s, x) => s + x[key], 0) / arr.length) : 0);

  // Hora media de acostarse/despertar, expresada en minutos desde medianoche (hora local del servidor no importa: se usa la del cliente en el ISO)
  const minutesOfDay = (iso) => {
    const m = iso.match(/T(\d{2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  res.json({
    days: list,
    summary: {
      nights: nights.length,
      avg_sleep_min: avg(nights, 'sleep_min'),
      avg_nap_min: avg(list.filter((d) => d.naps > 0), 'nap_min'),
      total_naps: naps.length,
      avg_bedtime_min: circularAvg(nights.map((d) => minutesOfDay(d.bedtime)).filter((v) => v !== null)),
      avg_wake_min: circularAvg(nights.map((d) => minutesOfDay(d.wake_time)).filter((v) => v !== null)),
    },
  });
});

module.exports = r;
