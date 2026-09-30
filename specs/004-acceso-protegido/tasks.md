# Tasks: Acceso protegido y portabilidad (multiusuario, paso 1)

**Input**: Design documents from `specs/004-acceso-protegido/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: obligatorios (principio IV). Se escriben antes de implementar y deben fallar primero.

**Organization**: por historia de usuario. `R#` = research.md.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Quitar la dependencia `cors` de `backend/package.json` y su uso en `backend/src/app.js` (R9); `npm install --ignore-scripts` para actualizar el lockfile
- [X] T002 [P] En `frontend/angular.json`, configuración `production`: `optimization.styles.inlineCritical: false` (R9); comprobar que `dist/.../index.html` ya no contiene `onload=`

---

## Phase 2: Foundational (bloquea US1–US5)

**Purpose**: esquema de usuarios y la extensión del runner que necesitan todas las historias.

- [X] T003 Tests de la extensión del runner en `backend/test/migrate.test.js`: una migración `.js` con `foreignKeys: false` puede reconstruir una tabla referenciada con `ON DELETE CASCADE` sin borrar las filas hijas; si deja una FK rota, `foreign_key_check` provoca error y rollback; tras la migración (con éxito o con fallo) `PRAGMA foreign_keys` vuelve a ser 1
- [X] T004 Implementar `foreignKeys: false` en `backend/src/migrate.js` (R6) y documentarlo en `docs/sdd/guia-migraciones.md` y en `specs/003-fundaciones-datos/contracts/migraciones.md` (sección "Extensión 004")
- [X] T005 Crear `backend/src/migrations/003_usuarios_y_sesiones.sql` según data-model.md: `users` (fila `1, NULL, NULL, 'owner'`; `email` "NULL hasta el alta", `COLLATE NOCASE UNIQUE`; `role CHECK (role IN ('owner'))`), `sessions` y `auth_setup` (`CHECK (id = 1)`, fila inicial)
- [X] T006 [P] Tests de la migración 004 en `backend/test/migrations-004.test.js`: sobre la base legacy (fixture de 003 con valores de métricas) → recuentos y huella de columnas originales idénticos en las 3 tablas, `metric_entries` intacta, todas las filas con `user_id = 1`, `foreign_key_check` vacío, `ux_sleep_one_open` por usuario (dos noches abiertas del mismo usuario → UNIQUE; de usuarios distintos → permitido); con la base realista, < 20 s
- [X] T007 Crear `backend/src/migrations/004_user_id_en_datos.js` (`foreignKeys: false`): reconstrucción en 12 pasos de `sleep_records`, `naps` y `metrics` con `user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE`, verificación de recuento y huella antes de `DROP`, y recreación de índices (`idx_sleep_date`, `idx_naps_date`, `ux_sleep_one_open ON sleep_records(user_id) WHERE wake_time IS NULL`) (R6)

**Checkpoint**: esquema listo; la suite existente sigue en verde (todavía sin autenticación).

---

## Phase 3: User Story 4 - Mis datos asociados a mí sin romper el rollback (Priority: P1)

**Goal**: el código de 003 funciona sobre el esquema de 004.

**Independent Test**: `compat-previous-004.test.js` y la imagen de master sobre una base migrada.

- [X] T008 [P] [US4] Crear `backend/test/fixtures/legacy-003-statements.js` con las sentencias SQL de las rutas de 003 (crear, abrir, cerrar, editar y borrar noche con `writeNight`; siestas; métricas y valores; listados con rango; stats), extraídas de `backend/src/routes/*` en master
- [X] T009 [US4] Crear `backend/test/compat-previous-004.test.js`: base migrada hasta 004 → ejecutar esas sentencias sin errores; las filas nuevas tienen `user_id = 1`; una segunda noche abierta da `SQLITE_CONSTRAINT_UNIQUE` con el nombre `ux_sleep_one_open` (FR-020, SC-004)
- [X] T010 [US4] Verificar con Docker que la imagen de master (003) arranca y opera sobre una base migrada por 004 (quickstart §2) y anotar el resultado para el PR

**Checkpoint**: el rollback automático sigue siendo seguro.

---

## Phase 4: User Story 2 - Alta y recuperación del propietario (Priority: P1) 🎯 MVP (con US1)

**Goal**: crear la cuenta con `OWNER_SETUP_TOKEN` y recuperarla rotándolo.

**Independent Test**: `setup.test.js`.

