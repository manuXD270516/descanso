// Datos crudos del dashboard de un usuario (feature 005): noches (también la abierta) y siestas.
const db = require('../db');
const { requireUser } = require('./scope');

const nights = (userId, from, to) =>
  db.prepare('SELECT date, bedtime, wake_time FROM sleep_records WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY bedtime')
    .all(requireUser(userId), from, to);

const naps = (userId, from, to) =>
  db.prepare('SELECT date, start_time, end_time FROM naps WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY start_time')
    .all(requireUser(userId), from, to);

module.exports = { nights, naps };
