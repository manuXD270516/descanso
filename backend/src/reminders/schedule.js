// Vencimientos de los avisos (feature 013, research R2). Función pura, sin I/O: recibe el reloj y lo
// que sabe de cada persona y devuelve qué avisos vencen, con su noche, su instante y su estado.
// Se recalcula en cada tick, así un cambio de tipos, horario, "Avisarme antes", zona o pausa rige
// desde el siguiente aviso no enviado sin invalidar nada (FR-017).
const { zonedToUtc, localParts } = require('./zoned');
const { WINDOW_MIN, KINDS } = require('./windows');
const { nightOf } = require('../streak');

const MINUTE = 60_000;
const NIGHTS_BACK = 2; // noches candidatas: hoy − 2 … hoy
const WAKE_GRACE_MIN = 60; // "¿ya despertaste?" llega una hora después de la hora de levantarse

const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Versión vigente en la fecha: mayor effective_from ≤ fecha y, a igualdad, la de id mayor (010). */
function versionAt(versions, date) {
  let best = null;
  for (const v of versions) {
    if (v.effective_from > date) continue;
    if (!best || v.effective_from > best.effective_from || (v.effective_from === best.effective_from && v.id > best.id)) best = v;
  }
  return best;
}

/**
 * @param {{ now: number, users: Array<{
 *   id: number, timezone: string|null, lead_min: number,
 *   kinds: { prepare: boolean, bedtime: boolean, wake_check: boolean },
 *   since: string|number|null, versions: Array, pauses: Array, openNight: { bedtime: string }|null,
 *   deliveries: Iterable<string> }> }} input  deliveries: claves "tipo|AAAA-MM-DD" ya registradas
 * @returns {Array<{ userId: number, kind: string, nightDate: string, dueUtc: number, dueIso: string, windowMin: number,
 *   state: 'future'|'send'|'discard' }>}
 */
function dueReminders({ now, users }) {
  const out = [];
  for (const user of users) {
    if (!user.timezone) continue; // sin zona horaria no hay avisos (R14)
    const since = typeof user.since === 'string' ? Date.parse(user.since) : user.since;
    const done = new Set(user.deliveries ?? []);
    const today = localParts(now, user.timezone).date;
    const openNightDate = user.openNight ? nightOf(user.openNight.bedtime) : null;

    for (let back = NIGHTS_BACK; back >= 0; back--) {
      const night = addDays(today, -back);
      const version = versionAt(user.versions ?? [], night);
      const day = version?.days.find((d) => d.weekday === weekdayOf(night));
      if (!day || !day.active) continue;
      if ((user.pauses ?? []).some((p) => p.start_date <= night && night <= p.end_date)) continue;

      // Minutos de pared desde las 0:00 de la noche N; acostarse antes de mediodía es ya el día N + 1
      const bed = day.bed_min < 720 ? day.bed_min + 1440 : day.bed_min;
      const minutes = {
        prepare: bed - user.lead_min,
        bedtime: bed,
        wake_check: 1440 + day.wake_min + WAKE_GRACE_MIN,
      };

      for (const kind of KINDS) {
        if (!user.kinds?.[kind]) continue;
        if (kind === 'wake_check' && openNightDate !== night) continue; // solo con la noche abierta
        if (done.has(`${kind}|${night}`)) continue;
        const due = zonedToUtc(night, minutes[kind], user.timezone);
        if (since != null && due.utcMs < since) continue; // anterior a la activación de los avisos
        const windowMin = WINDOW_MIN[kind];
        const state = now < due.utcMs ? 'future' : now < due.utcMs + windowMin * MINUTE ? 'send' : 'discard';
        out.push({ userId: user.id, kind, nightDate: night, dueUtc: due.utcMs, dueIso: due.iso, windowMin, state });
      }
    }
  }
  return out;
}

module.exports = { dueReminders, versionAt };
