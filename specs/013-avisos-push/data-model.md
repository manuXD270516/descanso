# Data Model: Avisos push con la app cerrada (013)

Migración **`backend/src/migrations/011_avisos_push.js`** (research R16):
- solo *expand* (dos tablas nuevas y `ADD COLUMN` con `DEFAULT` o `NULL`), con respaldo previo del
  runner;
- idempotente (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` y `PRAGMA table_info` antes
  de cada `ADD COLUMN`, como `009_horario.js` y `010_rachas.js`).

## push_subscriptions (nueva)

Un dispositivo (navegador) con avisos activados. Credenciales del navegador: no se exportan (FR-028).

| Columna | Tipo | Regla |
|---------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `user_id` | INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE | Aislamiento; borrado con la cuenta (FR-007) |
| `session_hash` | TEXT NOT NULL REFERENCES sessions(id_hash) ON DELETE CASCADE | Sesión que lo activó: cerrarla borra el dispositivo (R8) |
| `endpoint` | TEXT NOT NULL UNIQUE | `CHECK (length(endpoint) <= 1024)`; host permitido (R6, validado en código) |
| `p256dh` | TEXT NOT NULL | base64url de 65 bytes (87 caracteres) |
| `auth` | TEXT NOT NULL | base64url de 16 bytes (22 caracteres) |
| `label` | TEXT NOT NULL | "<navegador> en <sistema>", ≤ 40 caracteres (`deviceLabel`, R8) |
| `created_at` | TEXT NOT NULL | ISO UTC de la activación (o de la reactivación del mismo `endpoint`) |
| `last_success_at` | TEXT NULL | ISO UTC del último envío aceptado por el servicio de push |

Índices: `idx_push_subscriptions_user (user_id)` y `idx_push_subscriptions_session (session_hash)`.

Reglas en el servidor:
- como mucho **5 por persona** (FR-006): contar en la misma transacción que el alta; el sexto → 409;
- alta idempotente por `endpoint` (`ON CONFLICT(endpoint) DO UPDATE SET user_id, session_hash, p256dh,
  auth, label, created_at`): el mismo navegador no se duplica y, si lo activa otra persona, pasa a ser
  suyo;
- 404 o 410 al enviar → `DELETE` de la fila (FR-007).

Se clasifica en el meta-test del esquema como tabla con `user_id`.

## reminder_deliveries (nueva)

Registro de cada aviso programado: reclamo, envío o descarte. Retención 90 días (FR-027).

| Columna | Tipo | Regla |
|---------|------|-------|
| `user_id` | INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE | |
| `kind` | TEXT NOT NULL | `CHECK (kind IN ('prepare','bedtime','wake_check'))` |
| `night_date` | TEXT NOT NULL | `AAAA-MM-DD`, la fecha de la noche (principio III) |
| `due_at` | TEXT NOT NULL | Instante previsto en ISO 8601 **con el desfase de la zona** (`2026-10-25T02:30:00+02:00`, R3) |
| `status` | TEXT NOT NULL | `CHECK (status IN ('claimed','sent','skipped','failed'))` |
| `reason` | TEXT NULL | `CHECK (reason IS NULL OR reason IN ('late','night_open','muted','dnd','expired','timeout','error','no_devices','interrupted'))` |
| `updated_at` | TEXT NOT NULL | ISO UTC del último cambio de estado |

`PRIMARY KEY (user_id, kind, night_date)`: como mucho un aviso por persona, tipo y noche (FR-010).
Índice `idx_reminder_deliveries_updated (updated_at)` para la salud de administración. Se clasifica en
el meta-test como tabla con `user_id`. No se exporta (research R15).

### Transiciones

```text
(no existe) ──reclamo en ventana (INSERT … ON CONFLICT DO NOTHING)──▶ claimed
(no existe) ──vencido fuera de ventana──▶ skipped (late)
claimed ──noche abierta (prepare/bedtime)──▶ skipped (night_open)
claimed ──noche ≤ muted_until──▶ skipped (muted)
claimed ──ahora dentro de "No molestar"──▶ skipped (dnd)
claimed ──≥ 1 dispositivo aceptó──▶ sent
claimed ──ninguno aceptó──▶ failed (expired | timeout | error | no_devices)
claimed ──más de 5 min sin terminar (proceso caído)──▶ failed (interrupted)
```

Ningún estado final (`sent`, `skipped`, `failed`) vuelve a `claimed`: nada se reintenta.

## user_settings (ampliada)

| Columna | Tipo | Regla |
|---------|------|-------|
| `push_prepare` | INTEGER NOT NULL DEFAULT 1 | `CHECK (push_prepare IN (0, 1))` |
| `push_bedtime` | INTEGER NOT NULL DEFAULT 1 | `CHECK (push_bedtime IN (0, 1))` |
| `push_wake_check` | INTEGER NOT NULL DEFAULT 1 | `CHECK (push_wake_check IN (0, 1))` |
| `dnd_start_min` | INTEGER NULL | `CHECK (dnd_start_min IS NULL OR dnd_start_min BETWEEN 0 AND 1439)` |
| `dnd_end_min` | INTEGER NULL | `CHECK (dnd_end_min IS NULL OR dnd_end_min BETWEEN 0 AND 1439)` |
| `muted_until` | TEXT NULL | `AAAA-MM-DD`: fecha de la noche hasta la que rige "Silenciar hoy" |

Reglas en el servidor (`PUT /api/push/preferences`): `dnd_start_min` y `dnd_end_min` van juntos (los
dos o ninguno) y son distintos; si no → 400 "La franja de No molestar necesita inicio y fin
distintos". Las filas existentes quedan con los tres tipos activos, sin "No molestar" y sin silencio
(aclaración del 2026-10-08).

## Reutilizadas (sin cambios de esquema)

- `users.timezone` (008): zona IANA del perfil; `NULL` = sin fijar → sin avisos (research R14).
- `sessions` (004): `id_hash` y `expires_at` (solo se envía a dispositivos con sesión vigente).
- `schedule_versions`, `schedule_days`, `pauses` y `user_settings.lead_min` (010).
- `sleep_records` (006/010): noche abierta (`wake_time IS NULL`) y su `bedtime`.

## Derivados (no persistidos)

- **Hoy de la persona**: fecha de pared de `now` en `users.timezone`.
- **Noche de horario de una noche registrada**: `date` si la hora de pared de `bedtime` ≥ 12:00; si no,
  `date − 1` (011-R2).
- **Vencimientos de la noche N** (research R2), con la versión vigente en N y el día `weekday(N)` activo,
  N fuera de pausa:
  - acostarse = N (o N + 1 si `bed_min` < 720) a `bed_min`;
  - `prepare` = acostarse − `lead_min` (en minutos de pared); `bedtime` = acostarse;
  - `wake_check` = N + 1 a `wake_min` + 60 min, solo con una noche abierta cuya noche de horario es N.
  - Cada uno pasa a instante con `zonedToUtc` (inexistente → primera hora válida posterior; ambigua →
    primera ocurrencia).
- **Ventana de descarte** (`windows.js`): 10 min (`prepare`, `bedtime`), 60 min (`wake_check`); es
  también el `TTL` del envío.
- **Dentro de "No molestar"**: con `m` = minuto de pared actual, `start < end` → `start ≤ m < end`;
  `start > end` → `m ≥ start || m < end`.
- **Silenciado**: `night_date ≤ muted_until`.
- **Salud de administración**: `pending_dues` (vencimientos en ventana sin entrega en el último tick,
  en memoria), `skipped_24h` y `failed_24h` (`COUNT(*)` por `status` con `updated_at` en las últimas
  24 h), `last_tick_at` (en memoria).
