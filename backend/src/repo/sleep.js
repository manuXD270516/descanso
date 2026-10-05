// Noches de un usuario (feature 008). Lo ajeno no existe: devuelve undefined / 0 cambios.
const db = require('../db');
const { requireUser, rangeClause } = require('./scope');

// sol_bucket y awakenings_bucket: respuestas opcionales de la tarjeta (feature 006); NULL = sin respuesta
// wake_logged_at y wake_from_proposal (feature 010): cuándo se anotó el despertar y si se confirmó la hora propuesta
const COLS = 'id, date, bedtime, wake_time, notes, sol_bucket, awakenings_bucket, wake_logged_at, wake_from_proposal, created_at';

function list(userId, range = {}) {
  const params = [requireUser(userId)];
  const sql = `SELECT ${COLS} FROM sleep_records WHERE user_id = ?${rangeClause('date', range, params)} ORDER BY bedtime DESC`;
  return db.prepare(sql).all(...params);
}

const get = (userId, id) => db.prepare(`SELECT ${COLS} FROM sleep_records WHERE user_id = ? AND id = ?`).get(requireUser(userId), id);

const open = (userId) =>
  db.prepare(`SELECT ${COLS} FROM sleep_records WHERE user_id = ? AND wake_time IS NULL ORDER BY bedtime DESC LIMIT 1`).get(requireUser(userId));

function create(userId, d) {
  const info = db
    .prepare('INSERT INTO sleep_records (user_id, date, bedtime, wake_time, notes, wake_logged_at) VALUES (?,?,?,?,?,?)')
    .run(requireUser(userId), d.date, d.bedtime, d.wake_time ?? null, d.notes ?? null, d.wake_time ? new Date().toISOString() : null);
  return get(userId, info.lastInsertRowid);
}

function update(userId, id, d) {
  // Cuándo se anotó el despertar (010): se fija al pasar de abierta a cerrada y se borra al reabrir
  const loggedAt = !d.wake_time ? null : d.wake_logged_at ?? new Date().toISOString();
  const fromProposal = d.wake_time ? d.wake_from_proposal ?? 0 : 0;
  const info = db
    .prepare('UPDATE sleep_records SET date=?, bedtime=?, wake_time=?, notes=?, sol_bucket=?, awakenings_bucket=?, wake_logged_at=?, wake_from_proposal=? WHERE user_id = ? AND id = ?')
    .run(d.date, d.bedtime, d.wake_time ?? null, d.notes ?? null, d.sol_bucket ?? null, d.awakenings_bucket ?? null, loggedAt, fromProposal, requireUser(userId), id);
  return info.changes ? get(userId, id) : undefined;
}

function setWake(userId, id, wakeTime, fromProposal = false) {
  db.prepare('UPDATE sleep_records SET wake_time = ?, wake_logged_at = ?, wake_from_proposal = ? WHERE user_id = ? AND id = ?')
    .run(wakeTime, new Date().toISOString(), fromProposal ? 1 : 0, requireUser(userId), id);
  return get(userId, id);
}

const remove = (userId, id) => db.prepare('DELETE FROM sleep_records WHERE user_id = ? AND id = ?').run(requireUser(userId), id).changes;

/** Noches cerradas del rango, para el resumen. */
const closedInRange = (userId, from, to) =>
  db.prepare(`SELECT ${COLS} FROM sleep_records WHERE user_id = ? AND wake_time IS NOT NULL AND date >= ? AND date <= ?`).all(requireUser(userId), from, to);

module.exports = { list, get, open, create, update, setWake, remove, closedInRange };
