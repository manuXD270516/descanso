# Implementation Plan: Pipeline de construcción y despliegue continuo

**Branch**: `002-pipeline-ci-cd` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-pipeline-ci-cd/spec.md`

## Summary

> **Enmienda 2026-09-29**: el despliegue pasa de Render a **Fly.io** (pago por uso, app
> `descanso-sleep`, región `gru`), ver research R13. Las referencias a Render de abajo quedan
> sustituidas por `fly.toml` y `flyctl deploy --image` con rollback desde el pipeline.

Ampliar el CI mínimo de la 001 hasta un pipeline completo en GitHub Actions:

- **Validación de PR**: el job `quality` pasa a ser un check requerido. Para eso el repositorio
  se hace público y se protege `master`. Además, el job usa caché de npm.
- **Despliegue en cada merge**:
  - se publica la imagen en GHCR con las etiquetas `:<sha>` y `:latest`;
  - se despliega en Fly.io (pago por uso, volumen persistente, máquina que se apaga sin
    tráfico) con `flyctl deploy --image`, con rollback automático si falla;
  - el despliegue se verifica: el estado debe llegar a `live` y `/api/health` debe devolver
    `version == sha` en ≤ 60 s.
- **Respaldo diario**:
  - un workflow programado descarga una copia consistente desde un endpoint protegido con token;
  - comprueba su integridad, la sube a un bucket compatible con S3 y poda las de más de 14 días.
- **Restauración**: runbook probado en local.
- **Entorno local**: `docker compose up --build`.
- **Visibilidad**: badge en el README y versión en el pie de página.

En el código de la app solo cambian `/api/health` (se añade `version`), el nuevo
`/api/admin/backup` y el pie de página.

## Technical Context

**Language/Version**: Node.js 22 LTS (backend, CommonJS), TypeScript 5.9 / Angular 20
(frontend), YAML (GitHub Actions, Compose), TOML (`fly.toml`), Bash (pasos de workflow).

**Primary Dependencies**:
- Actions: `actions/checkout@v4`, `actions/setup-node@v4`, `docker/setup-buildx-action@v3`,
  `docker/login-action@v3`, `docker/metadata-action@v5`, `docker/build-push-action@v6`.
- En el runner: `aws` CLI y `sqlite3` (preinstalados en `ubuntu-latest`).
- Sin dependencias nuevas en la app.

**Storage**: SQLite en el volumen persistente de Fly.io (`/data/sleep.db`). Respaldos en un bucket
privado compatible con S3. Sin cambios de esquema.

**Testing**:
- Backend: `node:test` + `supertest` para `version` en health y para `/api/admin/backup`
  (404 sin token configurado; 401 sin token o con uno inválido; 200 con un SQLite válido que
  contiene los datos).
- Frontend: TestBed del pie de página.
- Pipeline: se valida ejecutándolo (quickstart §3–5).

**Target Platform**: GitHub Actions (`ubuntu-latest`); Fly.io (máquina con la imagen de GHCR,
Linux, node:22-alpine); Docker Compose en local.

**Project Type**: aplicación web ya existente (API + SPA en un solo servicio) más la
infraestructura de CI/CD.

**Performance Goals**:
- CI de PR < 5 min (hoy ~1 min, medido).
- Despliegue sano ≤ 60 s después de estar `live`.
- Restauración < 15 min.

**Constraints**:
- Principio V: un solo servicio, healthcheck en `/api/health`, volumen persistente, ningún
  secreto en el repositorio.
- Plan gratuito de GitHub, de ahí el repositorio público.
- Con una sola máquina y un volumen no hay despliegue sin corte (se acepta). La primera
  petición tras un periodo sin uso tarda unos segundos en responder (arranque en frío).

**Scale/Scope**: 1 persona usuaria; base de pocos MB; 1 respaldo al día, 14 retenidos; 3
workflows.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principio | Evaluación | Estado |
|---|-----------|------------|--------|
| I | Stack fijo | Ninguna dependencia nueva en backend ni frontend. El respaldo usa `db.backup()` de better-sqlite3 (ya instalado) y `crypto` nativo. Las herramientas nuevas (Actions, `aws` CLI, Compose) son de infraestructura, no de la app. | ✅ |
| II | Persistencia segura | Sin cambios de esquema. Disco persistente en `/data`. El respaldo es de solo lectura (API de backup online). La restauración usa la API de backup de SQLite, nunca un DROP. | ✅ |
| III | Tiempo | Sin cambios en las reglas de tiempo. El timestamp de los respaldos va en UTC ISO. | ✅ |
| IV | Calidad | Tests para `version` y para `/api/admin/backup` (backend) y para el pie de página (frontend). Lint. El build de producción en CI pasa a ser **bloqueante** gracias a la protección de rama. | ✅ |
| V | Despliegue | Un solo servicio; imagen multi-stage (optimizada); healthcheck en `/api/health` (checks de `fly.toml` + `HEALTHCHECK` en Docker); volumen persistente; secretos solo en GitHub y Fly. Cumple lo que la 001 dejó pendiente (DT-15, DT-16). | ✅ |
| VI | Simplicidad | Ver Complexity Tracking (el endpoint de administración). Se reutiliza `/api/health` para la versión en lugar de crear un endpoint nuevo. | ✅ (justificado) |
| VII | UX | El pie de página respeta el estilo existente, con texto discreto y contraste suficiente. | ✅ |

**Post-design re-check (Phase 1)**: sin violaciones nuevas. ✅

## Project Structure

### Documentation (this feature)

```text
specs/002-pipeline-ci-cd/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi-delta.yaml   # /api/health (+version), /api/admin/backup
│   └── pipeline.md          # workflows, disparadores, secretos
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

