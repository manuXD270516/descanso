const { Router } = require('express');
const db = require('../db');
const { durationMinutes } = require('../util');

const r = Router();

// GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD  → resumen diario + promedios
r.get('/', (req, res) => {
  const { from, to } = req.query;
  const sleep = db.prepare('SELECT * FROM sleep_records WHERE wake_time IS NOT NULL AND date >= ? AND date <= ?').all(from, to);
  const naps = db.prepare('SELECT * FROM naps WHERE date >= ? AND date <= ?').all(from, to);

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
  const circularAvg = (values) => {
    if (!values.length) return null;
    const rad = values.map((v) => (v / 1440) * 2 * Math.PI);
    const x = rad.reduce((s, a) => s + Math.cos(a), 0) / rad.length;
    const y = rad.reduce((s, a) => s + Math.sin(a), 0) / rad.length;
    let ang = Math.atan2(y, x);
    if (ang < 0) ang += 2 * Math.PI;
    return Math.round((ang / (2 * Math.PI)) * 1440);
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
