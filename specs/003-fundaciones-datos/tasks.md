# Tasks: Fundaciones de datos: migraciones y endurecimiento

**Input**: Design documents from `specs/003-fundaciones-datos/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: obligatorios por el principio IV de la constitución. En cada historia, las pruebas se
escriben primero y deben fallar antes de implementar.

**Organization**: por historia de usuario. Referencias `R#` = research.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes).
- **[Story]**: US1–US4 de spec.md.

---

## Phase 1: Setup

- [X] T001 [P] Crear `.gitattributes` en la raíz con `backend/src/migrations/* text eol=lf` (R3)
- [X] T002 [P] Crear `backend/test/fixtures/legacy-db.js` como copia literal del `backend/src/db.js` actual de master (antes de 003), parametrizado solo para recibir la ruta de la base como argumento en lugar de `DB_PATH` (R14)
- [X] T003 Crear `backend/test/fixtures/make-legacy-db.js`: con `legacy-db.js`, genera en una ruta dada una base determinista; opciones `--realista` (10 años: 3.650 noches, ~1.500 siestas, 3 métricas × 3.650 días) y `--dos-abiertas` (dos filas con `wake_time` NULL); exporta también `hashTables(dbPath)` (SHA-256 por tabla de `SELECT * ORDER BY rowid`) (R15)

---

## Phase 2: Foundational

No hay tareas bloqueantes compartidas: US1 es la base de US2 y de la parte de índice de US3 (ver
Dependencies).

---

## Phase 3: User Story 1 - Cambiar el esquema sin arriesgar los datos (Priority: P1) 🎯 MVP

**Goal**: runner de migraciones síncrono con registro, checksum, atomicidad, respaldo previo y
línea base que no toca datos.

**Independent Test**: arrancar sobre una base legacy y sobre una vacía; ambas en la última versión,
la legacy con huella idéntica y el segundo arranque sin cambios.

### Tests for User Story 1

- [X] T004 [P] [US1] Pruebas del runner en `backend/test/migrate.test.js` con carpetas de migraciones temporales: base nueva crea `schema_migrations` y aplica en orden, con `applied_at` en ISO 8601 con desfase (FR-003); segunda ejecución devuelve `applied: []` y no escribe (FR-006); migración que falla a mitad deja la base igual y sin registro, y las anteriores siguen aplicadas (FR-002); checksum alterado lanza error que nombra la migración y no toca la base (FR-004); mismo archivo con CRLF y con BOM da la misma huella (R3); hueco o versión duplicada abortan; versión registrada sin archivo solo avisa; respaldo `pre-NNN.db` creado solo si hay pendientes y existe `sleep_records`, poda a 3, y fallo del respaldo aborta sin migrar (FR-007, FR-008); dos conexiones al mismo archivo ejecutando `migrate()` → cada versión registrada una sola vez (FR-009)
- [X] T005 [P] [US1] Pruebas de línea base en `backend/test/migrations-legacy.test.js`: base legacy pequeña → `hashTables` idéntico antes y después y versiones 1 y 2 registradas (SC-001); base realista → `migrate()` + respaldo en < 20 s (SC-004); base nueva vía `require('../src/db')` con `DB_PATH` temporal → 3 métricas iniciales; en un proceso hijo, con una base cuya migración aplicada tiene otro checksum, `require('../src/app')` falla y el proceso sale con código ≠ 0 sin llegar a escuchar (FR-001)

### Implementation for User Story 1

- [X] T006 [US1] Implementar `backend/src/migrate.js` según `contracts/migraciones.md`: `schema_migrations(version INTEGER PK, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)`, lectura y validación de `NNN_*.sql|js`, SHA-256 con `\n` y sin BOM, `VACUUM INTO` a `backupDir/pre-NNN.db` (si ya existe por un reintento, se borra antes) con poda a 3, transacción `.immediate()` por migración con recomprobación, `MigrationError` con mensajes en español (R1–R6)
- [X] T007 [US1] Crear `backend/src/migrations/001_esquema_inicial.sql` con el DDL exacto actual de `db.js` (`IF NOT EXISTS`) y la siembra `INSERT … SELECT … WHERE NOT EXISTS (SELECT 1 FROM metrics)` de las 3 métricas iniciales (R5)
- [X] T008 [US1] Reescribir `backend/src/db.js`: abrir conexión, `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`, llamar a `migrate(db, { backupDir: DB_PATH === ':memory:' ? null : path.join(path.dirname(DB_PATH), 'backups') })` y exportar `db`; quitar DDL y siembra (R1)
- [X] T009 [US1] Ejecutar la suite completa del backend y `e2e/` sin cambios de expectativas para confirmar que la línea base es transparente; ajustar `backend/test/persistence.test.js` si asume el DDL dentro de `db.js`

**Checkpoint**: US1 funcional; la base de producción migraría a la versión 1 sin cambios.

---

## Phase 4: User Story 2 - Rollback del despliegue sin romper la base (Priority: P1)

