# Data Model: Pipeline de construcción y despliegue continuo

**Esta feature no cambia el esquema de la base** (principio II): no hay migraciones. Las
entidades de abajo son artefactos operativos y viven fuera de SQLite.

## Imagen publicada

| Atributo | Valor | Reglas |
|----------|-------|--------|
| Repositorio | `ghcr.io/manuxd270516/descanso` | En minúsculas; paquete público (research R2). |
| Etiqueta de versión | SHA completo del commit (40 hex) | Inmutable; se despliega siempre por esta etiqueta. |
| Etiqueta móvil | `latest` | Apunta al mismo digest que la de versión del último merge. |
| `APP_VERSION` (env) | SHA completo | Se inyecta como build-arg; ausente → `"dev"`. |

## Despliegue (Render)

| Atributo | Valor |
|----------|-------|
| `id` | Lo devuelve el deploy hook (200). Si responde 202 (en cola), no hay id. |
| `status` | `created` → `build_in_progress` → `update_in_progress` → `live`. Estados de fallo: `build_failed`, `update_failed`, `canceled`, `deactivated`. |
| Imagen | `ghcr.io/manuxd270516/descanso:<sha>` (parámetro `imgURL`). |

**Criterio de éxito** (FR-007): `status == live` **y** `GET /api/health` → `{ ok: true, version: <sha> }`
en ≤ 60 s desde que el despliegue está `live`.

## Respaldo

| Atributo | Valor | Reglas |
|----------|-------|--------|
| Clave | `descanso/<YYYY-MM-DDTHHMMSSZ>.db` | Hora UTC de la ejecución; ordenable alfabéticamente. |
| Contenido | Archivo SQLite completo | Generado con la API de backup online (consistente). `PRAGMA integrity_check` = `ok` antes de subirlo. |
| Ubicación | Bucket privado compatible con S3 (`S3_BUCKET`) | Sin acceso público (FR-020). |
| Retención | 14 días | Se borra lo que tenga `LastModified` de más de 14 días, **solo** si la subida del día terminó bien (FR-011, FR-013). |

## Token de respaldo

| Atributo | Valor | Reglas |
|----------|-------|--------|
| `BACKUP_TOKEN` | 64 caracteres hex (`openssl rand -hex 32`) | Se configura en Render (servicio) y en GitHub (secreto). Se compara en tiempo constante. Si no está definido en el servicio, el endpoint no existe (404). |

## Versión

| Contexto | Valor mostrado |
|----------|----------------|
| `/api/health` → `version` | SHA completo, o `"dev"`. |
| Pie de página | 7 primeros caracteres del SHA, o `dev`. |
