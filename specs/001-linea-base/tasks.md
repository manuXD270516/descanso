---

description: "Lista de tareas de la feature 001 – Línea base del tracker de descanso"
---

# Tasks: Línea base del tracker de descanso

**Input**: Design documents from `/specs/001-linea-base/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml, quickstart.md

**Tests**: SÍ se piden. SC-002 exige que el 100 % de los escenarios de aceptación estén cubiertos
por pruebas automatizadas, y la constitución (principio IV) exige tests antes de cerrar una
tarea.

La mayoría son **tests de caracterización**: documentan comportamiento que ya existe, así que
deben pasar sin tocar el código. Solo los tests de FR-003 (409) y de los textos "desperté"
deben **fallar antes** de implementar.

**Organization**: una fase por historia, en orden de prioridad: US1 y US6 (P1), US2 y US3 (P2),
US4 y US5 (P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos y sin dependencias pendientes).
- **[Story]**: historia de la spec (US1–US6).

## Path Conventions

Aplicación web: `backend/src/`, `backend/test/`, `frontend/src/app/` (specs junto al código).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: herramientas de pruebas y lint que hoy no existen (research D1, D4, D7).

- [X] T001 Añadir `supertest` como devDependency y los scripts `"test": "node --test"` y `"lint": "eslint ."` en backend/package.json, y fijar `"engines": { "node": ">=22" }` (principio I; el Dockerfile ya usa node:22)
- [X] T002 [P] Crear backend/eslint.config.js (flat config, `@eslint/js` recommended, globals de Node CommonJS, ignorar `data/` y `node_modules/`) y añadir `eslint`, `@eslint/js` y `globals` como devDependencies en backend/package.json
- [X] T003 [P] Ejecutar `npx ng add @angular-eslint/schematics --skip-confirmation` en frontend/ para generar frontend/eslint.config.js, el target `lint` en frontend/angular.json y el script `"lint": "ng lint"` en frontend/package.json
- [X] T004 Corregir solo los **errores** de lint (no los warnings) que aparezcan con `npm run lint` en backend/src/ y frontend/src/app/, sin cambiar el comportamiento

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: hacer la app testeable sin cambiar su comportamiento (research D2, D3, D5).

**⚠️ CRITICAL**: ninguna historia puede empezar hasta completar esta fase.

- [X] T005 Crear backend/src/app.js moviendo desde backend/src/server.js todo menos `listen()`: `require('./db')`, cors, json, `/api/health`, las 4 rutas, estáticos y SPA fallback, y el manejador de errores `{ error }`. Exportar `app` con `module.exports = app`
- [X] T006 Reducir backend/src/server.js a `const app = require('./app'); const PORT = process.env.PORT || 3000; app.listen(PORT, () => console.log(...))`, conservando el mensaje de log actual (depende de T005)
- [X] T007 Crear backend/test/helpers.js: fija `process.env.DB_PATH = ':memory:'` **antes** de requerir `../src/app`, y exporta `api = supertest(app)` y helpers ISO como `iso('2026-09-07T23:40', '-04:00')` (depende de T005)
- [X] T008 [P] Crear backend/test/health.test.js: `GET /api/health` → 200 con `ok === true` y `time` ISO (FR-029)
- [X] T009 [P] Crear backend/test/util.test.js con los casos de `isIso`, `isDate` (rechaza `2026-13-01` y `26-09-01`) y `durationMinutes` (23:40-04:00 → 07:10-04:00 = 450), en backend/src/util.js
- [X] T010 [P] Añadir `export function nightDate(iso: string): string` en frontend/src/app/core/time.ts. Devuelve `iso.slice(0, 10)`: el día local de quien registra, porque el ISO lleva su offset (FR-004)
- [X] T011 [P] Crear frontend/src/app/core/time.spec.ts con ≥ 3 casos de `nightDate` (23:40 → mismo día; 00:30 → ese mismo día; offsets `-04:00` y `+02:00`) (SC-003), más `inputLocalToIso`: añade `:00` y el offset del navegador (FR-005)
- [X] T012 Sustituir `iso.slice(0, 10)` y `bedtime.slice(0, 10)` por `nightDate(...)` en frontend/src/app/features/night/night.component.ts, y `start.slice(0, 10)` en frontend/src/app/features/naps/naps.component.ts (depende de T010)

**Checkpoint**: `npm test` (backend) y `ng test` (frontend) pasan; la app se comporta igual.

---

## Phase 3: User Story 1 - Registrar la noche en curso (Priority: P1) 🎯 MVP

**Goal**: dormir y despertar con un gesto cada uno, con una sola noche abierta garantizada por
el servicio.

**Independent Test**: `POST /api/sleep` → `GET /api/sleep/open` → `POST /api/sleep/wake` en una
base vacía, y la pestaña Noche en TestBed.

### Tests for User Story 1 ⚠️

- [X] T013 [P] [US1] Crear backend/test/sleep-night.test.js con los casos de caracterización. Deben pasar ya:
  - crear una noche sin `wake_time` → 201 con `wake_time: null` y `duration_min: null`;
  - `GET /api/sleep/open` la devuelve; sin noches abiertas devuelve `null`;
  - `POST /api/sleep/wake` con 07:10 tras 23:40 → 200, `duration_min: 450`, y la fecha de noche se conserva;
  - wake ≤ bedtime → 400 "La hora de despertar debe ser posterior a la de dormir" y la noche sigue abierta;
  - wake sin noche abierta → 404 "No hay una noche abierta para cerrar";
  - `wake_time` no ISO → 400.
- [X] T014 [P] [US1] Añadir a backend/test/sleep-night.test.js los casos de FR-003. Deben **fallar** antes de T016:
  - con una noche abierta, `POST /api/sleep` sin `wake_time` → 409 `{ error: "Ya hay una noche abierta. Ciérrala antes de abrir otra." }`;
  - con una noche abierta, `PUT /api/sleep/:otra` con `wake_time: null` → 409 y la otra noche no cambia;
  - el `PUT` con `wake_time: null` sobre la propia noche abierta → 200;
  - `POST /api/sleep` con `wake_time` válido mientras hay una abierta → 201, porque crea una noche cerrada.
- [X] T015 [P] [US1] Crear frontend/src/app/features/night/night.component.spec.ts con TestBed, `provideHttpClient()` y `provideHttpClientTesting()`. Casos:
  - sin noche abierta se ve "Me voy a dormir"; al pulsarlo se hace `POST /api/sleep` con `date === nightDate(bedtime)`;
  - con noche abierta se ve "Te acostaste a las HH:MM" y **"Ya desperté"** (debe fallar antes de T017), y no se ve "Me voy a dormir";
  - un error `{ error }` del servidor se muestra en `role="alert"`;
  - un registro sin `wake_time` muestra "noche abierta" en la lista (FR-008).

### Implementation for User Story 1

- [X] T016 [US1] En backend/src/routes/sleep.js añadir el guard de FR-003 (research D6). Condiciones:
  - en `POST /`: si `d.wake_time` es null/undefined y existe una fila `wake_time IS NULL`, lanzar `HttpError(409, 'Ya hay una noche abierta. Ciérrala antes de abrir otra.')`;
  - en `PUT /:id`: si el resultado deja `wake_time` null y existe otra fila abierta con `id != existing.id`, lanzar el mismo error.

  No cambiar el esquema (principio II).
- [X] T017 [US1] En frontend/src/app/features/night/night.component.html cambiar "Ya despertí" → "Ya desperté" y la etiqueta "Despertí" → "Desperté" (las dos apariciones: formulario manual y edición) (FR-027)

**Checkpoint**: T013–T015 en verde. US1 funciona de forma aislada.

---

## Phase 4: User Story 6 - Persistencia de los datos (Priority: P1)

**Goal**: garantizar que los datos sobreviven a reinicios y que los datos iniciales no se
duplican.

**Independent Test**: dos procesos Node sobre el mismo archivo SQLite temporal.

### Tests for User Story 6 ⚠️

- [X] T018 [US6] Crear backend/test/persistence.test.js:
  - con `DB_PATH` en un archivo de `os.tmpdir()`, lanzar con `child_process.execFileSync(process.execPath, [script])` un proceso que requiere `src/db.js` e inserta una noche, una siesta y un valor de métrica;
  - lanzar un segundo proceso que los lee y los imprime como JSON, y comprobar que son idénticos (US6-1);
  - comprobar que tras dos arranques hay exactamente 3 métricas (US6-3);
  - borrar el archivo y sus `-wal`/`-shm` al terminar.

**Checkpoint**: la persistencia está verificada.

---

## Phase 5: User Story 2 - Registrar, editar y eliminar noches pasadas (Priority: P2)

**Goal**: registro manual, edición y borrado de noches.

**Independent Test**: CRUD completo de `/api/sleep` y el formulario manual en TestBed.

### Tests for User Story 2 ⚠️

- [X] T019 [P] [US2] Crear backend/test/sleep-history.test.js:
  - `POST` con `wake_time` → 201 y `duration_min` correcto;
  - `date` inválida → 400 "date debe tener formato YYYY-MM-DD";
  - `bedtime` inválido → 400;
  - `PUT` parcial (solo `notes`) conserva las horas;
  - `PUT` con wake ≤ bedtime → 400 sin cambios;
  - `PUT` y `DELETE` de un id inexistente → 404 "Registro no encontrado";
  - `DELETE` → 204 y desaparece de `GET`;
  - notas de 600 caracteres → se guardan 500;
  - notas `''` → null;
  - `GET ?from&to` filtra por `date` inclusivo y ordena por `bedtime` DESC.
- [X] T020 [US2] Ampliar frontend/src/app/features/night/night.component.spec.ts (después de T015):
  - "Guardar noche" está deshabilitado si falta dormir o despertar;
  - guardar hace `POST` con `date` = `nightDate(bedtime)` y `wake_time`;
  - "Editar" + "Guardar cambios" hace `PUT` con `wake_time: null` si se vacía el despertar;
  - "Eliminar" con `confirm` falso no hace petición (espiar `window.confirm`); con `confirm` verdadero hace `DELETE`.

**Checkpoint**: US2 verificada.

---

## Phase 6: User Story 3 - Registrar siestas (Priority: P2)

**Goal**: CRUD de siestas y lista de 30 días agrupada por día.

**Independent Test**: `/api/naps` y NapsComponent en TestBed.

### Tests for User Story 3 ⚠️

- [X] T021 [P] [US3] Crear backend/test/naps.test.js:
  - `POST` válido → 201 con `duration_min`;
  - fin ≤ inicio → 400 "La siesta debe terminar después de empezar";
  - horas no ISO → 400;
  - `date` inválida → 400;
  - `PUT` parcial conserva el resto;
  - `PUT`/`DELETE` inexistente → 404 "Siesta no encontrada";
  - `GET ?from&to` filtra y ordena por `start_time` DESC.
- [X] T022 [P] [US3] Crear frontend/src/app/features/naps/naps.component.spec.ts:
  - al iniciar, el formulario propone inicio = ahora − 30 min y fin = ahora, y muestra "Duración: 30 min" (usar `jasmine.clock().mockDate`);
  - con fin ≤ inicio se muestra "El fin debe ser posterior al inicio" y el botón está deshabilitado;
  - pide `GET /api/naps` con `from = hoy − 29` y `to = hoy`;
  - dos siestas del mismo día (20 y 45 min) se muestran como "2 siestas · 1 h 05 min";
  - `POST` con `date = nightDate(start)`.

**Checkpoint**: US3 verificada.

---

## Phase 7: User Story 4 - Resumen de 14 días y cinta de noches (Priority: P3)

**Goal**: verificar los cálculos del resumen y la geometría de la cinta.

**Independent Test**: `/api/stats` con datos fijos, y el `computed` `ribbons()` de NightComponent.

### Tests for User Story 4 ⚠️

- [X] T023 [P] [US4] Crear backend/test/stats.test.js:
  - noches de 7 h y 8 h → `avg_sleep_min 450`, `nights 2`;
  - horas de dormir 23:30 y 00:30 → `avg_bedtime_min 0` (media circular);
  - las noches abiertas no cuentan;
  - 3 siestas → `total_naps 3` y `avg_nap_min` = media de los días con siestas;
  - sin datos → `avg_*_min` de horas `null` y `avg_sleep_min 0`;
  - `days` ordenado por fecha ascendente;
  - la hora media usa el `HH:MM` escrito en el ISO, sin convertirlo (sirven dos noches con offsets distintos).
- [X] T024 [US4] Ampliar frontend/src/app/features/night/night.component.spec.ts (después de T020):
  - se pide `GET /api/stats` con `from = hoy − 13` y `to = hoy`;
  - el resumen muestra "7 h 30 min", la hora media con `fmtMinutesOfDay`, y "N" siestas en 14 días;
  - sin datos se muestra "—";
  - `ribbons()` devuelve 14 filas, la más reciente primero;
  - una noche de 23:00 a 07:00 (hora local del navegador) da `x ≈ 45.83` y `w ≈ 33.33`;
  - una siesta cae en la fila de su `date`.

**Checkpoint**: US4 verificada.

---

## Phase 8: User Story 5 - Métricas personalizables (Priority: P3)

**Goal**: verificar la configuración, el registro diario y el historial de métricas.

**Independent Test**: `/api/metrics*` y MetricsComponent en TestBed.

### Tests for User Story 5 ⚠️

- [X] T025 [P] [US5] Crear backend/test/metrics.test.js. Casos de configuración:
  - base nueva → 3 métricas iniciales en orden: "Calidad del sueño" scale 1–5, "Energía al despertar" scale 1–5, "Cafés" number "tazas" min 0;
  - nombre vacío → 400 "El nombre es obligatorio";
  - tipo inválido → 400;
  - escala sin min/max o con min ≥ max → 400 "Una escala necesita mínimo y máximo (mínimo < máximo)";
  - nombre > 60 y unidad > 20 caracteres se truncan;
  - color inválido → `#5b6ee1`;
  - `archived: true` oculta la métrica en `GET /api/metrics` pero no con `?all=1`;
  - `sort_order` persiste el orden;
  - `PUT`/`DELETE` inexistente → 404 "Métrica no encontrada".
