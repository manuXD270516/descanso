# Research: Diario opcional, ciclos y honestidad de datos (006)

Formato: Decisión / Razón / Alternativas. Diseño de referencia: feature 006 (V-08, V-09, UX-01 a
UX-03, N-02) en `docs/sdd/propuestas/2026-09-29-set-de-features.md`. Rige el principio VIII
(constitución v2.1.0, aprobado el 2026-10-03 antes de este plan).

## R1. Calculadora de ventanas: función pura en el cliente, nunca persistida

- **Decisión**: `wakeWindows(bedtime: Date, { cycleMin, latencyMin }, counts = [4, 5, 6], halfWidth = 15)`
  en `frontend/src/app/core/cycles.ts` devuelve, para cada n, `{ cycles, center, start, end }` como
  **instantes absolutos** (`center = bedtime + latencia + n × ciclo`, `start/end = center ∓ 15 min`).
  El formateo es aparte: `fmtWindow(w, bedtime, timeZone?)` con `Intl.DateTimeFormat` en la zona del
  navegador (o la que se le pase en los tests) y "mañana" cuando la fecha local del centro es
  posterior a la de la hora de dormir.
- **Razón**:
  - Sumar en milisegundos y formatear después en hora local da la hora real tras un cambio de
    offset (principio III), cosa que no consigue sumar minutos al reloj de pared.
  - Pasar la zona como parámetro permite probar un cambio de horario real
    (`America/Santiago`, `Europe/Madrid`) sin depender de la zona de la máquina de CI.
  - FR-004 / principio VIII: una estimación no se guarda; calcularla en el cliente evita cualquier
    tentación de persistirla y no añade endpoints.
- **Alternativas**:
  - Endpoint en el backend: más superficie, una petición por cada cambio de hora y nada que aislar.
  - Guardar las ventanas con la noche: viola FR-004.

## R2. Ajustes de ciclo en `user_settings` y en `PUT /api/me`

- **Decisión**: migración `008_ciclos_y_diario.js` (solo *expand*, sin reconstrucción):
  - `ALTER TABLE user_settings ADD COLUMN cycle_min INTEGER NOT NULL DEFAULT 90 CHECK (cycle_min BETWEEN 70 AND 110)`;
  - `ALTER TABLE user_settings ADD COLUMN latency_min INTEGER NOT NULL DEFAULT 15 CHECK (latency_min BETWEEN 0 AND 60)`.

  `GET /api/me` (perfil) los devuelve. `PUT /api/me` acepta `cycle_min` y `latency_min` con
  validación y mensajes que indican el rango. Las cuentas sin fila de ajustes usan 90/15.
- **Razón**:
  - Es la tabla de ajustes por persona que ya existe (004/008); `PUT /api/me` ya actualiza el
    objetivo (005, sin `/api/settings`, principio VI).
  - `ADD COLUMN` con `DEFAULT` constante es aditivo: el código de 005 sigue funcionando sobre el
    esquema nuevo (sus `SELECT` e `INSERT` nombran columnas).
- **Alternativas**:
  - Tabla `cycle_settings` aparte: un JOIN más y otra tabla para el meta-test de aislamiento, sin
    beneficio.
  - Reconstruir `user_settings`: innecesario para añadir columnas con valor por defecto.

## R3. La duración de ciclo de cada persona alimenta los atajos del objetivo (005)

- **Decisión**: `GET /api/dashboard` devuelve `cycle_min` del usuario y `cycles(goal, cycle_min)`. En
  el cliente, `goal-editor` usa el `cycle_min` del perfil en lugar de la constante `CYCLE_MIN`, que
  pasa a ser solo el valor por defecto. La bienvenida no cambia: se ve antes de poder ajustar el
  ciclo, así que siempre es 90.
