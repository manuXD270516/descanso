// Límite de intentos fallidos en memoria (feature 004, research R5): 5 en 15 min por IP y por email.
// Se vacía al arrancar la máquina (caso límite aceptado en la spec).

function createRateLimiter({ max = 5, windowMs = 15 * 60 * 1000, maxKeys = 10_000, now = Date.now } = {}) {
  const hits = new Map();

  const recent = (key, t) => {
    const list = (hits.get(key) || []).filter((ts) => ts > t - windowMs);
    if (list.length) hits.set(key, list);
    else hits.delete(key);
    return list;
  };

  return {
    /** Segundos hasta poder reintentar si alguna clave superó el límite; 0 si se puede intentar. */
    retryAfter(keys) {
      const t = now();
      let wait = 0;
      for (const key of keys) {
        const list = recent(key, t);
        if (list.length >= max) wait = Math.max(wait, Math.ceil((list[0] + windowMs - t) / 1000));
      }
      return wait;
    },
    fail(keys) {
      const t = now();
      for (const key of keys) {
        const list = recent(key, t);
        list.push(t);
        hits.delete(key); // reinsertar al final: el Map queda ordenado por actividad
        hits.set(key, list);
      }
      while (hits.size > maxKeys) hits.delete(hits.keys().next().value); // la más antigua
    },
    reset(key) {
      hits.delete(key);
    },
    size: () => hits.size,
  };
}

const clientIp = (req) => req.get('Fly-Client-IP') || req.socket.remoteAddress || 'desconocida';
const keysFor = (req, email) => [`ip:${clientIp(req)}`, ...(email ? [`email:${email}`] : [])];

module.exports = { createRateLimiter, limiter: createRateLimiter(), keysFor };
