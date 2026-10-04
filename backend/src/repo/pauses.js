// Pausas de un usuario (feature 010, US4): viaje, malestar o turnos. Las reglas se validan dentro de
// una transacción para que dos peticiones no dejen pausas solapadas. 011 las leerá para las rachas.
const db = require('../db');
const { requireUser } = require('./scope');
const { HttpError } = require('../util');

const COLS = 'id, start_date, end_date, created_at';
const MAX_DAYS = 14;
const MAX_PER_30_DAYS = 2;

function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

const list = (userId) => db.prepare(`SELECT ${COLS} FROM pauses WHERE user_id = ? ORDER BY start_date`).all(requireUser(userId));
const get = (userId, id) => db.prepare(`SELECT ${COLS} FROM pauses WHERE user_id = ? AND id = ?`).get(requireUser(userId), id);
const activeOn = (userId, date) =>
  db.prepare(`SELECT ${COLS} FROM pauses WHERE user_id = ? AND start_date <= ? AND end_date >= ? LIMIT 1`).get(requireUser(userId), date, date) ?? null;

/** Crea una pausa si cumple las 4 reglas (FR-015); si no, lanza el error con el motivo. */
function create(userId, { start_date, end_date, today }) {
  requireUser(userId);
  return db.transaction(() => {
    if (start_date < today) throw new HttpError(400, 'La pausa no puede empezar en el pasado');
    if (end_date < start_date) throw new HttpError(400, 'La pausa debe terminar el mismo día o después de empezar');
    if (daysBetween(start_date, end_date) + 1 > MAX_DAYS) throw new HttpError(400, 'La pausa dura como máximo 14 días');
    const overlap = db.prepare('SELECT 1 FROM pauses WHERE user_id = ? AND start_date <= ? AND end_date >= ?').get(userId, end_date, start_date);
    if (overlap) throw new HttpError(409, 'Se solapa con otra pausa');
    const recent = db
      .prepare('SELECT COUNT(*) AS c FROM pauses WHERE user_id = ? AND start_date > ? AND start_date <= ?')
      .get(userId, addDays(start_date, -30), addDays(start_date, 30)).c;
    if (recent >= MAX_PER_30_DAYS) throw new HttpError(400, 'Solo puedes hacer 2 pausas cada 30 días');
    const id = db
      .prepare('INSERT INTO pauses (user_id, start_date, end_date, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, start_date, end_date, new Date().toISOString()).lastInsertRowid;
    return get(userId, id);
  }).immediate();
}

/** Termina hoy una pausa ya empezada; una futura se cancela (la borra su dueño). */
function end(userId, id, today) {
  const p = get(userId, id);
  if (!p) return undefined;
  if (p.start_date > today) {
    db.prepare('DELETE FROM pauses WHERE user_id = ? AND id = ?').run(userId, id);
    return null;
  }
  db.prepare('UPDATE pauses SET end_date = ? WHERE user_id = ? AND id = ?').run(today < p.end_date ? today : p.end_date, userId, id);
  return get(userId, id);
}

module.exports = { list, get, activeOn, create, end };