**Goal**: regla expand/contract escrita, compatibilidad probada con la versión anterior y runbook
de restauración.

**Independent Test**: `compat-previous.test.js` en verde y runbook ensayado en local en < 15 min.

- [X] T010 [P] [US2] Prueba `backend/test/compat-previous.test.js`: base temporal creada con `legacy-db.js` + datos → `migrate()` → reabrir con `legacy-db.js` y ejecutar las sentencias de la versión anterior (crear noche abierta, cerrarla, crear siesta, upsert de valor de métrica, listar con rango, stats) sin errores (FR-012, SC-006)
- [X] T011 [P] [US2] Escribir `docs/sdd/guia-migraciones.md`: regla expand/contract con ejemplos permitidos en un despliegue y en dos, nombre y numeración, "nunca editar una migración aplicada", `PRAGMA foreign_keys` fuera de transacción, cómo probar (fixture legacy + compat) (FR-010)
- [X] T012 [P] [US2] Escribir `docs/runbooks/rollback-migracion.md`: síntomas (log `[migraciones]`, rollback del pipeline), restauración en Fly con `flyctl ssh console` (parar, copiar `/data/backups/pre-NNN.db` sobre `/data/sleep.db`, borrar `-wal`/`-shm`, `flyctl apps restart`), redepliegue de la imagen anterior, y sección "Ensayo en local" con `compose.yaml` (FR-011)
- [X] T013 [US2] Ensayar el runbook en local según `quickstart.md` §6, cronometrarlo (< 15 min, SC-007) y anotar la duración y cualquier corrección en el propio runbook

**Checkpoint**: el rollback automático de 002 sigue siendo seguro.

---

## Phase 5: User Story 3 - Datos que no se distorsionan (Priority: P1)

**Goal**: rechazar entradas incorrectas con 400 claros, cinta completa, media circular en rango y
una sola noche abierta garantizada por la base.

**Independent Test**: `validation-dt.test.js` y las pruebas de componente de la cinta en verde.

### Tests for User Story 3

- [X] T014 [P] [US3] Ampliar `backend/test/util.test.js`: `isDate` rechaza `2026-02-30`, `2026-13-01`, `26-09-01` y acepta `2028-02-29`; `localDateOf('2026-09-05T23:30:00-04:00') === '2026-09-05'` y `null` para `'Sep 7 2026'`; `circularAvg([1410, 30])` ∈ 0..1439 y nunca 1440; `parseRange` (opcional/obligatorio, `from > to`) (R8, R9, R12)
- [X] T015 [P] [US3] Crear `backend/test/validation-dt.test.js`: `GET /api/stats` sin rango, con fecha inválida o `from > to` → 400 con mensaje en español, nunca 500 (DT-02); `from=2026-02-30` en `/api/sleep`, `/api/naps`, `/api/metrics/entries` → 400 (DT-03); POST y PUT de noche con `date` ≠ día local de `bedtime` → 400 con la fecha esperada, incluida noche que empieza a las 00:30 (fecha = ese día) (DT-04); ídem siestas con `start_time`; métrica sí/no con `'quizá'`, `2`, `null` → 400 y con `true`/`'0'` → `'1'`/`'0'` (DT-08); editar una noche antigua cuya fecha ya era incoherente sin corregirla → 400, y la fila no cambia (FR-021); insertar directamente dos noches abiertas con SQL → `SQLITE_CONSTRAINT_UNIQUE`, y la ruta traduce ese error a 409 con el mensaje actual (FR-019)
- [X] T016 [P] [US3] Prueba de migración con dos noches abiertas en `backend/test/migrations-legacy.test.js`: base `--dos-abiertas` → `migrate()` lanza un error que incluye ids y fechas de ambas, la huella no cambia y la versión 2 no queda registrada (FR-020, US3-8)
- [X] T017 [P] [US3] Ampliar `frontend/src/app/features/night/night.component.spec.ts`: dos noches con la misma fecha → dos `.bar.sleep` en esa fila (DT-11); al editar y cambiar "Me dormí" a otro día, el campo "Fecha de la noche" (solo lectura) muestra `nightDate` del nuevo valor y `updateSleep` recibe esa fecha (FR-025)

### Implementation for User Story 3

