---

description: "Lista de tareas de la feature 002 – Pipeline de construcción y despliegue continuo"
---

# Tasks: Pipeline de construcción y despliegue continuo

**Input**: Design documents from `/specs/002-pipeline-ci-cd/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: sí para el código de la app (principio IV): `version` en health, `/api/admin/backup`
y el pie de página. Se escriben **antes** que el código y deben fallar primero. Los workflows y
la infraestructura se validan ejecutándolos (quickstart).

**Tareas manuales**: las marcadas **(manual, usuario)** actúan sobre cuentas externas (GitHub,
Render, bucket). En `/sdd-ship` se preparan los comandos o pasos exactos y **se piden
confirmación y credenciales al usuario**; nunca se ejecutan sin permiso.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: una imagen más pequeña y cacheable, que sirve de base a US2 y US4 (research R4).

- [X] T001 [P] Crear .dockerignore en la raíz con `**/node_modules`, `**/dist`, `**/.angular`, `backend/data`, `*.db`, `*.db-wal`, `*.db-shm`, `.git`, `.github`, `specs`, `docs`, `.specify`, `.claude`, `*.log`, `.env*`
- [X] T002 Reescribir Dockerfile (multi-stage, principio V):
  - Etapa `frontend`: igual que ahora.
  - Nueva etapa `backend-deps` (node:22-alpine): `COPY backend/package*.json` → `npm ci --omit=dev --ignore-scripts`. `better-sqlite3` usa su binario precompilado `linuxmusl-x64`.
  - Etapa final: node:22-alpine **sin** `apk add python3 make g++`. Copia `node_modules` desde `backend-deps`, el código del backend y el build de Angular.
  - Mantiene `ENV PORT=3000 DB_PATH=/data/sleep.db NODE_ENV=production`, `VOLUME ["/data"]` y `EXPOSE 3000`.
  - Añade `HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://localhost:3000/api/health || exit 1`.
  - Añade `ARG APP_VERSION` + `ENV APP_VERSION=$APP_VERSION` justo antes de `CMD`, para no invalidar la caché.

  Verificación: `docker build -t descanso:test .` y `docker run --rm -p 3000:3000 descanso:test` → `/api/health` 200 y estado `healthy` en `docker ps`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: la versión desplegada tiene que poder verificarse. La usan el despliegue (US2) y el
pie de página (US5).

- [X] T003 Ampliar backend/test/health.test.js: sin `APP_VERSION`, `GET /api/health` → `version === "dev"`. Crear backend/test/health-version.test.js, que fija `process.env.APP_VERSION = 'abc123'` antes de requerir `./helpers`: → `version === "abc123"`. Ambos deben **fallar** antes de T004.
- [X] T004 En backend/src/app.js, añadir `version: process.env.APP_VERSION || 'dev'` a la respuesta de `/api/health` (FR-018; contrato en contracts/openapi-delta.yaml)

**Checkpoint**: `npm test` y `npm run lint` en verde en backend/.

---

## Phase 3: User Story 1 - Validar cada cambio antes de integrarlo (Priority: P1) 🎯 MVP

**Goal**: un PR en rojo no se puede integrar; el CI usa caché.

**Independent Test**: un PR con un test roto queda bloqueado; al arreglarlo se desbloquea.

- [X] T005 [US1] Modificar .github/workflows/ci.yml según contracts/pipeline.md:
  - disparadores `pull_request` (branches: [master]) y `workflow_call` (quitar `push`);
  - `timeout-minutes: 10`;
  - `actions/setup-node` con `cache: npm` y `cache-dependency-path: | backend/package-lock.json frontend/package-lock.json`.

  El job se sigue llamando `quality`.
- [X] T006 [US1] **(manual, usuario)** Preparar y, con confirmación explícita, ejecutar:
  1. `gh repo edit manuXD270516/descanso --visibility public --accept-visibility-change-consequences`;
  2. la protección de `master` con `gh api -X PUT repos/manuXD270516/descanso/branches/master/protection`, con `required_status_checks: {strict: true, contexts: ["quality"]}`, `enforce_admins: true`, `required_pull_request_reviews: null` y `restrictions: null` (FR-002, research R1).

  Verificar con `gh api …/protection` (200).

**Checkpoint**: el PR de esta feature muestra `quality` como requerido.

---

## Phase 4: User Story 2 - Publicar y desplegar automáticamente (Priority: P1)