`[nuevo]` = archivo nuevo; `[mod]` = archivo modificado.

```text
.github/workflows/
├── ci.yml                  [mod]    pull_request + workflow_call; caché de npm
├── deploy.yml              [nuevo]  quality → publish (GHCR) → deploy (Fly.io + verificación + rollback)
└── backup.yml              [nuevo]  schedule + dispatch: descargar → integridad → subir → podar
.dockerignore               [nuevo]
Dockerfile                  [mod]    etapa de deps con caché; sin toolchain en runtime;
                                     APP_VERSION; HEALTHCHECK
compose.yaml                [nuevo]  entorno local en un comando
fly.toml                    [nuevo]  imagen GHCR, volumen /data, auto-stop, checks, 256 MB
render.yaml                 [borrado] sustituido por fly.toml (research R13)
                                     BACKUP_TOKEN
README.md                   [mod]    badge; entorno local; despliegue; respaldos
docs/runbooks/
└── restaurar-respaldo.md   [nuevo]  local (probada) + producción

backend/
├── src/app.js              [mod]    health.version; monta /api/admin
├── src/routes/admin.js     [nuevo]  GET /backup (Bearer, timingSafeEqual, db.backup)
└── test/
    ├── health.test.js          [mod]    version "dev"
    ├── health-version.test.js  [nuevo]  version = APP_VERSION
    ├── admin.test.js           [nuevo]  401 sin token o con uno inválido; 200 con un SQLite válido
    └── admin-disabled.test.js  [nuevo]  404 sin BACKUP_TOKEN

frontend/src/app/
├── core/api.service.ts     [mod]    health(): Observable<{ok, version}>
├── app.ts / app.html / app.css  [mod]  pie de página con la versión
└── app.spec.ts             [mod]    el pie muestra 7 caracteres o "dev"
```

**Structure Decision**: se mantiene la estructura web existente. La infraestructura va en la
raíz (`.github/`, `compose.yaml`, `fly.toml`, `Dockerfile`) y la documentación operativa en
`docs/runbooks/`.

## Complexity Tracking

| Violación / complejidad | Por qué hace falta | Alternativa más simple descartada porque |
|-------------------------|--------------------|------------------------------------------|
| Endpoint de administración `/api/admin/backup` protegido con token | El volumen solo lo monta la máquina de la app; un job externo no puede leer la base de otra forma (clarificación de la spec). | Un programador interno no notifica fallos (FR-013) ni permite lanzarlo a mano (FR-012). Subir al bucket desde el servicio añade el SDK de S3 y credenciales en el servicio. |
| Rollback desde el pipeline | Fly.io no garantiza volver solo a la versión anterior si un despliegue falla (FR-007). | `canary` y `bluegreen` necesitan un segundo volumen, así que no aplican a una base SQLite en un solo volumen. |
