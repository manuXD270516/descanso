// Métricas de un usuario (feature 008), incluida la siembra de las 3 iniciales.
const db = require('../db');
const { requireUser } = require('./scope');

const COLS = 'id, name, type, unit, min_value, max_value, color, sort_order, archived, created_at';

const DEFAULTS = [
  ['Calidad del sueño', 'scale', null, 1, 5, '#5b6ee1', 0],
  ['Energía al despertar', 'scale', null, 1, 5, '#e8a33d', 1],
  ['Cafés', 'number', 'tazas', 0, null, '#8a5a3c', 2],
];

const list = (userId, { all = false } = {}) =>
  db.prepare(`SELECT ${COLS} FROM metrics WHERE user_id = ? ${all ? '' : 'AND archived = 0'} ORDER BY sort_order, id`).all(requireUser(userId));

const get = (userId, id) => db.prepare(`SELECT ${COLS} FROM metrics WHERE user_id = ? AND id = ?`).get(requireUser(userId), id);

function create(userId, m) {
  const info = db
    .prepare('INSERT INTO metrics (user_id, name, type, unit, min_value, max_value, color, sort_order, archived) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(requireUser(userId), m.name, m.type, m.unit, m.min_value, m.max_value, m.color, m.sort_order, m.archived);
  return get(userId, info.lastInsertRowid);
}

function update(userId, id, m) {
  const info = db
    .prepare('UPDATE metrics SET name=?, type=?, unit=?, min_value=?, max_value=?, color=?, sort_order=?, archived=? WHERE user_id = ? AND id = ?')
    .run(m.name, m.type, m.unit, m.min_value, m.max_value, m.color, m.sort_order, m.archived, requireUser(userId), id);
  return info.changes ? get(userId, id) : undefined;
}

const remove = (userId, id) => db.prepare('DELETE FROM metrics WHERE user_id = ? AND id = ?').run(requireUser(userId), id).changes;

/** Las 3 métricas iniciales de un usuario nuevo (antes eran globales, en la migración 001). */
function seedDefaults(userId) {
  const insert = db.prepare('INSERT INTO metrics (user_id, name, type, unit, min_value, max_value, color, sort_order) VALUES (?,?,?,?,?,?,?,?)');
  for (const m of DEFAULTS) insert.run(requireUser(userId), ...m);
}

module.exports = { list, get, create, update, remove, seedDefaults };