- [X] T018 [US3] En `backend/src/util.js`: `isDate` estricto de calendario, `localDateOf(iso)`, `parseRange(query, { required })` que lanza `HttpError(400)` con los mensajes de `contracts/openapi-delta.yaml`, y `circularAvg` movida desde `stats.js` con `% 1440` (R8, R9, R12)
- [X] T019 [US3] Crear `backend/src/migrations/002_una_noche_abierta.js`: si hay más de una noche con `wake_time IS NULL`, lanzar error con ids y fechas e instrucción de resolución; si no, `CREATE UNIQUE INDEX ux_sleep_one_open ON sleep_records(wake_time IS NULL) WHERE wake_time IS NULL` (R7)
- [X] T020 [US3] Actualizar `backend/src/routes/sleep.js`: `parseRange` en GET; en `validate()` exigir `date === localDateOf(bedtime)` con el mensaje "La fecha de la noche debe ser {esperada} (el día en que te acostaste)"; mantener `assertNoOtherOpen()` y traducir `SQLITE_CONSTRAINT_UNIQUE` de `ux_sleep_one_open` a `HttpError(409, 'Ya hay una noche abierta. Ciérrala antes de abrir otra.')` en POST y PUT
- [X] T021 [P] [US3] Actualizar `backend/src/routes/naps.js`: `parseRange` en GET; exigir `date === localDateOf(start_time)` con "La fecha de la siesta debe ser {esperada} (el día en que empezó)"
- [X] T022 [P] [US3] Actualizar `backend/src/routes/metrics.js`: `parseRange` en `GET /entries`; `validateValue` para `boolean` según R10, 400 "El valor debe ser sí o no"
- [X] T023 [P] [US3] Actualizar `backend/src/routes/stats.js`: `parseRange(req.query, { required: true })` y `circularAvg` importada de `util.js`
- [X] T024 [P] [US3] Actualizar `frontend/src/app/features/night/night.component.ts` y `.html`: `Ribbon.sleeps: Bar[]` y `@for` sobre todas las barras (DT-11); en edición, "Fecha de la noche" `readonly` con `nightDate(edit.bedtime)` y `saveEdit` enviando ese valor (FR-025)
- [X] T025 [US3] Revisar las pruebas existentes de backend, frontend y `e2e/` que envíen fechas incoherentes o valores sí/no fuera de rango y corregir sus datos (no sus expectativas de negocio); confirmar que la suite completa pasa

**Checkpoint**: US3 funcional; ninguna petición mal formada produce 500.

---

## Phase 6: User Story 4 - Aviso antes de quedarse sin espacio (Priority: P2)

**Goal**: estado del volumen en `/api/health` y aviso en el log por encima del 70 %.

**Independent Test**: `storage.test.js` con 71 % → `warn`; 69 % → `ok`; sin medir → `unknown`.

- [X] T026 [P] [US4] Crear `backend/test/storage.test.js` inyectando un `statfs` falso y un reloj: 71 % → `{ status: 'warn', used_pct: 71 }` y un `console.warn`; segunda llamada antes de 1 h no vuelve a avisar y después de 1 h sí (FR-022); 70 % → `ok`; error o `:memory:` → `{ status: 'unknown', used_pct: null }`; `GET /api/health` incluye `storage` y responde 200 también en `warn` (FR-023, FR-024)
- [X] T027 [US4] Implementar `backend/src/storage.js` con `storageStatus({ statfs, now })` (inyectables, por defecto `fs.statfsSync` y `Date.now`), umbral 70 y aviso máximo 1 por hora (R13)
- [X] T028 [US4] Añadir `storage: storageStatus()` a `/api/health` en `backend/src/app.js` y llamar a `storageStatus()` tras `listen()` en `backend/src/server.js`; actualizar `backend/test/health.test.js` y `health-version.test.js` a la nueva forma

**Checkpoint**: todas las historias funcionales.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T029 [P] Actualizar `README.md`: sección "Migraciones" (dónde viven, cómo se aplican, enlaces a la guía y al runbook) y `storage` en la descripción de `/api/health`
- [X] T030 [P] Registrar DT-23 y DT-24 (research.md) en `specs/001-linea-base/research.md` y marcar DT-01, DT-02, DT-03, DT-04, DT-08, DT-11 y DT-21 como resueltos por 003
- [X] T031 Ejecutar `quickstart.md` §1–§8 en local y lint + tests + build de backend y frontend; anotar resultados en el PR

---

## Dependencies & Execution Order

- **Setup (T001–T003)** → antes de todo. T003 depende de T002.
- **US1 (T004–T009)** → base de US2 y de T016/T019 (la migración 002 necesita el runner).
- **US2 (T010–T013)** → después de US1. T013 después de T012.
- **US3**: T014, T015, T017, T018 y T020–T024 no dependen de US1 (salvo el caso de 409 por índice
  de T015, que necesita T019). T016 y T019 necesitan US1.
- **US4 (T026–T028)** → independiente de las demás.
- **Polish (T029–T031)** → al final.

Dentro de cada historia: pruebas → implementación → verificación.

## Parallel Example

```text
# Tras el Setup, en paralelo:
T004, T005        (pruebas de US1)
T014, T015, T017  (pruebas de US3)
T026              (pruebas de US4)
# Implementación en paralelo por archivos distintos:
T021, T022, T023, T024  (naps, metrics, stats, cinta)
```

## Implementation Strategy

1. **MVP = Setup + US1**: el runner con la línea base ya desbloquea las features 004 en adelante.
2. **US2** antes de desplegar: sin la guía, el runbook y la prueba de compatibilidad, no se fusiona.
3. **US3**: correcciones de datos y la migración 002.
4. **US4**: aviso de volumen.
5. Un único PR con todo, porque es una sola feature de infraestructura; las migraciones 001 y 002 se
   aplican en el mismo arranque en producción.
