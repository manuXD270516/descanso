# Tasks: Tendencias y sueño pendiente (dashboard)

**Input**: Design documents from `specs/005-tendencias-sueno/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: obligatorios (principio IV). Se escriben antes de implementar.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Foundational (bloquea las historias)

- [X] T001 Tests `backend/test/migrations-006-007.test.js`: sobre la base legacy migrada hasta 005 con un segundo usuario y datos → tras 006, recuento y huella de todas las columnas idénticos en `sleep_records`, `naps` y `metrics`, `metric_entries` intacta, `foreign_key_check` vacío, `INSERT` sin `user_id` → error NOT NULL, `ux_sleep_one_open` nombra el índice en su error y conserva `sqlite_sequence`; tras 007, filas con 480 → 420 y `goal_customized = 0`, filas con otro valor conservadas y `goal_customized = 1`, `DEFAULT 420`, `onboarded_at` NULL
- [X] T002 Crear `backend/src/migrations/006_contraer_user_id.js` (`foreignKeys: false`, copia verificada como en `004_user_id_en_datos.js`, sin `DEFAULT 1`) y `backend/src/migrations/007_objetivo_y_bienvenida.js` (reconstrucción de `user_settings` según data-model.md)
- [X] T003 [P] Compatibilidad `backend/test/compat-previous-005.test.js` con `fixtures/legacy-008-statements.js` (sentencias de `repo/` y `auth` de 008: crear noche/siesta/métrica con `user_id`, `createUser` con `user_settings(user_id, updated_at)`, `updateProfile` de objetivo, borrar cuenta): funcionan sobre el esquema de 005
- [X] T004 Ajustar `repo/users.js`: `updateProfile` con objetivo → `goal_customized = 1`; `profile()` devuelve `goal_customized` y `onboarded_at`; `createUser` toma el nuevo DEFAULT 420

---

## Phase 2: User Story 1 + 2 - Objetivo y sueño pendiente (Priority: P1) 🎯 MVP

**Independent Test**: `analytics.test.js` + `dashboard.test.js` + e2e.

- [X] T005 [P] [US1] Tests `backend/test/analytics.test.js` (puras, con fixtures): `buildDays` con noche + 2 siestas → suma; 2 noches con la misma fecha → suma; día sin registro → `none` y `total_min = null`; noche abierta → `in_progress`; `summary` ignora `none`/`in_progress` en la media y en "X de Y"; `pending` neto (déficit, compensación, sin días → `null`) contando solo días registrados de los últimos 14
- [X] T006 [US1] Implementar `backend/src/analytics.js` (`buildDays`, `summary`, `pending`) (R1)
- [X] T007 [P] [US1] Tests `backend/test/dashboard.test.js`: `GET /api/dashboard?days=30&to=…` → forma de `contracts/openapi-delta.yaml`; `days` ∉ {7,30,90} → 400; `to` inválido o posterior a hoy+1 → 400; sin sesión → 401; 90 días con datos responde en < 300 ms (SC-001); `PUT /api/me` con objetivo 239/721 → 400 y 450 → `goal_customized = 1`
- [X] T008 [US1] Implementar `backend/src/repo/dashboard.js` (noches del rango incluida la abierta y siestas, por usuario) y `backend/src/routes/dashboard.js`; montar en `app.js`
- [X] T009 [US1] Añadir `/api/dashboard` a `backend/test/isolation.test.js`: el dashboard de B no refleja nada de A (días, resumen, pendiente, regularidad)
- [X] T010 [P] [US1] Frontend: `core/dashboard.service.ts`, `shared/charts/daily-bars.component.ts` (SVG con banda del objetivo, `none` y `in_progress` diferenciados sin rojo ni verde, `role="img"`, título y descripción) y `shared/charts/chart-table.component.ts` ("Ver como tabla"), con specs
- [X] T011 [US1] Frontend: `features/trends/trends.component.*` (3 indicadores, selector 7/30/90, gráfico, textos de pendiente según signo y "Aún no hay datos…") y pestaña "Tendencias" en `app.ts/app.html`, con specs

---

## Phase 3: User Story 4 - Objetivo adaptado a los ciclos (Priority: P2)

- [X] T012 [P] [US4] Tests en `analytics.test.js`: `cycles(420)` → `equivalent 4.7` y atajos (4 → 360, 5 → 450, 6 → 540); `cycles(240)` y `cycles(720)` dentro de rango; atajos siempre en 240..720
- [X] T013 [US4] Implementar `cycles()` y devolver `cycle_min` y `cycles` en el dashboard
- [X] T014 [US4] Frontend: `features/trends/goal-editor.component.ts` (equivalencia en ciclos, atajos, campo libre en h y min, nota de aproximación y error 400), usado desde Tendencias; en el perfil, los mismos atajos (+ specs)

---

## Phase 4: User Story 3 - Regularidad (Priority: P2)

- [X] T015 [P] [US3] Tests en `analytics.test.js`: < 7 noches → `null`; 23:30 y 00:30 → media 0 y dispersión pequeña (SC-003); dispersión conocida (±40 min) con un fixture; media en 0..1439
- [X] T016 [US3] Implementar `regularity()` (media y desviación circular) y su sección plegable en Tendencias (+ spec)

---

## Phase 5: User Story 5 - Bienvenida (Priority: P2)

- [X] T017 [P] [US5] Tests: `POST /api/me/onboarding` con y sin objetivo → `onboarded_at` fijado, objetivo y `goal_customized`; 400 fuera de rango; `status` y `login` devuelven `onboarded`; es por usuario
- [X] T018 [US5] Implementar la ruta y `onboarded` en `routes/auth.js`
- [X] T019 [US5] Frontend: `features/onboarding/welcome.component.ts` (pregunta, atajos de ciclos, campo libre y "Saltar") mostrado tras entrar si `!onboarded`; `AuthService.onboarded` (+ spec)

---

## Phase 6: User Story 6 - Gráficos accesibles (Priority: P2)

- [X] T020 [US6] Cinta de 14 noches (`features/night`): descripción en frases (`aria-describedby`) y "Ver como tabla" con `chart-table` (+ spec)
- [X] T021 [US6] `frontend/src/styles.css`: `--ink-faint: #9297b7` (R6)
- [X] T022 [US6] E2E `e2e/tests/tendencias.spec.ts`: con datos sembrados (huecos, siestas, noche abierta) se ven los indicadores correctos, "sin dato" y "en curso"; cambio de periodo; editar objetivo con un atajo; cada `svg[role=img]` tiene nombre y descripción y una tabla alternativa con las mismas filas (también la cinta, SC-004); contraste WCAG de `.faint` ≥ 4,5 calculado con colores computados (SC-005); bienvenida en la primera entrada; sin colores rojo o verde en el dashboard

---

## Phase 7: Polish

- [X] T023 [P] `README.md`: pestaña Tendencias, `GET /api/dashboard`, objetivo de 7 h con ciclos y bienvenida; `docs/sdd/guia-migraciones.md`: contracción de `user_id` hecha (quitar el aviso "pendiente")
- [X] T024 [P] Registrar en `specs/001-linea-base/research.md` que DT-23 queda resuelta en el dashboard (no en `/api/stats`)
- [X] T025 Puertas de calidad, compatibilidad en Docker con la imagen de master (008) sobre una base migrada por 005, y verificación manual de quickstart §3; anotar en el PR

---

## Dependencies & Execution Order

- Foundational (T001–T004) → resto.
- US1 + US2 (T005–T011): MVP. T006 → T008; T010 → T011.
- US4 (T012–T014), US3 (T015–T016) y US5 (T017–T019) tras T008. US6 (T020–T022) tras T011.
- Polish al final.

## Implementation Strategy

1. Migraciones y compatibilidad primero (incluida la contracción pendiente).
2. MVP: dashboard con objetivo y pendiente.
3. Ciclos, regularidad y bienvenida.
4. Accesibilidad y e2e.
