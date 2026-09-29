# Contrato del pipeline (workflows y secretos)

Interfaces que exponen los workflows de GitHub Actions: disparadores, jobs, entradas y salidas.
Detalle de las decisiones en [research.md](../research.md) (R1, R3–R8, R12).

## `ci.yml` — Validación (FR-001 a FR-003)

| Aspecto | Valor |
|---------|-------|
| Disparadores | `pull_request` (a `master`), `workflow_call` |
| Job | `quality`. **Nombre estable**: es el check requerido por la protección de `master`. |
| Pasos | Backend: `npm ci` → lint → test. Frontend: `npm ci` → lint → test (ChromeHeadless) → build. |
| Caché | `actions/setup-node` con `cache: npm` y `cache-dependency-path` apuntando a los dos lockfiles. |
| Límite | `timeout-minutes: 10`; el objetivo es < 5 min (SC-001). |

## `deploy.yml` — Publicación y despliegue (FR-004 a FR-008)

| Aspecto | Valor |
|---------|-------|
| Disparadores | `push` a `master` y `workflow_dispatch` (para relanzar) |
| Concurrencia | `group: deploy-production`, `cancel-in-progress: false` |
| Permisos | `contents: read`, `packages: write` |
| Jobs | `quality` (usa `./.github/workflows/ci.yml`) → `publish` → `deploy` |
| `publish` | Buildx con caché `gha`. Push de `:<sha>` y `:latest`. Build-arg `APP_VERSION=<sha>`. |
| `deploy` | Llama al hook con `imgURL=…:<sha>`. Sondea `GET /v1/services/$RENDER_SERVICE_ID/deploys/<id>` cada 10 s (máx. 15 min) hasta `live`, y luego exige `/api/health` con `version == <sha>` en ≤ 60 s. Cualquier estado de fallo, o superar el tiempo, termina en exit 1. |

## `backup.yml` — Respaldo diario (FR-010 a FR-013)

| Aspecto | Valor |
|---------|-------|
| Disparadores | `schedule: '17 3 * * *'` (UTC) y `workflow_dispatch` |
| Concurrencia | `group: backup`, `cancel-in-progress: false` |
| Pasos | 1. `curl --fail -H "Authorization: Bearer $BACKUP_TOKEN" $APP_URL/api/admin/backup -o backup.db`. 2. `sqlite3 backup.db 'PRAGMA integrity_check'` debe devolver `ok`. 3. `aws s3 cp` a `descanso/<timestamp>.db`. 4. Poda de lo que tenga más de 14 días; solo se ejecuta si 1–3 terminaron bien. |

## Secretos (GitHub → Settings → Secrets and variables → Actions)

| Secreto | Usado por | Descripción |
|---------|-----------|-------------|
| `RENDER_DEPLOY_HOOK_URL` | deploy | URL del deploy hook del servicio (contiene su propia clave). |
| `RENDER_API_KEY` | deploy | Para consultar el estado del despliegue. |
| `RENDER_SERVICE_ID` | deploy | `srv-…` |
| `APP_URL` | deploy, backup | URL pública, por ejemplo `https://descanso.onrender.com`. |
| `BACKUP_TOKEN` | backup | El mismo valor que la variable de entorno del servicio en Render. |
| `S3_ENDPOINT`, `S3_BUCKET` | backup | Bucket privado compatible con S3. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | backup | Credenciales limitadas a ese bucket (lectura, escritura, listado y borrado). |

`GITHUB_TOKEN` (automático) publica en GHCR. Ningún secreto se escribe en el repositorio
(FR-019).

## Variables de entorno del servicio (Render)

| Variable | Valor |
|----------|-------|
| `DB_PATH` | `/data/sleep.db` |
| `BACKUP_TOKEN` | Secreto (`sync: false` en el Blueprint) |
| `APP_VERSION` | Viene en la imagen; no se define en Render. |