- **Razón**: FR-010 y la promesa de la aclaración de 005 ("cuando exista la feature 006, las
  sugerencias usarán la duración de ciclo de cada persona").
- **Alternativas**: mantener 90 fijo en Tendencias (incoherente con la calculadora).

## R4. Respuestas de la tarjeta: dos columnas enum nulables en `sleep_records`

- **Decisión**: en la misma migración 008:
  - `ALTER TABLE sleep_records ADD COLUMN sol_bucket TEXT CHECK (sol_bucket IN ('lt15','15_30','gt30'))`;
  - `ALTER TABLE sleep_records ADD COLUMN awakenings_bucket TEXT CHECK (awakenings_bucket IN ('0','1_2','3plus'))`.

  `NULL` = sin respuesta (principio VIII: "sin dato" ≠ 0). Se escriben con el `PUT /api/sleep/:id`
  existente (fusión parcial, ya devuelve 404 para lo ajeno). `null` borra una respuesta.
- **Razón**:
  - Pertenecen a la noche, comparten su ciclo de vida (borrado de noche y de cuenta) y su
    aislamiento.
  - El contexto técnico de la feature lo fija así.
  - Sin endpoint nuevo.
- **Alternativas**:
  - Tabla `night_journal`: otra tabla hija para la suite de aislamiento y el borrado, sin necesidad.
  - Guardar minutos exactos: la feature pide rangos; un número exacto sugiere precisión que nadie
    mide.

## R5. "No volver a mostrar la tarjeta" sin estado en el servidor

- **Decisión**: la tarjeta aparece solo **justo después** de cerrar la noche en la sesión actual
  (signal `lastClosed` en `NightComponent`). Descartarla o recargar la quita. No hay columna
  `card_dismissed`.
- **Razón**: FR-018 ("no la vuelve a mostrar para esa noche") se cumple porque la tarjeta solo
  sigue al cierre, que ocurre una vez por noche (principio VI). Para añadir o cambiar las
  respuestas después está la edición de la noche.
- **Alternativas**: persistir el descarte (columna y migración sin valor para la persona).

## R6. Insignias de origen por bloque y aviso médico

- **Decisión**:
  - `shared/origin/origin-badge.component.ts` (`origin: 'manual' | 'estimated' | 'device'` →
    "Anotado por ti" / "Estimado" / "Del reloj").
  - `blockOrigin(items)` devuelve el origen común o `null` si hay mezcla; con `null`, cada fila
    pinta su insignia (aclaración del 2026-10-03).
  - Hoy el origen se **deduce**: todo lo guardado es `manual` y lo calculado es `estimated`. La
    columna `source` llegará con 007.
  - El aviso "No es un dispositivo médico" se pinta **una vez en `app.html`** cuando la pestaña
    activa es Noche, Tendencias o Siestas (y no en Cuenta, Métricas ni en las pantallas de acceso).
- **Razón**:
  - Un único componente y una función probada cubren los dos modos (bloque y mezcla).
  - El aviso en el shell garantiza FR-002 en todas las pantallas de sueño con un solo punto de
    verdad.
- **Alternativas**:
  - Insignia en cada fila: descartada en el clarify.
  - Aviso en cada componente: duplicación y riesgo de olvidarlo.

## R7. Prueba de términos prohibidos

- **Decisión**:
  - `backend/test/forbidden-terms.test.js` (corre en `npm test`, CI ya lo ejecuta) recorre los
    textos de la interfaz:
    - `frontend/src/**/*.html`;
    - `frontend/src/**/*.ts` sin `*.spec.ts`;
    - `backend/src/**/*.js`, por los mensajes de error que ve la persona.
  - Comprueba contra `docs/sdd/terminos-prohibidos.txt`: un término o patrón por línea, `#` para
    comentarios, versionado.
  - La comparación no distingue mayúsculas ni tildes y usa límites de palabra.
  - Si falla, informa de `archivo:línea` y del término.
  - Lista inicial (clínica, en español):
    - trastornos y diagnósticos: insomnio, apnea, narcolepsia, parasomnia, hipersomnia,
      bruxismo, trastorno, diagnóstico/diagnosticar, síndrome, patología, enfermedad;
    - medicación: "tratamiento médico", medicación. "Tratamiento" a secas no entra, porque es el
      término legal del RGPD ("tratamiento de mis datos") que ya usan el registro y la política;
    - umbrales y alertas: "umbral clínico", "alerta médica", "riesgo de salud", "deberías
      consultar";
    - unidades del índice de apnea: IAH, AHI;
    - puntuaciones y fases medidas (SC-007): "puntuación de sueño", "hipnograma", "% de REM".
- **Razón**:
  - FR-003 / SC-002.
  - Recorrer los archivos fuente es estático, rápido y no depende de pintar la app.
  - Los comentarios también se revisan, para no normalizar el vocabulario.
- **Alternativas**:
  - Recorrer el DOM en la e2e: solo ve las pantallas visitadas.
  - Plugin de lint: dependencia nueva (principio I).
- **Excepción documentada**: el aviso "No es un dispositivo médico" usa "médico" como negación;
  "médico" no está en la lista, solo "alerta médica".

## R8. Recordatorio de noche abierta en Noche

- **Decisión**: `NightComponent` ya carga la noche abierta al iniciarse, y Noche es la pestaña con
  la que abre la app. Si `ahora − bedtime ≥ 14 h`, muestra el aviso con
  `propuesta = min(bedtime + objetivo, ahora)` en un `datetime-local` editable, y los botones
  "Sí, desperté a esa hora" (POST `/api/sleep/wake`) y "Aún no".
  - El objetivo sale del perfil (`GET /api/me`, que ya carga el editor del perfil).
  - "Aún no" oculta el aviso hasta recargar o volver a abrir la app (no reaparece al cambiar de
    pestaña y volver a Noche); vuelve a aparecer en la siguiente apertura.
  - Al cerrar desde el aviso, aparece la tarjeta (FR-017).
- **Razón**:
  - Sin notificaciones (FR-016) y sin nuevo estado en el servidor.
  - Las validaciones son las de "Ya desperté": las mismas del servidor, más el tope "no futuro"
    en el cliente.
- **Alternativas**:
  - Banner global en `app.html` en cualquier pestaña: más cableado, para un caso que ya se ve al
    abrir.
  - Un job en el servidor: viola FR-016 en espíritu.

## R9. Sección "Fases" con disponibilidad declarada

- **Decisión**:
  - `core/features.ts` exporta `WATCH_IMPORT_AVAILABLE = false`.
  - La sección plegable "Fases" de Tendencias lee esa constante. Con `false` dice "Descanso aún
    no importa datos de relojes", más una frase explicativa. Con `true` (feature 007) ofrece
    "Importa tus datos →".
  - Los dos estados se prueban en el spec del componente pasando la disponibilidad como input.
- **Razón**:
  - FR-012 y FR-013 sin código muerto en la vista.
  - 007 solo tendrá que cambiar la constante y enlazar su pantalla.
- **Alternativas**: endpoint de capacidades (nada que consultar todavía).

## R10. Exportación y compatibilidad

- **Decisión**:
  - La exportación JSON incluye `sol_bucket` y `awakenings_bucket` con sus códigos.
  - El CSV de noches añade al final `tiempo_dormirse` (`<15`, `15-30`, `>30`) y `despertares`
    (`0`, `1-2`, `3+`), vacíos cuando no hay respuesta.
  - Prueba de compatibilidad `compat-previous-006.test.js`: el código de 005 (master) sobre el
    esquema con la 008 aplicada.
  - Ensayo en Docker con la imagen de master, como en 005.
- **Razón**: FR-019 y la regla expand/contract (`docs/sdd/guia-migraciones.md`). Añadir columnas al
  final no rompe a quien lea el CSV por nombre de cabecera.
- **Alternativas**: un CSV aparte para el diario (fragmenta lo que es de la noche).

## Evidencia (resumen para los textos)

- **Ciclos**: la duración de un ciclo de sueño varía entre personas y a lo largo de la noche (unos
  70–110 min). De ahí el rango ajustable y el lenguaje de "estimación".
- **AASM**: la tecnología de sueño de consumo no diagnostica. De ahí el aviso y el lenguaje no
  clínico (principio VIII).
- **Ortosomnia**: la preocupación por optimizar métricas de sueño puede empeorar el descanso. Por
  eso no hay puntuaciones ni fases estimadas (fuera de alcance, SC-007).
