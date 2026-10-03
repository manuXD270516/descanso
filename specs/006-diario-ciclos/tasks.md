# Tasks: Diario opcional, ciclos y honestidad de datos (REM sin sensores)

**Input**: Design documents from `specs/006-diario-ciclos/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: obligatorios (principio IV). Se escriben antes de implementar.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Foundational (bloquea las historias)

- [ ] T001 Tests `backend/test/migrations-008.test.js`: sobre la base legacy migrada hasta 007, con 2 usuarios y noches, tras 008:
  - `user_settings.cycle_min = 90` y `latency_min = 15` en las filas existentes;
  - `CHECK` rechaza `cycle_min` 69/111 y `latency_min` -1/61;
  - `sleep_records.sol_bucket` y `awakenings_bucket` son `NULL` en todas las noches y `CHECK` rechaza valores fuera de `lt15|15_30|gt30` y `0|1_2|3plus`;
  - recuento y huella de las columnas previas de `sleep_records` idénticos;
  - `foreign_key_check` vacío;
  - reaplicar el `up` no falla (idempotente).
- [ ] T002 Crear `backend/src/migrations/008_ciclos_y_diario.js` (`ADD COLUMN` × 4 según data-model.md, comprobando antes con `PRAGMA table_info`).
- [ ] T003 [P] Compatibilidad `backend/test/compat-previous-006.test.js`: las sentencias de `repo/` de 005 sobre el esquema con la 008 funcionan, igual que `compat-previous-005.test.js` (con `fixtures/migrations-up-to.js` y las sentencias de 005: crear y cerrar noche, siesta, `updateProfile` con objetivo, onboarding, export y borrar cuenta). Fijar los tests de compatibilidad y de migraciones anteriores a su era con `migrationsUpTo(7)` donde haga falta.
- [ ] T004 [P] Crear `docs/sdd/terminos-prohibidos.txt` (lista inicial de R7: un término o patrón por línea y `#` para comentarios) y el test `backend/test/forbidden-terms.test.js`:
  - recorre `frontend/src/**/*.html`, `frontend/src/**/*.ts` sin `*.spec.ts` y `backend/src/**/*.js`;
  - compara sin distinguir mayúsculas ni tildes y con límites de palabra;
  - si falla, informa de `archivo:línea` y del término;
  - un caso de autocomprobación con un texto sembrado demuestra que detecta un término;
  - un caso que confirma que "tratamiento de mis datos" (término legal del RGPD) **no** se marca.
- [ ] T005 Pasar `forbidden-terms.test.js` sobre el código actual: corregir los textos o comentarios existentes que contengan términos de la lista, sin cambiar el comportamiento.

**Checkpoint**: esquema 008 aplicado, compatible con 005, y la vigilancia de términos en marcha.

---

## Phase 2: User Story 1 - Origen de los datos y aviso médico (Priority: P1) 🎯 MVP

**Independent Test**: specs de `origin-badge` y `app` + e2e (insignias y aviso).

- [ ] T006 [P] [US1] Frontend: `shared/origin/origin-badge.component.ts`:
  - input `origin: 'manual' | 'estimated' | 'device'` → "Anotado por ti" / "Estimado" / "Del reloj";
  - función `blockOrigin(items: { origin }[])` → origen común o `null` si hay mezcla;
  - spec con los 3 textos, el bloque homogéneo, la mezcla y el bloque vacío (`null`).
- [ ] T007 [US1] Insignias de bloque (R6) con `blockOrigin`; por fila solo si mezcla. Specs de cada componente.
  - En las cabeceras de: lista de noches y cinta en `features/night/night.component.html`, lista de siestas en `features/naps/naps.component.html`, gráfico y tabla en `features/trends/trends.component.html`.
  - Hoy todos los datos guardados son `manual`.
- [ ] T008 [US1] `app.html`: aviso "No es un dispositivo médico" con `role="note"`, visible sin interacción cuando la pestaña activa es Noche, Tendencias o Siestas (no en Métricas, Cuenta ni en las pantallas de acceso o bienvenida). Spec en `app.spec.ts` con las 4 pestañas.

**Checkpoint**: US1 verificable sola.

---

## Phase 3: User Story 2 - Calculadora de ciclos (Priority: P1)

**Independent Test**: specs de `cycles.ts` y de la calculadora + `me.test.js` + e2e.

- [ ] T009 [P] [US2] Tests `backend/test/me.test.js`:
  - `GET /api/me` incluye `cycle_min: 90` y `latency_min: 15`;
  - `PUT /api/me` con `cycle_min` 100 y `latency_min` 20 → guardados y devueltos;
  - 69/111 → 400 "La duración del ciclo debe estar entre 70 y 110 minutos";
  - -1/61 → 400 "El tiempo en dormirte debe estar entre 0 y 60 minutos";
  - valores no enteros → 400;
  - cambiar el ciclo no toca `goal_customized`;
  - por usuario.