- [X] T026 [P] [US5] Crear backend/test/metric-entries.test.js. Casos de valores:
  - `PUT /:id/entries/:date` hace upsert: dos escrituras dejan 1 fila con el último valor (FR-021);
  - `-1` en "Cafés" → 400 "Mínimo 0";
  - `6` en una escala 1–5 → 400 "Máximo 5";
  - `'abc'` en number → 400 "El valor debe ser numérico";
  - boolean `true` → `'1'` y `false` → `'0'`;
  - un texto de 600 caracteres se guarda con 500;
  - fecha inválida → 400 "Fecha inválida";
  - `DELETE` de un valor → 204; si no existe → 404 "Registro no encontrado";
  - `GET /entries?from&to` excluye las métricas archivadas;
  - `DELETE /api/metrics/:id` borra en cascada sus valores (FR-019).
- [X] T027 [P] [US5] Crear frontend/src/app/features/metrics/metrics.component.spec.ts:
  - carga `GET /api/metrics?all=1` y las entradas de `hoy − 6..hoy`;
  - pulsar un valor de escala hace `PUT` y volver a pulsarlo hace `DELETE`;
  - sí/no alterna "Sin registrar" → "Sí" → "No";
  - el botón "Día siguiente" está deshabilitado en hoy;
  - el historial tiene 7 columnas que terminan en el día seleccionado;
  - "Archivar" hace `PUT {archived: 1}`;
  - "Eliminar" solo aparece en las archivadas y respeta `confirm`;
  - mover "↓" la primera métrica hace un `PUT` de `sort_order` por cada métrica activa, con el orden intercambiado;
  - "Crear métrica" está deshabilitado sin nombre.

