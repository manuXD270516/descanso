# Tasks: Mi horario de sueño y recordatorios (sin servidor)

**Input**: Design documents from `specs/010-horario-recordatorios/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md, spike/

**Tests**: obligatorios (principio IV). Se escriben antes de implementar.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Foundational (bloquea las historias)

- [X] T001 Tests `backend/test/migrations-009.test.js` sobre la base legacy migrada hasta 008 con 2 usuarios. Tras 009:
  - existen `schedule_versions`, `schedule_days` y `pauses`, con sus `CHECK`: `weekday` 0..6, minutos 0..1439, `active` 0/1, `end_date >= start_date`, y `UNIQUE(user_id, effective_from)`;
  - `user_settings.lead_min = 30` en las filas existentes, con `CHECK` 15..60;
  - `sleep_records.wake_logged_at` es NULL y `wake_from_proposal = 0` en las noches existentes;
  - las columnas previas de `sleep_records` mantienen la misma huella;
  - CASCADE: borrar un usuario borra sus versiones, días y pausas;
  - `foreign_key_check` vacío;
  - el `up` es idempotente.
- [X] T002 Crear `backend/src/migrations/009_horario.js` según `data-model.md`.
- [X] T003 [P] Compatibilidad `backend/test/compat-previous-010.test.js` con `fixtures/legacy-006-statements.js` (sentencias de `repo/` de 006: noche y despertar, `PUT` con respuestas, perfil con ciclo, exportar, borrar cuenta) sobre el esquema con 009. Fijar a su era (`migrationsUpTo(8)`) los tests de migraciones anteriores que hagan huellas de tablas ampliadas.
- [X] T004 [P] Añadir `schedule_versions` (con `user_id`), `schedule_days` (hija de `schedule_versions`) y `pauses` (con `user_id`) a `backend/test/schema-isolation.test.js`.
- [X] T005 [P] Tests `backend/test/ics.test.js` contra los golden `fixtures/schedule-v1.ics` y `schedule-v2.ics` (v2 sin el miércoles y con el fin de semana a otra hora):
  - CRLF y líneas de ≤ 75 octetos;
  - `VERSION:2.0` y `PRODID`;
  - hora flotante (sin TZID ni Z) y `DTSTAMP` en UTC;
  - `UID:sched-<userId>-<weekday>@descanso-sleep.fly.dev` y `SEQUENCE` = id de versión;
  - `RRULE:FREQ=WEEKLY;BYDAY=…`;
  - `VALARM` DISPLAY con `TRIGGER:-PT30M`;
  - `DESCRIPTION` y `URL` con `<base>/#noche`;
  - días inactivos que estuvieron activos en una versión anterior → `STATUS:CANCELLED` sin alarma; los que nunca estuvieron activos, ausentes;
  - acostarse a la 1:15 la noche del sábado → `DTSTART` el domingo a las 01:15;
  - de v1 a v2: mismos UID, `SEQUENCE` mayor y el mismo número de `VEVENT`;
  - sin términos de salud (lista de `spike/validate-ics.py`).
- [X] T006 Implementar `backend/src/ics.js` (R3) y generar los golden. Validarlos además con `python specs/010-horario-recordatorios/spike/validate-ics.py` y anotar el resultado en el PR.

**Checkpoint**: esquema 009 compatible y generador iCalendar probado.

---

## Phase 2: User Story 1 - Agendar mi horario (Priority: P1) 🎯 MVP

**Independent Test**: `schedule.test.js` + specs del editor y la bienvenida + e2e.

- [X] T007 [P] [US1] Tests `backend/test/schedule.test.js`:
  - `GET /api/schedule?date=` sin horario → `version: null`, `lead_min: 30` y `pause: null`;
  - `PUT` con 7 días → versión vigente desde `today`;
  - un segundo `PUT` el mismo día sustituye (id nuevo, una sola versión ese día);
  - un `PUT` otro día crea otra versión y la de una fecha anterior sigue igual;
  - `GET` con fecha anterior → versión anterior;
  - 400 si faltan días, si `weekday` se repite, si un minuto está fuera de rango o si `today` no está a ±1 día de UTC;
  - por usuario: lo de otra persona no aparece;
  - sin sesión → 401.