**Goal**: cada merge produce la imagen `:<sha>` + `:latest` y un despliegue verificado en ≤ 60 s.

**Independent Test**: tras un merge, GHCR tiene las dos etiquetas y `$APP_URL/api/health`
devuelve `version == sha`.

- [X] T007 [US2] Crear .github/workflows/deploy.yml, parte de publicación:
  - `name: Deploy`, con `on: push: branches: [master]` y `workflow_dispatch`;
  - `concurrency: { group: deploy-production, cancel-in-progress: false }`;
  - `permissions: { contents: read, packages: write }`.

  Jobs:
  - `quality` con `uses: ./.github/workflows/ci.yml`.
  - `publish` (`needs: quality`):
    1. `docker/login-action` a `ghcr.io` con `GITHUB_TOKEN`;
    2. `docker/metadata-action` con `images: ghcr.io/manuxd270516/descanso` y tags `type=sha,format=long,prefix=` y `type=raw,value=latest`;
    3. `docker/setup-buildx-action`;
    4. `docker/build-push-action` con `push: true`, `build-args: APP_VERSION=${{ github.sha }}` y `cache-from/to: type=gha` (`mode=max` en `cache-to`).

  Salida del job: `image=ghcr.io/manuxd270516/descanso:${{ github.sha }}` (FR-004, FR-005).
- [X] T008 [US2] Añadir a .github/workflows/deploy.yml el job `deploy` (`needs: publish`, `environment: production`, `timeout-minutes: 20`), según research R6. Pasos bash con `set -euo pipefail`:
  1. `curl -fsS -X POST "$RENDER_DEPLOY_HOOK_URL&imgURL=<image>"`. Si la URL ya tiene `?`, usar `&`; comprobarlo al construirla. Extraer el id del despliegue con `jq -r .deploy.id // .id`. Si la respuesta es 202 sin id, esperar al último despliegue con `GET /v1/services/$RENDER_SERVICE_ID/deploys?limit=1`.
  2. Cada 10 s, durante 15 min como máximo, consultar `GET https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys/$ID` con `Authorization: Bearer $RENDER_API_KEY`:
     - `live` → continuar;
     - `build_failed`, `update_failed`, `canceled` o `deactivated` → `exit 1`.
  3. Durante 60 s como máximo, consultar `curl -fsS $APP_URL/api/health` cada 5 s hasta que `jq -r .version` == `$GITHUB_SHA`. Si no llega, `exit 1` (FR-007).

  Secretos: `RENDER_DEPLOY_HOOK_URL`, `RENDER_API_KEY`, `RENDER_SERVICE_ID` y `APP_URL`.
- [X] T009 [P] [US2] **(sustituida por T023: se pasó a Fly.io)** Reescribir render.yaml para el servicio `descanso`:
  - `type: web`, `runtime: image`, `image: { url: ghcr.io/manuxd270516/descanso:latest }`;
  - `plan`: el plan de pago más pequeño que admita disco, con el nombre que acepte hoy el Blueprint (verificarlo en la documentación de Render; research R5);
  - `healthCheckPath: /api/health`;
  - `disk: { name: descanso-data, mountPath: /data, sizeGB: 1 }`;
  - `envVars`: `DB_PATH=/data/sleep.db` y `BACKUP_TOKEN` con `sync: false`;
  - ~~`autoDeploy: false`~~: no aplica. Según la documentación del Blueprint, los servicios basados en imagen no se redespliegan solos; solo lo hace el deploy hook. Plan usado: `0.5c-512mb`, porque `starter` ya no existe.
- [X] T010 [US2] **(sustituida por T026: se pasó a Fly.io)** **(manual, usuario)** Guía paso a paso y, con confirmación, apoyo:
  1. crear o actualizar el servicio en Render desde el Blueprint (si el servicio existente es `runtime: docker`, antes descargar un respaldo manual; riesgo R-04);
  2. generar `BACKUP_TOKEN` con `openssl rand -hex 32` y cargarlo en Render;
  3. copiar el deploy hook y crear una API key;
  4. cargar en GitHub los secretos `RENDER_DEPLOY_HOOK_URL`, `RENDER_API_KEY`, `RENDER_SERVICE_ID`, `APP_URL` y `BACKUP_TOKEN` (`gh secret set`, con los valores introducidos por el usuario, nunca repetidos en el chat);
  5. tras el primer `publish`, marcar el paquete GHCR `descanso` como público.

**Checkpoint**: un merge despliega y verifica la versión.

---

