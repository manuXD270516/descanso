# Research: Tendencias y sueño pendiente (005)

Formato: Decisión / Razón / Alternativas. Diseño de referencia: feature 005 (V-07, X8, X9, UX-04 a
UX-06, UX-13) en `docs/sdd/propuestas/2026-09-29-set-de-features.md`.

## R1. Agregaciones puras en `backend/src/analytics.js`

- **Decisión**: funciones puras sin I/O:
  - `buildDays(nights, naps, from, to)` → un elemento por fecha del periodo con `night_min`,
    `nap_min`, `total_min` y `status` (`data` | `none` | `in_progress`). Varias noches de la misma
    fecha **se suman** (corrige DT-23 en el dashboard). Una noche abierta marca el día como
    `in_progress` si no hay otro dato cerrado.
  - `summary(days, goalMin)` → `{ avg_min, days_with_data, goal_met }` (solo días con dato).
  - `pending(days14, goalMin)` → `{ net_min, days }`, con `net = goal × días − total` (aclaración del
    2026-10-02: neto, compensa).
  - `regularity(nights)` → `null` con < 7 noches cerradas; si no, la media y la **desviación circular**
    de dormir y despertar en minutos: `σ = sqrt(−2·ln R) · 1440 / 2π`, donde R es la longitud media
    del vector, y la media normalizada `% 1440`.
  - `cycles(goalMin, cycleMin = 90)` → `{ equivalent, shortcuts }` con los atajos de ciclos enteros
    dentro de 240–720 min.
- **Razón**: se prueban con fixtures sin base de datos, incluidos los casos límite (huecos, medianoche).
- **Alternativas**: SQL de agregación (mezcla lógica y consulta, peor para la estadística circular).

## R2. Endpoint `GET /api/dashboard?days=7|30|90&to=AAAA-MM-DD`

- **Decisión**: el cliente envía `to` = la fecha de la noche de hoy (su zona horaria). El servidor
  valida que `days ∈ {7, 30, 90}` y que `to` es una fecha real y no posterior a hoy + 1 día en UTC
  (absorbe cualquier zona). Lee por `repo/` las noches (incluida la abierta) y las siestas del rango
  `[to − (max(days, 14) − 1), to]` del usuario y devuelve días, resumen, pendiente de 14 días,
  regularidad del periodo, objetivo y ciclos. El objetivo sale de `user_settings`.
- **Razón**: una sola petición por cambio de periodo; el servidor no adivina "hoy" (principio III).
- **Alternativas**: varios endpoints (más peticiones); calcular en el cliente (duplica la lógica y
  complica las pruebas de aislamiento).

## R3. Objetivo de 7 h, `goal_customized` y bienvenida: migración `007_objetivo_y_bienvenida.sql`

- **Decisión**: reconstruir `user_settings` (hoja sin referencias entrantes, así que no hace falta
  `foreignKeys: false`):
  - `sleep_goal_min INTEGER NOT NULL DEFAULT 420 CHECK (BETWEEN 240 AND 720)`;
  - `goal_customized INTEGER NOT NULL DEFAULT 0`;
  - `onboarded_at TEXT NULL`.
  - Copia: `sleep_goal_min = CASE WHEN sleep_goal_min = 480 THEN 420 ELSE sleep_goal_min END` y
    `goal_customized = (sleep_goal_min <> 480)`. 480 era el valor por defecto de 008. En producción,
    008 se desplegó el 2026-10-02 y nadie pudo personalizarlo aún, porque el propietario sigue sin
    alta. Las demás filas conservan su valor (FR-008).
  - `PUT /api/me` y la bienvenida marcan `goal_customized = 1` al fijar un objetivo.
- **Bienvenida**: `onboarded_at` NULL → la app la muestra. `POST /api/me/onboarding { sleep_goal_min? }`
  la marca vista y, si llega un objetivo, lo guarda. `status`/`login` devuelven `onboarded`.
