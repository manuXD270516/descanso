# Tasks: Rachas de constancia (gamificación del hábito)

**Input**: Design documents from `specs/011-rachas-constancia/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: obligatorios (principio IV). Se escriben antes de implementar.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Foundational (bloquea las historias)

- [ ] T001 Tests `backend/test/migrations-010.test.js` sobre la base legacy migrada hasta 009 con 2 usuarios. Tras 010:
  - `user_settings` tiene `streak_enabled` (`INTEGER NOT NULL DEFAULT 0`, `CHECK (streak_enabled IN (0, 1))`), `streak_margin_min` (`DEFAULT 30`, `CHECK (streak_margin_min BETWEEN 15 AND 60)`), `streak_since` y `streak_offered_at` (NULL), `streak_best`, `streak_total` y `streak_total_base` (`DEFAULT 0`, `CHECK (… >= 0)`) y `streak_summary_dismissed` (NULL); las filas existentes toman esos valores;
  - existe `streak_achievements` con `CHECK (key IN (7, 21, 66, 100, 180, 365))`, `CHECK (wake_spread_min >= 0)`, `achieved_on` y `created_at` `NOT NULL` y `UNIQUE (user_id, key)`;
  - CASCADE: borrar un usuario borra sus logros;
  - las columnas previas de `user_settings` y `sleep_records` mantienen la misma huella;
  - `foreign_key_check` vacío y el `up` es idempotente.
- [ ] T002 Crear `backend/src/migrations/010_rachas.js` según `data-model.md` (solo *expand*, `PRAGMA table_info` antes de cada `ADD COLUMN`, como `009_horario.js`).
- [ ] T003 [P] Compatibilidad `backend/test/compat-previous-011.test.js` (`migrationsUpTo(10)`): las sentencias de 006 (`fixtures/legacy-006-statements.js`) y las de 010 (crear usuario con `INSERT INTO user_settings (user_id, updated_at)`, versión y días del horario, pausa, `lead_min`, `wake_logged_at`/`wake_from_proposal`, exportar y borrar cuenta) operan sobre el esquema de 011; la fila creada sin columnas de racha queda desactivada con margen 30. Fijar a su era (`migrationsUpTo(9)`) los tests de migraciones anteriores que hagan huellas de `user_settings`.
- [ ] T004 [P] Añadir `streak_achievements` (con `user_id`) a `backend/test/schema-isolation.test.js`.

**Checkpoint**: esquema 010 compatible.

---

## Phase 2: User Story 1 - Mi racha de constancia (Priority: P1) 🎯 MVP

**Goal**: calcular la racha con reglas honestas y mostrar "Día N", récord y total.

**Independent Test**: `streak-engine.test.js` (el ejemplo de la spec, literal) + `streak.test.js` + specs del panel y los ajustes.

- [ ] T005 [P] [US1] Tests `backend/test/streak-engine.test.js` de `computeStreak({ nights, versions, pauses, since, today, marginMin })` (tabla de estados de `data-model.md`):
  - asignación de noche (principio III): acostarse 23:10 → N; 0:30 y 11:59 del día siguiente → N; 12:00 → su propia fecha;
  - límites inclusivos: acostarse o levantarse a la agendada + margen → cumplido; +1 min → no cumplido (`late_bed` / `late_wake`, con las horas de pared);
  - horario después de medianoche (acostarse 1:15, levantarse 0:15) y adelantarse nunca resta;
  - modo "Registro": sin versión o con el día inactivo → cumplido con solo cerrar;
  - `wake_from_proposal = 1` → `proposal` con horario y cumplido en modo "Registro";
  - "Anotado después" (61 frente a 60 min) evaluado con la hora guardada, con `late_logged`;
  - sin cerrar: "aún no" hoy y ayer, no cumplido (`no_record`) desde hoy − 2; noche abierta igual;
  - noche partida: primera hora de acostarse y última de levantarse, un solo día;
  - versión vigente por fecha de la noche (cambiar el horario no altera noches pasadas);
  - DST y viaje: misma hora de pared con `-04:00` y `-03:00` → mismo resultado;
  - tolerancia: 2 no cumplidos en 7 días mantienen la racha; el tercero la corta y la siguiente empieza en el primer cumplido ("Día 1"); el ejemplo del Independent Test de US1 da 10 → 10 → corte → 1 con total 11;
  - `since` excluye las noches anteriores;
  - `spreadMin`: `null` con menos de 7 cumplidos; σ circular correcta con horas que cruzan medianoche;
  - propiedades con semilla (R9, 500 historiales, semilla en el mensaje): la racha no crece sin cumplidos; quitar un registro nunca sube `current` ni `total`; retrasar una hora nunca mejora; marcar `wake_from_proposal` nunca mejora; una noche que nunca se cierra acaba no cumplida;
  - rendimiento: 3.650 noches, mediana de 5 ejecuciones < 20 ms (SC-002).
- [ ] T006 [US1] Implementar `backend/src/streak.js` (`computeStreak`, R1–R3), puro, O(n) con cola de no cumplidos de la racha en curso; reutiliza `addDays` y `circularStat` de `backend/src/analytics.js`.
- [ ] T007 [P] [US1] Tests `backend/test/streak.test.js` (ajustes, consulta y trinquete):
  - `GET /api/streak?today=` desactivada → exactamente `{ enabled: false, offered: false, margin_min: 30, offer: false }`; `today` inválido o a más de ±1 día de UTC → 400; sin sesión → 401;
  - `PUT /api/streak/settings { today, enabled: true }` → `streak_since = today` y `streak_total_base = streak_total`; `margin_min` 14, 61 o no entero → 400 "El margen debe ser entre 15 y 60 minutos"; claves desconocidas → 400 "Ajuste no válido";
  - activada: `current`, `best`, `total`, `cut`, `week` (7 noches de lunes a domingo) y `last_night`;
  - `GET` dos veces no cambia ninguna columna `streak_*` ni crea logros (FR-010);
  - cerrar con `POST /api/sleep/wake`, crear cerrada con `POST /api/sleep` o editar con `PUT /api/sleep/:id` sube `streak_best` y `streak_total` en la misma petición;
  - editar o borrar después noches antiguas no baja el `best` ni el `total` mostrados (US1-12);
  - cambiar el margen recalcula `current` sin bajar `best` (US1-13);
  - desactivar conserva `best` y `total`; reactivar fija un `since` nuevo y el total sigue desde el guardado.
- [ ] T008 [US1] Implementar `backend/src/repo/streak.js` (`settings`, `saveSettings(userId, today, patch)`, `load(userId, today)` con noches desde `streak_since` hasta `today + 1`, versiones y pausas, y `ratchet(userId, today)` para `streak_best`/`streak_total`) y `backend/src/routes/streak.js` (`GET /api/streak`, `PUT /api/streak/settings` con `clientToday`); montarlo en `backend/src/app.js`.
- [ ] T009 [US1] Trinquete en `backend/src/routes/sleep.js`: `POST /`, `POST /wake` y `PUT /:id` escriben y llaman a `repo/streak.ratchet` dentro de una sola `db.transaction`, solo si la racha está activada; `today` = fecha de pared de ahora con el desfase del ISO escrito (helper `todayAt(iso)` en `backend/src/util.js`, con test). `DELETE` no cambia. Los tests de `diary.test.js` y de noches siguen pasando.
- [ ] T010 [P] [US1] Frontend `frontend/src/app/core/streak.service.ts` (`get(today)`, `saveSettings(patch)`) y `frontend/src/app/core/streak.ts` (textos puros) con `core/streak.spec.ts`: "Día N de constancia", "Tu récord: R", "Días cumplidos en total: T" y "Puedes fallar hasta 2 días en cualquier periodo de 7 días seguidos".
- [ ] T011 [US1] `frontend/src/app/features/streak/streak-panel.component.ts`: `<details>` "Constancia" con Día N, récord, total y la explicación de la tolerancia, montado en `features/trends/trends.component.*` debajo de los 3 indicadores de 005 y solo con la racha activada. Spec: fuera del bloque de indicadores; nada con la racha desactivada.
- [ ] T012 [US1] `frontend/src/app/features/streak/streak-settings.component.ts` en `features/schedule/my-schedule.component.ts`: "Llevar una racha de constancia" (activar/desactivar) y "Margen" (15–60 min) con los errores del servidor. Spec.

**Checkpoint**: la racha se calcula, se guarda el récord y se ve en Tendencias.

---

## Phase 3: User Story 2 - Recompensa visible que no caduca (Priority: P1)

**Goal**: estrellas de la semana y constelaciones permanentes.

**Independent Test**: `streak.test.js` (logros) + specs de la tarjeta y del panel.

- [ ] T013 [P] [US2] Tests en `backend/test/streak.test.js`:
  - la escritura que lleva `current` a 7 crea el logro 7 con `achieved_on = today` y `wake_spread_min` congelado;
  - una edición que sube `current` de 5 a 22 crea 7 y 21 a la vez;
  - editar o borrar después esas noches no cambia ni retira los logros (SC-005); volver a llegar a 7 tras un corte no duplica;
  - `POST /api/streak/achievements/7/seen` → 204 e idempotente; clave no desbloqueada o fuera de la lista → 404;
  - `GET` devuelve `achievements` con `seen` y cada día de `week` con `state`, `reason`, `bed_time`, `wake_time` y `late_logged`.
- [ ] T014 [US2] Ampliar `repo/streak.ratchet` con `INSERT OR IGNORE` de los hitos `k ≤ current` en `streak_achievements`; `week`, `last_night` y `achievements` en `GET`; ruta `POST /api/streak/achievements/:key/seen` en `backend/src/routes/streak.js`.
- [ ] T015 [P] [US2] `frontend/src/app/features/streak/streak-card.component.ts`: tarjeta descartable con `role="status"`, brillo CSS ≤ 400 ms y sin animación bajo `@media (prefers-reduced-motion: reduce)`; foco visible en "Cerrar". Spec: rol, salida al descartar y ausencia de animación con movimiento reducido.
- [ ] T016 [US2] En `streak-panel`: semana de 7 estrellas (encendida, apagada con motivo, "En pausa", "Aún no", sin estrella antes de activar) con texto accesible en cada una (no solo color) y la marca "Anotado después" de `shared/origin/origin-badge.component.ts`; colección de constelaciones con fecha y "tu hora de levantarte varió solo ±X min"; la de 66 dice que es la media; un logro sin ver se muestra en `streak-card` y al descartarlo se marca visto. Textos en `core/streak.ts`. Specs: etiquetas de estrellas, texto de 66 y ningún texto de puntos, niveles ni rankings.

---

## Phase 4: User Story 3 - La racha está donde la busco y nunca antes de dormir (Priority: P1)

**Goal**: opcional, ofrecida una vez y visible solo tras despertar y en Tendencias.

**Independent Test**: `streak.test.js` (oferta) + specs de Noche, bienvenida y aviso + e2e.

- [ ] T017 [P] [US3] Tests en `backend/test/streak.test.js`: `offer` es true solo desactivada, sin ofrecer y con ≥ 3 noches cerradas; `PUT { offered: true }` la apaga para siempre; activar también marca `offered`; con la racha desactivada, cerrar o editar noches no escribe ninguna columna `streak_*` ni logros (SC-006).
- [ ] T018 [US3] Implementar `offer` (recuento de noches cerradas) y `offered` en `repo/streak.js` y `routes/streak.js`.
- [ ] T019 [P] [US3] `frontend/src/app/features/streak/streak-offer.component.ts`: "¿Quieres llevar una racha de constancia?" con un ejemplo, qué se premia (acostarte y levantarte a tu hora, o registrar sin horario) y por qué; "Sí, activarla" y "Ahora no", un toque cada una (SC-007). Spec.
- [ ] T020 [US3] `frontend/src/app/features/streak/streak-morning.component.ts` en `features/night/night.component.*`, solo en el estado tras "Ya desperté": línea "Día N de constancia ★" si `last_night` es cumplido o un texto neutro si no; la oferta si `offer`; la tarjeta del logro sin ver. Specs: la línea tras despertar; nada con la racha desactivada; **sin noche abierta (pantalla de acostarse) y en `shared/bedtime-notice.component.ts` no se renderiza nada de `features/streak/` ni el texto "constancia"** (SC-003).
- [ ] T021 [US3] `streak-offer` en `features/onboarding/welcome.component.ts` (si no se ofreció) y en `streak-panel` de Tendencias cuando `offer`. Specs: aparece una vez y responder la oculta.

---

## Phase 5: User Story 4 - Volver a empezar sin culpa (Priority: P2)

**Goal**: motivos neutros y mensaje de nuevo comienzo; vocabulario vigilado.

**Independent Test**: `core/streak.spec.ts` + `forbidden-terms.test.js`.

- [ ] T022 [P] [US4] Specs en `frontend/src/app/core/streak.spec.ts`: motivos "Te acostaste a las 0:15 (fuera de tu horario)", "Te levantaste a las 9:10 (fuera de tu horario)", "Hora propuesta, sin anotar la real" y "Sin registro"; "Tu récord sigue siendo 25. Mañana es un buen día para empezar otra" y su variante si hoy es domingo (mañana empieza la semana).
- [ ] T023 [US4] Implementar esos textos en `core/streak.ts`; tarjeta de nuevo comienzo (`cut`) en `streak-morning` y `streak-panel`; estrellas apagadas con estilo neutro (sin rojo ni iconos de error). Spec del panel: ninguna clase de error en días no cumplidos.
- [ ] T024 [P] [US4] Añadir la sección "Culpa y pérdida (011)" (`perdiste`, `fallaste`, `rompiste`, `en peligro`, `castigo*`) a `docs/sdd/terminos-prohibidos.txt` y ampliar la autocomprobación de `backend/test/forbidden-terms.test.js`; nuevo caso: `backend/src/ics.js` no contiene "racha" ni "constancia" (FR-023; `bedtime-notice` ya lo comprueba T020).

---

## Phase 6: User Story 5 - Pausa (Priority: P2)

**Goal**: la pausa no corta la racha; registrar en pausa cuenta como modo "Registro".

**Independent Test**: `streak-engine.test.js` (pausa). La lógica ya está en T006 y el estilo "En pausa" en T016; esta fase la verifica.

- [ ] T025 [P] [US5] Tests en `backend/test/streak-engine.test.js` y `backend/test/streak.test.js`:
  - noche en pausa sin registrar → "en pausa", fuera de la ventana (2 no cumplidos + 5 en pausa + 1 no cumplido no cortan);
  - noche en pausa cerrada a cualquier hora → cumplido;
  - el Independent Test de US5 literal (racha 10, pausa de 5 sin registrar → 10; registrar en pausa → 11);
  - propiedad: no registrar en pausa nunca corta la racha;
  - `POST /api/pauses` con inicio en el pasado sigue dando 400 (010 sin cambios; SC-001).

---

## Phase 7: User Story 6 - Resumen de la semana (Priority: P3)

**Goal**: tarjeta informativa de la semana anterior, descartable y sin notificación.

**Independent Test**: `streak.test.js` (resumen) + spec de la tarjeta.

- [ ] T026 [P] [US6] Tests en `backend/test/streak.test.js`: `summary` de la semana anterior (`met` y `of` sobre noches no pausadas y decididas; `avg_min` con `buildDays`/`summary` de 005 con 3 noches cerradas, `null` con 2, nunca 0); `PUT { dismiss_summary: true }` → `null` esa semana y vuelve la siguiente; desactivada → sin resumen.
- [ ] T027 [US6] Implementar `summary` y `dismiss_summary` (`streak_summary_dismissed` = lunes de la semana de `today`) en `repo/streak.js` y `routes/streak.js`.
- [ ] T028 [US6] Tarjeta de resumen (`streak-card`) en `streak-morning` y `streak-panel`: "La semana pasada: X de Y días cumplidos · media 7 h 10 min" (con `origin-badge` "Anotado por ti", principio VIII) o "media: sin datos"; descartar llama a `dismiss_summary`. Spec.

---

## Phase 8: Polish & cross-cutting

- [ ] T029 [P] Exportación y borrado (FR-026): `backend/src/routes/export.js` añade `streak: { settings, achievements }` (función en `repo/streak.js`). Tests en `backend/test/export.test.js` y `backend/test/delete-account.test.js` (borrar la cuenta borra los logros y los ajustes).
- [ ] T030 [P] Aislamiento en `backend/test/isolation.test.js` (FR-027, SC-008): A con la racha activada, noches y un logro; `GET /api/streak` de B no refleja nada de A; `PUT /api/streak/settings` de B no toca a A; `POST /api/streak/achievements/7/seen` de B → 404 y el de A sigue sin ver; la exportación de B no contiene logros de A.
- [ ] T031 E2E `e2e/tests/rachas.spec.ts` (fechas relativas a hoy: el trinquete usa el reloj real del servidor):
  - con 3 noches cerradas, "Ya desperté" → oferta → "Ahora no" → activarla en Cuenta → Mi horario;
  - "Ya desperté" → "Día N de constancia ★"; sin noche abierta, ningún rastro de la racha en Noche;
  - logro de 7 días: tarjeta una sola vez y sigue en la colección tras editar una noche;
  - estrella apagada con su motivo y "En pausa" en Tendencias → Constancia;
  - desactivarla oculta todo.
- [ ] T032 [P] Documentación: `README.md` (racha de constancia y API) y `docs/sdd/guia-migraciones.md` (010 como *expand* con columnas y tabla nuevas).
- [ ] T033 Puertas de calidad (según `specs/011-rachas-constancia/quickstart.md`):
  - backend `test` y `lint`; frontend `lint`, `test` y `build`; e2e;
  - `smoke-local run` (sin comprobaciones nuevas: regresión de lo existente);
  - verificación manual del quickstart §3;
  - anotar todo en el PR.

---

## Dependencies & Execution Order

- **Phase 1** bloquea todo (T001 → T002; T003 y T004 [P]).
- **US1** (T005–T012) es la base: motor, repo, rutas y trinquete.
- **US2** (T013–T016) amplía el trinquete y el panel de US1.
- **US3** (T017–T021) usa la ruta de US1 y la tarjeta de US2 (T015).
- **US4** (T022–T024) depende de los componentes de US1–US3 para la tarjeta de nuevo comienzo; T024 es independiente.
- **US5** (T025) solo verifica T006 y T016.
- **US6** (T026–T028) usa la ruta de US1 y la tarjeta de US2.
- **Polish** (T029–T033) al final; T031 tras US1–US4.

## Parallel Example

```text
Phase 1: T003 ∥ T004 mientras T001 → T002.
US1: T005 ∥ T007 ∥ T010; luego T006 → T008 → T009; T011 y T012 tras T010.
US2/US3: T013 ∥ T015 ∥ T017 ∥ T019.
US4–US6: T022 ∥ T024 ∥ T025 ∥ T026.
Polish: T029 ∥ T030 ∥ T032.
```

## Implementation Strategy

1. Phase 1 + **MVP = US1 + US2 + US3** (racha honesta, recompensa y su sitio): las tres son P1 y la
   racha no es útil sin estrellas ni sin la oferta.
2. US4 y US5 (sin culpa y pausa).
3. US6 y polish.

## Revisión de sobreingeniería (2026-10-05)

Cruzando las tareas con la spec y la constitución se quitó lo que ninguna de las dos pide:
- **Comprobaciones nuevas en `scripts/smoke-local.mjs`** y su fila en el runbook: repetían lo que ya
  prueban `streak.test.js` y el e2e; `smoke-local run` se mantiene como regresión.
- **Ensayo de compatibilidad en Docker** con la imagen de 010: la migración solo añade columnas con
  `DEFAULT`/`NULL` y una tabla, y `compat-previous-011.test.js` (T003, exigido por la guía de
  migraciones) ya ejecuta las sentencias de 010 sobre el esquema nuevo.
- **Comprobación duplicada de `bedtime-notice`** en la prueba de términos: ya la cubre la spec de
  componentes de T020 (SC-003).

Descartado ya en el diseño (research): tabla de días materializada, motor duplicado en el cliente,
librería de pruebas de propiedades, un segundo margen para la hora de acostarse, varios tipos de dato
personal en las constelaciones (solo la variación de la hora de levantarse), crear pausas desde la
racha (se crean en "Mi horario") y una lista de términos prohibidos propia de 011.
