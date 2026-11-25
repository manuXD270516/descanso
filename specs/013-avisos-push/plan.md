# Implementation Plan: Avisos push con la app cerrada

**Branch**: `013-avisos-push` | **Date**: 2026-10-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/013-avisos-push/spec.md`, más la sección "Contexto técnico"
de `docs/sdd/features/013-avisos-push.md` y el spike en Android ([spike/README.md](spike/README.md)).

## Summary

El propio servicio, **siempre encendido** (decisión del owner, P5b), envía por Web Push tres avisos
sin datos de salud a los móviles con la app cerrada: `prepare` (acostarse − "Avisarme antes"),
`bedtime` (acostarse) y `wake_check` (levantarse + 60 min con la noche abierta), con las horas del
horario de 010 en la zona horaria del perfil (008).

- **Disparador en proceso** (R1): `server.js` arranca un temporizador de 30 s con tick inmediato al
  arrancar y mutex; sin terceros de programación. `fly.toml` pasa a `min_machines_running = 1`.
- **Núcleo puro** (R2, R3): `dueReminders()` recalcula en cada tick los vencimientos de las noches
  `hoy − 2 … hoy` y `zonedToUtc()` convierte hora de pared + zona IANA a instante con las reglas de DST
  (inexistente → primera válida; ambigua → primera ocurrencia), con `Intl` y sin librerías.
- **Exactamente una vez** (R4): reclamo `INSERT … ON CONFLICT DO NOTHING` en `reminder_deliveries`
  (PK persona + tipo + noche); noche abierta, "Silenciar hoy" y "No molestar" se comprueban al enviar;
  lo vencido fuera de su ventana (10 / 60 min) queda `skipped`; nada se reintenta.
- **Envío** (R5–R7): `web-push` 3.6.7 fijada; `TTL` = ventana, `topic` = tipo, `urgency: high`, timeout
  10 s; 404/410 borran el dispositivo; solo hosts de push conocidos (anti-SSRF); concurrencia ≤ 4
  aislada por persona.
- **Dispositivos** (R8): únicos por `endpoint`, como mucho 5 por persona y **ligados a la sesión** que
  los activó (`ON DELETE CASCADE`): cerrar sesión deja de avisar sin código extra.
- **Frontend** (R11, R12): service worker propio mínimo (`push`, `notificationclick`, sin `fetch`);
  bloque "Avisos en este móvil" en Cuenta → Mi horario; permiso solo tras "Activar avisos"; con la app
  visible, el aviso se muestra dentro (`role="status"`); enlace nuevo `#noche-despertar`.
- **Operación** (R13): salud de administración, poda a 90 días, secretos VAPID, runbook de rotación y
  coste ≈ 3,3 $/mes.

Migración `011_avisos_push.js`, solo *expand*: `push_subscriptions`, `reminder_deliveries` y 6
columnas en `user_settings`.

## Technical Context

**Language/Version**: Node.js 22 LTS; TypeScript con Angular 20 (standalone, signals, zoneless)

**Primary Dependencies**: Express 5, better-sqlite3. **Nueva**: `web-push` **3.6.7** (versión exacta,
research R5; Complexity Tracking).

**Storage**: SQLite; migración 011 (`CREATE TABLE` × 2 + 6 `ADD COLUMN`).

**Testing**:
- `node --test`: migración y compatibilidad, `zonedToUtc` (DST), `dueReminders`, tick (concurrencia,
  recuperación, 20 personas, silencios), envío y hosts permitidos, service worker en `vm`, rutas,
  aislamiento, exportación, borrado, salud de administración y términos prohibidos.
- Karma: `core/push.ts`, `PushService` con `navigator.serviceWorker`/`PushManager` simulados,
  `push-settings` en sus estados, `#noche-despertar` y aviso con la app visible.
- Playwright: `e2e/tests/avisos.spec.ts` con servicio de push simulado (research R17).

**Target Platform**: Fly.io (shared-cpu-1x, 256 MB, gru), una máquina **siempre encendida**. Clientes:
Chrome (u otro navegador con Web Push) en Android; iPhone ve "no compatible".

**Project Type**: aplicación web, un único servicio.

**Performance Goals**:
- aviso entregado al servicio de push a ± 2 min de su hora (FR-009): tick cada 30 s + ≤ 50 s de envío
  en el peor caso con 20 personas (R7);
- aviso de prueba en < 10 s (FR-020);
- un tick sin vencimientos < 50 ms con 20 personas.

**Constraints**:
- El código de 011 debe funcionar sobre el esquema de 013 (expand/contract).
- 0 datos de salud y 0 menciones de la racha en los avisos (FR-022).
- 0 peticiones de permiso sin pulsar "Activar avisos" (SC-007).
- Memoria: pico medido 54 MB en el spike; sin ampliar la VM (SC-011).
- Sin terceros de programación (FR-023); el único secreto nuevo es VAPID.

