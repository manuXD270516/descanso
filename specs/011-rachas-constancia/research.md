# Research: Rachas de constancia (011)

Formato: Decisión / Razón / Alternativas. Diseño de referencia: `docs/sdd/features/011-rachas-constancia.md`
y la ronda 2 del debate (E9, E10, X17, X19, X20, X28, UX-15, UX-19 a UX-22) en `docs/sdd/propuestas/`.
Aclaraciones del 2026-10-05 en [`spec.md`](spec.md). Constitución v2.2.0 (principio VIII ampliado).

## R1. Motor puro `computeStreak()` en `backend/src/streak.js`

- **Decisión**: una función pura, sin I/O, en un módulo propio (no en `analytics.js`, que es el
  dashboard de 005):
  `computeStreak({ nights, versions, pauses, since, today, marginMin })` →
  `{ days: Map<fecha, Día>, current, total, cutAfterBest, spreadMin }`.
  - Recorre las noches de constancia de `since` a `today` en orden, **una sola vez**, con una cola de
    las posiciones de los no cumplidos de la racha en curso (ventana deslizante de 7 días no pausados):
    O(n).
  - Estado de cada noche N (FR-001…FR-006, FR-024):
    1. noche cerrada asignada a N (R2) → con horario activo: comprobar acostarse y levantarse (R3);
       sin horario activo (sin versión, día inactivo o pausa): **cumplido** (modo "Registro");
    2. sin noche cerrada y N en pausa → **en pausa** (no entra en la ventana);
    3. sin noche cerrada y N ≥ `today − 1` → **aún no** (no entra en la ventana);
    4. si no → **no cumplido**, motivo `no_record`.
  - Corte (FR-007): al añadir un no cumplido, se descartan de la cola los que quedan fuera de los
    últimos 7 días no pausados **de la racha en curso**; si la cola llega a 3, la racha se corta: la
    cola se vacía, `current = 0` y la siguiente racha empieza en el siguiente cumplido (los no cumplidos
    previos a ese primer cumplido no se cuentan en la ventana nueva).
  - `current` = cumplidos desde el último corte; `total` = cumplidos desde `since`.
  - `spreadMin` = desviación circular (σ, `analytics.circularStat`) de la hora de levantarse de los
    cumplidos de la racha viva, redondeada; `null` con menos de 7 (principio VIII, "estadística
    prudente": n mínima 7, que coincide con el primer hito).
- **Razón**: la entrada y FR-011 piden calcular al vuelo, sin tabla materializada; una función pura se
  prueba con propiedades y se mide (SC-001, SC-002). Un módulo aparte evita mezclar la racha con los
  cálculos del dashboard.
  La definición literal de la entrada ("la última ventana de 7 días con 3 o más no cumplidos") hacía
  que la nueva racha no empezase hasta 6 días después del corte (la ventana con los 3 fallos sigue
  siendo "la última" mientras los contiene), contradiciendo su propio ejemplo ("Día 1" el día
  siguiente); por eso la ventana cuenta solo días de la racha en curso (spec, Assumptions).
- **Alternativas**:
  - Guardar el estado de cada día (tabla `streak_days`): se desincroniza al editar noches y lo prohíbe
    FR-011.
  - Calcular en el cliente: duplicaría el motor y el récord y los logros deben guardarse en el
    servidor en la misma transacción que la noche (FR-009, FR-013). El cliente solo muestra.

## R2. Asignar una noche registrada a su noche de constancia

- **Decisión**: noche de constancia = `date` de la noche registrada si su hora de acostarse (reloj de
  pared del propio ISO) es ≥ 12:00; si es < 12:00, el día anterior. Se calcula a partir del texto ISO
  (`AAAA-MM-DDTHH:MM` con su desfase), como `localDateOf` y `minutesOfDay`, sin zonas horarias del
  servidor. Si varias noches caen en la misma N (noche partida), se evalúa con la **primera** hora de
  acostarse y la **última** de levantarse; la marca "Anotado después" y "hora propuesta" se toman de la
  noche con la última hora de levantarse. Las noches abiertas solo cuentan para "aún no".
- **Razón**: es la misma frontera que usa el horario de 010 (`bed_min` < 720 → después de
  medianoche) y la que resolvió `scheduledWake` en la implementación de 010: acostarse a las 0:30 del
  sábado es la noche del viernes del horario. El principio III no cambia: la noche registrada sigue
  guardando la fecha del día en que te acuestas; la asignación es un derivado del cálculo y se prueba
  explícitamente (antes y después de mediodía, después de medianoche, DST).
- **Alternativas**: reutilizar la regla de `scheduledWake` ("primera hora de levantarse agendada
  posterior, ≤ 18 h"): no funciona en modo "Registro", donde no hay horario.

## R3. "A tu hora" con margen único y solo hacia más tarde

- **Decisión**: con horario activo para N (versión vigente en N, día de la semana de N activo, sin
  pausa):
  - `bedOk` ⇔ minutos de pared de la hora de acostarse desde las 0:00 del día N ≤ `bed_min` (+1440 si
    `bed_min` < 720) + margen;
  - `wakeOk` ⇔ minutos de pared de la hora de levantarse desde las 0:00 de N ≤ 1440 + `wake_min` +
    margen, **y** la noche no se cerró con la hora propuesta (`wake_from_proposal = 0`, FR-004);
  - cumplido ⇔ `bedOk ∧ wakeOk`. Motivo del no cumplido, por orden: `late_bed`, `proposal`,
    `late_wake` (se devuelven las horas de pared para el texto).
  - Los "minutos de pared desde N" se calculan con la fecha y la hora del propio ISO:
    `(díasEntre(N, fechaISO)) × 1440 + HH × 60 + MM`. Así el margen cruza medianoche sin error y el
    cambio de hora o un viaje no mueven la hora agendada (hora de pared, como 010).
  - Margen: `user_settings.streak_margin_min`, 30 por defecto (15–60). Adelantarse nunca resta.
  - Marca "Anotado después": `wake_logged_at − wake_time > 60 min` (la regla de 010-R5), también en
    modo "Registro".
- **Razón**: aclaración del 2026-10-05 (acostarse **y** levantarse a tiempo; el despertar anotado tarde
  cuenta con la hora corregida y queda marcado). 30 min coincide con el aviso por defecto de 010 y queda
  por debajo de los 60 min de "¿Ya despertaste?" y de "Anotado después": una noche a tu hora no puede
  depender de un registro tardío. Sin límite inferior para no culpar a quien se adelanta. Un solo
  margen evita un segundo ajuste (principio VI).
- **Alternativas**: ventana ± margen (penaliza levantarse antes, contra el principio "sin culpa");
  márgenes distintos para acostarse y levantarse (un ajuste más sin necesidad demostrada).

## R4. Récord, total y logros: trinquete en la escritura de la noche

- **Decisión**: `repo/streak.js` expone `ratchet(userId, today)`; las rutas que **pueden subir** la
  racha lo llaman dentro de la misma `db.transaction` que escribe la noche:
  `POST /api/sleep` (con `wake_time`), `POST /api/sleep/wake` y `PUT /api/sleep/:id`.
  - Solo si `streak_enabled = 1` (FR-018); si no, no calcula nada.
  - `today` = fecha de pared de **ahora** con el desfase de la hora escrita (`wake_time` o, si no hay,
    `bedtime`), sin cambiar los contratos de 010. La pequeña diferencia posible frente al "hoy" del
    cliente solo afecta a qué noches son "aún no", que nunca cortan.
  - `streak_best = max(streak_best, current)`; `streak_total = max(streak_total, streak_total_base +
    total)`.
  - Para cada hito `k ∈ {7, 21, 66, 100, 180, 365}` con `k ≤ current`: `INSERT OR IGNORE` en
    `streak_achievements` con `achieved_on = today` y `wake_spread_min = spreadMin` (congelado).
  - `DELETE /api/sleep/:id` no llama al trinquete: borrar nunca sube la racha.
- **Razón**: FR-009 y FR-013 (en la misma operación; nunca bajan ni se retiran) y FR-010 (consultar no
  escribe). Un `UNIQUE (user_id, key)` hace idempotente el desbloqueo.
- **Alternativas**: guardar al consultar (viola FR-010); un `POST /api/streak/sync` aparte (dos
  peticiones, no atómico).

## R5. Ajustes en `user_settings`, logros en una tabla propia

- **Decisión**: columnas nuevas en `user_settings` (como `lead_min` en 010): `streak_enabled`,
  `streak_margin_min`, `streak_since`, `streak_offered_at`, `streak_best`, `streak_total`,
  `streak_total_base`, `streak_summary_dismissed`. Logros en `streak_achievements` (una fila por hito y
  persona). Detalle en [`data-model.md`](data-model.md).
  - Activar (`PUT /api/streak/settings { enabled: true, today }`): `streak_since = today`,
    `streak_total_base = streak_total`, `streak_offered_at` si estaba vacío. Desactivar solo pone
    `streak_enabled = 0` (récord, total y logros se conservan; FR-018).
  - "Ahora no": `{ offered: true }` fija `streak_offered_at`.
- **Razón**: un solo registro de ajustes por persona; `total_base` permite que el total siga sumando
  tras reactivar sin contar los días desactivados (spec, Assumptions).
- **Alternativas**: JSON en una columna (no se valida con `CHECK`); historial de periodos activos
  (innecesario para lo que pide la spec).

## R6. API

- **Decisión** (contrato en [`contracts/openapi-delta.yaml`](contracts/openapi-delta.yaml)):
  - `GET /api/streak?today=` (sin efectos): con la racha desactivada devuelve solo
    `{ enabled: false, offered, margin_min, offer }` sin calcular (SC-006). Activada: `current`,
    `best = max(guardado, current)`, `total`, `cut` (N = 0 y récord > 0), `week` (7 noches de lunes a
    domingo de la semana de `today`), `last_night` (la noche de ayer, para la línea tras "Ya
    desperté"), `achievements` y `summary` (semana anterior, o `null` si ya se descartó; `avg_min`
    con `buildDays`/`summary` de 005 solo si hay ≥ 3 noches cerradas, si no `null`: n mínima del
    principio VIII fijada en FR-025).
  - `offer` = sin ofrecer, desactivada y con 3 o más noches cerradas.
  - `PUT /api/streak/settings { today, enabled?, margin_min?, offered?, dismiss_summary? }`.
  - `POST /api/streak/achievements/:key/seen` → 204; clave ajena o inexistente → 404.
  - `today` se valida con `clientToday` (±1 día de UTC), como en 010.
- **Razón**: tres rutas pequeñas; el cliente pinta lo que recibe.

## R7. Dónde aparece en la interfaz (FR-017, FR-019, FR-025)

- **Decisión**: componentes en `frontend/src/app/features/streak/`:
  - `streak-morning`: dentro del estado "noche cerrada" de Noche (tras "Ya desperté", junto a la
    tarjeta de 006): la línea "Día N de constancia ★" o un texto neutro, y la tarjeta que toque (logro
    nuevo, resumen semanal, oferta o "nuevo comienzo").
  - `streak-panel`: un `<details>` "Constancia" en Tendencias, debajo de los 3 indicadores de 005, con
    la semana de estrellas, récord, total, explicación de la tolerancia, colección y las mismas
    tarjetas.
  - `streak-card`: tarjeta descartable con `role="status"` y brillo CSS ≤ 400 ms desactivado con
    `prefers-reduced-motion`.
  - `streak-offer`: la oferta, reutilizada en la bienvenida (005/010).
  - `streak-settings`: en Cuenta → "Mi horario": activar/desactivar y margen.
  - Textos puros en `core/streak.ts` (motivo, "nuevo comienzo" con variante del lunes, etiqueta
    accesible de cada estrella).
  - La pantalla de acostarse (estado sin noche abierta de Noche) y `bedtime-notice` no importan nada de
    `features/streak/` (prueba de componente, SC-003).
- **Razón**: la racha solo vive donde la spec la permite; el cliente no recalcula nada.

## R8. Palabras prohibidas de culpa

- **Decisión**: se añaden a `docs/sdd/terminos-prohibidos.txt` en una sección "Culpa y pérdida (011)":
  `perdiste`, `fallaste`, `rompiste`, `en peligro`, `castigo*`. La prueba existente
  (`forbidden-terms.test.js`) ya recorre `frontend/src` y `backend/src`; se amplía su autocomprobación.
  Además, una prueba comprueba que `ics.js` y `bedtime-notice` no contienen "racha" (FR-023).
- **Razón**: FR-022 ("además de la lista de 006") con la misma herramienta; sin prueba nueva.
- **Alternativas**: una lista solo para 011 (dos listas que mantener).

## R9. Pruebas de propiedades sin dependencias

- **Decisión**: generador pseudoaleatorio con semilla (mulberry32, unas 5 líneas) dentro de
  `backend/test/streak-engine.test.js`; 500 historiales por propiedad y la semilla en el mensaje de
  error para reproducir. Medida de rendimiento con `performance.now()` sobre 3.650 noches (mediana de
  5 ejecuciones < 20 ms).
- **Razón**: SC-001 y SC-002 sin añadir `fast-check` (principio I).

## R10. Exportación, borrado, aislamiento y compatibilidad

- **Decisión**:
  - `export.json` añade `streak: { settings, achievements }` (FR-026); sin CSV nuevo.
  - Borrado de cuenta: CASCADE en `streak_achievements`; los ajustes van con `user_settings`.
  - Rutas `/api/streak*` en la suite de aislamiento de dos usuarios; `streak_achievements` en el
    meta-test del esquema (con `user_id`).
  - Migración `010_rachas.js` solo *expand* (columnas con `DEFAULT`/`NULL` y tabla nueva):
    `compat-previous-011.test.js` comprueba que las sentencias de 010 (y 006) siguen funcionando.