- [ ] T010 [US2] Implementar en `backend/src/repo/users.js`:
  - `PROFILE` con `s.cycle_min` y `s.latency_min`, y `COALESCE` a 90/15;
  - `setCycleSettings(userId, { cycle_min, latency_min }, now)`, un upsert sin tocar `goal_customized`;
  - `cycleOf(userId)`.

  En `backend/src/routes/me.js`: validación y mensajes.
- [ ] T011 [P] [US2] Tests en `backend/test/dashboard.test.js`: con `cycle_min = 100`, `GET /api/dashboard` devuelve `cycle_min: 100` y atajos múltiplos de 100 dentro de 240..720 (FR-010).
- [ ] T012 [US2] `backend/src/routes/dashboard.js`: `cycle_min` y `cycles(goal, cycleOf(userId))` del usuario (R3).
- [ ] T013 [P] [US2] Tests `frontend/src/app/core/cycles.spec.ts` para `wakeWindows` y `fmtWindow`:
  - 23:00 con 90/15 → centros 5:15, 6:45 y 8:15, y ventanas de ±15 min;
  - 22:00 con 70/0 → 4:40, 5:50 y 7:00;
  - cruce de medianoche → "mañana";
  - noche del cambio de horario con zona fija `Europe/Madrid`: el 25-oct-2026 a las 3:00 se atrasa a las 2:00. Acostarse `2026-10-24T23:00+02:00` con 90/15 y 5 ciclos → instante `2026-10-25T04:45Z` → se muestra **5:45** (no 6:45) y "mañana";
  - 110/60 y 6 ciclos → 12 h después, con "mañana".
- [ ] T014 [US2] Implementar `wakeWindows` y `fmtWindow` en `frontend/src/app/core/cycles.ts` (R1). `CYCLE_MIN` queda solo como valor por defecto.
- [ ] T015 [US2] Frontend `features/night/cycle-settings.component.ts`: campos de ciclo (70–110) y tiempo en dormirse (0–60), guardado con `AccountService.updateProfile` y error del servidor en `role="alert"`; output `changed`. Usarlo en el perfil (`features/account/profile.component.html`, sección "Ciclos de sueño"). Spec con guardado y 400.
- [ ] T016 [US2] Frontend `features/night/cycle-calculator.component.ts`:
  - inputs `bedtime` y ajustes; 3 ventanas con la insignia "Estimado";
  - el texto fijo "estimación, no medición; no está demostrado que despertar al final de un ciclo mejore cómo te sientes";
  - "Ajustar" (`<details>`) con `cycle-settings`.

  En `night.component.html`, bajo "¿Hora de dormir?" (desde `bedtimeInput`, recalcula al cambiarla) y en el estado de noche abierta (desde `open.bedtime`). Los ajustes salen de `GET /api/me`. "Me voy a dormir" sigue siendo 1 toque. Specs: recálculo al cambiar la hora y al cambiar los ajustes, texto fijo e insignia.
- [ ] T017 [US2] `goal-editor` (Tendencias y perfil) usa el `cycle_min` del dashboard o del perfil en lugar de la constante (FR-010); actualizar `trends.spec.ts` con un ciclo de 100. La bienvenida no cambia: aparece antes de que la persona pueda ajustar el ciclo, así que siempre usa 90.

**Checkpoint**: US1 + US2 = MVP.

---

## Phase 4: User Story 3 - Sección "Fases" (Priority: P2)

- [ ] T018 [P] [US3] `frontend/src/app/core/features.ts` (`WATCH_IMPORT_AVAILABLE = false`) y la sección plegable "Fases" en `features/trends/trends.component.html`:
  - sin importación: "Descanso aún no importa datos de relojes" más una frase explicativa;
  - con importación: "Importa tus datos →";
  - sin gráficos ni porcentajes.

  Spec en `trends.spec.ts` con los dos estados (la disponibilidad como input del componente, con la constante por defecto).

---

## Phase 5: User Story 4 - Recordatorio de noche abierta (Priority: P2)

- [ ] T019 [US4] `features/night/night.component.*`:
  - si la noche abierta lleva ≥ 14 h, aviso con `role="status"` "¿Olvidaste marcar que despertaste?";
  - hora propuesta = `min(bedtime + objetivo, ahora)` en `datetime-local` editable;
  - "Sí, desperté a esa hora" → `POST /api/sleep/wake` y después la tarjeta (T021);
  - "Aún no" lo oculta hasta recargar o volver a abrir la app (también al volver a la pestaña Noche: el descarte vive en un servicio raíz, porque Noche se recrea al cambiar de pestaña);
  - el objetivo sale de `GET /api/me`.

  Specs: 13 h 59 → sin aviso; 14 h → aviso con dormir + objetivo; 48 h → propuesta = dormir + objetivo (pasado); aceptar, cambiar la hora y descartar; ningún canal fuera de la app.

---

## Phase 6: User Story 5 - Tarjeta "¿Cómo fue la noche?" (Priority: P3)

