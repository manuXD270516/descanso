# Descanso — tracker de sueño, siestas y métricas

[![Deploy](https://github.com/manuXD270516/descanso/actions/workflows/deploy.yml/badge.svg?branch=master)](https://github.com/manuXD270516/descanso/actions/workflows/deploy.yml)

Aplicación full-stack para registrar la hora de dormir cada noche, la hora de despertar
al día siguiente, siestas con inicio y fin, y un panel de métricas configurables
(escala, número, sí/no o texto) con historial diario.

**Tendencias** (feature 005): la pestaña Tendencias muestra las horas dormidas por día (noche +
siestas) en 7, 30 o 90 días frente a tu objetivo, cuántos días lo cumples, el sueño pendiente neto
de los últimos 14 días y la regularidad de tus horarios. El objetivo empieza en **7 h** y se puede
cambiar con atajos de ciclos completos (~90 min cada uno, una orientación); la primera vez que
entras, una bienvenida te lo pregunta. Cada gráfico tiene descripción en frases y "Ver como tabla".

**Ciclos y honestidad de datos** (feature 006, principio VIII):
- **Calculadora**: bajo "¿Hora de dormir?" se ven 3 ventanas para despertar tras 4, 5 o 6 ciclos
  ("entre 6:30 y 7:00"). Usa tu ciclo (70–110 min) y el tiempo que tardas en dormirte (0–60 min),
  ajustables en "Ajustar" o en Mi perfil. Es una estimación y lo dice siempre; no se guarda.
- **Tarjeta "¿Cómo fue la noche?"**: aparece después de "Ya desperté". Es opcional y guarda en la
  noche cuánto tardaste en dormirte y cuántas veces despertaste, por rangos. Cerrar la noche
  sigue siendo un toque.
- **Noche abierta olvidada**: si lleva 14 h o más abierta, al abrir la app te propone tu hora de
  dormir + tu objetivo. Sin notificaciones.
- **Honestidad**: cada bloque de datos dice su origen ("Anotado por ti", "Estimado") y Noche,
  Tendencias y Siestas avisan de que no es un dispositivo médico. "Fases" explica que la app no
  las mide.
- **Vocabulario**: ningún texto usa vocabulario clínico; lo vigila una prueba con la lista
  [`docs/sdd/terminos-prohibidos.txt`](docs/sdd/terminos-prohibidos.txt). Si una palabra de la
  lista es necesaria en otro sentido, documenta la excepción en el propio archivo.

**Multiusuario por invitación** (feature 008): el propietario invita a otras personas con un
enlace de un solo uso; cada una tiene su cuenta, su perfil y sus datos, y nadie ve los de otra
(tampoco el propietario). Quien administra el servidor tiene acceso técnico a la base y a los
respaldos (cifrados): la app lo dice antes de registrarse.

- **Backend:** Node.js 22 LTS · Express 5 · SQLite (better-sqlite3), datos persistentes en un archivo `.db`
- **Frontend:** Angular 20 (standalone components + signals)
- **Despliegue:** un solo servicio — Express sirve la API y el frontend compilado

```
sleep-tracker/
├── backend/          API REST + servidor estático
│   ├── src/server.js
│   ├── src/db.js     conexión SQLite + migraciones al arrancar (src/migrations)
│   ├── src/repo/     único acceso a datos de usuario (userId obligatorio)
│   └── src/routes/   sleep · naps · metrics · stats · export · auth · me · people
├── frontend/         proyecto Angular
├── e2e/              pruebas end-to-end con Playwright (docs/testing/e2e-playwright.md)
├── Dockerfile
├── fly.toml          despliegue en Fly.io (volumen persistente, apagado sin tráfico)
└── compose.yaml      entorno local en un comando
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
| `DB_PATH`       | `backend/data/sleep.db`             | Ruta del archivo SQLite (los respaldos previos a cada migración van a `backups/` junto a él) |
| `FRONTEND_DIST` | `frontend/dist/frontend/browser`    | Carpeta del build de Angular a servir    |
| `APP_VERSION`   | `dev`                               | Versión desplegada (la inyecta el pipeline en la imagen) |
| `BACKUP_TOKEN`  | —                                   | Habilita `GET /api/admin/backup` (Bearer); sin definir, el endpoint no existe |
| `OWNER_SETUP_TOKEN` | —                               | Código de alta del propietario. Si cambia al arrancar, reabre el alta y cierra las sesiones ([recuperar acceso](docs/runbooks/recuperar-acceso.md)) |

## API

**Toda la API exige sesión** (cookie `__Host-sid` en HTTPS, `sid` en local) salvo `/api/health`,
`/api/auth/*` y `/api/admin/*` (token Bearer). Sin sesión responde 401. Las peticiones que
modifican datos deben venir del propio sitio (`Sec-Fetch-Site`/`Origin`); si no, 403.

| Método | Ruta                                  | Descripción                                        |
|--------|---------------------------------------|----------------------------------------------------|
| GET    | `/api/auth/status`                    | `setup` · `setup-unavailable` · `login` · `authenticated` |
| POST   | `/api/auth/setup`                     | `{token, email, password}` alta del propietario (contraseña de 12 a 128 caracteres) |
| POST   | `/api/auth/login` · `/api/auth/logout` | Entrar (5 fallos en 15 min → 429) / cerrar sesión   |
| POST   | `/api/auth/register`                  | `{invite, display_name, email, password, accept_policy, policy_version}` registro por invitación |
| POST   | `/api/auth/reset`                     | `{token, password}` contraseña nueva con un enlace de recuperación |
| GET · PUT · DELETE | `/api/me`                 | Mi perfil (nombre, zona horaria, objetivo de sueño de 4 a 12 h, `cycle_min` 70–110 y `latency_min` 0–60) / borrar mi cuenta (con contraseña) |
| POST   | `/api/me/onboarding`                  | `{sleep_goal_min?}` bienvenida vista (sin objetivo: se queda en 7 h) |
| GET    | `/api/dashboard?days=7\|30\|90&to`   | Tendencias: días (`data` · `none` · `in_progress`), resumen, pendiente neto 14 días, regularidad y ciclos |
| PUT    | `/api/me/email` · `/api/me/password`  | Cambiar email o contraseña (con la actual)         |
| GET    | `/api/me/activity`                    | Acciones del propietario sobre mi cuenta           |
| GET · POST · DELETE | `/api/people…`           | Solo propietario: personas, invitaciones (72 h) y enlaces de recuperación (30 min) |
| GET    | `/api/export.json`                    | Todos mis datos en JSON versionado                 |
| GET    | `/api/export/{noches,siestas,metricas,valores}.csv` | Un CSV por tipo (UTF-8 con BOM)      |
| GET    | `/api/sleep?from&to`                  | Noches (con `duration_min`)                        |
| GET    | `/api/sleep/open`                     | Noche abierta (me acosté, aún no despierto)        |
| POST   | `/api/sleep`                          | `{date, bedtime, wake_time?, notes?}` · `date` = día local de `bedtime` · 409 si ya hay una noche abierta y no se envía `wake_time` |
| POST   | `/api/sleep/wake`                     | `{wake_time}` cierra la noche abierta              |
| PUT    | `/api/sleep/:id` · DELETE             | Editar (fusión parcial; incluye `sol_bucket` `lt15·15_30·gt30` y `awakenings_bucket` `0·1_2·3plus`, `null` borra) / eliminar |
| GET    | `/api/naps?from&to`                   | Siestas                                            |
| POST   | `/api/naps`                           | `{date, start_time, end_time, notes?}` · `date` = día local de `start_time` |
| PUT    | `/api/naps/:id` · DELETE              | Editar / eliminar                                  |
| GET    | `/api/metrics?all=1`                  | Métricas (activas, o todas con `all=1`)            |
| POST   | `/api/metrics`                        | `{name, type, unit?, min_value?, max_value?, color?}` |
| PUT    | `/api/metrics/:id` · DELETE           | Editar (incl. `archived`, `sort_order`) / eliminar |
| GET    | `/api/metrics/entries?from&to`        | Valores registrados                                |
| PUT    | `/api/metrics/:id/entries/:date`      | `{value}` — crea o actualiza el valor del día (sí/no: solo `true`/`false`, `1`/`0`) |
| DELETE | `/api/metrics/:id/entries/:date`      | Borra el valor del día                             |
| GET    | `/api/stats?from&to`                  | Resumen diario + promedios (sueño, siestas, horas medias); `from` y `to` obligatorios |
| GET    | `/api/health`                         | `{ok, time, version, storage}` — healthcheck, versión desplegada y ocupación del volumen (`warn` por encima del 70 %) |
| GET    | `/api/admin/backup`                   | Copia SQLite consistente; requiere `Authorization: Bearer <BACKUP_TOKEN>` |

Las horas se guardan en ISO 8601 **con offset** (ej. `2026-09-11T23:15:00-04:00`), así los
promedios de "hora de dormir/despertar" respetan tu zona horaria sin importar dónde
corra el servidor. El frontend lo hace automáticamente.

Los filtros `from`/`to` deben ser fechas reales `AAAA-MM-DD` con `from ≤ to`; si no, la API responde 400.

## Tests y lint

```bash
cd backend && npm test && npm run lint          # node:test + supertest, base SQLite en memoria
cd frontend && npm run lint && npx ng test --watch=false --browsers=ChromeHeadless
```

Verificación local automatizada (servidor + datos sembrados + quickstart de Tendencias) y datos de
prueba bajo demanda: [`docs/runbooks/verificacion-local.md`](docs/runbooks/verificacion-local.md).

```bash
node scripts/smoke-local.mjs run                          # verifica y para
node scripts/smoke-local.mjs serve --build --fresh        # deja la app abierta con datos
node scripts/smoke-local.mjs seed --days 90 --metrics     # más datos, sin duplicar (solo localhost)
```

Pruebas end-to-end con Playwright (navegador real contra el servidor real, un servidor con base
SQLite vacía por test). Requieren las dependencias de `backend/` y `frontend/` instaladas; en
local usan el Google Chrome instalado:

```bash
cd e2e && npm ci && npm test        # npm run test:ui para depurar, npm run report para el reporte
```

Guía paso a paso, mapa escenario → test y decisiones: [`docs/testing/e2e-playwright.md`](docs/testing/e2e-playwright.md).

La especificación, el contrato de la API (`contracts/openapi.yaml`) y la deuda técnica
conocida están en `specs/001-linea-base/`. CI (`.github/workflows/ci.yml`) ejecuta lint,
tests y el build de producción en cada pull request (job `quality`, check obligatorio para
fusionar) y, en paralelo, la suite E2E (job `e2e`).

## Desplegar

### Opción A — Pipeline automático a Fly.io (la que se usa)

La app corre en https://descanso-sleep.fly.dev (región `gru`, São Paulo). Cada merge a `master`
ejecuta el workflow **Deploy**:

1. lint, tests y build (`quality`) y pruebas E2E (`e2e`), en paralelo;
2. publica la imagen en GHCR (`ghcr.io/manuxd270516/descanso:<sha>` y `:latest`);
3. la despliega en Fly.io por su SHA (`flyctl deploy --image`). Si falla con
   `volume not found`, reintenta hasta 3 veces cada 30 s: pasa cuando Fly acaba de migrar la
   máquina y su volumen a otro host (el volumen recibe un ID nuevo y el viejo queda en
   `pending_destroy` en `flyctl volumes list --all`), y los datos siguen intactos. Si los
   3 intentos fallan, relanza el job. Cualquier otro error no se reintenta;
4. verifica que `/api/health` devuelve esa versión en ≤ 60 s. Si no, **vuelve a desplegar la
   versión anterior** y el job falla. La versión aparece también en el pie de la app.

Los PR no se pueden fusionar si `quality` falla.

Coste: la máquina (`shared-cpu-1x`, 256 MB) **se apaga cuando no hay tráfico** y arranca con la
primera petición, que tarda unos segundos. Se paga por uso, a mes vencido, más el volumen de
1 GB. La configuración está en `fly.toml`.

Configuración única (con [`flyctl`](https://fly.io/docs/flyctl/install/)):

```bash
flyctl apps create descanso-sleep
flyctl volumes create descanso_data --size 1 --region gru --app descanso-sleep
flyctl secrets set BACKUP_TOKEN=<token> --stage --app descanso-sleep   # token: openssl rand -hex 32
flyctl secrets set OWNER_SETUP_TOKEN=<código> --stage --app descanso-sleep   # código de alta del propietario
flyctl tokens create deploy --app descanso-sleep                         # → secreto FLY_API_TOKEN en GitHub
```

**Primer acceso**: tras el despliegue, abre la app → "Crea tu contraseña" → pega el código de alta,
tu email y una contraseña (mínimo 12 caracteres). Si la olvidas, sigue
[`docs/runbooks/recuperar-acceso.md`](docs/runbooks/recuperar-acceso.md).

Después carga en GitHub (Settings → Secrets → Actions) los secretos listados en
[`specs/002-pipeline-ci-cd/contracts/pipeline.md`](specs/002-pipeline-ci-cd/contracts/pipeline.md)
y lanza **Deploy** a mano (Actions → Deploy → *Run workflow*).

### Respaldos

El workflow **Backup** corre a diario (03:17 UTC) y también se puede lanzar a mano:

1. descarga una copia consistente de la base con `/api/admin/backup`, protegido con
   `BACKUP_TOKEN`;
2. verifica su integridad;
3. la **cifra con age** usando la clave pública `BACKUP_AGE_RECIPIENT` (la privada solo la
   guarda el propietario; sin el secreto, el workflow falla sin subir nada en claro);
4. la sube a un bucket privado compatible con S3;
5. borra las copias de más de 14 días.

Para restaurar, sigue [`docs/runbooks/restaurar-respaldo.md`](docs/runbooks/restaurar-respaldo.md).

### Migraciones

El esquema de la base se versiona en `backend/src/migrations/` y se aplica **solo al arrancar**,
antes de atender peticiones. Antes de aplicar migraciones pendientes se guarda una copia en
`backups/pre-NNN.db` junto a la base (en Fly, `/data/backups/`); se conservan las 3 últimas. Si
una migración falla, se deshace, el servicio no arranca y el pipeline vuelve a la imagen anterior.

- Cómo escribir una migración (regla expand/contract): [`docs/sdd/guia-migraciones.md`](docs/sdd/guia-migraciones.md).
- Qué hacer si una migración deja la base mal: [`docs/runbooks/rollback-migracion.md`](docs/runbooks/rollback-migracion.md).

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
- Solo puede haber una noche abierta a la vez (lo garantiza la base; la API responde 409 si se intenta abrir otra); "Ya desperté" la cierra.
- Cada cuenta empieza con tres métricas de ejemplo (Calidad del sueño, Energía al despertar, Cafés). Puedes editarlas, archivarlas o eliminarlas desde el panel.
- **Invitar**: Cuenta → Personas → "Invitar a alguien" y envía el enlace por el medio que prefieras.
- **Olvidé mi contraseña**: el propietario genera un enlace de recuperación en Personas; si es el propio
  propietario, sigue [`docs/runbooks/recuperar-acceso.md`](docs/runbooks/recuperar-acceso.md).
- **Rollback**: con otros usuarios registrados, nunca vuelvas manualmente a una versión anterior a 008
  ([`rollback-migracion.md`](docs/runbooks/rollback-migracion.md)).
- Archivar una métrica la oculta sin borrar el historial; eliminar borra también sus registros.
