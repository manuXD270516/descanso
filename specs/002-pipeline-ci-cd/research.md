# Research: Pipeline de construcción y despliegue continuo

**Feature**: `002-pipeline-ci-cd` | **Fecha**: 2026-09-29

Fuentes consultadas: documentación de Render ("Persistent Disks", "Deploy Hooks", "Health
Checks", "Blueprint Spec") y la ejecución real del CI de la feature 001. Las decisiones de
producto vienen de las Clarifications de la spec.

## Mediciones de partida

- **CI actual** (workflow `quality` de la 001, un solo job): 52–60 s en total.
  - Instalación de dependencias: 9 s en backend y 7 s en frontend.
  - Tests de frontend (Karma/ChromeHeadless): 15 s.

  El objetivo de < 5 min (SC-001) ya se cumple; la caché (FR-003) añade margen.
- En Ubuntu, `npm ci` del backend compila `better-sqlite3` sin problema; el fallo de node-gyp
  solo ocurre en la máquina Windows del mantenedor.

## Decisiones

### R1. Bloqueo de merges: repositorio público + protección de rama

- **Decision**: hacer público `manuXD270516/descanso` y proteger `master`:
  - exigir el check `quality`;
  - exigir que la rama esté al día (`strict`);
  - sin push directo (se integra por PR).
- **Rationale**: es la respuesta de la clarificación. En el plan gratuito, la protección de ramas
  solo está disponible en repositorios públicos. El repositorio no contiene secretos (la 001 ya
  lo verificó) ni datos personales, porque la base vive en el disco del servicio.
- **Alternatives considered**: GitHub Pro (coste); convención sin bloqueo (no cumple FR-002).
- **Nota operativa**: cambiar la visibilidad y crear la protección son acciones sobre la cuenta
  de GitHub. Se hacen en `/sdd-ship` con confirmación explícita del usuario.

### R2. Registro de imágenes: GHCR con paquete público

- **Decision**: `ghcr.io/manuxd270516/descanso` (en minúsculas, como exige GHCR). El paquete es
  público para que Render lo descargue sin credenciales. Se publica con `GITHUB_TOKEN`
  (`packages: write`), sin PAT.
- **Rationale**: con el repositorio público, un paquete público no expone nada nuevo: la imagen
  contiene el mismo código y ningún dato ni secreto. Así Render no necesita una credencial de
  registro, que habría que rotar.
- **Alternatives considered**: paquete privado + `image.creds` en Render con un PAT
  `read:packages` (otro secreto de larga vida que gestionar).
- **Nota operativa**: GHCR crea el paquete como privado en el primer push. Hay que cambiarlo a
  público una vez desde la interfaz, porque la API no lo permite con `GITHUB_TOKEN`.

### R3. Etiquetas de imagen

- **Decision**: `ghcr.io/manuxd270516/descanso:<sha completo>` y `:latest`, generadas con
  `docker/metadata-action` (`type=sha,format=long,prefix=` y `type=raw,value=latest`).
- **Rationale**: FR-004. Se despliega siempre por el SHA (FR-006), nunca por `latest`, para
  saber exactamente qué versión corre.

### R4. Construcción con caché de capas

- **Decision**: usar `docker/setup-buildx-action` y `docker/build-push-action` con
  `cache-from/to: type=gha,mode=max`. Cambios en el Dockerfile:
  - Etapa de dependencias del backend separada: `COPY package*.json` → `npm ci --omit=dev`
    antes de copiar el código.
  - Imagen final **sin** `python3 make g++`. `better-sqlite3@13` trae el binario precompilado
    `linuxmusl-x64`, así que en Alpine basta `npm ci --omit=dev --ignore-scripts` (DT-16 de la
    001).
  - `.dockerignore` con `node_modules`, `dist`, `.angular`, `data`, `*.db*`, `.git`, `specs`,
    `docs` y `.github`, para que el contexto no arrastre artefactos locales (DT-16).
  - `ARG APP_VERSION` → `ENV APP_VERSION`, al final, para no invalidar la caché de las capas
    anteriores.
  - `HEALTHCHECK` con `wget -qO- http://localhost:3000/api/health`, que usa el entorno local
    (DT-15). Render usa su propio `healthCheckPath`.
- **Rationale**: FR-005, y una imagen más pequeña.
- **Alternatives considered**: caché de registro (`type=registry`), que obliga a publicar una
  imagen de caché extra.

### R5. Despliegue en Render: servicio basado en imagen + deploy hook con `imgURL`

- **Decision**:
  - `render.yaml` pasa de `runtime: docker` (build en Render) a `runtime: image` con
    `image.url: ghcr.io/manuxd270516/descanso:latest`.
  - Plan de pago (el más pequeño que admite disco; hoy "starter") y disco de 1 GB en `/data`.
  - `healthCheckPath: /api/health`.
  - El pipeline llama al deploy hook con
    `?imgURL=ghcr.io/manuxd270516/descanso:<sha>`.
- **Rationale**:
  - FR-006: se despliega la imagen exacta que se publicó, sin reconstruirla en Render.
  - La documentación de Render dice que las partes de `imgURL` distintas del tag deben coincidir
    con la URL de imagen del servicio (la cumplimos).
  - Con la política de despliegues solapados en *Wait*, un segundo hook devuelve 202 y queda en
    cola (FR-008). Además, el workflow usa `concurrency: deploy-production` con
    `cancel-in-progress: false`.
- **Alternatives considered**: `runtime: docker` con auto-deploy desde el repositorio (Render
  compilaría otra imagen distinta de la publicada, lo que incumple FR-006); la API REST de
  Render para cambiar la imagen (más secretos y más código para lo mismo).
- **Verificar al implementar**: el nombre exacto del plan de pago en el Blueprint. La
  documentación muestra ejemplos como `1c-2g`, y `starter` podría estar renombrado.

### R6. Verificación de salud en 60 s y comportamiento ante fallos

- **Decision**:
  1. El hook responde 200 con el `id` del despliegue.
  2. El pipeline consulta la API de Render (`GET /v1/services/{serviceId}/deploys/{deployId}`,
     con `RENDER_API_KEY`) cada 10 s hasta que el estado sea `live`, con un límite global de
     15 min: descargar la imagen y arrancar lleva su tiempo.
  3. Con el despliegue en `live`, el pipeline exige que `GET https://<app>/api/health` responda
     `ok: true` **y** `version == <sha>` en ≤ 60 s. Si no, el job falla (FR-007).
  4. Si el estado pasa a `build_failed`, `update_failed`, `canceled` o `deactivated`, falla en
     el acto.
- **Rationale**:
  - FR-007 y SC-003.
  - Comprobar la versión evita dar por bueno un "ok" de la versión anterior.
  - Render solo enruta tráfico a la versión nueva cuando pasa su propio health check. Si falla,
    "cancela el despliegue y sigue enrutando al servicio existente".
- **Limitación aceptada** (supuesto de la spec): con disco, Render **detiene la instancia
  anterior antes** de arrancar la nueva, así que hay unos segundos sin servicio en cada
  despliegue. Si la nueva falla, Render vuelve a la existente. SC-003 se valida con un
  despliegue fallido provocado en la verificación manual.
- **Alternatives considered**: sondear solo `/api/health` sin la API de Render. Es imposible
  distinguir "todavía descargando la imagen" de "no responde".

### R7. Versión visible: `APP_VERSION` en la imagen → `/api/health` → pie de página

- **Decision**:
  - `APP_VERSION` es el SHA completo, y se inyecta como build-arg solo en el pipeline.
  - `GET /api/health` añade `version` (valor `"dev"` si no hay `APP_VERSION`).
  - El frontend llama a `/api/health` al arrancar y el pie muestra los 7 primeros caracteres
    (`a6efe9b`), o `dev`.
- **Rationale**:
  - Una sola imagen sirve para todo, sin reconstruir Angular por entorno.
  - Se reutiliza un endpoint existente (principio VI).
  - FR-016 a FR-018.
- **Alternatives considered**: inyectar la versión en el build de Angular con `define` (dos
  fuentes de verdad); un endpoint `/api/version` aparte (innecesario).

### R8. Respaldos: endpoint protegido + workflow programado + aws cli

- **Decision** (según la clarificación):
  - **Servicio**:
    - `GET /api/admin/backup` crea una copia **consistente** con la API de backup online de
      SQLite (`db.backup(tmpFile)` de better-sqlite3) en un archivo temporal, la envía como
      `application/octet-stream` (`descanso-<timestamp>.db`) y borra el temporal.
    - Autoriza con `Authorization: Bearer <BACKUP_TOKEN>`, comparado con
      `crypto.timingSafeEqual`. Responde 401 sin token o con uno inválido.
    - Si `BACKUP_TOKEN` no está definido, la ruta no existe (404, FR-021).
  - **Workflow `backup.yml`**:
    - Se dispara con `schedule` (diario, 03:17 UTC, para evitar la hora punta de los crons) y
      con `workflow_dispatch` (FR-012).
    - Descarga la copia con `curl --fail`.
    - Comprueba `PRAGMA integrity_check` = `ok` con el `sqlite3` del runner.
    - Sube a `s3://$BUCKET/descanso/<YYYY-MM-DDTHHMMSSZ>.db` con `aws s3 cp --endpoint-url`.
    - Poda las copias de más de 14 días con `aws s3api list-objects-v2` y `delete-object`
      (FR-011).
    - **Solo borra si la subida del día terminó bien** (FR-013).
- **Rationale**:
  - Ninguna dependencia nueva de runtime: `aws` y `sqlite3` vienen instalados en
    `ubuntu-latest`.
  - Las credenciales del bucket solo viven en GitHub.
  - GitHub notifica por correo cuando falla un workflow programado.
  - Poda y comprobación de integridad quedan versionadas en el repositorio y no dependen de
    reglas de ciclo de vida del proveedor.
- **Alternatives considered**: el servicio sube al bucket (necesita el SDK de S3 y credenciales
  en Render); un programador interno (sin notificación ni disparo manual); reglas de ciclo de
  vida del bucket (no todos los proveedores compatibles con S3 las soportan igual).
- **Secretos**: `BACKUP_TOKEN` (Render y GitHub), `APP_URL`, `S3_ENDPOINT`, `S3_BUCKET`,
  `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` (GitHub). El token se genera con
  `openssl rand -hex 32`.
- **Nota**: GitHub desactiva los workflows programados tras 60 días sin actividad en el
  repositorio. Queda documentado en el runbook, junto con cómo reactivarlos.

### R9. Restauración documentada y probada

- **Decision**: runbook `docs/runbooks/restaurar-respaldo.md` con dos variantes:
  - **Local** (la que se prueba en esta feature, SC-006):
    1. descargar el respaldo del bucket;
    2. `docker compose down`;
    3. copiar el archivo al volumen como `sleep.db`;
    4. `docker compose up`;
    5. verificar los datos.
  - **Producción (Render)**:
    0. lanzar un respaldo manual y esperar a que termine bien, para que la restauración nunca
       pierda datos (principio II);
    1. generar una URL firmada temporal con `aws s3 presign`;
    2. en el Shell de Render, descargarla a `/data/restore.db`;
    3. copiarla sobre la base viva con la API de backup de SQLite:
       `node -e "new (require('better-sqlite3'))('/data/restore.db').backup('/data/sleep.db')"`,
       que respeta los bloqueos, a diferencia de sobrescribir el archivo;
    4. reiniciar el servicio;
    5. verificar con la app;
    6. borrar `restore.db`.
- **Rationale**: FR-014. La prueba real se hace en local con un respaldo auténtico descargado
  del bucket. La variante de producción se ensaya una vez en `/sdd-ship`, si el usuario lo
  autoriza.
- **Alternatives considered**: un endpoint de restauración (superficie de ataque destructiva;
  descartado).

### R10. Entorno local con un comando: `docker compose up --build`

- **Decision**: `compose.yaml` en la raíz con un servicio `app`:
  - build del Dockerfile y puerto `3000:3000`;
  - volumen con nombre `descanso-data:/data`;
  - `APP_VERSION` sin definir, para que el pie muestre `dev`.

  El comando documentado es `docker compose up --build` (FR-015, SC-007).
- **Rationale**: reutiliza la misma imagen que producción, así que prueba también el Dockerfile.
- **Alternatives considered**: un script con `npm run dev` en paralelo (depende del toolchain
  local; en Windows falla node-gyp, ver research de la 001).

### R11. Badge

- **Decision**: badge del workflow `Deploy` (validación + publicación + despliegue) en `master`,
  al principio del README:
  `[![Deploy](https://github.com/manuXD270516/descanso/actions/workflows/deploy.yml/badge.svg?branch=master)](https://github.com/manuXD270516/descanso/actions/workflows/deploy.yml)`
  (FR-016). Muestra el estado completo del pipeline de la rama principal, no solo los tests.

### R12. Separación de workflows

- **Decision**: tres workflows.
  - `ci.yml` (existente): se dispara con `pull_request` y `workflow_call`, y deja de ejecutarse
    con `push` para no correr dos veces en `master`. Job `quality`, cuyo nombre no cambia porque
    es el check requerido. Se le añade la caché de npm.
  - `deploy.yml`: `push` a `master`. Primero ejecuta `quality` como workflow reutilizable
    (`workflow_call`), luego `publish` y luego `deploy`. Solo publica si `quality` pasa.
  - `backup.yml`: `schedule` + `workflow_dispatch`.
- **Rationale**: un fallo del respaldo no ensucia el estado del CI, y el despliegue nunca
  publica algo que no pasó la validación.
- **Alternatives considered**: un único workflow con condiciones `if:` (más difícil de leer y de
  relanzar por partes).

## Deuda técnica o riesgos nuevos

| # | Hallazgo | Impacto | Mitigación |
|---|----------|---------|------------|
| R-01 | Unos segundos sin servicio en cada despliegue (disco en Render). | Aceptado por la spec (uso personal). | — |
| R-02 | Los workflows programados se desactivan tras 60 días sin actividad. | Dejaría de haber respaldos sin avisar. | Documentado en el runbook; revisar si el repositorio pasa meses inactivo. |
| R-03 | Coste mensual del plan de pago y del bucket. | Aceptado en la clarificación. | Disco de 1 GB, el mínimo. |
| R-04 | Cambiar de `runtime: docker` a `runtime: image` en un servicio ya creado puede no aplicarse vía Blueprint. | Habría que recrear el servicio. | Verificarlo en el primer despliegue; si hay que recrearlo, antes se descarga un respaldo manual. |
