# Data Model: Fundaciones de datos (003)

El esquema de negocio **no cambia**: se añade una tabla de control y un índice. Ambos son
aditivos (expand), así que la versión anterior sigue funcionando (FR-012).

## Tablas existentes (versión 1 = línea base)

Son idénticas a las de `backend/src/db.js` antes de 003 (ver `specs/001-linea-base/data-model.md`):
`sleep_records`, `naps`, `metrics`, `metric_entries` y los índices `idx_sleep_date`,
`idx_naps_date` e `idx_entries_date`. Pasan a crearse desde `migrations/001_esquema_inicial.sql`.

## Nueva: `schema_migrations`

La crea el runner (no una migración) con `CREATE TABLE IF NOT EXISTS`, **después** del respaldo previo,
para que el respaldo sea una copia exacta del estado anterior.

| Columna | Tipo | Reglas |
|---------|------|--------|
| `version` | INTEGER PK | Prefijo numérico del archivo (`001` → 1). Único, creciente, sin huecos. |
| `name` | TEXT NOT NULL | Nombre del archivo sin extensión (`001_esquema_inicial`). |
| `checksum` | TEXT NOT NULL | SHA-256 hex del contenido con fin de línea `\n` y sin BOM (research R3). |
| `applied_at` | TEXT NOT NULL | ISO 8601 con desfase (UTC, `Z`), principio III. |

**Reglas**:

- Una fila se inserta en la **misma transacción** que la migración (FR-002).
- Una fila nunca se actualiza ni se borra.
- Si hay versiones registradas que no existen en disco (una versión más nueva tras un rollback),
  se ignoran con un aviso en el log: la versión anterior arranca igual (caso límite de la spec).
- Si un archivo en disco con versión registrada tiene otra huella → error
  `La migración 002_una_noche_abierta cambió después de aplicarse (checksum distinto). Restaura el archivo original.`
  y el arranque se detiene (FR-004).

## Nuevo índice: `ux_sleep_one_open` (migración 002)

```sql
CREATE UNIQUE INDEX ux_sleep_one_open ON sleep_records(wake_time IS NULL) WHERE wake_time IS NULL;
```

- Como máximo una fila de `sleep_records` con `wake_time IS NULL` (FR-019).
- **Precondición** comprobada por la migración: hay 0 o 1 noches abiertas. Si hay más, se aborta con
  `Hay N noches abiertas (id 12 del 2026-09-20, id 15 del 2026-09-21). Cierra o borra las sobrantes y vuelve a desplegar.`,
  sin tocar datos (FR-020).

## Validaciones nuevas (no cambian el esquema)

| Entidad | Campo | Regla | Error |
|---------|-------|-------|-------|
| Noche | `date` | `date` = día local de `bedtime` (10 primeros caracteres del ISO) al crear y editar | 400 `La fecha de la noche debe ser {esperada} (el día en que te acostaste)` |
| Siesta | `date` | `date` = día local de `start_time` al crear y editar | 400 `La fecha de la siesta debe ser {esperada} (el día en que empezó)` |
| Valor de métrica sí/no | `value` | `true`/`'true'`/`1`/`'1'` → `'1'`; `false`/`'false'`/`0`/`'0'` → `'0'`; otro → error | 400 `El valor debe ser sí o no` |
| Filtros de consulta | `from`, `to` | Fecha real de calendario `AAAA-MM-DD`; `from ≤ to` | 400 `from debe ser una fecha AAAA-MM-DD válida` / `from no puede ser posterior a to` |
| Estadísticas | `from`, `to` | Obligatorios, con las reglas anteriores | 400 `from y to son obligatorios (AAAA-MM-DD)` |

Los datos existentes que incumplen estas reglas **no se modifican** (FR-021).

## Archivos en el volumen

| Ruta | Contenido | Retención |
|------|-----------|-----------|
| `{dir(DB_PATH)}/backups/pre-NNN.db` | Copia completa (`VACUUM INTO`) justo antes de aplicar la versión NNN | Las 3 de versión más alta |

## Estado de almacenamiento (no persistido)

`{ status: 'ok' | 'warn' | 'unknown', used_pct: number | null }`, calculado del sistema de
archivos donde vive `DB_PATH` en cada consulta (`statfs` es una llamada barata). `warn` si `used_pct > 70`.