## Phase 5: User Story 3 - Datos a salvo: respaldos restaurables (Priority: P1)

**Goal**: respaldo diario consistente, fuera del servicio, con 14 días de retención y
restauración probada.

**Independent Test**: lanzar `Backup` a mano, ver el archivo en el bucket y restaurarlo en local
con el runbook.

- [X] T011 [P] [US3] Crear backend/test/admin.test.js. Deben **fallar** antes de T012:
  - sin `BACKUP_TOKEN` en el entorno, `GET /api/admin/backup` → 404. Este caso va en un archivo aparte, backend/test/admin-disabled.test.js, porque la variable se lee al montar la ruta;
  - con `BACKUP_TOKEN=t0k3n` fijado antes de requerir la app:
    - sin cabecera → 401 `{error:'No autorizado'}`;
    - con `Bearer otro` → 401;
    - con `Bearer t0k3n` → 200, `Content-Type` `application/octet-stream` y `Content-Disposition` con `descanso-…db`.
  - El cuerpo, guardado en un temporal y abierto con better-sqlite3, contiene una noche creada antes por la API y pasa `PRAGMA integrity_check` = `ok`.
  - Tras la respuesta, no queda ningún archivo temporal de respaldo en `os.tmpdir()`.
- [X] T012 [US3] Crear backend/src/routes/admin.js y montarlo en backend/src/app.js **solo si** `process.env.BACKUP_TOKEN` está definido (`app.use('/api/admin', require('./routes/admin'))`). Comportamiento:
  - `GET /backup` compara el Bearer con `crypto.timingSafeEqual`, comprobando antes que las longitudes coincidan; si no, responde 401 `{error:'No autorizado'}`;
  - hace `await db.backup(tmp)` con `tmp = path.join(os.tmpdir(), 'descanso-<timestamp>.db')`;
  - `res.download(tmp, 'descanso-<YYYY-MM-DDTHHMMSSZ>.db', () => fs.rm(tmp, {force:true}))`.

  Contrato: contracts/openapi-delta.yaml (FR-021).
- [X] T013 [US3] Crear .github/workflows/backup.yml según contracts/pipeline.md:
  - `schedule: - cron: '17 3 * * *'` y `workflow_dispatch`;
  - `concurrency: backup`;
  - `timeout-minutes: 10`.

  Pasos bash con `set -euo pipefail`:
  1. `TS=$(date -u +%Y-%m-%dT%H%M%SZ)`, y descargar con `curl --fail -sS -H "Authorization: Bearer $BACKUP_TOKEN" "$APP_URL/api/admin/backup" -o backup.db`;
  2. comprobar que `sqlite3 backup.db 'PRAGMA integrity_check'` devuelve exactamente `ok`;
  3. `aws s3 cp backup.db "s3://$S3_BUCKET/descanso/$TS.db" --endpoint-url "$S3_ENDPOINT"`;
  4. podar: `CUTOFF=$(date -u -d '14 days ago' +%Y-%m-%dT%H:%M:%SZ)`, luego `aws s3api list-objects-v2 --bucket … --prefix descanso/ --query "Contents[?LastModified<'$CUTOFF'].Key" --output text` y un `aws s3api delete-object` por clave. Este paso solo se ejecuta si los anteriores terminaron bien, porque va después sin `if: always()`.

  Env: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION: auto`, `S3_ENDPOINT`, `S3_BUCKET`, `APP_URL`, `BACKUP_TOKEN` (FR-010 a FR-013, FR-020).
- [ ] T014 [US3] **(manual, usuario)** Crear el bucket privado compatible con S3 y unas credenciales limitadas a él, y cargar en GitHub los secretos `S3_ENDPOINT`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` (el usuario introduce los valores)
- [X] T015 [P] [US3] Crear docs/runbooks/restaurar-respaldo.md (research R9):
  - requisitos;
  - cómo listar y descargar respaldos (`aws s3 ls`, `aws s3 cp` con `--endpoint-url`);
  - **variante local**: `docker compose down`, copiar el archivo al volumen `descanso-data` (`docker run --rm -v descanso-data:/data -v "$PWD":/in alpine cp /in/<archivo>.db /data/sleep.db` y borrar `sleep.db-wal`/`-shm`), `docker compose up`, verificar;
  - **variante de producción**: **paso 0 obligatorio**, lanzar `Backup` a mano y esperar a que termine en verde, para no perder los cambios hechos después del respaldo que se va a restaurar (principio II). Luego `aws s3 presign` (expira en 15 min), Shell de Render, `wget -O /data/restore.db "<url>"`, `node -e "new (require('better-sqlite3'))('/data/restore.db').backup('/data/sleep.db').then(()=>console.log('ok'))"`, reiniciar el servicio, verificar y borrar `restore.db`;
  - cómo lanzar un respaldo manual;
  - aviso: los workflows programados se desactivan tras 60 días sin actividad, y cómo reactivarlos (riesgo R-02).

