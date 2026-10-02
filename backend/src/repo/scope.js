// Garantía común de la capa repo/ (feature 008): toda función de datos recibe el usuario.
// Sin userId válido se lanza: nunca se consulta "de todos" por olvido.
function requireUser(userId) {
  if (!Number.isInteger(userId) || userId <= 0) throw new Error(`repo: userId obligatorio (recibido ${userId})`);
  return userId;
}

/** Añade from/to opcionales a un WHERE que ya filtra por usuario. */
function rangeClause(column, { from, to }, params) {
  let sql = '';
  if (from) { sql += ` AND ${column} >= ?`; params.push(from); }
  if (to) { sql += ` AND ${column} <= ?`; params.push(to); }
  return sql;
}

module.exports = { requireUser, rangeClause };
