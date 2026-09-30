# Propuesta F: recordatorios de horarios agendados (borrador ReAct v0, verificado el 2026-09-29)

## 1. Resumen y recomendación

Dos formas de avisar, con sus límites:

- **Web Push** funciona en todas las plataformas, con dos condiciones:
  - En iOS solo llega si la PWA está instalada en la pantalla de inicio (requiere B-3).
  - Alguien tiene que despertar la máquina de Fly a la hora exacta.
- **Un .ics con RRULE + VALARM** hace que avise el calendario del teléfono, sin infraestructura. Las suscripciones por URL suelen descartar las alarmas, así que el archivo hay que **importarlo**.

Plan por fases:

- **Fase 1, MVP (S, 0 $)**:
  - horario semanal;
  - `.ics` para importar;
  - aviso dentro de la app mientras está abierta.
- **Fase 2 (M)**: Web Push, después de 004 y B-3. El disparador puede ser:
  - (a) una máquina siempre encendida con un planificador interno: ±1 min, unos 3,1 $/mes adicionales en gru (0,00000075 $/s × 2.592.000 s × 1,615; la propuesta estimaba 6,5 $, hay que conciliar las cifras);
  - (c)/(d) un ping externo como alternativa.

## 2. Matriz de opciones

| Opción | Precisión | Coste | Veredicto |
|--------|-----------|-------|-----------|
| Web Push + VAPID (Chrome, Edge y Firefox desde mar-2023; Safari macOS 16+; iOS 16.4+ solo con PWA instalada) | La del disparador | 0 $ | Fase 2 (`web-push` 3.6.7, 5 dependencias, o implementación propia con `node:crypto`) |
| (a) `min_machines_running = 1` + `setInterval` | ±1 min | ~3,1 $/mes | Preferida si P5 lo permite |
| (b) Fly `--schedule` | Imprecisa (por hora o por día), puede no arrancar | Bajo | Descartada: rompe el "servicio único" |
| (c) Cron de GitHub Actions | Cada 5 min como mínimo; puede retrasarse o descartarse; se desactiva a los 60 días; admite `timezone` IANA | 0 $ | Plan B (±15 min) |
| (d) cron-job.org → `POST /api/internal/tick` | Cada minuto | 0 $ | Plan B más preciso (tercero + secreto) |
| (e) Cloudflare Workers Cron | Cada minuto, solo en UTC | Gratis | Descartada |
| (f) Planificador interno con `auto_stop` | No fiable: los timers no cuentan como tráfico | 0 $ | Solo para recuperar avisos al arrancar |
| ICS importado | Exacta, en el propio dispositivo | 0 $ | **Fase 1** (spike para comprobar VALARM al importar en Apple y Google) |
| ICS suscrito (webcal) | Apple elimina las alertas por defecto y Google ignora VALARM (*solo snippets*) | 0 $ | Sirve solo para ver los horarios |
| Notification Triggers | — | — | Abandonada por Chrome |
| Alarmas nativas por deep link | No verificada | — | Fuera de alcance |
| Notificación local con la app abierta | Exacta, pero solo con la app abierta | 0 $ | Complemento de la fase 1 |

## 3. Historias

- **US1 (P1): Agendar el horario.**
  - Hora de acostarse y de despertar para cada día (L–D), con la opción "igual todos los días".
  - Zona horaria IANA del navegador.
  - Tests de cambio de horario (DST).
- **US2 (P1): Calendario.**
  - `.ics` que pasa un validador RFC 5545, con VEVENT semanal y VALARM de −X min (entre 15 y 60).
  - UID estable y SEQUENCE incremental, para que reimportar no duplique.
  - Sin datos de salud en el texto.
- **US3 (P2): Aviso con la app abierta.**
  - Banner con `role="status"` en ±1 min.
  - Sin sonido y respetando `prefers-reduced-motion`.
- **US4 (P2, fase 2): Web Push.**
  - El permiso se pide solo al pulsar "Activar avisos", con una explicación.
  - Guía para instalar en iOS.
  - El 95 % de los avisos llega en ±2 min con (a) o en ±15 min con (c).
  - Si el push responde 404/410, se borra la suscripción.
- **US5 (P3): Pausar y no molestar.**
  - "Pausar hasta…", "silenciar hoy" y una ventana de no molestar.
  - `wake_check` solo si la noche sigue abierta ≥ 30 min después de la hora agendada.

## 4. Requisitos funcionales

