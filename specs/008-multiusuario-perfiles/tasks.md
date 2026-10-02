# Tasks: Multiusuario con perfiles

**Input**: Design documents from `specs/008-multiusuario-perfiles/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: obligatorios (principio IV). Se escriben antes de implementar y deben fallar primero.

**Organization**: por historia de usuario. `R#` = research.md.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Foundational (bloquea todas las historias)

- [X] T001 Tests de la migración en `backend/test/migrations-005.test.js`: sobre la base legacy migrada hasta 004 (con el propietario dado de alta) → huella de `users` (`id, email, password_hash, role, created_at`) idéntica; `role` admite `'user'` y rechaza otros valores; `display_name` del propietario = parte local de su email; existe `user_settings` del propietario con `sleep_goal_min = 480` y CHECK 240..720; tablas `invites`, `password_resets` y `audit_log` creadas; recuentos de `sessions`, `sleep_records`, `naps`, `metrics` y `metric_entries` intactos (sin cascadas); `foreign_key_check` vacío
- [X] T002 Crear `backend/src/migrations/005_multiusuario.js` (`foreignKeys: false`) según data-model.md: reconstrucción verificada de `users` y nuevas tablas `user_settings` (`sleep_goal_min INTEGER NOT NULL DEFAULT 480 CHECK (sleep_goal_min BETWEEN 240 AND 720)`), `invites`, `password_resets` y `audit_log` (`action CHECK IN ('reset_link_created','password_reset')`) con sus `ON DELETE`
- [X] T003 [P] Test de compatibilidad `backend/test/compat-previous-008.test.js` con `fixtures/legacy-004-statements.js` (sentencias de auth y datos de 004: status, login con `users`, `bootstrap` de 004, sesiones, crear noche/siesta/métrica): funcionan sobre el esquema de 008
- [X] T004 [P] Meta-test `backend/test/schema-isolation.test.js` (R9) con la clasificación de data-model.md
- [X] T005 Crear `backend/src/repo/` (R1): `sleep.js`, `naps.js`, `metrics.js` (incluye `seedDefaults(userId)`), `entries.js`, `stats.js`, `export.js`, con `userId` obligatorio (lanza si falta) y `WHERE user_id = ?` o `JOIN metrics` en todas las consultas; mover a ellos el SQL de `backend/src/routes/{sleep,naps,metrics,stats,export}.js`
- [X] T006 Reescribir esas rutas para usar `repo.*(req.user.id, …)` y responder 404 cuando el repo no encuentra el recurso (incluido el IDOR de `DELETE /metrics/:id/entries/:date`, R2); quitar `require('../db')` de las rutas de datos
- [X] T007 [P] Test estático `backend/test/routes-no-db.test.js`: ningún archivo de `backend/src/routes/` contiene `db.prepare` ni `db.exec`, salvo `auth.js` y `admin.js` (justificados, tablas de identidad y respaldo)
- [X] T008 Ampliar `backend/test/helpers.js`: segundo usuario `other` (`role = 'user'`, con sus métricas sembradas) y su agente `otherApi`; la suite existente sigue pasando sin cambios de expectativas

**Checkpoint**: datos aislados por usuario en el backend; esquema listo.

---

## Phase 2: User Story 2 - Mis datos solo los veo yo (Priority: P1) 🎯 MVP

**Independent Test**: `isolation.test.js`.

- [X] T009 [US2] Crear `backend/test/isolation.test.js` (R10): A (propietario) y B con noche abierta y cerrada, siesta, métrica y valores; recorrer por introspección todas las rutas de `sleep`, `naps`, `metrics`, `stats` y `export`; como B, con ids y fechas de A → 404 o listas sin filas de A; huella de A intacta; `/sleep/open` de cada uno es la suya; A y B pueden tener una noche abierta a la vez; `/stats` y la exportación de B no contienen nada de A (FR-007…FR-009, SC-001)
- [X] T010 [US2] Corregir lo que destape T009 en `repo/` y rutas hasta que pase

---

## Phase 3: User Story 1 - Invitar a alguien (Priority: P1) 🎯 MVP

**Independent Test**: `invites.test.js` + e2e.