**Checkpoint**: todas las historias están verificadas.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T028 [P] Crear frontend/src/app/app.spec.ts: se muestran las 3 pestañas "Noche", "Siestas" y "Métricas"; la activa tiene `aria-current="page"`, y cambiar de pestaña cambia el componente visible (FR-027)
- [X] T029 [P] Actualizar README.md: "Ya despertí" → "Ya desperté"; "Node.js 20+" → "Node.js 22 LTS"; la sección de desarrollo con `npm test`, `npm run lint` y `ng test --watch=false --browsers=ChromeHeadless`; y el 409 de `POST /api/sleep` en la tabla de la API
- [X] T030 Crear .github/workflows/ci.yml con **un** job en `pull_request` y `push` a `main`, sobre ubuntu-latest con Node 22 (`actions/setup-node`). Pasos: `npm ci`, `npm run lint` y `npm test` en backend/; `npm ci`, `npm run lint`, `npx ng test --watch=false --browsers=ChromeHeadless` y `npx ng build` en frontend/. Es el mínimo que exige el principio IV ("el build de producción debe pasar en CI"). La caché, la imagen, el despliegue y el badge son de la feature 002
- [X] T031 Ejecutar las puertas de calidad de specs/001-linea-base/quickstart.md §2 (lint + tests backend y frontend + `ng build`) y la comprobación manual §3, incluida la de FR-027: a 375 px de ancho no hay scroll horizontal, el foco es visible navegando con Tab, y con `prefers-reduced-motion: reduce` no hay animaciones. Anotar el resultado en el PR

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sin dependencias. T004 depende de T002 y T003.
- **Foundational (Fase 2)**: depende de T001. T006 y T007 dependen de T005; T012 depende de T010.
  **Bloquea todas las historias.**