**Checkpoint**: el endpoint está probado y el workflow y el runbook escritos. La ejecución real
va en la Fase 8.

---

## Phase 6: User Story 4 - Entorno local en un solo comando (Priority: P2)

**Goal**: `docker compose up --build` levanta la app completa con datos persistentes.

**Independent Test**: clon limpio → comando → app en :3000; los datos sobreviven a
`down` + `up`.

- [X] T016 [US4] Crear compose.yaml en la raíz:
  - `services.app`: `build: .`, `ports: ["3000:3000"]`, `volumes: ["descanso-data:/data"]`, `environment: { DB_PATH: /data/sleep.db }`, `restart: unless-stopped`;
  - `volumes: { descanso-data: {} }`.

  Sin `APP_VERSION`, para que el pie muestre "dev" (FR-015).
- [X] T017 [US4] Verificar en local:
  1. `docker compose up --build -d` → `/api/health` responde `version:"dev"` y el contenedor queda `healthy`;
  2. crear una noche con la API y hacer `docker compose down` + `up -d` → la noche sigue;
  3. cronometrar la primera construcción (SC-007: < 10 min);
  4. `docker compose down`, sin `-v`, para no borrar el volumen.

---

## Phase 7: User Story 5 - Estado y versión visibles (Priority: P3)

**Goal**: badge en el README y versión en el pie de página.

**Independent Test**: el pie muestra los 7 primeros caracteres de la versión, o "dev".

- [X] T018 [P] [US5] Ampliar frontend/src/app/app.spec.ts. Deben **fallar** antes de T019:
  - con `HttpTestingController`, al responder `/api/health` con `{ok:true, version:'a6efe9b68d08a574233ce72d5ade7d40babfb739'}`, el `footer` muestra `a6efe9b`;
  - con `version:'dev'`, muestra `dev`;
  - si `/api/health` falla, el pie no rompe la app y no muestra versión.

  Usar `match` para descartar las peticiones de los componentes hijos.
- [X] T019 [US5] Añadir `health(): Observable<{ ok: boolean; time: string; version: string }>` en frontend/src/app/core/api.service.ts. En frontend/src/app/app.ts, añadir la signal `version`, cargada una vez con `api.health()`; si el valor tiene 40 caracteres hexadecimales se recorta a 7, y en caso contrario se usa tal cual. En frontend/src/app/app.html, añadir `<footer class="version muted small">Versión <span class="tabular">{{ version() }}</span></footer>`, que solo se muestra si hay versión. Estilo discreto en frontend/src/app/app.css (FR-017)
- [X] T020 [P] [US5] Actualizar README.md:
  - badge `Deploy` al principio (research R11);
  - sección "Entorno local": `docker compose up --build`;
  - "Desplegar": pipeline automático, secretos necesarios (enlace a specs/002-pipeline-ci-cd/contracts/pipeline.md) y plan de pago con disco;
  - "Respaldos": horario, retención, enlace al runbook.

  Sin reescribir el resto del README.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T021 Puerta de calidad local: `npm run lint` y `npm test` en backend/; `npm run lint`, `ng test --watch=false --browsers=ChromeHeadless` y `ng build` en frontend/; `docker build .` sin errores
- [ ] T022 Validación de extremo a extremo con quickstart.md §3–5, una vez hechas T006, T014 y T026:
  - PR bloqueado en rojo y desbloqueado en verde, con su duración (SC-001);
  - merge → despliegue verificado y versión en el pie (SC-002);
  - `Backup` manual → archivo en el bucket; 401 sin token;
  - restauración local con ese respaldo, cronometrada (SC-006);
  - 3 redespliegues con el dato de control intacto (SC-004);
  - despliegue fallido provocado con `Deploy` → *Run workflow* → `simular_fallo`: el job `deploy` falla, se ejecuta el rollback y la app sigue sirviendo la versión anterior (SC-003, quickstart §4).

  Anotar los resultados en el PR.

---