- [X] T011 [P] [US1] Tests `backend/test/invites.test.js`: solo el propietario crea, lista y revoca (otro usuario → 403); token solo como huella; registro con invitación válida → 201, sesión, `role = 'user'`, `consent_version`/`consent_at`, 3 métricas propias y `user_settings`; sin `accept_policy` o con `policy_version` distinta → 400; invitación usada, revocada, caducada (reloj inyectable, 72 h) o inventada → 403 sin crear nada; email existente (NOCASE) → 409 sin gastar la invitación; dos registros simultáneos con el mismo token → uno 201 y otro 403; con sesión abierta → 409; los fallos cuentan para el rate limit
- [X] T012 [US1] Implementar `backend/src/auth/tokens.js` (crear token y huella, canje atómico), `backend/src/policy.js` (`POLICY_VERSION = '2026-10-01'`), `repo/users.js` e `repo/invites.js`
- [X] T013 [US1] Implementar `backend/src/routes/people.js` (`GET /people`, `GET/POST /people/invites`, `DELETE /people/invites/:id`) con `requireOwner` en `auth/middleware.js`, y `POST /api/auth/register` en `routes/auth.js`; `status` y `login` devuelven `role` y `display_name`
- [X] T014 [P] [US1] Frontend: `core/link-tokens.ts` (lee y borra `#invitacion=` / `#restablecer=`), `core/privacy.ts` (texto de la política + `POLICY_VERSION` igual al backend; test que compara ambas constantes leyendo `backend/src/policy.js`), `features/account/register.component.*` (+ spec: texto de transparencia, casilla de aceptación obligatoria, errores 403/409 en `role="alert"`)
- [X] T015 [US1] Frontend: `features/account/people.component.*` (+ spec): lista de personas, "Invitar a alguien" con enlace copiable (`/#invitacion=…`), estado de las invitaciones y revocar; visible solo para el propietario en el menú Cuenta

---

## Phase 4: User Story 3 - Mi perfil (Priority: P1)

**Independent Test**: `me.test.js`.

- [X] T016 [P] [US3] Tests `backend/test/me.test.js`: `GET /me`; `PUT /me` con nombre 0/61 caracteres → 400, zona `Mars/Base` → 400, `Europe/Madrid` y `UTC` → 200, objetivo 239/721 → 400 y 450 → 200 (en `user_settings`); `PUT /me/email` sin la contraseña correcta → 401 y con email de otro → 409 sin revelar de quién; `PUT /me/password` cierra las demás sesiones del usuario pero no la actual ni las de otros; los fallos de contraseña cuentan en el rate limit
- [X] T017 [US3] Implementar `backend/src/routes/me.js` (`GET/PUT /me`, `PUT /me/email`, `PUT /me/password`) con `repo/users.js` (R6)
- [X] T018 [US3] Frontend: `core/account.service.ts` + `features/account/profile.component.*` (+ spec): nombre, email (pide contraseña), zona propuesta con `Intl` si no hay, objetivo en horas y minutos, cambio de contraseña; el nombre visible se muestra en el menú Cuenta

---

## Phase 5: User Story 4 - Recuperar mi contraseña (Priority: P2)

**Independent Test**: `reset.test.js`.

- [X] T019 [P] [US4] Tests `backend/test/reset.test.js`: solo el propietario genera enlaces y solo para `role = 'user'` (para el propietario → 404); generar uno nuevo invalida el anterior; enlace de 30 min (reloj inyectable); `POST /auth/reset` válido → 204, contraseña nueva, **todas** las sesiones de la persona cerradas, `reset_notice_at` fijado y `audit_log` con `reset_link_created` y `password_reset`; inválido, usado o caducado → 403 con el mismo mensaje; `login` devuelve `reset_notice_at` hasta el `ack`; `GET /me/activity` lista acciones con el nombre del actor; `bootstrap()` con un token nuevo solo cierra sesiones y borra la contraseña del propietario (FR-018)
- [X] T020 [US4] Implementar `POST /people/:id/reset-link`, `POST /auth/reset`, `GET /me/activity`, `POST /me/reset-notice/ack` (`repo/audit.js`) y ajustar `auth/bootstrap.js` a `WHERE user_id = 1` / `WHERE id = 1`
- [X] T021 [US4] Frontend: `forgot.component` (mensaje fijo), `reset-password.component` (desde `#restablecer=`), botón "Enlace de recuperación" en Personas, aviso "Tu contraseña fue restablecida el …" (`role="status"`, descartable) y "Actividad de la cuenta" en el perfil (+ specs)

---

## Phase 6: User Story 5 - Exportar y borrar mi cuenta (Priority: P2)

**Independent Test**: `delete-account.test.js`.

