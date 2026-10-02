# Data Model: Multiusuario con perfiles (008)

Una migración nueva: `005_multiusuario.js` (`foreignKeys: false`). Es compatible con el código de
004 (expand/contract).

## `users` (reconstruida, copia verificada)

| Columna | Tipo | Reglas |
|---------|------|--------|
| `id` | INTEGER PK | El propietario sigue siendo `1`. |
| `email` | TEXT NULL `COLLATE NOCASE` UNIQUE | Normalizado (recortado, minúsculas). NULL solo para el propietario antes del alta. |
| `password_hash` | TEXT NULL | Igual que en 004. |
| `role` | TEXT NOT NULL `CHECK (role IN ('owner','user'))` | `owner` solo para `id = 1`. |
| `display_name` | TEXT NULL | 1–60 caracteres. Al migrar: parte local del email del propietario (o NULL). |
| `timezone` | TEXT NULL | Identificador IANA válido o `UTC`; NULL = sin fijar. |
| `consent_version` | TEXT NULL | Versión de la política aceptada (NULL para el propietario existente). |
| `consent_at` | TEXT NULL | ISO 8601 UTC. |
| `reset_notice_at` | TEXT NULL | Fecha del último restablecimiento pendiente de mostrar. |
| `created_at` | TEXT NOT NULL | Se conserva. |

Verificación de la copia: recuento y huella de `id, email, password_hash, role, created_at`.

## `user_settings` (nueva)

| Columna | Tipo | Reglas |
|---------|------|--------|
| `user_id` | INTEGER PK → `users(id)` ON DELETE CASCADE | |
| `sleep_goal_min` | INTEGER NOT NULL DEFAULT 480 `CHECK (sleep_goal_min BETWEEN 240 AND 720)` | Objetivo de sueño (4–12 h). |
| `updated_at` | TEXT NOT NULL | |

Al migrar se crea la fila del propietario. Al registrar se crea la del usuario nuevo. Las
features 005, 006, 010 y 011 añadirán columnas aquí.

## `invites` (nueva)

| Columna | Tipo | Reglas |
|---------|------|--------|
| `id` | INTEGER PK | Para listar y revocar. |
| `token_hash` | TEXT NOT NULL UNIQUE | `sha256` hex. |
| `created_by` | INTEGER NOT NULL → `users(id)` ON DELETE CASCADE | Siempre el propietario. |
| `created_at` | TEXT NOT NULL | |
| `expires_at` | TEXT NOT NULL | `created_at + 72 h`. |
| `used_by` | INTEGER NULL → `users(id)` ON DELETE CASCADE | Al borrar la cuenta del invitado desaparece su rastro. |
| `used_at` | TEXT NULL | |
| `revoked_at` | TEXT NULL | |

Estado derivado: `pendiente` (sin usar, sin revocar, no caducada), `usada`, `revocada` o `caducada`.

## `password_resets` (nueva)

| Columna | Tipo | Reglas |
|---------|------|--------|
| `token_hash` | TEXT PK | `sha256` hex. |
| `user_id` | INTEGER NOT NULL → `users(id)` ON DELETE CASCADE | Solo usuarios `role = 'user'`. |
| `created_by` | INTEGER NOT NULL → `users(id)` ON DELETE CASCADE | Propietario. |
| `expires_at` | TEXT NOT NULL | `+ 30 min`. |
| `used_at` | TEXT NULL | |

Generar un enlace nuevo invalida los anteriores sin usar de esa persona (`used_at = now`).

## `audit_log` (nueva)

| Columna | Tipo | Reglas |
|---------|------|--------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `user_id` | INTEGER NOT NULL → `users(id)` ON DELETE CASCADE | Persona afectada. |
| `actor_user_id` | INTEGER NULL → `users(id)` ON DELETE SET NULL | Quién actuó. |
| `action` | TEXT NOT NULL `CHECK (action IN ('reset_link_created','password_reset'))` | |
| `created_at` | TEXT NOT NULL | |

## Tablas existentes

- `sleep_records`, `naps` y `metrics` ya tienen `user_id NOT NULL DEFAULT 1 → users ON DELETE CASCADE` (004).
  **008 siempre envía `user_id`**; la contracción del `DEFAULT` va en un despliegue posterior (R3).
- `metric_entries` pertenece al usuario a través de `metrics` (CASCADE).
- `sessions` ya tiene `user_id` (CASCADE).
- `ux_sleep_one_open(user_id, (wake_time IS NULL)) WHERE wake_time IS NULL` ya es por usuario (004).

## Clasificación para el meta-test de esquema (R9)

| Tipo | Tablas |
|------|--------|
| Con `user_id` | `sleep_records`, `naps`, `metrics`, `sessions`, `user_settings`, `password_resets`, `audit_log` |
| Hija justificada | `metric_entries` (→ `metrics.user_id`), `invites` (→ `created_by`/`used_by`) |
| Identidad | `users` |
| Sistema | `schema_migrations`, `auth_setup`, `sqlite_sequence` |

## Borrado de cuenta: qué desaparece

`DELETE FROM users WHERE id = ?` → por CASCADE: `sessions`, `sleep_records`, `naps`, `metrics` →
`metric_entries`, `user_settings`, `password_resets`, `audit_log` (como afectado), `invites`
creadas (solo propietario) o usadas. `audit_log.actor_user_id` → NULL donde actuó.