**Scale/Scope**:
- backend: 1 migración, módulo `reminders/` (6 archivos), 1 repo, 1 router con 5 rutas
  (`/api/push…`), 1 ruta de administración (`/api/admin/health`), exportación y arranque en `server.js`;
- frontend: service worker, 1 módulo puro, 1 servicio, 1 componente; ampliados `app.ts`
  (`#noche-despertar`), `night`, `bedtime-notice`, `my-schedule` y la política de privacidad;
- infraestructura: `fly.toml`, `compose.yaml`, runbook nuevo y `README.md`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / sección | Cumplimiento | Estado |
|---------------------|--------------|--------|
| Alcance (v2.0.0) | `push_subscriptions` y `reminder_deliveries` con `user_id` y CASCADE; preferencias en `user_settings`; acceso por `repo/push.js` con `userId` (el tick lee por persona); rutas nuevas en la suite de aislamiento (lo ajeno → 404); tablas en el meta-test; un aviso solo va a dispositivos de su dueño (test). | ✅ |
| I. Stack fijo | Una dependencia nueva, `web-push` 3.6.7, sin ORM ni librerías de UI: justificada en research R5 y en Complexity Tracking. Zonas horarias con `Intl`, sin librerías (R3). Service worker propio sin `@angular/service-worker` (R11). | ✅ (justificada) |
| II. Persistencia segura | Migración 011 por el runner con respaldo, solo *expand*, idempotente; `compat-previous-013`. La poda de `reminder_deliveries` a 90 días borra un registro operativo cuya retención fija la spec (FR-027), no datos de salud ni historia del usuario; los dispositivos se borran a petición de su dueño, al cerrar su sesión o cuando el servicio de push los declara inválidos. | ✅ |
| III. Reglas de tiempo | `due_at` en ISO 8601 con el desfase de la zona; la noche de cada aviso es la fecha en que te acuestas (después de medianoche → noche anterior). Pruebas explícitas: DST de primavera y otoño en `Europe/Madrid` y `America/Santiago`, noche que cruza medianoche, `prepare` que cae el día anterior y fecha de la noche correcta (SC-001). | ✅ |
| IV. Calidad | Tests de backend (núcleo puro, tick, rutas, migración), specs de componentes y e2e; lint y build en CI. | ✅ |
| V. Un solo servicio | El disparador vive **dentro** del mismo proceso (sin enmienda). Imagen, healthcheck y volumen sin cambios. Secretos VAPID solo en Fly secrets y variables locales; nunca en el repositorio. | ✅ |
| VI. Simplicidad | Recalcular en cada tick en vez de tabla de vencimientos; sin interfaz `Waker` genérica ni `TICK_TOKEN`; 5 rutas en vez de 6; dispositivos ligados a la sesión por FK. La máquina siempre encendida, la dependencia, el service worker y la costura de pruebas se registran abajo. | ✅ (ver Complexity Tracking) |
| VII. UX accesible | Bloque con etiquetas, foco visible e interruptores accesibles; aviso dentro de la app con `role="status"`, sin sonido y sin animación con `prefers-reduced-motion`; textos en español; responsive. | ✅ |
| VIII. Datos de salud (v2.2.0) | Avisos con textos fijos sin datos de sueño ni de salud ni racha (FR-022; test de textos y términos prohibidos). El servicio de push del navegador solo ve cuándo llega un aviso (carga cifrada) y se informa en la explicación previa y en la política de privacidad (FR-005; versión de la política actualizada). Sin terceros de programación. | ✅ |

**Re-check post-diseño**: sin violaciones no justificadas. Las cuatro entradas de Complexity Tracking
están respaldadas por la spec o por decisiones del owner.

## Project Structure

### Documentation (this feature)

```text
specs/013-avisos-push/  spec · plan · research · data-model · quickstart · contracts/ (openapi-delta.yaml, service-worker.md) · checklists/ · spike/ · tasks
```

### Source Code (repository root)