- [ ] T020 [P] [US5] Tests `backend/test/diary.test.js`:
  - `PUT /api/sleep/:id` con `{ sol_bucket: '15_30' }` → guardado y el resto de la noche intacto;
  - `{ awakenings_bucket: '3plus' }` → guardado;
  - `null` → borrado;
  - valor fuera de la lista → 400 "Respuesta no válida";
  - `GET /api/sleep` y `/api/sleep/open` devuelven ambas columnas;
  - noche de otro usuario → 404 y sin cambios.
- [ ] T021 [US5] Implementar en `backend/src/repo/sleep.js` (`COLS` y `update` con las dos columnas) y en `backend/src/routes/sleep.js` (validación de los enums).
- [ ] T022 [P] [US5] Ampliar `backend/test/isolation.test.js` (las respuestas de A no se pueden escribir ni leer desde B) y `backend/test/export.test.js` (JSON con códigos; CSV de noches con `tiempo_dormirse` y `despertares` al final, vacíos sin respuesta).
- [ ] T023 [US5] Implementar la exportación en `backend/src/repo/export.js` y `backend/src/routes/export.js` (R10).
- [ ] T024 [US5] Frontend `features/night/night-card.component.ts`: tarjeta descartable con dos grupos de chips (`aria-pressed`), "<15 / 15–30 / >30 min" y "0 / 1–2 / 3+"; cada toque guarda con `PUT /api/sleep/:id` y tocar el elegido lo borra; "Cerrar" no guarda.

  En `night.component`, aparece solo justo después de "Ya desperté" o del aviso de T019 (signal `lastClosed`, R5); recargar no la muestra. En la edición de la noche, los dos selectores con la opción "Sin respuesta".

  Specs: el cierre es 1 toque y la tarjeta llega después; elegir guarda; descartar no guarda; no reaparece tras recargar; editar cambia o borra.

---

## Phase 7: Polish & cross-cutting

- [ ] T025 E2E `e2e/tests/diario-ciclos.spec.ts`:
  - calculadora (23:00 → 5:15 / 6:45 / 8:15 y "mañana", texto fijo, "Estimado");
  - ajustes 100/20 que se conservan al recargar, y 120 → error;
  - atajos del objetivo con 100 min;
  - "Me voy a dormir" y "Ya desperté" con 1 toque cada uno, y la tarjeta guarda "15–30" y "1–2";
  - noche abierta de hace 15 h con `setNow` → aviso y cierre con la hora propuesta;
  - aviso médico en Noche/Tendencias/Siestas y no en Métricas;
  - insignias "Anotado por ti" en las cabeceras;
  - "Fases" con el estado vacío.
- [ ] T026 [P] `scripts/smoke-local.mjs`: añadir a `run` las comprobaciones de 006:
  - `GET /api/me` con 90/15, y `PUT` 100/20 → 200 y 120 → 400;
  - el dashboard con `cycle_min` 100;
  - respuestas de la tarjeta por `PUT /api/sleep/:id` (y valor inválido → 400);
  - el CSV con las columnas nuevas.

  Actualizar la tabla de `docs/runbooks/verificacion-local.md`.
- [ ] T027 [P] Documentación:
  - `README.md`: calculadora, ajustes de ciclo, tarjeta, aviso de noche abierta, insignias, aviso médico y API (`PUT /api/me` y `PUT /api/sleep/:id` ampliados);
  - `docs/sdd/guia-migraciones.md`: la 008 como ejemplo de *expand* puro;
  - nota en `README.md` sobre la lista `docs/sdd/terminos-prohibidos.txt`.
- [ ] T028 Puertas de calidad:
  - backend `npm ci --ignore-scripts && npm test && npm run lint`, y frontend lint, test y build;
  - e2e completas;
  - `node scripts/smoke-local.mjs run`;
  - compatibilidad en Docker con la imagen de master (005) sobre una base migrada por 006 (adaptar `compat005-docker.js`);
  - verificación manual del quickstart §3; anotar todo en el PR.

---

## Dependencies & Execution Order

- **Phase 1** (T001→T002; T003, T004 [P]; T005 después de T004) bloquea todo.
- **US1** (T006–T008) y **US2** (T009–T017) son independientes entre sí; T016 usa la insignia de
  T006.
- **US3** (T018) solo depende de Phase 1.
- **US4** (T019) depende de Phase 1; su paso a la tarjeta enlaza con T024 si existe.
- **US5** (T020–T024) depende de T002.
- **Polish** (T025–T028) al final.

## Parallel Example

```text
Phase 1: T003 (compatibilidad) y T004 (términos) mientras T001→T002.
US2: T009 (me.test) ∥ T011 (dashboard.test) ∥ T013 (cycles.spec); luego T010, T012, T014.
US5: T020 (diary.test) ∥ T022 (isolation/export).
```

## Implementation Strategy

1. Phase 1, luego **MVP = US1 + US2** (honestidad + calculadora): se puede desplegar solo.
2. US3 y US4: pequeñas e independientes.
3. US5: la tarjeta y su exportación.
4. Polish con las puertas y la compatibilidad.
