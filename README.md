# Descanso — tracker de sueño, siestas y métricas

[![Deploy](https://github.com/manuXD270516/descanso/actions/workflows/deploy.yml/badge.svg?branch=master)](https://github.com/manuXD270516/descanso/actions/workflows/deploy.yml)

Aplicación full-stack para registrar la hora de dormir cada noche, la hora de despertar
al día siguiente, siestas con inicio y fin, y un panel de métricas configurables
(escala, número, sí/no o texto) con historial diario.

- **Backend:** Node.js 22 LTS · Express 5 · SQLite (better-sqlite3), datos persistentes en un archivo `.db`
- **Frontend:** Angular 20 (standalone components + signals)
- **Despliegue:** un solo servicio — Express sirve la API y el frontend compilado

```
sleep-tracker/
├── backend/          API REST + servidor estático
│   ├── src/server.js
│   ├── src/db.js     esquema SQLite (se crea solo al arrancar)
│   └── src/routes/   sleep · naps · metrics · stats
├── frontend/         proyecto Angular
├── Dockerfile
└── render.yaml       plantilla para desplegar en Render con disco persistente
```

## Ejecutar en local

Todo en un comando (requiere Docker). La app queda en http://localhost:3000 y los datos en el
volumen `descanso-data`:

```bash
docker compose up --build
```

Sin Docker, en modo desarrollo:

```bash
# 1. Backend (puerto 3000)
cd backend && npm install && npm run dev

# 2. Frontend en modo desarrollo (puerto 4200, con proxy a /api)
cd frontend && npm install && npx ng serve
```

Abre http://localhost:4200. Para probar el modo producción (todo en el puerto 3000):

```bash
cd frontend && npx ng build
cd ../backend && npm start        # sirve frontend/dist/frontend/browser
```

## Variables de entorno (backend)

| Variable        | Por defecto                         | Descripción                              |
|-----------------|-------------------------------------|------------------------------------------|
| `PORT`          | `3000`                              | Puerto HTTP                              |
| `DB_PATH`       | `backend/data/sleep.db`             | Ruta del archivo SQLite                  |
| `FRONTEND_DIST` | `frontend/dist/frontend/browser`    | Carpeta del build de Angular a servir    |
| `APP_VERSION`   | `dev`                               | Versión desplegada (la inyecta el pipeline en la imagen) |
| `BACKUP_TOKEN`  | —                                   | Habilita `GET /api/admin/backup` (Bearer); sin definir, el endpoint no existe |

## API

| Método | Ruta                                  | Descripción                                        |
|--------|---------------------------------------|----------------------------------------------------|
| GET    | `/api/sleep?from&to`                  | Noches (con `duration_min`)                        |
| GET    | `/api/sleep/open`                     | Noche abierta (me acosté, aún no despierto)        |
| POST   | `/api/sleep`                          | `{date, bedtime, wake_time?, notes?}` · 409 si ya hay una noche abierta y no se envía `wake_time` |
| POST   | `/api/sleep/wake`                     | `{wake_time}` cierra la noche abierta              |
| PUT    | `/api/sleep/:id` · DELETE             | Editar / eliminar                                  |
| GET    | `/api/naps?from&to`                   | Siestas                                            |
| POST   | `/api/naps`                           | `{date, start_time, end_time, notes?}`             |
| PUT    | `/api/naps/:id` · DELETE              | Editar / eliminar                                  |
| GET    | `/api/metrics?all=1`                  | Métricas (activas, o todas con `all=1`)            |
| POST   | `/api/metrics`                        | `{name, type, unit?, min_value?, max_value?, color?}` |
| PUT    | `/api/metrics/:id` · DELETE           | Editar (incl. `archived`, `sort_order`) / eliminar |
| GET    | `/api/metrics/entries?from&to`        | Valores registrados                                |
| PUT    | `/api/metrics/:id/entries/:date`      | `{value}` — crea o actualiza el valor del día      |
| DELETE | `/api/metrics/:id/entries/:date`      | Borra el valor del día                             |
| GET    | `/api/stats?from&to`                  | Resumen diario + promedios (sueño, siestas, horas medias) |
| GET    | `/api/health`                         | `{ok, time, version}` — healthcheck y versión desplegada |
| GET    | `/api/admin/backup`                   | Copia SQLite consistente; requiere `Authorization: Bearer <BACKUP_TOKEN>` |

Las horas se guardan en ISO 8601 **con offset** (ej. `2026-09-11T23:15:00-04:00`), así los
promedios de "hora de dormir/despertar" respetan tu zona horaria sin importar dónde
corra el servidor. El frontend lo hace automáticamente.

## Tests y lint

```bash
cd backend && npm test && npm run lint          # node:test + supertest, base SQLite en memoria
cd frontend && npm run lint && npx ng test --watch=false --browsers=ChromeHeadless
```

La especificación, el contrato de la API (`contracts/openapi.yaml`) y la deuda técnica
conocida están en `specs/001-linea-base/`. CI (`.github/workflows/ci.yml`) ejecuta lint,
tests y el build de producción en cada pull request. Es un check obligatorio para fusionar.

## Desplegar

### Opción A — Pipeline automático a Render (la que se usa)

Cada merge a `master` ejecuta el workflow **Deploy**:

1. lint, tests y build (`quality`);
2. publica la imagen en GHCR (`ghcr.io/manuxd270516/descanso:<sha>` y `:latest`);
3. la despliega en Render por su SHA;
4. verifica que `/api/health` devuelve esa versión en ≤ 60 s. La versión aparece también en el
   pie de la app.

Los PR no se pueden fusionar si `quality` falla.

Configuración única:

1. En Render, **New → Blueprint** con este repo. `render.yaml` define un servicio basado en
   imagen, en plan de pago (el gratuito no tiene disco persistente), con un disco de 1 GB en
   `/data` y el health check en `/api/health`. Define `BACKUP_TOKEN` (`openssl rand -hex 32`).
2. Carga en GitHub (Settings → Secrets → Actions) los secretos listados en
   [`specs/002-pipeline-ci-cd/contracts/pipeline.md`](specs/002-pipeline-ci-cd/contracts/pipeline.md).
3. Tras el primer despliegue, marca como público el paquete `descanso` en GHCR para que Render
   pueda descargarlo.

### Respaldos

El workflow **Backup** corre a diario (03:17 UTC) y también se puede lanzar a mano:

1. descarga una copia consistente de la base con `/api/admin/backup`, protegido con
   `BACKUP_TOKEN`;
2. verifica su integridad;
3. la sube a un bucket privado compatible con S3;
4. borra las copias de más de 14 días.

Para restaurar, sigue [`docs/runbooks/restaurar-respaldo.md`](docs/runbooks/restaurar-respaldo.md).

### Opción B — Railway / Fly.io / VPS con Docker

```bash
docker build -t descanso .
docker run -p 3000:3000 -v descanso-data:/data descanso
```

El volumen `/data` conserva `sleep.db` entre reinicios.

### Opción C — Sin Docker (cualquier VPS con Node 22+)

```bash
cd frontend && npm ci && npx ng build
cd ../backend && npm ci && PORT=80 DB_PATH=/var/lib/descanso/sleep.db npm start
```

## Notas

- La "fecha de la noche" es el día en que te acostaste (una noche del 11 al 12 se guarda como `2026-09-11`).
- Solo puede haber una noche abierta a la vez (la API responde 409 si se intenta abrir otra); "Ya desperté" la cierra.
- Al primer arranque se crean tres métricas de ejemplo (Calidad del sueño, Energía al despertar, Cafés). Puedes editarlas, archivarlas o eliminarlas desde el panel.
- Archivar una métrica la oculta sin borrar el historial; eliminar borra también sus registros.