- [X] T008 [US1] Implementar `backend/src/repo/schedule.js` (`current(userId, date)`, `save(userId, today, days)` en transacción, `everActiveWeekdays(userId)`) y `backend/src/routes/schedule.js` (`GET`/`PUT /api/schedule`); montarlo en `app.js`.
- [X] T009 [P] [US1] Frontend `core/schedule.ts` (puro) con spec:
  - `proposeBed(wakeMin, goalMin)` = levantarse − objetivo − 15, con vuelta de día (7:00 con 7 h 30 → 23:15; 9:00 → 1:15; 5:00 con 9 h → 19:45);
  - `daysFor(mode, …)`: igual / fin de semana = noches 6 (sábado) y 0 (domingo) / cada día;
  - `bedInstant(nightDate, bedMin)` (< 720 → día siguiente) y `wakeInstant(nightDate, wakeMin)` (día siguiente);
  - pruebas que cruzan la medianoche.
- [X] T010 [P] [US1] Frontend `core/schedule.service.ts` (get, save y `.ics` URL) y `features/schedule/schedule-editor.component.ts`:
  - hora de levantarse → acostarse propuesta y editable;
  - modo (radio) y activar o desactivar días;
  - salida `days[7]`;
  - spec: propuesta, modo fin de semana y días desactivados.
- [X] T011 [US1] Ampliar `features/onboarding/welcome.component.ts`: objetivo → editor → "Guardar" (`POST /api/me/onboarding` + `PUT /api/schedule`) o "Saltar" (sin horario). Sigue siendo una pantalla. Spec: guardar con horario, saltar y 3 decisiones como máximo (SC-001).
- [X] T012 [US1] `features/schedule/my-schedule.component.ts` y Cuenta → "Mi horario" (`accountView = 'schedule'` en `app.ts`/`app.html`): editor con el horario vigente y aviso "Se aplica desde hoy; los días anteriores no cambian". Specs.

---

## Phase 3: User Story 2 - Añadir a mi calendario (Priority: P1)

- [X] T013 [P] [US2] Tests en `schedule.test.js`:
  - `GET /api/schedule.ics?today=` → `text/calendar; charset=utf-8`, `attachment; filename="descanso-horario.ics"` y cuerpo igual al de `ics.js` para la versión vigente y `lead_min`;
  - sin horario → 404 "No tienes horario";
  - con `lead_min` 45 → `TRIGGER:-PT45M` y el texto "en 45 min";
  - el `.ics` de B nunca contiene los UID de A.

  Tests en `me.test.js`: `lead_min` 14/61/no entero → 400 "El aviso debe ser entre 15 y 60 minutos antes"; 45 → 200.
- [X] T014 [US2] Implementar `GET /api/schedule.ics` (`baseUrl` desde el origen de la petición) y `lead_min` en `repo/users.js` (`PROFILE` y `updateProfile`) y `routes/me.js`.
- [X] T015 [US2] Frontend en "Mi horario":
  - "Avisarme antes" (15–60) y "Añadir a mi calendario" (descarga con `today`);
  - `features/schedule/calendar-guide.component.ts` (R4): detecta Android o iPhone y muestra primero esa guía;
  - Google Calendar: "Añadir todo" + notificación por defecto del calendario + cómo crear "Descanso";
  - fabricante: borrar los anteriores y ajustar el recordatorio + permiso "Alarmas y recordatorios";
  - iPhone, "no verificado";
  - aviso de No molestar;
  - alternativa de alarma recurrente en el reloj, con las horas del horario.

  Specs: orden por plataforma, textos clave y horas en la alternativa.

---

## Phase 4: User Story 3 - "¿Ya despertaste?" con horario (Priority: P2)

- [X] T016 [P] [US3] Tests backend (`diary.test.js` o `sleep-night.test.js`):
  - `POST /api/sleep/wake` fija `wake_logged_at` (≈ ahora) y `wake_from_proposal` según `from_proposal`;
  - un `PUT` que pasa `wake_time` de NULL a un valor fija `wake_logged_at`;
  - `GET /api/sleep` los devuelve;
  - `from_proposal` no booleano → 400.
- [X] T017 [US3] Implementar en `repo/sleep.js` (`COLS`, `setWake`, `update`) y en `routes/sleep.js`.
- [X] T018 [US3] Frontend en `features/night/night.component.*`, con la regla pura en `core/schedule.ts` (`scheduledWakeCheck(open, version, pause, now)`):
  - con horario activo para la noche abierta y sin pausa, a partir de la hora de levantarse + 60 min, "¿Ya despertaste?" con la hora agendada;
  - confirmar sin cambiar → `from_proposal: true`;
  - si no, regla de 006 (14 h);
  - origen `'late'` "Anotado después" en `origin-badge` (`wake_logged_at − wake_time > 60 min`), por fila (bloque mezclado).

  Specs: 59 vs 61 min, día inactivo → regla de 14 h, pausa → regla de 14 h, `from_proposal` y origen por fila.

