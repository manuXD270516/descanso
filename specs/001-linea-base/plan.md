# Implementation Plan: Línea base del tracker de descanso

**Branch**: `001-linea-base` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-linea-base/spec.md`

## Summary

Especificar el MVP existente de "Descanso" y cubrirlo con pruebas automatizadas, sin reescribir
la app. El código actual es la implementación de referencia.

Los cambios de producto se limitan a los dos que salieron de la clarificación:

- el servicio rechaza una segunda noche abierta (409), y
- se corrige el texto "despertí" → "desperté".

El resto son ajustes de testabilidad y calidad:

- separar `app.js` de `server.js`;
- extraer `nightDate()` en `core/time.ts`;
- configurar el lint (hoy inexistente);
- añadir suites de pruebas con `node:test` + `supertest` en backend y TestBed en frontend.

La deuda técnica detectada queda registrada en [research.md](./research.md) y no se corrige.

## Technical Context

**Language/Version**: JavaScript (CommonJS) sobre Node.js 22 LTS en backend; TypeScript 5.9 en
frontend.

**Primary Dependencies**: Express 5, better-sqlite3, cors; Angular 20 (standalone + signals),
RxJS 7.8.

**Storage**: SQLite en un único archivo (`DB_PATH`, WAL). Sin cambios de esquema.

**Testing**:
- Backend: `node:test` + `supertest` (nueva dependencia de desarrollo).
- Frontend: Jasmine + Karma con Angular TestBed y `HttpTestingController` (ya instalados).

**Target Platform**: contenedor Linux (node:22-alpine) y navegadores modernos de escritorio y
móvil.

**Project Type**: aplicación web (API REST + SPA), desplegada como un solo servicio.

**Performance Goals**: uso personal. Las respuestas deben sentirse instantáneas (SC-001:
iniciar o cerrar la noche en menos de 5 s); no hay objetivos de rendimiento.

**Constraints**: sin cambiar el comportamiento visible salvo FR-003 y la corrección de textos
(SC-007); sin cambios de esquema; sin librerías nuevas de runtime.

**Scale/Scope**: 1 persona usuaria; del orden de cientos de filas por año; 3 pestañas; 19
operaciones de API.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principio | Evaluación | Estado |
|---|-----------|------------|--------|
| I | Stack fijo | Se mantiene Node 22 + Express 5 + better-sqlite3 y Angular 20 standalone + signals. Solo se añaden dependencias de desarrollo (`supertest`, ESLint / angular-eslint): no son ORM, estado ni UI. | ✅ |
| II | Persistencia segura | Sin cambios de esquema. FR-003 se aplica en el servicio, no con un índice (evita una migración). La falta de un mecanismo de migraciones queda como DT-01. | ✅ |
| III | Reglas de tiempo | Se añade `nightDate()` con ≥ 3 tests explícitos, y tests de duración y media circular en el backend. | ✅ |
| IV | Calidad | Esta feature crea las suites de pruebas y el lint que faltan, y un workflow de CI mínimo (lint + tests + build en cada PR). La feature 002 lo amplía con caché, imagen y despliegue. | ✅ |
| V | Despliegue | Sin cambios: un solo servicio, `/api/health`, volumen `/data`, sin secretos. La falta de `HEALTHCHECK` en el Dockerfile queda como DT-15 (002). | ✅ |
| VI | Simplicidad | Solo se toca lo necesario para probar: `app.js`, `nightDate()`, el guard de FR-003 y el texto. Nada en Complexity Tracking. | ✅ |
| VII | UX | Interfaz en español; ya hay estilos de foco visible y de `prefers-reduced-motion` en `styles.css`. Se corrige la errata. | ✅ |

**Post-design re-check (Phase 1)**: sin cambios. El contrato, el modelo de datos y el quickstart
no introducen violaciones. ✅

## Project Structure

### Documentation (this feature)

```text
specs/001-linea-base/
├── plan.md              # Este archivo
├── research.md          # Decisiones + inventario de deuda técnica
├── data-model.md        # Modelo extraído de db.js
├── quickstart.md        # Guía de validación
├── contracts/
│   └── openapi.yaml     # Contrato de la API
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

`[nuevo]` = archivo nuevo; `[mod]` = archivo modificado; `[sin cambios]` = se deja igual.

```text
backend/
├── package.json                 [mod]  scripts test/lint, devDeps supertest + eslint
├── eslint.config.js             [nuevo]
├── src/
│   ├── app.js                   [nuevo]  construcción de la app Express (exporta app)
│   ├── server.js                [mod]    solo listen()
│   ├── db.js                    [sin cambios]
│   ├── util.js                  [sin cambios]
│   └── routes/
│       ├── sleep.js             [mod]    guard de noche abierta única (409)
│       ├── naps.js · metrics.js · stats.js   [sin cambios]
└── test/
    ├── helpers.js               [nuevo]  DB_PATH=:memory:, request(app)
    ├── util.test.js             [nuevo]  isIso, isDate, durationMinutes
    ├── health.test.js           [nuevo]
    ├── sleep-night.test.js      [nuevo]  US1 + FR-003
    ├── sleep-history.test.js    [nuevo]  US2
    ├── naps.test.js             [nuevo]  US3
    ├── stats.test.js            [nuevo]  US4 (medias, media circular, noches abiertas)
    ├── metrics.test.js          [nuevo]  US5 (datos iniciales, validación, orden, archivado)
    ├── metric-entries.test.js   [nuevo]  US5 (upsert, rangos, cascada)
    └── persistence.test.js      [nuevo]  US6 (archivo temporal, reapertura)

frontend/
├── package.json                 [mod]  script lint, devDeps angular-eslint
├── eslint.config.js             [nuevo]  (generado por ng add @angular-eslint/schematics)
├── angular.json                 [mod]  target lint
└── src/app/
    ├── core/
    │   ├── time.ts              [mod]  + nightDate(iso)
    │   └── time.spec.ts         [nuevo]
    ├── features/night/
    │   ├── night.component.ts   [mod]  usa nightDate()
    │   ├── night.component.html [mod]  "Ya desperté", "Desperté"
    │   └── night.component.spec.ts   [nuevo]
    ├── features/naps/
    │   ├── naps.component.ts    [mod]  usa nightDate()
    │   └── naps.component.spec.ts    [nuevo]
    ├── features/metrics/
    │   └── metrics.component.spec.ts [nuevo]
    └── app.spec.ts              [nuevo]  pestañas

README.md                        [mod]  "Ya desperté"; comandos de test y lint
.github/workflows/ci.yml         [nuevo]  job único: lint + tests + build (principio IV)
```

**Structure Decision**: aplicación web ya existente (`backend/` + `frontend/`). Las pruebas
de backend van en `backend/test/`, fuera de `src/`, para que el runtime no las cargue. Las de
frontend van junto a cada archivo (`*.spec.ts`), que es la convención de Angular y la que
espera `tsconfig.spec.json`.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
