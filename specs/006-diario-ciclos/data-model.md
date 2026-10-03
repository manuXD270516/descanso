# Data Model: Diario opcional, ciclos y honestidad de datos (006)

Migración **`backend/src/migrations/008_ciclos_y_diario.js`**:
- solo *expand* (`ALTER TABLE … ADD COLUMN`), sin reconstrucción y con respaldo previo `pre-008.db`
  del runner;
- idempotente: comprueba con `PRAGMA table_info` si la columna ya existe.

## user_settings (ampliada)

| Columna | Tipo | Regla |
|---------|------|-------|
| `cycle_min` | INTEGER NOT NULL DEFAULT 90 | `CHECK (cycle_min BETWEEN 70 AND 110)` |
| `latency_min` | INTEGER NOT NULL DEFAULT 15 | `CHECK (latency_min BETWEEN 0 AND 60)` |

- Las filas existentes toman 90 / 15.
- Sin fila de ajustes (no debería ocurrir desde 008), el repo devuelve 90 / 15.
- Se escriben con un upsert como `setGoal` (`INSERT … ON CONFLICT(user_id) DO UPDATE`), sin tocar
  `goal_customized`.
- **Aislamiento**: tabla ya clasificada en el meta-test (clave `user_id`).

## sleep_records (ampliada)

| Columna | Tipo | Valores | Etiqueta en la interfaz / CSV |
|---------|------|---------|-------------------------------|
| `sol_bucket` | TEXT NULL | `lt15` · `15_30` · `gt30` | "<15 min" · "15–30 min" · ">30 min" / `<15` · `15-30` · `>30` |
| `awakenings_bucket` | TEXT NULL | `0` · `1_2` · `3plus` | "0" · "1–2" · "3+" / `0` · `1-2` · `3+` |

- `CHECK (col IN (...))` en cada columna. `NULL` = sin respuesta ("sin dato", nunca 0).
- Se escriben con `PUT /api/sleep/:id` (fusión parcial con la noche existente). `null` borra la
  respuesta. Un valor fuera de la lista → 400 "Respuesta no válida".
- Se borran con la noche y con la cuenta (CASCADE de 004/008).
- Las noches existentes quedan con `NULL` en ambas.

## Ventana de despertar (no persistida)

`{ cycles: 4|5|6, center: Date, start: Date, end: Date }`:
- `center = bedtime + latency_min + cycles × cycle_min`;
- `start = center − 15 min` y `end = center + 15 min`;
- instantes absolutos, formateados en hora local con "mañana" si el día local del centro es
  posterior al de `bedtime`.

## Origen del dato (derivado, no persistido)

`'manual' | 'estimated' | 'device'`:
- hoy, las noches, siestas, totales y respuestas son `manual`, y las ventanas son `estimated`;
- `device` queda reservado para 007, que añadirá la columna de fuente;
- `blockOrigin(items)` devuelve el origen común o `null` si hay mezcla.

## Compatibilidad (expand/contract)

- El código de 005 sobre el esquema con la 008 aplicada:
  - `SELECT` e `INSERT` con columnas nombradas;
  - las columnas nuevas tienen `DEFAULT` o admiten `NULL`;
  - por tanto, funciona sin cambios.
- Lo verifican `compat-previous-006.test.js` y el ensayo en Docker con la imagen de master.
- No hay paso *contract* pendiente.