- **Expand/contract**: el código de 008 inserta `user_settings(user_id, updated_at)` (toma el nuevo
  `DEFAULT 420`) y actualiza solo `sleep_goal_min`; funciona sobre el esquema nuevo.

## R4. Contracción de `user_id`: migración `006_contraer_user_id.js` (`foreignKeys: false`)

- **Decisión**: reconstruir `sleep_records`, `naps` y `metrics` **sin `DEFAULT 1`**
  (`user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE`), con el mismo patrón verificado
  de `004_user_id_en_datos.js`: recuento + huella de **todas** las columnas, `metric_entries` intacta,
  índices recreados (`idx_sleep_date`, `idx_naps_date`, `ux_sleep_one_open` con expresión) y
  `sqlite_sequence` conservado.
- **Razón**: era el paso "contract" pendiente desde 004/008 (guía de migraciones). 005 es el primer
  despliegue tras 008, y la imagen anterior (008) ya siempre envía `user_id` por `repo/`.
- **Compatibilidad**: un test ejecuta las sentencias de `repo/` de 008 sobre el esquema nuevo. Un
  `INSERT` sin `user_id` debe fallar con NOT NULL: es la red de seguridad que buscábamos.

## R5. Gráficos SVG propios y accesibles

- **Decisión**: `frontend/src/app/shared/charts/`:
  - `daily-bars.component`: barras por día con banda del objetivo, días "sin dato" como trazo
    discontinuo bajo y "en curso" con patrón rayado.
  - `chart-table.component`: tabla alternativa en un `<details>` "Ver como tabla".
  - Cada `<svg>` lleva `role="img"`, `aria-labelledby` (título) y `aria-describedby` (resumen en
    frases). La cinta de 14 noches de Noche reutiliza la descripción y la tabla.
  - Colores: luna y alba (los de la app); nada de rojo o verde (FR-013).
- **Razón**: principio I (sin librería de gráficos) y FR-011.
- **Alternativas**: Chart.js o ngx-charts (dependencias pesadas; accesibilidad a medida igualmente).

## R6. Contraste del texto tenue (FR-012)

- **Decisión**: `--ink-faint` pasa de `#6f76a0` (3,90:1 sobre `--night`, 3,47:1 sobre `--night-2` y
  2,97:1 sobre `--night-3`) a **`#9297b7`** (5,99, 5,32 y 4,56). Es el tono más cercano al actual que
  cumple sobre los tres fondos. Lo verifica una e2e que calcula el contraste WCAG con los colores
  computados en el navegador.

## R7. Ciclos: duración fija de 90 min hasta 006

- **Decisión**: `CYCLE_MIN = 90` en `analytics.js`, devuelto por el dashboard (`cycle_min`) para
  que el frontend no lo duplique. La feature 006 lo sustituirá por la estimación personal
  (`user_settings.cycle_min`). El texto de ayuda dice: "Un ciclo dura unos 90 minutos, aunque varía
  entre personas y a lo largo de la noche".
- **Atajos**: los ciclos enteros n con `n × 90 ∈ [240, 720]` → 3 a 8 ciclos (4 h 30 … 12 h). Se
  muestran los 3 más cercanos al objetivo actual.

## R8. Pestaña "Tendencias" y bienvenida en el frontend

- **Decisión**:
  - Nueva pestaña "Tendencias" en la navegación: arriba los 3 indicadores, luego el selector de
    periodo, el gráfico con "Editar objetivo" y "Regularidad" plegable.
  - La bienvenida se muestra a pantalla completa tras entrar si `onboarded` es falso, con los atajos
    de ciclos, un campo libre y "Saltar".
  - `core/dashboard.service.ts` pide `/api/dashboard` con `to = nightDate(ahora)`.
- **Razón**: sin router (decisión de 004); los 3 indicadores siguen la sección de presentación de la
  entrada.

## Deuda y seguimiento

- DT-23 (stats agrega por fecha con una sola noche): el dashboard ya suma noches por fecha. El
  resumen de 14 días de la pestaña Noche (`/api/stats`) sigue igual; se anota.
