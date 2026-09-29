# Contrato del pipeline (workflows y secretos)

Interfaces que exponen los workflows de GitHub Actions: disparadores, jobs, entradas y salidas.
Detalle de las decisiones en [research.md](../research.md) (R1, R3, R4, R7, R8, R12, R13).

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
| Disparadores | `push` a `master` y `workflow_dispatch` (para relanzar), con la entrada opcional `simular_fallo` (boolean) para probar el rollback (SC-003) |
| Concurrencia | `group: deploy-production`, `cancel-in-progress: false` |
| Permisos | `contents: read`, `packages: write` |
| Jobs | `quality` (usa `./.github/workflows/ci.yml`) → `publish` → `deploy` |
| `publish` | Buildx con caché `gha`. Push de `:<sha>` y `:latest`. Build-arg `APP_VERSION=<sha>`. |
| `deploy` | Lee la versión actual en `/api/health`. Ejecuta `flyctl deploy --image …:<sha> --wait-timeout 5m0s` con la estrategia `rolling`, que espera a los health checks de `fly.toml`. Luego exige `/api/health` con `version == <sha>` en ≤ 60 s. **Si algo falla, redespliega la versión anterior** y el job termina en rojo (FR-007). |

## `backup.yml` — Respaldo diario (FR-010 a FR-013)

| Aspecto | Valor |
|---------|-------|
| Disparadores | `schedule: '17 3 * * *'` (UTC) y `workflow_dispatch` |
| Concurrencia | `group: backup`, `cancel-in-progress: false` |
| Pasos | 1. `curl --fail -H "Authorization: Bearer $BACKUP_TOKEN" $APP_URL/api/admin/backup -o backup.db`. 2. `sqlite3 backup.db 'PRAGMA integrity_check'` debe devolver `ok`. 3. `aws s3 cp` a `descanso/<timestamp>.db`. 4. Poda de lo que tenga más de 14 días; solo se ejecuta si 1–3 terminaron bien. |

## Secretos (GitHub → Settings → Secrets and variables → Actions)

| Secreto | Usado por | Descripción |
|---------|-----------|-------------|
| `FLY_API_TOKEN` | deploy | Deploy token limitado a la app: `fly tokens create deploy --app descanso-sleep`. |
| `BACKUP_TOKEN` | backup | El mismo valor que el secreto `BACKUP_TOKEN` de la app en Fly. |
| `S3_ENDPOINT`, `S3_BUCKET` | backup | Bucket privado compatible con S3. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | backup | Credenciales limitadas a ese bucket (lectura, escritura, listado y borrado). |

`GITHUB_TOKEN` (automático) publica en GHCR. `APP_URL` no es secreto: está fijo en los workflows como `https://descanso-sleep.fly.dev`. Ningún secreto se escribe en el repositorio
(FR-019).

## Variables de entorno del servicio (Fly.io, `fly.toml` y `fly secrets`)

| Variable | Valor |
|----------|-------|
| `DB_PATH` | `/data/sleep.db` |
| `PORT` | `3000` (`[env]` de `fly.toml`) |
| `BACKUP_TOKEN` | Secreto: `fly secrets set BACKUP_TOKEN=… --app descanso-sleep` |
| `APP_VERSION` | Viene en la imagen; no se define en Fly. |
