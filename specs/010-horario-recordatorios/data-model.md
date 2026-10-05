# Data Model: Mi horario de sueño y recordatorios (010)

Migración **`backend/src/migrations/009_horario.js`**:
- solo *expand* (tablas nuevas y `ADD COLUMN`), con respaldo previo del runner;
- idempotente (`CREATE TABLE IF NOT EXISTS` y `PRAGMA table_info` antes de cada `ADD COLUMN`).

## schedule_versions (nueva)

| Columna | Tipo | Regla |
|---------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | También es el `SEQUENCE` del calendario (siempre crece) |
| `user_id` | INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE | Aislamiento |
| `effective_from` | TEXT NOT NULL | `AAAA-MM-DD`; índice `(user_id, effective_from, id)`. Varias el mismo día: vigente = la de id mayor |
| `created_at` | TEXT NOT NULL | ISO UTC |

## schedule_days (nueva, hija de schedule_versions)

| Columna | Tipo | Regla |
|---------|------|-------|
| `version_id` | INTEGER NOT NULL REFERENCES schedule_versions(id) ON DELETE CASCADE | |
| `weekday` | INTEGER NOT NULL | `CHECK (0..6)`, día de la **noche** (0 = domingo); PK `(version_id, weekday)` |
| `bed_min` | INTEGER NOT NULL | `CHECK (0..1439)`; < 720 → después de medianoche (día siguiente) |
| `wake_min` | INTEGER NOT NULL | `CHECK (0..1439)`; mañana siguiente a la noche |
| `active` | INTEGER NOT NULL DEFAULT 1 | `CHECK (0, 1)` |

Siempre 7 filas por versión. Se clasifica en el meta-test como hija de `schedule_versions`.

## pauses (nueva)

| Columna | Tipo | Regla |
|---------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `user_id` | INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE | |
| `start_date` / `end_date` | TEXT NOT NULL | `AAAA-MM-DD`; `CHECK (end_date >= start_date)` |
| `created_at` | TEXT NOT NULL | |

Reglas en el servidor (transacción):
- inicio ≥ hoy;
- como máximo 14 días, ambos incluidos;
- sin solapes (409);
- menos de 2 pausas con inicio en los 30 días anteriores al nuevo inicio.

## user_settings (ampliada)

| Columna | Tipo | Regla |
|---------|------|-------|
| `lead_min` | INTEGER NOT NULL DEFAULT 30 | `CHECK (lead_min BETWEEN 15 AND 60)` |

## sleep_records (ampliada)

| Columna | Tipo | Regla |
|---------|------|-------|
| `wake_logged_at` | TEXT NULL | ISO UTC de cuándo se registró el despertar; lo fija el servidor |
| `wake_from_proposal` | INTEGER NOT NULL DEFAULT 0 | 1 si se confirmó la hora propuesta sin cambiarla |

Las noches existentes quedan con `NULL` y 0, es decir, sin origen "Anotado después".

## Derivados (no persistidos)

- **Versión vigente en D**: la de mayor `effective_from` ≤ D y, a igualdad, la de id mayor.
- **Origen de una noche**: `'late'` ("Anotado después") si `wake_logged_at − wake_time > 60 min`; si
  no, `'manual'`.
- **Pausa activa en D**: hay alguna con `start_date ≤ D ≤ end_date`.
- **Instante de levantarse de la noche N**: fecha N + 1 a `wake_min`, en la hora local del navegador.
- **Instante de acostarse de la noche N**: fecha N (o N + 1 si `bed_min` < 720) a `bed_min`.