---

## Phase 5: User Story 4 - Modo pausa (Priority: P2)

- [X] T019 [P] [US4] Tests `backend/test/pauses.test.js`:
  - crear desde hoy 5 días → 201;
  - inicio en el pasado → 400;
  - 15 días → 400;
  - solapada → 409;
  - tercera con inicio en 30 días → 400;
  - terminar hoy una activa → `end_date = today`;
  - "terminar" una futura → se borra (204);
  - de otra persona → 404;
  - `GET /api/schedule?date=` devuelve la pausa activa.
- [X] T020 [US4] Implementar `backend/src/repo/pauses.js` y las rutas `/api/pauses` en `routes/schedule.js` (transacción `IMMEDIATE`).
- [X] T021 [US4] Frontend en "Mi horario":
  - sección "Modo pausa (viaje, enfermedad, turnos) hasta…": desde, hasta, guardar y errores del servidor;
  - banda "En pausa hasta el …" con "Terminar hoy";
  - nota de que el calendario se silencia desde el propio calendario.

  Specs.

---

## Phase 6: User Story 5 - Aviso con la app abierta (Priority: P3)

- [X] T022 [US5] `shared/bedtime-notice.component.ts` (R7) en `app.html`, con la regla pura `prepareInstant(...)` en `core/schedule.ts`:
  - comprueba cada 30 s;
  - ±1 min;
  - `role="status"`, sin sonido, sin animación con `prefers-reduced-motion`;
  - no aparece con pausa, día inactivo o noche abierta;
  - se cierra y no vuelve ese día.

  Specs con reloj simulado (`jasmine.clock`).

---

## Phase 7: Polish & cross-cutting

- [X] T023 [P] Exportación (FR-019): `repo/export.js` y `routes/export.js` añaden `schedule_versions` (con `days`) y `pauses` al JSON. Test en `export.test.js`. Aislamiento en `isolation.test.js`: B no ve ni modifica el horario, las pausas ni el `.ics` de A.
- [X] T024 E2E `e2e/tests/horario.spec.ts`:
  - bienvenida con horario (7:00 → 23:15; fin de semana 9:00 → 1:15);
  - "Mi horario" y descarga del `.ics` (el evento contiene el UID y la alarma esperados);
  - "¿Ya despertaste?" con `setNow` a levantarse + 61 min → confirmar → "Anotado después";
  - pausa de 15 días → error y de 5 días → OK;
  - aviso con la app abierta (`setNow` a acostarse − 30 min);
  - abrir `/#noche` (el enlace del evento) muestra Noche con "Me voy a dormir" visible (FR-010);
  - fixtures: `onboarded` sin horario por defecto.
- [X] T025 [P] `scripts/smoke-local.mjs`: comprobaciones de 010 (horario, `.ics` válido con UID y `SEQUENCE`, `lead_min`, reglas de la pausa, `wake_logged_at`) y su fila en `docs/runbooks/verificacion-local.md`.
- [X] T026 [P] Documentación:
  - `README.md`: horario, calendario y guía, pausa, avisos y API;
  - `docs/sdd/guia-migraciones.md`: 009 como *expand* con tablas nuevas;
  - `spike/README.md`: enlazar el `.ics` real validado.
- [X] T027 Puertas de calidad:
  - backend `test` y `lint`; frontend `lint`, `test` y `build`; e2e;
  - `smoke-local run`;
  - `validate-ics.py` sobre v1 y v2 reales;
  - compatibilidad en Docker con la imagen de master (006) sobre una base migrada por 010;
  - verificación manual del quickstart §4;
  - anotar todo en el PR.

---

## Dependencies & Execution Order

- **Phase 1** bloquea todo (T001 → T002; T003–T005 [P]; T006 después de T005).
- **US1** (T007–T012) es la base del resto en el frontend; **US2** (T013–T015) usa US1 y T006.
- **US3** (T016–T018) y **US4** (T019–T021) dependen de US1 en el backend.
- **US5** (T022) depende de US1 y US4.
- **Polish** (T023–T027) al final.

## Parallel Example

```text
Phase 1: T003 ∥ T004 ∥ T005 mientras T001 → T002.
US1: T007 ∥ T009 ∥ T010; luego T008, T011, T012.
US3/US4: T016 ∥ T019 (backend) en paralelo.
```

## Implementation Strategy

1. Phase 1 + **MVP = US1 + US2** (horario + calendario): ya avisa con la app cerrada.
2. US3 y US4 (avisos en la app y pausa).
3. US5 y polish.