- [X] T011 [P] [US2] Tests de `backend/src/auth/password.js` en `backend/test/password.test.js`: hash/verify, formato `scrypt$N$r$p$salt$hash`, parámetros de producción N=2^15, r=8, p=3 cuando `NODE_ENV≠test`, semáforo (10 llamadas simultáneas → nunca más de 1 en curso), `verifyDummy()` tarda lo mismo que un verify real (±50 %)
- [X] T012 [US2] Implementar `backend/src/auth/password.js` (R1): scrypt con `maxmem` 64 MiB, cola de concurrencia 1, hash ficticio al cargar, `timingSafeEqual`; con `NODE_ENV=test`, N=2^10
- [X] T013 [P] [US2] Tests en `backend/test/setup.test.js`: sin contraseña, `status` es `setup` con `nights`; sin token, `setup-unavailable`; `POST /api/auth/setup` con token correcto → 201, cookie y `used_at`; token incorrecto o gastado → 401; contraseña de 11 caracteres → 400 con el mensaje de la frase; 129 → 400; email normalizado; mientras no hay contraseña, `/api/sleep` → 401; `bootstrap()` con otro token borra `password_hash` y todas las sesiones y reabre el alta sin tocar las noches (recuento igual); con el mismo token no cambia nada
- [X] T014 [US2] Implementar `backend/src/auth/bootstrap.js` (R4, transacción) y llamarlo en `backend/src/server.js` antes de `listen()`
- [X] T015 [US2] Implementar en `backend/src/routes/auth.js`: `GET /status` y `POST /setup` (R4), con validaciones de `contracts/openapi-delta.yaml` y registro de fallos en el rate limit

---

## Phase 5: User Story 1 - Entrar con mi cuenta (Priority: P1) 🎯 MVP

**Goal**: sesión de 30 días deslizante; toda la API tras sesión.

**Independent Test**: `auth.test.js` + e2e `acceso.spec.ts`.

- [X] T016 [P] [US1] Tests en `backend/test/auth.test.js`: login correcto → 200 y cookie `sid` con `HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000` (con `X-Forwarded-Proto: https` → `__Host-sid` y `Secure`); credenciales incorrectas → 401 "Email o contraseña incorrectos", igual con email inexistente; la sesión en la base solo guarda `sha256`; `last_seen_at` y `expires_at` se renuevan solo si pasó más de 1 h (reloj inyectable); sesión caducada → 401 y se borra; logout → 204 y la cookie deja de servir
- [X] T017 [US1] Implementar `backend/src/auth/sessions.js` (R2, R3) y `POST /login` + `POST /logout` en `backend/src/routes/auth.js`
- [X] T018 [US1] Implementar `requireAuth` en `backend/src/auth/middleware.js` y montarlo en `backend/src/app.js` para `/api/*` excepto `/api/health`, `/api/auth/*` y `/api/admin/*`; `req.user` = `{ id, email }`
- [X] T019 [US1] Adaptar `backend/test/helpers.js`: `OWNER_SETUP_TOKEN=test-token`, `NODE_ENV=test`, `bootstrap()` + alta una vez por proceso; `api` = `supertest.agent` con la cookie y `Sec-Fetch-Site: same-origin`; `anon` sin sesión. Confirmar que los 103 tests existentes pasan sin cambios de expectativas
- [ ] T021 [P] [US1] Frontend: `core/auth.service.ts` (+ spec) con `status` signal, `login`, `setup`, `logout`; `core/auth.interceptor.ts` que marca `login` ante un 401 de `/api/*` salvo `/api/auth/*`; registrarlo en `app.config.ts` con `withInterceptors`
- [ ] T022 [P] [US1] Frontend: `features/auth/login.component.*` (+ spec) con `autocomplete="username"`/`current-password`, error `role="alert"` con foco, botón deshabilitado mientras envía; y `features/auth/setup.component.*` (+ spec) con código (`autocomplete="off"`, tipo password), email, contraseña (`new-password`, mínimo 12, texto de ayuda "Usa una frase de 3–4 palabras"), "Tus N noches están a salvo" y la pantalla `setup-unavailable` con instrucciones sin datos
- [ ] T023 [US1] Frontend: en `app.ts/app.html/app.css`, compuerta según `status` (setup / no disponible / login / app), conservar la pestaña al volver de "Entrar" (Noche por defecto), y menú "Cuenta" (`<details>`) con email, exportaciones (US5) y "Cerrar sesión"; actualizar `app.spec.ts`
- [ ] T024 [US1] E2E: `e2e/support/server.ts` pasa `OWNER_SETUP_TOKEN`; `e2e/support/fixtures.ts` y `api.ts` hacen el alta o entran por API enviando `Origin` y añaden la cookie al contexto del navegador; la suite existente pasa sin cambios de expectativas
- [ ] T025 [US1] E2E `e2e/tests/acceso.spec.ts`: alta desde la UI en un servidor aislado; entrar y salir; sin sesión no se ven datos; con sesión, "Me voy a dormir" y "Ya desperté" funcionan sin pedir contraseña (FR-006); con una noche abierta y la sesión caducada (borrar la cookie) → tras entrar se ve "Ya desperté" (US1-4)

**Checkpoint**: MVP; la app ya no es pública.

---

## Phase 6: User Story 3 - Defensas (Priority: P1)

**Independent Test**: `security.test.js` + humo de memoria.

