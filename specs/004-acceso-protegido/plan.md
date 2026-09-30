# Implementation Plan: Acceso protegido y portabilidad (multiusuario, paso 1)

**Branch**: `004-acceso-protegido` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-acceso-protegido/spec.md`

## Summary

La feature cierra DT-17: toda la API pasa a exigir sesión. El propietario entra con email y
contraseña, con hash `crypto.scrypt` en serie y hash ficticio para emails inexistentes. La sesión
va en una cookie `__Host-sid` deslizante de 30 días y en la base solo se guarda su huella.

- **Alta y recuperación sin terminal**: con el secreto `OWNER_SETUP_TOKEN`. Si cambia al arrancar,
  se reabre el alta y se invalidan la contraseña y las sesiones.
- **Defensas**: CSRF por `Sec-Fetch-Site`/`Origin`, sin CORS, rate limit en memoria por IP y por
  email, y cabeceras de seguridad (CSP compatible con el build de Angular).
- **Datos del propietario**: dos migraciones.
  - `003`: usuarios, sesiones y estado del alta.
  - `004`: `user_id NOT NULL DEFAULT 1` con FK en `sleep_records`, `naps` y `metrics`. Se hace por
    reconstrucción verificada, que la constitución v1.0.1 permite, con una extensión del runner:
    `foreignKeys: false`.
- **Exportación**: en JSON versionado y en 4 CSV.

## Technical Context

**Language/Version**: Node.js 22 LTS (backend); TypeScript con Angular 20 (frontend)

**Primary Dependencies**: Express 5, better-sqlite3 13, `node:crypto`. **Se elimina `cors`.**
Sin dependencias nuevas.

**Storage**: SQLite (`DB_PATH`), con las migraciones 003 y 004 aplicadas por el runner de la feature 003.

**Testing**: `node --test` + supertest (agente autenticado en `helpers.js`); Karma/Jasmine;
Playwright con fixture de sesión; humo Docker `--memory=256m`.

**Target Platform**: Fly.io (shared-cpu-1x, 256 MB, TLS terminado por Fly); desarrollo en Windows.

**Project Type**: aplicación web (un único servicio Express que sirve la API y Angular).

**Performance Goals**: login < 1 s (SC-006); pico de memoria < 200 MB con 10 logins concurrentes
(SC-005); exportación de 10 años < 5 s.

**Constraints**:
- La versión 003 debe funcionar sobre el esquema nuevo.
- Sin credenciales en el repositorio ni en URLs.
- La CSP no puede romper el build de Angular (se desactiva `inlineCritical`).

**Scale/Scope**: 1 usuario (propietario); 2 migraciones; unas 8 rutas nuevas; 3 componentes nuevos.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Cumplimiento | Estado |
|-----------|--------------|--------|
| I. Stack fijo | `crypto.scrypt`, cookies y cabeceras a mano; se quita `cors`; ningún paquete nuevo (ni helmet ni express-session). | ✅ |
| II. Persistencia segura (v1.0.1) | Migraciones por el runner con respaldo previo. La reconstrucción de 3 tablas verifica recuento y huella antes de sustituir, dentro de la misma migración atómica, con `foreign_key_check`. **Sin cascadas accidentales**: FK desactivadas solo durante la migración. | ✅ |
| III. Reglas de tiempo | `created_at`, `last_seen_at`, `expires_at` y `used_at` en ISO 8601 UTC. La fecha de la noche no cambia. | ✅ |
| IV. Calidad | Contrato de auth (401, 429, cookie, CSRF, logout), migración con fixture legacy, compatibilidad con 003, exportación y reconstrucción, componentes de login/alta, e2e con sesión y humo de memoria. | ✅ |
| V. Un solo servicio | Todo dentro del mismo proceso. `OWNER_SETUP_TOKEN` es un secreto de Fly, nunca en el repo. `/api/health` sigue público. | ✅ |
| VI. Simplicidad | Rate limit en memoria; sin filtrado por usuario hasta 008 (R7); sin router en Angular. | ✅ |
| VII. UX en español | Pantallas de entrada y alta en español, con `autocomplete` correcto, errores `role="alert"` y menú de cuenta accesible por teclado. | ✅ |

**Re-check post-diseño**: sin violaciones. La extensión del runner (`foreignKeys: false`) se
documenta como ampliación del contrato de 003, no como excepción.

## Project Structure

### Documentation (this feature)

```text
specs/004-acceso-protegido/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/openapi-delta.yaml
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── migrate.js                        # + opción foreignKeys: false (R6)
│   ├── migrations/
│   │   ├── 003_usuarios_y_sesiones.sql   # NUEVO: users, sessions, auth_setup
│   │   └── 004_user_id_en_datos.js       # NUEVO: reconstrucción verificada (foreignKeys: false)
│   ├── auth/
│   │   ├── password.js                   # NUEVO: scrypt, semáforo, hash ficticio (R1)
│   │   ├── sessions.js                   # NUEVO: crear, validar/renovar, borrar; cookie (R2, R3)
│   │   ├── bootstrap.js                  # NUEVO: rotación de OWNER_SETUP_TOKEN al arrancar (R4)
│   │   ├── rate-limit.js                 # NUEVO (R5)
│   │   └── middleware.js                 # NUEVO: requireAuth, csrf, securityHeaders (R8, R9)
│   ├── routes/
│   │   ├── auth.js                       # NUEVO: status, setup, login, logout
│   │   └── export.js                     # NUEVO: JSON y CSV (R10)
│   ├── app.js                            # sin cors; cabeceras, csrf, auth, requireAuth en /api
│   └── server.js                         # bootstrap() antes de listen
└── test/
    ├── helpers.js                        # agente autenticado + anon
    ├── fixtures/import-export.js         # NUEVO: reconstruye una base desde el JSON
    ├── auth.test.js                      # NUEVO: contrato de autenticación
    ├── setup.test.js                     # NUEVO: alta y rotación
    ├── security.test.js                  # NUEVO: CSRF, CORS, cabeceras, 401 en todas las rutas
    ├── migrations-004.test.js            # NUEVO: reconstrucción verificada y FK
    ├── compat-previous-004.test.js       # NUEVO: código de 003 sobre el esquema de 004
    └── export.test.js                    # NUEVO

frontend/src/app/
├── core/auth.service.ts (+ .spec)        # NUEVO
├── core/auth.interceptor.ts              # NUEVO
├── features/auth/login.component.*       # NUEVO
├── features/auth/setup.component.*       # NUEVO
├── app.ts / app.html / app.css           # compuerta de acceso + menú Cuenta
└── app.config.ts                         # withInterceptors
frontend/angular.json                     # inlineCritical: false (R9)

e2e/support/{server,fixtures,api}.ts      # token de alta, sesión compartida, Origin
e2e/tests/acceso.spec.ts                  # NUEVO
scripts/smoke-login-mem.mjs               # NUEVO: humo de memoria con Docker
docs/runbooks/recuperar-acceso.md         # NUEVO: rotar OWNER_SETUP_TOKEN
```

**Structure Decision**: se mantiene la estructura web. La autenticación va en `backend/src/auth/`
(módulos pequeños y probables por separado). Sin capa `repo/` (llega con 008).

## Complexity Tracking

Sin violaciones de la constitución que justificar.
