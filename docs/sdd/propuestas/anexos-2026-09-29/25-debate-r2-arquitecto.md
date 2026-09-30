# Debate ronda 2: Arquitecto (E, F)

## Veredictos

- **E: factible con cambios.** Es un cálculo puro con migraciones aditivas. Tres problemas lo bloquean:
  - la regla está mal definida (X17);
  - el `GET` tiene efectos secundarios (X19);
  - el horario tiene varios dueños (X18).
- **F fase 1: factible (S/M) y sin infraestructura.**
- **F fase 2: riesgo alto de coste y de operación.**
  - Un ping cada 1–5 min impide el auto-stop.
  - Las opciones (c) y (d) cuestan casi lo mismo que (a) y dependen de un tercero o de un cron que se desactiva a los 60 días.
  - El endpoint de push abre riesgo de SSRF (X23).

## Orden

No se renumeran 007–009, porque sus archivos ya existen. Las features nuevas van en el orden de ejecución siguiente:

| Orden | Feature | Talla | Notas |
|-------|---------|-------|-------|
| 1–4 | 003 · 004 · 005 · 006 | — | Sin cambios |
| 5 | **010 Horario y recordatorios sin servidor** (F fase 1; absorbe `wake_check` dentro de la app) | S/M | Solo depende de 004. Es la dueña del horario. Coste 0 $ |
| 6 | **011 Rachas** (E) | S/M | Depende de 005, 006 y 010. Sin horario funciona en modo "Registro" |
| 7 | 007 (P2) | L | Sin cambios |
| — | 008 y 009 | — | Condicionadas |
| 8 | **012 PWA** (B-3) | S–M | Solo si P5 acepta unos 3 $ **y** el usuario tiene iPhone |
| 9 | **013 Web Push** (F fase 2) | M | Depende de 012 y P5. Disparador (a) |

## Esquema (expand, aditivo)

```text
schedule_versions(id, user_id CASCADE, effective_from DATE, created_at, UNIQUE(user_id, effective_from))   -- 010, solo inserciones
schedule_days(version_id CASCADE, weekday 0..6, bed_min NULL, wake_min NULL, active, PK(version_id, weekday))  -- 010
user_settings + lead_min 15..60, dnd_start_min, dnd_end_min, reminders_paused_until          -- 010
              + streaks_enabled DEFAULT 0, wake_window_min DEFAULT 30, habit_metric_id NULL  -- 011
streak_pauses(id, user_id, start_date, end_date, CHECK)                                      -- 011
user_milestones(user_id, key, achieved_on, seen_at, UNIQUE(user_id, key))                    -- 011
push_subscriptions(id, user_id CASCADE, endpoint UNIQUE, p256dh, auth, created_at, last_ok_at, fail_count)  -- 013
reminder_deliveries(user_id, kind, night_date, due_at_utc, status claimed|sent|failed|skipped,
                    claimed_at, sent_at, PK(user_id, kind, night_date))                      -- 010/013
```

- El horario tiene un único dueño, 010.
  - `schedule_history` y `sleep_schedules` se fusionan en `schedule_versions` con `effective_from`.
  - `planned_wake_min` desaparece.
- La zona horaria vive solo en `users.timezone`.
- La idempotencia se basa en `(user_id, kind, night_date)`, no en `schedule_id`.

## Objeciones bloqueantes