- [X] T026 [P] [US3] Tests en `backend/test/security.test.js`: POST/PUT/DELETE con `Origin: https://evil.example` → 403 y nada cambia; sin `Origin` ni `Sec-Fetch-Site` → 403; `Sec-Fetch-Site: cross-site` → 403; `/api/admin/backup` con Bearer y sin cabeceras de origen sigue funcionando; ninguna respuesta tiene `Access-Control-Allow-Origin`; cabeceras CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy` y HSTS solo con `X-Forwarded-Proto: https`; **recorrer todas las rutas registradas en Express** y comprobar 401 sin sesión salvo las excepciones (SC-001)
- [X] T027 [P] [US3] Tests de `backend/src/auth/rate-limit.js` en `backend/test/rate-limit.test.js` (reloj inyectable): 5 fallos por IP (`Fly-Client-IP`) o por email → el 6.º intento es 429 con `Retry-After`, aunque la contraseña sea correcta; pasados 15 min se libera; un acierto limpia el email; límite de 10.000 claves
- [X] T028 [US3] Implementar `backend/src/auth/rate-limit.js` (R5) y aplicarlo en `/login` y `/setup`
- [X] T029 [US3] Implementar `csrf` y `securityHeaders` en `backend/src/auth/middleware.js` (R8, R9), montarlos en `backend/src/app.js` y activar `app.set('trust proxy', 1)`
- [ ] T030 [US3] Crear `scripts/smoke-login-mem.mjs`: construye la imagen, `docker run --memory=256m` con `OWNER_SETUP_TOKEN`, alta, 10 logins concurrentes, pico de `docker stats` < 200 MB y todas las respuestas recibidas (SC-005); además, con `--cpus=1`, mide 5 logins secuenciales y comprueba que cada uno tarda < 1 s (SC-006); ejecutarlo y anotar el resultado

---

## Phase 7: User Story 5 - Exportar mis datos (Priority: P2)

**Independent Test**: `export.test.js`.

- [X] T031 [P] [US5] Crear `backend/test/fixtures/import-export.js` (`importExport(db, json)`) y `backend/test/export.test.js`: el JSON tiene `format`, `version: 1`, `exported_at` y las 4 colecciones; no contiene `password`, `session`, `token` ni `users`; reconstruir una base vacía desde él da recuentos idénticos (SC-007); cada CSV empieza por BOM, tiene cabeceras en español, escapa comas, comillas y saltos de línea (RFC 4180) y tiene tantas filas como registros; tipo desconocido → 404; sin sesión → 401; 10 años en < 5 s
- [X] T032 [US5] Implementar `backend/src/routes/export.js` (R10) y montarlo en `/api`
- [ ] T033 [US5] Frontend: enlaces de exportación en el menú Cuenta (`download`), con test de componente de sus `href`

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T034 [P] `docs/runbooks/recuperar-acceso.md`: generar un código (`openssl rand -hex 32`), `flyctl secrets set OWNER_SETUP_TOKEN=… --app descanso-sleep` (o el panel web), reinicio y alta; efecto (se cierran todas las sesiones)
- [ ] T035 [P] Actualizar `README.md`: autenticación, `OWNER_SETUP_TOKEN` en variables de entorno, rutas `/api/auth/*` y `/api/export*`, 401 por defecto, primer despliegue (configurar el secreto antes de fusionar) y enlace al runbook
- [ ] T036 [P] Marcar DT-17 como resuelta por 004 en `specs/001-linea-base/research.md`
- [ ] T037 Ejecutar quickstart §1–§5 y las puertas de calidad; anotar resultados en el PR. Tras el despliegue (quickstart §6): medir el tiempo de login en producción (SC-006) y ensayar la recuperación con el runbook de T034, cronometrada (< 5 min, SC-008)

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T007)**, que bloquea todo lo demás.
- **US4 (T008–T010)** tras Foundational (solo necesita el esquema).
- **US2 (T011–T015)** y **US1 (T016–T025)** van juntas (MVP): T017 necesita T012; T019 necesita T014, T015, T017 y T018. El frontend (T021–T023) puede empezar en paralelo con el backend de US1.
- **US3 (T026–T030)** tras T018 (necesita la API protegida).
- **US5 (T031–T033)** tras T018.
- **Polish** al final.

## Parallel Example

```text
T006, T008, T011, T013, T016, T026, T027, T031   # tests en archivos distintos
T021, T022                                        # frontend mientras se implementa el backend
```

## Implementation Strategy

1. Foundational + US4: esquema y compatibilidad probados antes de tocar rutas.
2. MVP = US2 + US1: la app deja de ser pública.
3. US3: defensas y humo de memoria.
4. US5: exportación.
5. **Antes de fusionar**, el propietario configura `OWNER_SETUP_TOKEN` en Fly (quickstart §6). Si no
   lo hace, tras el despliegue la app muestra "Falta configurar el código de alta" y los datos
   siguen protegidos (401).