- [X] T022 [P] [US5] Tests `backend/test/delete-account.test.js`: `DELETE /me` sin la contraseña correcta → 401; como B con la contraseña → 204 y 0 filas con `user_id = B` en **todas** las tablas con `user_id` (generadas desde `sqlite_master`), sus `metric_entries` e `invites.used_by` incluidos; recuentos de A idénticos; la cookie de B deja de servir; el propietario con otros usuarios → 409; el propietario solo → 204 y el alta queda pendiente de un código nuevo; la exportación de B solo contiene lo suyo (FR-019)
- [X] T023 [US5] Implementar `DELETE /me` en `routes/me.js` (R8)
- [X] T024 [US5] Frontend: "Borrar mi cuenta" en el perfil con explicación del plazo de 14 días de los respaldos, la contraseña y una confirmación; el mensaje del 409 del propietario (+ spec)

---

## Phase 7: User Story 6 - Consentimiento y transparencia (Priority: P2)

- [X] T025 [US6] Frontend: `features/account/privacy.component` con el texto de `core/privacy.ts` (qué se guarda, para qué, acceso técnico del operador, exportar y borrar, 14 días de retención), enlazado desde el registro y desde el menú Cuenta (+ spec)

---

## Phase 8: User Story 7 - Respaldos cifrados (Priority: P2)

- [ ] T026 [US7] `.github/workflows/backup.yml`: instalar `age`; tras `integrity_check`, cifrar con `BACKUP_AGE_RECIPIENT` (falla si falta, antes de subir); subir `descanso/<TS>.db.age`; la poda incluye `*.db.age`
- [ ] T027 [P] [US7] `docs/runbooks/restaurar-respaldo.md`: crear el par de claves (`age-keygen`), guardar la privada, `gh secret set BACKUP_AGE_RECIPIENT`, descifrar con `age -d -i …`, `integrity_check` e instalar `age` en Windows, macOS y Linux
- [ ] T028 [US7] Ensayo local del cifrado y descifrado con `age` sobre una base de prueba (`integrity_check` ok tras descifrar); anotarlo en el runbook

---

## Phase 9: Polish & Cross-Cutting

- [ ] T029 [P] E2E: fixture `secondUser` en `e2e/support/fixtures.ts` (el propietario invita por API y registra a B en contextos propios); `e2e/tests/multiusuario.spec.ts` (dos navegadores: A registra una noche y B no la ve; B pide un id de A por API → 404; invitación por la UI de punta a punta); `e2e/tests/cuenta.spec.ts` (perfil, recuperación por enlace con aviso, borrar cuenta)
- [ ] T030 [P] Runbooks y guía: en `rollback-migracion.md` y `guia-migraciones.md`, prohibir el rollback manual por debajo de 008 con otros usuarios y explicar la alternativa (FR-024); anotar la contracción pendiente de `DEFAULT 1`
- [ ] T031 [P] `README.md`: multiusuario, invitaciones, perfil, recuperación, borrado y `BACKUP_AGE_RECIPIENT`
- [ ] T032 Puertas de calidad, compatibilidad en Docker con la imagen de master (004) sobre una base migrada por 008 (quickstart §2), y verificación manual de quickstart §3–§5, cronometrando la invitación hasta la primera noche (< 3 min, SC-003) y la recuperación de un usuario (< 5 min, SC-006); en producción, cuando exista el bucket, comprobar que el objeto subido es `.db.age` y no se abre como SQLite (SC-005); anotar resultados en el PR

---

## Dependencies & Execution Order

- **Foundational (T001–T008)** bloquea todo. T002 → T003. T005 → T006 → T007/T008.
- **US2 (T009–T010)** tras Foundational: es el MVP de seguridad.
- **US1 (T011–T015)** tras US2. El frontend (T014, T015) puede ir en paralelo al backend (T012, T013).
- **US3 (T016–T018)**, **US4 (T019–T021)** y **US5 (T022–T024)** tras US1 (necesitan un segundo usuario real).
- **US6 (T025)** junto a T014. **US7 (T026–T028)** es independiente del código de la app.
- **Polish** al final.

## Parallel Example

```text
T003, T004, T007                 # tests independientes de Foundational
T011, T016, T019, T022           # tests de historias en archivos distintos
T026–T028                        # respaldos, en paralelo a todo lo demás
```

## Implementation Strategy

1. **Foundational + US2**: aislar los datos antes de permitir más usuarios.
2. **US1**: abrir la puerta (invitaciones) solo cuando el aislamiento está probado.
3. **US3 → US4 → US5**: perfil, recuperación y borrado.
4. **US6 y US7** en paralelo.
5. Primer despliegue: solo existe el propietario hasta que invite a alguien, así que el rollback
   automático es seguro. Tras invitar, aplica FR-024.
