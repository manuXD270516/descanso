# Data Model: Línea base del tracker de descanso

**Fuente**: `backend/src/db.js` (esquema actual) y validaciones de `backend/src/routes/*`.
**Almacenamiento**: un único archivo SQLite (`DB_PATH`), `journal_mode = WAL`, `foreign_keys = ON`.
Esta feature **no cambia el esquema**.

## Convenciones

- Fechas de día: texto `YYYY-MM-DD`.
- Fechas/horas: texto ISO 8601 **con offset** (ej. `2026-09-11T23:15:00-04:00`), constitución III.
- `created_at`: `datetime('now')` de SQLite, en UTC y sin offset. Es de uso interno y no se
  expone en la UI.
- Duraciones: se calculan al leer (`duration_min`), no se guardan.

## Entidades

### Noche (`sleep_records`)

| Campo | Tipo | Nulo | Reglas |
|-------|------|------|--------|
| `id` | INTEGER PK autoincrement | no | |
| `date` | TEXT | no | `YYYY-MM-DD`; fecha de noche = día local de `bedtime` (FR-004). Hoy la calcula el cliente (DT-04). |
| `bedtime` | TEXT | no | ISO válido. |
| `wake_time` | TEXT | sí | ISO válido o NULL. Si no es NULL: `wake_time > bedtime` (duración > 0 min). |
| `notes` | TEXT | sí | Máx. 500 caracteres (se trunca). Vacío → NULL. |
| `created_at` | TEXT | no | Por defecto `datetime('now')`. |

Índice: `idx_sleep_date(date)`.
Derivado: `duration_min = round((wake_time − bedtime) / 60 s)`, o `null` si la noche está abierta.

**Estados**

```text
            crear sin wake_time              POST /wake o PUT con wake_time
 (nada) ─────────────────────────► ABIERTA ─────────────────────────────► CERRADA
            crear con wake_time                PUT con wake_time = null
 (nada) ──────────────────────────────────────────────────────► CERRADA ───► ABIERTA
```

**Invariante (FR-003, nuevo en esta feature)**: como máximo una fila con `wake_time IS NULL`.
Una transición que crearía una segunda noche abierta se rechaza con 409. Se aplica en el
servicio, sin cambiar el esquema (research D6).

### Siesta (`naps`)

| Campo | Tipo | Nulo | Reglas |
|-------|------|------|--------|
| `id` | INTEGER PK | no | |
| `date` | TEXT | no | `YYYY-MM-DD`; día local de `start_time` (FR-011). |
| `start_time` | TEXT | no | ISO válido. |
| `end_time` | TEXT | no | ISO válido; `end_time > start_time`. |
| `notes` | TEXT | sí | Máx. 500 caracteres. |
| `created_at` | TEXT | no | |

Índice: `idx_naps_date(date)`. Derivado: `duration_min`.

### Métrica (`metrics`)

| Campo | Tipo | Nulo | Reglas |
|-------|------|------|--------|
| `id` | INTEGER PK | no | |
| `name` | TEXT | no | Obligatorio tras `trim`; se trunca a 60 caracteres. |
| `type` | TEXT | no | `CHECK IN ('number','scale','boolean','text')`. |
| `unit` | TEXT | sí | Se trunca a 20 caracteres. |
| `min_value` | REAL | sí | En `scale`, obligatorio. |
| `max_value` | REAL | sí | En `scale`, obligatorio y `min < max`. |
| `color` | TEXT | no | `#RRGGBB`; si no es válido → `#5b6ee1`. |
| `sort_order` | INTEGER | no | Por defecto 0; entero. El orden de lectura es `sort_order, id`. |
| `archived` | INTEGER | no | 0/1. |
| `created_at` | TEXT | no | |

**Datos iniciales** (solo si la tabla está vacía, FR-025):

| name | type | unit | min | max | color | sort_order |
|------|------|------|-----|-----|-------|------------|
| Calidad del sueño | scale | — | 1 | 5 | `#5b6ee1` | 0 |
| Energía al despertar | scale | — | 1 | 5 | `#e8a33d` | 1 |
| Cafés | number | tazas | 0 | — | `#8a5a3c` | 2 |

**Estados**: ACTIVA ⇄ ARCHIVADA (`archived`); ARCHIVADA → eliminada (la UI solo ofrece
eliminar métricas archivadas; la API permite eliminar cualquiera).

### Valor de métrica (`metric_entries`)

| Campo | Tipo | Nulo | Reglas |
|-------|------|------|--------|
| `id` | INTEGER PK | no | |
| `metric_id` | INTEGER FK → `metrics.id` | no | `ON DELETE CASCADE` (FR-019). |
| `date` | TEXT | no | `YYYY-MM-DD` válido. |
| `value` | TEXT | no | Normalizado por tipo (ver abajo). |
| `created_at` | TEXT | no | |

Unicidad: `UNIQUE(metric_id, date)`; se escribe con upsert (FR-021). Índice: `idx_entries_date(date)`.

**Normalización de `value`**

| Tipo | Entrada aceptada | Se guarda |
|------|------------------|-----------|
| boolean | `true`, `'true'`, `1`, `'1'` → sí; cualquier otra cosa → no (DT-08) | `'1'` / `'0'` |
| number / scale | numérico dentro de `[min_value, max_value]` si están definidos | `String(n)` |
| text | cualquiera | texto, máx. 500 caracteres |

Las lecturas de valores (`/metrics/entries`) excluyen las métricas archivadas.

## Agregado derivado: Resumen (`GET /api/stats`)

No se almacena. Para el rango `[from, to]` por `date`:

- `days[]`: por fecha → `sleep_min` (suma de noches **cerradas**), `nap_min`, `naps`, `bedtime`
  y `wake_time` (los de la última noche procesada).
- `summary.nights`: días con `sleep_min > 0`.
- `summary.avg_sleep_min`: media redondeada de `sleep_min` de esos días.
- `summary.avg_nap_min`: media de `nap_min` de los días con siestas.
- `summary.total_naps`: número de siestas.
- `summary.avg_bedtime_min` / `avg_wake_min`: **media circular** (en minutos 0–1439) de la hora
  `HH:MM` escrita en el ISO (hora local de quien registró), o `null` si no hay noches.

## Relaciones

```text
metrics 1 ──── * metric_entries   (cascade delete)
sleep_records, naps: independientes; se relacionan con el resumen solo por `date`
```
