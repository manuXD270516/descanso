# Data Model: Rachas de constancia (011)

Migración **`backend/src/migrations/010_rachas.js`**:
- solo *expand* (`ADD COLUMN` con `DEFAULT` o `NULL` y una tabla nueva), con respaldo previo del runner;
- idempotente (`CREATE TABLE IF NOT EXISTS` y `PRAGMA table_info` antes de cada `ADD COLUMN`, como
  `009_horario.js`).

## user_settings (ampliada)

| Columna | Tipo | Regla |
|---------|------|-------|
| `streak_enabled` | INTEGER NOT NULL DEFAULT 0 | `CHECK (streak_enabled IN (0, 1))`; desactivada por defecto (FR-017) |
| `streak_margin_min` | INTEGER NOT NULL DEFAULT 30 | `CHECK (streak_margin_min BETWEEN 15 AND 60)` (FR-008) |
| `streak_since` | TEXT NULL | `AAAA-MM-DD` de la última activación; la racha se calcula desde esa noche |
| `streak_offered_at` | TEXT NULL | ISO UTC; no NULL = la oferta ya se respondió (no vuelve a salir) |
| `streak_best` | INTEGER NOT NULL DEFAULT 0 | `CHECK (streak_best >= 0)`; solo crece (FR-009) |
| `streak_total` | INTEGER NOT NULL DEFAULT 0 | `CHECK (streak_total >= 0)`; solo crece (FR-009) |
| `streak_total_base` | INTEGER NOT NULL DEFAULT 0 | `CHECK (streak_total_base >= 0)`; `streak_total` en la última activación |
| `streak_summary_dismissed` | TEXT NULL | `AAAA-MM-DD` del lunes de la semana cuyo resumen se descartó (FR-025) |

Las filas existentes quedan con la racha desactivada, margen 30 y contadores a 0.

## streak_achievements (nueva)

| Columna | Tipo | Regla |
|---------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `user_id` | INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE | Aislamiento; borrado con la cuenta |
| `key` | INTEGER NOT NULL | `CHECK (key IN (7, 21, 66, 100, 180, 365))` |
| `achieved_on` | TEXT NOT NULL | `AAAA-MM-DD`, el "hoy" de la escritura que lo desbloqueó; no cambia nunca |
| `wake_spread_min` | INTEGER NOT NULL | `CHECK (wake_spread_min >= 0)`; σ circular de la hora de levantarse de la racha, congelada |
| `seen_at` | TEXT NULL | ISO UTC; NULL = la tarjeta aún no se descartó |
| `created_at` | TEXT NOT NULL | ISO UTC |

`UNIQUE (user_id, key)`: un hito por persona, desbloqueo idempotente (`INSERT OR IGNORE`). Nunca se
actualiza salvo `seen_at`, ni se borra salvo con la cuenta (FR-013). Se clasifica en el meta-test del
esquema como tabla con `user_id`.

## Reutilizadas (sin cambios)

- `sleep_records`: `date`, `bedtime`, `wake_time`, `wake_logged_at`, `wake_from_proposal` (010).
- `schedule_versions` y `schedule_days` (010): versión vigente en N y día de la semana de N.
- `pauses` (010): N en pausa si `start_date ≤ N ≤ end_date`.

## Derivados (no persistidos)

- **Noche de constancia de una noche registrada**: `date` si la hora de pared de `bedtime` ≥ 12:00;
  si no, `date − 1` (research R2).
- **Horario activo en N**: versión vigente en N (mayor `effective_from` ≤ N, a igualdad id mayor) con
  el día `weekday(N)` activo, y N fuera de pausa.
- **Minutos de pared desde N** de un ISO: `díasEntre(N, fecha del ISO) × 1440 + HH × 60 + MM`.
- **Estado de N** (research R1, R3):

  | Situación | Estado | Motivo |
  |-----------|--------|--------|
  | Cerrada, sin horario activo (o en pausa) | cumplido | — |
  | Cerrada, acostarse > agendada + margen | no cumplido | `late_bed` |
  | Cerrada, `wake_from_proposal = 1` | no cumplido | `proposal` |
  | Cerrada, levantarse > agendada + margen | no cumplido | `late_wake` |
  | Cerrada, ambas a tu hora | cumplido | — |
  | Sin cerrar, en pausa | en pausa | — |
  | Sin cerrar, N ≥ hoy − 1 | aún no | — |
  | Sin cerrar, N < hoy − 1 | no cumplido | `no_record` |
  | N anterior a `streak_since` (solo en la semana mostrada) | off (neutro) | — |

  Marca `late_logged` ("Anotado después") si `wake_logged_at − wake_time > 60 min`.
- **Racha viva, `current`, `total`, `spreadMin`**: ver research R1.
- **Mostrado**: `best = max(streak_best, current)`; `total = max(streak_total, streak_total_base +
  total calculado)`.

## Transiciones

```text
desactivada ──"Sí, activarla" (since = hoy, total_base = total)──▶ activada
activada ──desactivar──▶ desactivada (best, total y logros se conservan)
logro: (no existe) ──trinquete con current ≥ key──▶ desbloqueado (seen_at NULL) ──descartar──▶ visto
```
