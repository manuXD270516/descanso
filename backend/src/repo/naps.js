// Siestas de un usuario (feature 008).
const db = require('../db');
const { requireUser, rangeClause } = require('./scope');

const COLS = 'id, date, start_time, end_time, notes, created_at';

function list(userId, range = {}) {
  const params = [requireUser(userId)];
  const sql = `SELECT ${COLS} FROM naps WHERE user_id = ?${rangeClause('date', range, params)} ORDER BY start_time DESC`;
  return db.prepare(sql).all(...params);
}

const get = (userId, id) => db.prepare(`SELECT ${COLS} FROM naps WHERE user_id = ? AND id = ?`).get(requireUser(userId), id);

function create(userId, d) {
  const info = db
    .prepare('INSERT INTO naps (user_id, date, start_time, end_time, notes) VALUES (?,?,?,?,?)')
    .run(requireUser(userId), d.date, d.start_time, d.end_time, d.notes);
  return get(userId, info.lastInsertRowid);
}

function update(userId, id, d) {
  const info = db
    .prepare('UPDATE naps SET date=?, start_time=?, end_time=?, notes=? WHERE user_id = ? AND id = ?')
    .run(d.date, d.start_time, d.end_time, d.notes, requireUser(userId), id);
  return info.changes ? get(userId, id) : undefined;
}

const remove = (userId, id) => db.prepare('DELETE FROM naps WHERE user_id = ? AND id = ?').run(requireUser(userId), id).changes;

module.exports = { list, get, create, update, remove };