- **FR-01** Horario: {weekday, bed HH:MM, wake HH:MM, active} + timezone + lead_min de 15 a 60.
- **FR-02** Tipos de aviso: `prepare`, `bedtime` y `wake_check`.
- **FR-03** `GET /api/schedule.ics` con VTIMEZONE/TZID, RRULE WEEKLY y VALARM DISPLAY.
- **FR-04** Texto neutro: "Descanso: hora de prepararte para dormir", sin métricas en la pantalla bloqueada.
- **FR-05** `push_subscriptions`: 404/410 → borrar; 429/5xx → reintentar con backoff dentro de la ventana.
- **FR-06** `reminder_deliveries` UNIQUE(schedule_id, kind, local_date). El tick envía lo pendiente entre el último tick y ahora; si pasaron más de 20 min, lo descarta.
- **FR-07** Sesión (004) y CSRF. El tick se autentica con un bearer secreto de Fly.
- **FR-08** La pausa, el silencio y el no molestar se evalúan en el servidor.

**Fuera de alcance:** apps nativas, SMS y email, alarmas sonoras, alarma inteligente, webcal como canal de aviso, multiusuario.

## 5. Arquitectura

- **Fase 1:** `routes/schedule.js`, `ics.js` (función pura con tests de DST) y un servicio Angular con `setTimeout`.
- **Fase 2:**
  - manifest y service worker (`push` y `notificationclick`, más el formato declarativo de Safari 18.4);
  - `push.js`: `web-push` justificada, o `node:crypto` validado con los vectores de RFC 8291;
  - `reminders.js`: función pura `dueReminders()`;
  - disparador (a) interno, o (c)/(d) vía `POST /api/internal/tick` (la petición despierta la máquina).
- **Datos:**
  - `sleep_schedules(user_id, weekday, bed_min, wake_min, active)`;
  - en `user_settings`: `timezone`, `lead_min`, `dnd_start`, `dnd_end` y `paused_until`;
  - `push_subscriptions`;
  - `reminder_deliveries`.

## 6. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| iOS sin PWA no recibe push | Fase 1 con ICS; guía de instalación |
| La máquina está apagada a la hora del aviso | Disparador (a), o ping + recuperación + deduplicación |
| El cron de GitHub se retrasa o se descarta | Minutos no redondos, tolerancia, pasar a (d) |
| El usuario deniega el permiso | Pedirlo tras un gesto y con explicación; ICS como alternativa |
| Datos de salud en la pantalla bloqueada | FR-04 |
| Fuga del endpoint de push | Guardarlo solo en el servidor |
| La suscripción de calendario ignora la alarma | Importar; spike |
| Errores de DST o zona horaria | `Intl` + zona IANA + tests (principio III) |

## 7. Dependencias

- **004**: sesión, `user_settings` y CSRF.
- **B-3 (PWA)**: requisito para push en iOS; se adelanta.
- **003**: migraciones.
- **005**: el objetivo ayuda a proponer la hora de despertar.
- **006-US4**: se unifica con `wake_check`.
- **Gamificación**: "a tiempo" = `bedtime` dentro de ±N min del horario de esa noche. Si no hay horario, el día no cuenta y la racha no se rompe.

## 8. Estimación y preguntas

- **Estimación:** fase 1 S; fase 2 M (+ B-3 S–M).
- **Preguntas:**
  1. ¿iPhone o Android? ¿Qué calendario usas?
  2. ¿Aceptas unos 3 $/mes para tener ±1 min, o te vale ±15 min gratis?
  3. ¿Quieres los tres tipos de aviso o solo "prepárate"?

## 9. Enmiendas propuestas

- **V (MINOR):** permitir un disparador externo que solo hace ping a un endpoint autenticado.
- **I (PATCH):** permitir una dependencia criptográfica justificada.
- **VIII:** las notificaciones no revelan datos de salud.

## Fuentes

**Abiertas:**
- WebKit: Web Push en iOS 16.4 y Declarative Web Push.
- MDN: Push API, `subscribe` y `requestPermission`.
- web.dev: protocolo Web Push.
- Chrome: Notification Triggers.
- Fly: autostop, proxy, `machine run`, task-scheduling y precios.
- GitHub: eventos de Actions.
- Cloudflare: Cron Triggers.
- cron-job.org.
- RFC 5545 §3.6.6.
- Repositorio de `web-push`.
- Issue 165 de calino.

**Solo snippet:** VALARM en Google por URL (afcal #3), opciones de alertas en Apple Calendar y npm de `web-push` (403).
