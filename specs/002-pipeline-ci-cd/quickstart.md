# Quickstart: validar el pipeline

Referencias: [spec](./spec.md), [contrato del pipeline](./contracts/pipeline.md),
[cambios de API](./contracts/openapi-delta.yaml), [research](./research.md).

## 0. Configuración única (la hace el mantenedor, con confirmación)

1. Hacer público el repositorio y proteger `master`: exigir el check `quality`, que la rama esté
   al día, e integrar solo por PR (R1).
2. Crear el bucket privado compatible con S3 y unas credenciales limitadas a él (R8).
3. Crear o actualizar el servicio en Render desde `render.yaml`, con plan de pago, disco en
   `/data` y `BACKUP_TOKEN` (R5).
4. Copiar el deploy hook y crear una API key en Render.
5. Cargar los secretos de [contracts/pipeline.md](./contracts/pipeline.md) en GitHub.
6. Tras el primer `publish`, marcar como **público** el paquete de GHCR `descanso` (R2).

## 1. Entorno local en un comando (US4, SC-007)

```bash
docker compose up --build
```

- http://localhost:3000 abre la app y el pie de página muestra `dev`.
- `curl localhost:3000/api/health` → `{"ok":true,...,"version":"dev"}`.
- Registrar una noche, ejecutar `docker compose down` y luego `docker compose up`: la noche sigue
  ahí.

## 2. Tests automatizados

```bash
cd backend && npm test      # incluye version en /api/health y /api/admin/backup (401/404/200)
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless   # pie de página
```

## 3. Validación de PR (US1)

1. Abrir un PR con un test roto: `quality` queda en rojo y el botón de merge bloqueado.
2. Arreglarlo: queda en verde y se puede integrar. Anotar la duración (SC-001: < 5 min).

## 4. Publicación y despliegue (US2, US5)

1. Integrar el PR. El workflow `Deploy` ejecuta `quality`, luego `publish` y luego `deploy`.
2. En GHCR aparecen `:<sha>` y `:latest` con el mismo digest.
3. `curl $APP_URL/api/health` → `version` es igual al SHA del merge; el pie muestra los 7
   primeros caracteres (SC-002).
4. El badge del README muestra el estado del último `Deploy`.

**Despliegue fallido (SC-003)**, opcional y sin tocar código:
1. En Render, definir temporalmente `NODE_OPTIONS=--require=/no-existe.js`, que impide arrancar
   a Node.
2. Relanzar `Deploy` y comprobar que el job `deploy` falla en ≤ 60 s + tiempo de arranque, y que
   la app sigue sirviendo la versión anterior.
3. Quitar la variable y relanzar.

## 5. Respaldos y restauración (US3)

1. Actions → `Backup` → *Run workflow*. En el bucket aparece `descanso/<timestamp>.db` y el
   resumen del job indica `integrity_check: ok`.
2. `curl -i $APP_URL/api/admin/backup` sin token → `401`.
3. Seguir `docs/runbooks/restaurar-respaldo.md`, variante local, con ese respaldo:
   1. registrar un dato de control en producción antes del respaldo;
   2. restaurar en el entorno local;
   3. comprobar que el dato aparece, y cronometrar el proceso (SC-006: < 15 min).
4. Redesplegar 3 veces (Actions → `Deploy` → *Run workflow*) y comprobar que el dato de control
   sigue ahí (SC-004).