- **Historias (Fases 3–8)**: dependen solo de la Fase 2 y son independientes entre sí.
- **Polish (Fase 9)**: T030 depende de T001–T003 (scripts de lint y test); T031 es la última
  tarea. T028 y T029 se pueden hacer en cualquier momento después de la Fase 2.

### User Story Dependencies

- Las seis historias son independientes en el backend: cada archivo de test tiene su propia base
  en memoria.
- En el frontend, `night.component.spec.ts` lo comparten US1 → US2 → US4 (T015 → T020 → T024),
  así que esas tareas van en ese orden.

### Within Each User Story

- Los tests de FR-003 (T014) y de "Ya desperté" (T015) se escriben **antes** que T016 y T017 y
  deben fallar primero.
- Los tests de caracterización deben pasar sin tocar el código. Si alguno falla, se trata como
  hallazgo y se consulta, sin cambiar el comportamiento por iniciativa propia.

### Parallel Opportunities

- Fase 1: T002 ∥ T003.
- Fase 2: T008 ∥ T009 ∥ T010 ∥ T011 (tras T005/T007 para los de backend).
- Tras la Fase 2, los tests de backend T013, T018, T019, T021, T023, T025 y T026 van en archivos
  distintos y pueden hacerse todos en paralelo, igual que los de frontend T022, T027 y T028.

---

## Parallel Example: User Story 5

```bash
Task: "Crear backend/test/metrics.test.js (configuración de métricas)"
Task: "Crear backend/test/metric-entries.test.js (valores diarios)"
Task: "Crear frontend/src/app/features/metrics/metrics.component.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Fase 1 + Fase 2: la app es testeable y tiene lint.
2. Fase 3 (US1): es el único cambio funcional (409 + textos). **Parar y validar.**

### Incremental Delivery

1. US1 → US6 (P1) → US2 → US3 (P2) → US4 → US5 (P3). Cada fase solo añade tests, salvo US1.
2. Fase 9 y validación con quickstart antes del PR (`/sdd-ship 001`).

---

## Notes

- No se cambia el esquema de la base (principio II).
- La deuda técnica DT-01…DT-20 de research.md queda **fuera de alcance**, salvo DT-12 (textos),
  DT-14 (Node 22) y DT-18 (tests, lint y CI mínimo).
- Commit por tarea o por grupo lógico.