| ID | Problema | Cambio exigido |
|----|----------|----------------|
| X17 | Si `sin_dato` no cuenta como fallo, quien no registra nunca rompe la racha | Máquina de estados formal. Un `sin_dato` pasado cuenta como no cumplido en los dos modos. La ventana es de 7 días no pausados. Tests de propiedades |
| X18 | F puntúa la hora de acostarse; E lo prohíbe | Solo cuenta la hora de despertar, según el horario del día local del despertar (noche D → mañana D+1) |
| X19 | Escribir "hito visto" dentro de un `GET` | `GET /api/streak` sin efectos + `POST /api/streak/milestones/:key/seen`. El hito se guarda la primera vez que `best ≥ umbral` y no se retira |
| X20 | Coste de `computeStreak` | O(n) está bien: 3.650 días en < 20 ms. Sin tabla materializada |
| X21 | Los disparadores (c)/(d) mantienen la máquina despierta; el cron de GitHub se retrasa y se desactiva | Descartarlos. Fase 2 solo con (a) + `setInterval` + recuperación de lo perdido. `/api/internal/tick` protegido con `TICK_TOKEN`, solo para pruebas y operación |
| X22 | Ticks concurrentes o caída a mitad de envío | Reclamar con `INSERT … ON CONFLICT DO NOTHING` y hacer commit; después enviar y marcar `sent`. Reintentar `claimed` de más de 2 min. `TTL` = ventana; cabecera `Topic` por tipo |
| X23 | SSRF en el endpoint de push | Solo HTTPS a hosts permitidos (FCM, Mozilla autopush, `web.push.apple.com`, WNS). No se incluye en la exportación |
| X24 | Implementar la cripto a mano | `web-push` con versión fija y justificada. Con `node:crypto` solo si el push va **sin payload** (JWT ES256 con `ieee-p1363`) y el texto está fijo en el service worker |
| X25 | Pérdida o rotación de la clave VAPID | Secreto en Fly + copia en un gestor + runbook para volver a suscribirse |
| X26 | Generar VTIMEZONE desde IANA sin librería | **Hora flotante** sin TZID. `DTSTAMP`, CRLF, plegado a 75, UID `sched-<version>-<weekday>@descanso-sleep.fly.dev`, `SEQUENCE` = versión. Spike de reimportación |
| X27 | Node 22 no tiene Temporal | `zonedToUtc` puro con `Intl`: una hora inexistente se adelanta; una ambigua toma la primera ocurrencia |
| X28 | Límite de pausas y pausas solapadas | Validación en el servidor dentro de una transacción; 409 si hay solape |
| X29 | Un service worker que cachea `/api/*` | Nunca cachear `/api/*`; shell versionado; tests de actualización |

## Pruebas obligatorias

**E**
- Propiedades de la racha.
- 3 faltas en 7 días.
- Noche abierta = `pendiente`.
- Varias noches en la misma fecha.
- Cruce circular (00:10 frente a 23:55).
- Cambio de hora (DST) en Madrid y Nueva York; viaje con cambio de zona.
- El horario versionado no cambia el pasado.
- 3.650 días en < 20 ms.
- El `GET` no escribe.
- Desactivada = 0 nodos y 0 cálculo.
- Palabras prohibidas.
- E2E de hitos.

**F**
- `dueReminders` y `zonedToUtc` en Madrid, Nueva York y São Paulo: hora inexistente, hora ambigua, después de medianoche, cambio de día de la semana, pausa, no molestar y `wake_check`.
- Tick:
  - 2 ticks concurrentes producen 1 entrega;
  - recuperación de lo perdido en 15 min;
  - descarte fuera de la ventana;
  - `claimed` huérfano.
- Push: 404/410 borra; 429/5xx reintenta; se rechaza el SSRF.
- `.ics` contra un archivo de referencia (golden).
- Sin datos de salud en el contenido.
- E2E con `page.clock`.
- Pruebas unitarias del service worker; push real solo manual.

## Riesgos operativos

- **Coste:** con la fase 2 pasa a unos 5–7 $/mes. Hay que conciliar la estimación de +3,1 $ con los 6,5 $ antes de P5.
- **Despliegues:** pueden perderse avisos durante un deploy o un rollback. La ventana de recuperación debe ser mayor que el deploy.
- **Crecimiento:** `reminder_deliveries` genera unas 1.100 filas al año. Podar las de más de 90 días.
- **Secretos:** `VAPID_*` y `TICK_TOKEN`, con runbook de rotación y rate limit en el tick.
- **Cron de GitHub:** se desactiva a los 60 días.
- **PWA:** una versión antigua del shell puede quedar cacheada. Mitigación: expand/contract y un SW que fuerza la actualización.
