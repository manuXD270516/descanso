// Datos del resumen de un usuario (feature 008): noches cerradas y siestas del rango.
const db = require('../db');
const { requireUser } = require('./scope');
const sleep = require('./sleep');

const napsInRange = (userId, from, to) =>
  db.prepare('SELECT id, date, start_time, end_time FROM naps WHERE user_id = ? AND date >= ? AND date <= ?').all(requireUser(userId), from, to);

const nightsInRange = (userId, from, to) => sleep.closedInRange(userId, from, to);

module.exports = { nightsInRange, napsInRange };