```text
backend/
├── package.json                         # web-push 3.6.7 (exacta)
└── src/
    ├── migrations/011_avisos_push.js    # NUEVO (data-model.md)
    ├── reminders/
    │   ├── zoned.js                     # NUEVO, puro: zonedToUtc, localParts (R3)
    │   ├── windows.js                   # NUEVO: ventanas por tipo (10 / 60 min) = TTL
    │   ├── schedule.js                  # NUEVO, puro: dueReminders (R2)
    │   ├── push.js                      # NUEVO: validateSubscription, deviceLabel, payloadFor, send (R5, R6, R8)
    │   ├── tick.js                      # NUEVO: reclamo, comprobaciones, envío ≤ 4, descartes, poda, estado (R4, R7, R13)
    │   └── waker.js                     # NUEVO: setInterval + tick inmediato + mutex + stop (R1)
    ├── repo/push.js                     # NUEVO: dispositivos, preferencias, entregas, entradas del tick
    ├── routes/push.js                   # NUEVO: /api/push (R10)
    ├── routes/admin.js                  # GET /api/admin/health (R13)
    ├── repo/export.js · routes/export.js # push_preferences en el JSON (R15)
    ├── policy.js                        # versión de la política (FR-005)
    ├── app.js                           # monta /api/push
    └── server.js                        # arranca/para el disparador si hay VAPID (R1)
backend/test/
├── migrations-011.test.js · compat-previous-013.test.js                               # NUEVOS
├── reminders-zoned.test.js · reminders-schedule.test.js · reminders-tick.test.js       # NUEVOS
├── reminders-waker.test.js · reminders-push.test.js · push-sw.test.js · push.test.js  # NUEVOS
└── isolation.test.js · schema-isolation.test.js · export.test.js · delete-account.test.js · admin.test.js · forbidden-terms.test.js   # ampliados

frontend/
├── public/push-sw.js                    # NUEVO: service worker mínimo (contracts/service-worker.md)
└── src/app/
    ├── core/push.ts · core/push.service.ts            # NUEVOS: reglas y textos puros; API, permiso y suscripción
    ├── core/privacy.ts                                # sección del servicio de avisos (FR-005)
    ├── features/push/push-settings.component.ts       # NUEVO: bloque "Avisos en este móvil"
    ├── features/schedule/my-schedule.component.ts     # incluye push-settings
    ├── shared/bedtime-notice.component.ts             # muestra el aviso con la app visible (FR-019)
    ├── features/night/night.component.*               # "Ya desperté" a la vista con #noche-despertar
    └── app.ts                                         # #noche-despertar; unsubscribe al cerrar sesión

e2e/
├── support/fake-push.ts                 # NUEVO: servicio de push simulado (R17)
└── tests/avisos.spec.ts                 # NUEVO

fly.toml · compose.yaml · README.md · docs/runbooks/rotar-vapid.md (NUEVO) · specs/002-pipeline-ci-cd/research.md (nota en R13) · docs/sdd/guia-migraciones.md
```

**Structure Decision**: `backend/src/reminders/` agrupa el disparador y el envío; `zoned.js` y
`schedule.js` son puros para probarlos con relojes falsos, y solo `tick.js` toca la base (vía
`repo/push.js`) y la red (vía `push.js`). En el frontend, `features/push/` sigue el patrón de
`features/streak/` y el bloque se monta en "Mi horario", de donde salen sus horas.

## Complexity Tracking

| Desviación | Por qué hace falta | Alternativa más simple descartada porque |
|------------|--------------------|------------------------------------------|
| **Máquina siempre encendida**: `min_machines_running = 1`; se abandona el auto-stop de R13 de 002. Coste ≈ **3,3 $/mes** en total (≈ 3,1 $ de cómputo shared-cpu-1x 256 MB en gru + 0,15 $ del volumen), ≈ 1–1,5 $/mes más que con QStash. Se anota en R13 de 002 y en el `README.md`. | Avisar a su hora con la app cerrada exige que algo despierte al servicio; dentro del proceso no hay terceros que conozcan las horas de sueño (RGPD art. 9), no hay arranques en frío al tocar el aviso y el rate limit en memoria de 004 se vuelve fiable. Decisión del owner (P5b, 2026-09-29; SC-011). | Mantener el auto-stop con un programador externo (QStash, cron externo): lo descartó el owner y lo excluye FR-023; el ahorro estimado (≈ 1,3 $) ni siquiera alcanzaba su propio umbral. |
| **Dependencia nueva `web-push` 3.6.7** (versión exacta, principio I). | Firmar VAPID (JWT ES256) y cifrar la carga (RFC 8291) a mano son ~200 líneas de criptografía delicada; `web-push` es la implementación de referencia y la validada en el spike (entrega, TTL, Topic, 410, 54 MB). | Implementación propia con `node:crypto` (riesgo sin beneficio) o push sin carga (el service worker tendría que pedir el texto a la API con la cookie). |
| **Temporizador en proceso** con estado en memoria (`last_tick_at`, `pending_dues`, mutex, fecha de la última poda). | Es el disparador elegido; el estado en memoria solo alimenta la salud de administración y se reconstruye en el primer tick. | Persistir el estado del tick (una tabla más sin valor para la persona). |
| **Service worker propio** (`frontend/public/push-sw.js`) y **costura de pruebas** `PUSH_TEST_ORIGIN` (solo con `NODE_ENV=test` y loopback). | Web Push no funciona sin service worker; el e2e no puede recibir un push real (Chromium sin FCM) y SC-005 exige uno con servicio simulado. La costura no existe en la imagen de producción (`NODE_ENV=production`) y un test lo comprueba. | `@angular/service-worker` (caché y ciclo de actualización innecesarios, el riesgo que descartó la 012); un endpoint de pruebas en la API (código de pruebas expuesto). |
