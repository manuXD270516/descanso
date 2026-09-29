# Descanso — tracker de sueño, siestas y métricas

Aplicación full-stack para registrar la hora de dormir cada noche, la hora de despertar
al día siguiente, siestas con inicio y fin, y un panel de métricas configurables
(escala, número, sí/no o texto) con historial diario.

- **Backend:** Node.js 20+ · Express 5 · SQLite (better-sqlite3), datos persistentes en un archivo `.db`
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

## API

| Método | Ruta                                  | Descripción                                        |
|--------|---------------------------------------|----------------------------------------------------|
| GET    | `/api/sleep?from&to`                  | Noches (con `duration_min`)                        |
| GET    | `/api/sleep/open`                     | Noche abierta (me acosté, aún no despierto)        |
| POST   | `/api/sleep`                          | `{date, bedtime, wake_time?, notes?}`              |
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

Las horas se guardan en ISO 8601 **con offset** (ej. `2026-09-11T23:15:00-04:00`), así los
promedios de "hora de dormir/despertar" respetan tu zona horaria sin importar dónde
corra el servidor. El frontend lo hace automáticamente.

## Desplegar

### Opción A — Render (recomendada, gratis con disco persistente)

1. Sube este repositorio a GitHub.
2. En Render: **New → Blueprint**, selecciona el repo. `render.yaml` ya define el
   servicio web con Docker y un disco de 1 GB montado en `/data` para la base SQLite.
3. Listo: la URL pública sirve frontend + API.

### Opción B — Railway / Fly.io / VPS con Docker

```bash
docker build -t descanso .
docker run -p 3000:3000 -v descanso-data:/data descanso
```

El volumen `/data` conserva `sleep.db` entre reinicios.

### Opción C — Sin Docker (cualquier VPS con Node 20+)

```bash
cd frontend && npm ci && npx ng build
cd ../backend && npm ci && PORT=80 DB_PATH=/var/lib/descanso/sleep.db npm start
```

## Notas

- La "fecha de la noche" es el día en que te acostaste (una noche del 11 al 12 se guarda como `2026-09-11`).
- Solo puede haber una noche abierta a la vez; "Ya despertí" la cierra.
- Al primer arranque se crean tres métricas de ejemplo (Calidad del sueño, Energía al despertar, Cafés). Puedes editarlas, archivarlas o eliminarlas desde el panel.
- Archivar una métrica la oculta sin borrar el historial; eliminar borra también sus registros.
