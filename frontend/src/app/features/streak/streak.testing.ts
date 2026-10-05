import { HttpTestingController } from '@angular/common/http/testing';
import { Streak } from '../../core/streak';

/** Racha desactivada y sin oferta: lo que devuelve el servidor por defecto (feature 011). */
export const STREAK_OFF: Streak = { enabled: false, offered: false, margin_min: 30, offer: false };

/** Responde a las peticiones de la racha pendientes (las pantallas que la montan la piden al iniciar). */
export function flushStreak(http: HttpTestingController, body: Streak = STREAK_OFF) {
  for (const r of http.match((req) => req.url === '/api/streak')) r.flush(body);
}
