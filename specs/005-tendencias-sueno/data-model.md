# Data Model: Tendencias y sueño pendiente (005)

Dos migraciones nuevas. No hay tablas nuevas de datos: el dashboard se calcula.

## Migración `006_contraer_user_id.js` (`foreignKeys: false`, copia verificada)

`sleep_records`, `naps` y `metrics` se reconstruyen con:

```sql
user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE   -- sin DEFAULT 1
```

- Verificación: recuento + huella de **todas** las columnas (incluido `user_id`) idénticos;
  `metric_entries` intacta; `foreign_key_check` vacío; `sqlite_sequence` conservado.
- Índices recreados: `idx_sleep_date`, `idx_naps_date` y
  `ux_sleep_one_open ON sleep_records(user_id, (wake_time IS NULL)) WHERE wake_time IS NULL`.
- Efecto: un `INSERT` sin `user_id` falla con NOT NULL (antes asignaba al propietario en silencio).

## Migración `007_objetivo_y_bienvenida.sql` (copia verificada de una hoja)

`user_settings` reconstruida:

| Columna | Tipo | Reglas |
|---------|------|--------|
| `user_id` | INTEGER PK → `users(id)` ON DELETE CASCADE | Sin cambios. |
| `sleep_goal_min` | INTEGER NOT NULL DEFAULT **420** CHECK 240..720 | Al migrar: 480 → 420; el resto se conserva. |
| `goal_customized` | INTEGER NOT NULL DEFAULT 0 | 1 si el usuario fijó su objetivo (perfil, dashboard o bienvenida). Al migrar: `sleep_goal_min <> 480`. |
| `onboarded_at` | TEXT NULL | Fecha en que vio la bienvenida (la completara o la saltara). |
| `updated_at` | TEXT NOT NULL | Sin cambios. |

## Día de sueño (calculado, no persistido)

| Campo | Tipo | Regla |
|-------|------|-------|
| `date` | AAAA-MM-DD | Fecha de la noche (principio III). |
| `night_min` | int \| null | Suma de las noches **cerradas** con esa fecha. |
| `nap_min` | int \| null | Suma de las siestas con esa fecha. |
| `total_min` | int \| null | `night_min + nap_min`; `null` si no hay dato. |
| `status` | `data` \| `none` \| `in_progress` | `in_progress` si hay una noche abierta con esa fecha y ningún dato cerrado. |

## Respuesta del dashboard

Ver `contracts/openapi-delta.yaml`. Los cálculos están en `research.md` (R1).
