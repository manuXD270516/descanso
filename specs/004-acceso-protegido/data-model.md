# Data Model: Acceso protegido y portabilidad (004)

Dos migraciones nuevas sobre las de 003. Ambas cumplen expand/contract: el código de 003 sigue
funcionando (FR-020).

## Migración 003 `003_usuarios_y_sesiones.sql` (aditiva)

### `users`

| Columna | Tipo | Reglas |
|---------|------|--------|
| `id` | INTEGER PK | El propietario es siempre `1` (lo crea la migración). |
| `email` | TEXT NULL `COLLATE NOCASE` UNIQUE | NULL hasta el alta. Se guarda recortado y en minúsculas. |
| `password_hash` | TEXT NULL | `scrypt$N$r$p$salt$hash`; NULL = alta pendiente. |
| `role` | TEXT NOT NULL `CHECK (role IN ('owner'))` | Solo `owner` en 004 (008 ampliará el CHECK con una migración). |
| `created_at` | TEXT NOT NULL | ISO 8601 UTC. |

Fila inicial: `(1, NULL, NULL, 'owner', now)`.

### `sessions`

| Columna | Tipo | Reglas |
|---------|------|--------|
| `id_hash` | TEXT PK | `sha256` hex del identificador que va en la cookie. |
| `user_id` | INTEGER NOT NULL → `users(id)` ON DELETE CASCADE | |
| `created_at` | TEXT NOT NULL | ISO 8601 UTC. |
| `last_seen_at` | TEXT NOT NULL | Se actualiza como máximo una vez por hora. |
| `expires_at` | TEXT NOT NULL | `last_seen_at + 30 días`. |

Índice `idx_sessions_user(user_id)`.

### `auth_setup`

| Columna | Tipo | Reglas |
|---------|------|--------|
| `id` | INTEGER PK `CHECK (id = 1)` | Una sola fila. |
| `token_hash` | TEXT NULL | `sha256` hex del último `OWNER_SETUP_TOKEN` visto al arrancar. |
| `used_at` | TEXT NULL | NULL = el código aún sirve para el alta. |

Fila inicial `(1, NULL, NULL)`.

**Transiciones** (al arrancar, `auth/bootstrap.js`):

```text
token configurado y sha256 ≠ token_hash → token_hash = nuevo; used_at = NULL;
                                            users[1].password_hash = NULL; DELETE sessions
token configurado e igual                 → sin cambios
token no configurado                      → sin cambios
```

**Alta** (`POST /api/auth/setup`): requiere `used_at IS NULL` y `users[1].password_hash IS NULL`
y token correcto → `email`, `password_hash`, `used_at = now`, crea sesión.

## Migración 004 `004_user_id_en_datos.js` (reconstrucción verificada, `foreignKeys: false`)

`sleep_records`, `naps` y `metrics` se reconstruyen con la nueva columna:

```sql
user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE
```

**Verificación dentro de la migración** (FR-021, SC-003): para cada tabla, el recuento y la huella
de las columnas originales (`SELECT <cols> ORDER BY id`) coinciden antes y después. Además,
`PRAGMA foreign_key_check` vacío antes del commit y recuento de `metric_entries` intacto.

**Índices tras la reconstrucción**:

| Índice | Definición |
|--------|------------|
| `idx_sleep_date` | `sleep_records(date)` (se recrea) |
| `idx_naps_date` | `naps(date)` (se recrea) |
| `ux_sleep_one_open` | `UNIQUE sleep_records(user_id) WHERE wake_time IS NULL`. **Mismo nombre** que en 003, ahora por usuario (FR-019) |

`metric_entries` no cambia (pertenece al usuario a través de `metric_id`). Los índices por
`user_id` para consultas llegan con el filtrado por usuario de 008.

`user_settings` no se crea en 004 (nadie la usa todavía); la crea 005 con sus columnas.

## Contrato del runner (extensión de `specs/003-fundaciones-datos/contracts/migraciones.md`)

Una migración `.js` puede exportar `foreignKeys: false`:

1. `PRAGMA foreign_keys = OFF` fuera de la transacción;
2. transacción inmediata: `up(db)` → `PRAGMA foreign_key_check` (vacío o error) → registro;
3. `PRAGMA foreign_keys = ON` en `finally`.

## Estado en memoria (no persistido)

- Rate limit: `Map<'ip:…' | 'email:…', number[]>` de marcas de fallos en los últimos 15 min.
- Semáforo de hash: cola de promesas de concurrencia 1.
- Hash ficticio para emails inexistentes, calculado al arrancar.