## Phase 9: Enmienda — despliegue en Fly.io (research R13)

**Purpose**: pagar por uso y a mes vencido en lugar de 7,25 $/mes fijos en Render (decisión del
usuario tras el merge de la 002). El resto del pipeline no cambia.

- [X] T023 [US2] Crear fly.toml en la raíz, que sustituye a render.yaml (borrado):
  - `app = "descanso-sleep"`, `primary_region = "gru"`;
  - `[build] image` de GHCR y `[env] DB_PATH`/`PORT`;
  - `[[mounts]] descanso_data → /data`;
  - `[http_service]` con `auto_stop_machines = "stop"`, `auto_start_machines = true` y `min_machines_running = 0`;
  - check `GET /api/health`;
  - `[deploy] strategy = "rolling"`;
  - `[[vm]] shared-cpu-1x` de 256 MB.
- [X] T024 [US2] Reescribir el job `deploy` de .github/workflows/deploy.yml:
  1. `setup-flyctl`;
  2. leer la versión actual en `/api/health`;
  3. `flyctl deploy --image …:<sha> --wait-timeout 5m0s`;
  4. exigir `version == sha` en ≤ 60 s;
  5. si falla, rollback con `flyctl deploy --image …:<prev>`.

  Añadir la entrada `workflow_dispatch.simular_fallo`, que despliega con `--env NODE_OPTIONS=--require=/no-existe.js` (SC-003). El único secreto es `FLY_API_TOKEN`.
- [X] T025 Fijar `APP_URL: https://descanso-sleep.fly.dev` en deploy.yml y backup.yml (ya no es secreto). Actualizar README (Opción A y árbol), el runbook (restauración en producción con `fly ssh console` y `fly apps restart`) y los artefactos de specs/002: spec (Clarifications y FR-006), research (R13, R5/R6 sustituidas, riesgos), plan, data-model, contracts/pipeline.md y quickstart
- [ ] T026 [US2] **(manual, usuario)** Con [`flyctl`](https://fly.io/docs/flyctl/install/) y `fly auth login`:
  1. `fly apps create descanso-sleep`;
  2. `fly volumes create descanso_data --size 1 --region gru --app descanso-sleep`;
  3. `fly secrets set BACKUP_TOKEN=<token> --stage --app descanso-sleep`;
  4. `fly tokens create deploy --app descanso-sleep`;
  5. en GitHub, `gh secret set FLY_API_TOKEN` y `gh secret set BACKUP_TOKEN`, con los valores que introduce el usuario.

  Si se llegó a crear el servicio en Render, eliminarlo para no pagarlo. Después, relanzar `Deploy` a mano.

## Dependencies & Execution Order

- **Setup (F1)**: T001 ∥ T002 (archivos distintos). Verificar T002 después de T001.
- **Foundational (F2)**: T003 → T004. Bloquea US2 (la verificación de versión) y US5.
- **US1 (F3)**: T005 no depende de nada; T006 conviene hacerla después de que el PR de la
  feature exista, para ver el check.
- **US2 (F4)**: T007 → T008 (mismo archivo). T009 ∥ T007. T010 necesita T009. El primer
  despliegue real necesita T002, T004, T007–T010.
- **US3 (F5)**: T011 → T012. T013 ∥ T011 y T012 (archivo distinto); T015 ∥ T013. La ejecución
  real necesita T010 (servicio con `BACKUP_TOKEN`) y T014.
- **US4 (F6)**: T016 necesita T001 y T002. T017 después de T016 y T004.
- **US5 (F7)**: T018 → T019, que necesita T004. T020 ∥ T018.
- **Polish (F8)**: T021 cuando todo el código esté hecho; T022 al final.

### Parallel Opportunities

- T001 ∥ T002; T009 ∥ T007; T011 ∥ T013 ∥ T015; T018 ∥ T020.

## Implementation Strategy

1. **MVP**: F1 + F2 + US1 (el PR bloqueante con caché). Ya tiene valor por sí mismo.
2. US2 (despliegue automático) y US3 (respaldos) antes del primer uso real de datos.
3. US4 y US5 son mejoras de experiencia de desarrollo y de visibilidad.
4. Las tareas manuales (T006, T010, T014) se agrupan en un único momento guiado de `/sdd-ship`.

## Notes

- Sin cambios de esquema (principio II).
- Ningún secreto en el repositorio ni en el chat: los valores los introduce el usuario con
  `gh secret set` o en la interfaz de cada proveedor.
