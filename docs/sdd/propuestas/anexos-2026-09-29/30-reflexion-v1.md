# Propuesta v1 (tras la Reflection): set de features para Descanso

**Estado**: borrador v1, pendiente de evaluación. Es la síntesis del orquestador a partir de 4 investigaciones ReAct (A multiusuario, B fases, C dashboard y D wearables) y de 3 críticas (Escéptico, Arquitecto y Defensor del usuario).

## Principios de la reescritura

1. **Primero lo que es urgente y lo que es común.**
   - DT-17 (datos de salud expuestos sin autenticación) es un riesgo real **hoy**.
   - DT-01 (migraciones) bloquea a las cuatro áreas.
   - Ambas se convierten en features propias y previas.
2. **Nada especulativo.**
   - Multi-inquilino, OAuth con proveedores y correlaciones quedan **condicionados** a respuestas del usuario o a datos suficientes.
   - Se aplican al alcance los principios de la constitución (VI) y YAGNI.
3. **Un solo modelo de datos**, el esquema unificado del Arquitecto: fases/sesiones con dueño en 007 y `user_id` desde 004.
4. **El gesto único de dormir y despertar no se toca** (SC-001 de la feature 001). Todo lo nuevo es opcional y va detrás.
5. **Honestidad**:
   - estimado ≠ medido;
   - "sin dato" ≠ 0;
   - frases antes que estadísticos;
   - sin puntuaciones (ortosomnia);
   - sin lenguaje clínico.

## El set propuesto (en orden de entrega)

### 003: Fundaciones de datos: migraciones y endurecimiento (M)

**Por qué:** todo lo demás cambia el esquema, y el principio II exige migraciones versionadas. Además cierra la deuda que distorsiona los datos.

**Historias:**
- **US1 (P1)**: runner de migraciones.
  - Se ejecuta antes de `listen()`; cada migración va en una transacción con checksum; si el checksum no cuadra, el arranque aborta.
  - Hace `db.backup` automático `pre-NNN.db` (conserva 3) antes de migrar.
  - La línea base 001 = el DDL actual; se marca como aplicada en bases existentes **sin tocar datos**.
  - CA: fixture `legacy.db` con hash de filas idéntico antes y después; ejecutarlo dos veces no hace nada; una migración que falla hace rollback completo; un checksum alterado aborta.
- **US2 (P1)**: validación y correcciones.
  - DT-02/03: `from`/`to` inválidos → 400.
  - DT-04: `date` coherente con el día local de `bedtime`.
  - DT-08: sí/no no booleano → 400.
  - DT-11: la cinta muestra todas las noches de una fecha.
  - DT-21: `% 1440`.
  - Índice único parcial "una noche abierta" (refuerza FR-003 de la 001 en la BD).
- **US3 (P2)**: regla expand/contract documentada: la versión N−1 del código tolera el esquema N, para que el rollback automático del pipeline siga siendo seguro (R1). Incluye el runbook "rollback con restauración de `pre-NNN.db`".

**Fuera de alcance:** cambios funcionales visibles.

**Pruebas:** las del Arquitecto para 003, más la medición del tiempo de migración con el tamaño real (menos de 20 s de grace, R2).

### 004: Acceso protegido y portabilidad (M): cierra DT-17

**Por qué:** hoy cualquiera con la URL lee y modifica datos de salud. Es el único riesgo presente de los cuatro temas.

**Historias:**
- **US1 (P1)**: entrar con mi cuenta.
  - `users` con una sola fila (el propietario), email + contraseña con `crypto.scrypt` y sesiones en SQLite.
  - Cookie `__Host-sid` `HttpOnly; Secure; SameSite=Lax`, deslizante 30 días; `last_seen_at` se actualiza como mucho una vez por hora.
  - CA:
    - sin sesión, `/api/*` → 401, salvo health, auth y admin con token;
    - logout invalida la sesión en el servidor;
    - dormir y despertar no piden login dentro de una sesión vigente;
    - si la sesión caduca con una noche abierta, tras entrar se ve esa noche.
- **US2 (P1)**: alta del propietario sin terminal.
  - La migración crea el usuario propietario y le asigna todas las filas.
  - El primer acceso muestra "Crea tu contraseña" con un enlace de un solo uso (el token lo genera una variable `OWNER_SETUP_TOKEN` de Fly, de un solo uso), más "Tus N noches están a salvo".
  - CA: el recuento antes y después de la migración es igual; el enlace caduca tras usarse.
- **US3 (P1)**: defensas.
  - CSRF: se rechazan los métodos no GET sin `Origin` y `Sec-Fetch-Site` válidos, salvo webhooks y admin.
  - CORS del mismo origen.
  - Rate limit por `Fly-Client-IP` + email (5 intentos / 15 min → 429).
  - Semáforo de 1 hash concurrente y hash ficticio si el email no existe.
  - Cabeceras de seguridad.
  - CA: pruebas de contrato de cada defensa; humo con Docker `--memory=256m` y 10 logins concurrentes sin OOM.
- **US4 (P2)**: exportar mis datos en JSON y CSV.
  - CA: reimportar en una base vacía da los mismos recuentos (N-03 del Defensor; A-HU5 sin multiusuario).

**Fuera de alcance** (quedan en 008 condicionada): más usuarios, invitaciones, recuperación por email, passkeys, OAuth de inicio de sesión y 2FA.

**Esquema:**
- `users`, `sessions` y `user_settings`.
- `user_id NOT NULL` en `sleep_records`, `naps` y `metrics`, mediante **reconstrucción en 12 pasos** con copia verificada.
- Requiere la enmienda PATCH del principio II (ver Enmiendas). Se descartan los triggers (E3 y Arquitecto).

**E2E:** la suite Playwright añade un fixture de login con `storageState`.

### 005: Tendencias y sueño pendiente (M), el dashboard

**Por qué:** es lo que el usuario pidió ("métricas y dashboard con relación a las horas descansadas") y funciona con los datos que ya existen.

**Historias:**
- **US1 (P1)**: horas dormidas frente a mi objetivo (7/30/90 días).
  - Gráfico de líneas en SVG propio con una banda de objetivo (por defecto 7 h; CDC, adultos de 18 a 60 años).
  - Los huecos se ven como "sin dato".
  - KPI "Noches con tus horas objetivo: X de Y".
  - Objetivo editable en línea.
- **US2 (P1)**: sueño pendiente de los últimos 14 días.
  - Σ max(0, objetivo − (noche + siestas)), solo sobre noches registradas, mostrando cuántas noches cubre.
  - Texto: "Te faltan 3 h 20 min esta quincena".
- **US3 (P2)**: regularidad, en lenguaje llano.
  - "Tu hora de dormir varía ±40 min" (desviación circular con ≥ 7 noches); con menos: "Aún no hay datos suficientes".
  - SRI **aplazado**: la fuente solo se consultó en un snippet y no hay despertares.
- **US4 (P2)**: bienvenida con objetivo.
  - Pantalla única y opcional la primera vez (0 noches, sin objetivo). Si se salta, el objetivo queda en 420 min.
- **US5 (P2)**: accesibilidad de gráficos.
  - `figure`/`figcaption` y tabla alternativa en los gráficos nuevos **y en la cinta actual**.
  - `--ink-faint` ≥ 4,5:1 (UX-13).

**Presentación:**
- 3 KPIs arriba (media, objetivo cumplido y sueño pendiente); la regularidad va en un plegable.
- Sin siglas (glosario del Defensor), sin rojo/verde y sin puntuaciones.

**Contrato:**
- `GET /api/dashboard?days=7|30|90&to=YYYY-MM-DD` (el cliente envía `to` = la fecha de la noche de hoy).
- `GET` y `PUT` de `/api/settings` sobre `user_settings`.
- Las agregaciones viven en `backend/src/analytics.js` (funciones puras). La duración **solo** se lee de `sleep_records` (evita contar horas dos veces, X8).

**Fuera de alcance (backlog):** correlaciones sueño ↔ métricas (C-US4), jetlag social y heatmap (C-US5), SRI, predicción.

### 006: Diario opcional, ciclos y honestidad de datos (S/M)

**Por qué:** responde a "control de ciclos REM" hasta donde es posible sin sensores, sin prometer mediciones y sin añadir fricción.

**Historias:**
- **US1 (P1)**: descargo e insignias.
  - Todo valor muestra su origen: "Anotado por ti", "Estimado" o "Del reloj (fuente)".
  - Aviso persistente "No es un dispositivo médico".
  - Un test de snapshot con la lista de palabras prohibidas (sin trastornos ni umbrales clínicos, ni alertas que guíen acciones médicas).
- **US2 (P1)**: calculadora de ciclos junto a "Me voy a dormir".
  - Propone despertar tras 4, 5 y 6 ciclos como **ventanas** ("entre 6:45 y 7:15").
  - Parámetros: latencia 15 min y ciclo de 90 min (configurable entre 70 y 120), con el texto "estimación, no medición; tus ciclos pueden durar entre 70 y 120 min".
  - Función pura con tests de cruce de medianoche y de cambio de offset.
- **US3 (P2)**: sección "Fases" con un estado vacío honesto: "Para ver REM y sueño profundo necesitas un reloj o anillo. Importa tus datos →". Enlaza a 007 cuando exista.
- **US4 (P2)**: recordatorio de noche abierta. Si una noche lleva abierta ≥ 14 h, al abrir la app aparece "¿Olvidaste marcar que despertaste? Tu noche empezó a las 23:40", con la hora propuesta. Sin notificaciones push.
- **US5 (P3, condicionada a la pregunta P3)**: tarjeta opcional "¿Cómo fue la noche?" **después** de "Ya desperté", descartable, con chips:
  - tardé en dormirme: <15 / 15–30 / >30;
  - despertares: 0 / 1–2 / 3+.
  - Se guarda en columnas nulables de `sleep_records` (rangos, no minutos exactos). Cerrar la noche sigue siendo 1 toque.

**Fuera de alcance:** fases estimadas guardadas, tendencias por fase (B-P3, rechazadas por ortosomnia y κ bajo), alarma inteligente, sonido o acelerómetro.

### 007: Importar mi sueño del reloj por archivo (L), condicionada a la pregunta P2

**Por qué:** es la única vía hoy, para una app web, de ver REM y sueño profundo **medidos** con Apple Watch, sin app nativa (HealthKit no tiene API web).

**Historias:**
- **US1 (P1)**: importar la exportación de Apple Health.
  - Acepta `export.zip`; lo procesa **en el navegador** (Web Worker con `File.stream()` y parser en streaming) y envía al servidor solo las sesiones de sueño en JSON, en lotes ≤ 5 MB (X11).
  - Guía con capturas y barra de progreso.
  - Resumen previo: "Encontramos 212 noches, 180 con fases. ¿Importar?".
  - CA:
    - un zip sintético de 1 GB no bloquea la UI ni supera la memoria del navegador;
    - reimportar crea 0 filas nuevas (hash del lote + `UNIQUE(user_id,source,external_id)`);
    - la fecha de la noche se recalcula con la regla III (tests antes y después de medianoche, DST y fechas de fin de proveedor);
    - validador ISO estricto y normalización del formato de Apple (X12).
- **US2 (P1)**: conciliación sin fricción.
  - Preferencia global "cuando haya datos del reloj, usar el reloj / mis noches anotadas".
  - Los solapes ≥ 50 % se agrupan en un único aviso.
  - La noche manual nunca se sobrescribe por defecto.
- **US3 (P2)**: "Tus fases de la noche".
  - Hipnograma en SVG propio con 4 carriles y tabla equivalente.
  - Minutos y % por fase; eficiencia, latencia y tiempo despierto de la fuente.
  - Las fases suman el tiempo dormido ± 1 min.
  - Aviso: "los relojes tienden a subestimar el tiempo despierto".
- **US4 (P2)**: importar CSV genérico (inicio, fin, fase) para otros dispositivos.
- **US5 (P2)**: borrar los datos importados de una fuente.

**Esquema:** `import_batches`, `sleep_sessions` y `sleep_stages` (tramos), del esquema unificado. `sleep_records.source`.

**Fuera de alcance:** OAuth y webhooks (009), apps nativas, frecuencia cardiaca y HRV.

### Condicionadas y backlog (no se especifican hasta que se cumpla la condición)

| ID | Feature | Condición | Notas |
|----|---------|-----------|-------|
| 008 | Multi-inquilino (A2: invitaciones, aislamiento con `repo/`, borrar cuenta, recuperación, zona horaria por usuario) | El usuario confirma otros usuarios reales (P1) | Enmienda MAJOR de alcance. RGPD art. 9 si hay residentes en la UE (valorar la exención doméstica si es solo familia). Respaldos cifrados en cliente y retención escrita (E4). Suite de aislamiento de 2 usuarios obligatoria. |
| 009 | Sincronización OAuth con un proveedor (Oura, Polar, Withings, WHOOP o Google Health) | El usuario usa uno de esos dispositivos (P2) y 004 está hecha | `user_connections`, `sync_jobs` con lease, `webhook_events`, AES-256-GCM con AAD y `key_version`, `express.raw` + HMAC, mutex por conexión. SLA "al abrir la app o recibir un webhook" (sin < 15 min). Antes de su spec hay que reverificar las cifras que solo se vieron en snippets (sandbox de Oura, membresía, fechas de Fitbit). |
| B-1 | Correlaciones sueño ↔ métricas (C-US4) | ≥ 30 noches con la métrica y respuesta a P4 (lag) | Lenguaje llano ("suelen ir juntos; puede ser casualidad"). Emparejar por la mañana del despertar (X7). Sin IC de Fisher sobre Spearman. |
| B-2 | Jetlag social y heatmap (C-US5), SRI real | Datos de despertares (007/009) | — |
| B-3 | PWA instalable (N-04) | — | S–M. Candidata a entrar tras 005. |
| B-4 | Passkeys y recuperación por email | 008 | — |
| — | **Rechazadas**: tendencias por fase (B-P3), agregadores de pago, integración directa con Garmin, Samsung o Zepp, apps nativas | — | Motivos: coste, factibilidad u ortosomnia. |

## Enmiendas a la constitución (consolidadas; se aplicarían con `/speckit-constitution`, no ahora)

1. **PATCH en II**:
   - Reconstruir una tabla copiando y verificando los recuentos en la misma migración (patrón de 12 pasos de SQLite) no es "DROP de datos del usuario".
   - Toda migración se ejecuta mediante el runner versionado, con respaldo previo automático.
   - El borrado que pide el propio usuario tampoco lo es (aplica en 008).
2. **MINOR, principio nuevo "VIII. Datos de salud: privacidad y honestidad"**, que fusiona los 4 "VIII" propuestos:
   - todo valor declara su origen (anotado, estimado o importado);
   - lenguaje no clínico y descargo;
   - "sin dato" ≠ 0;
   - estadísticos solo con n mínima y en lenguaje no causal;
   - consentimiento y revocación por fuente externa;
   - tokens de terceros cifrados en reposo.
3. **MAJOR (solo si llega 008)**: cambia el alcance de un solo usuario a multiusuario con aislamiento estricto.
4. Se **descarta** enmendar el principio I para los gráficos: el SVG propio no es una librería.

## Registro de respuesta a las críticas

| Crítica | Decisión | Dónde |
|---------|----------|-------|
| E1 (MAJOR sin demanda) | **Aceptada**: A se divide; 004 no cambia el alcance; 008 queda condicionada | 004, 008 |
| E2 / X3 (scrypt con 256 MB) | **Aceptada**: semáforo de 1, rate limit antes del hash, humo con 256 MB | 004-US3 |
| E3 (triggers) | **Aceptada**: reconstrucción en 12 pasos + PATCH en II | 004, Enmiendas |
| E4 (respaldos multiusuario) | **Aceptada**, movida a 008 (con un solo usuario no aplica) | 008 |
| E5 / X10 (dos modelos de fases) | **Aceptada**: esquema unificado, 007 es el dueño | 007 |
| E6 / X11 (export > 1 GB, 256 MB) | **Aceptada**: se procesa en el navegador | 007-US1 |
| E7 / X13 (SLA con auto-stop) | **Aceptada**: sin SLA de 15 min; lease + pull | 009 |
| E8 (fuentes vistas solo en snippet) | **Aceptada**: SRI aplazado; cifras de Oura, Fitbit y Rook reverificadas antes de 009; FDA citada como contexto de EE. UU. (MDR y RGPD en la UE) | 005, 009 |
| X1 (verificar el respaldo en S3) | **Aceptada**: `db.backup` propio del runner | 003-US1 |
| X2 (IP del proxy) | **Aceptada**: `Fly-Client-IP` + email | 004-US3 |
| X4 (IDOR en entries; noche abierta global) | **Aceptada**, en 008 (con un solo usuario no hay otro propietario); el índice parcial va ya en 003 | 003, 008 |
| X5, X6 | **Aceptadas** | 004 |
| X7 (lag con acostarse a la 01:30) | **Aceptada** para B-1 | Backlog |
| X8 (horas duplicadas) | **Aceptada**: la duración solo sale de `sleep_records` | 005, 007 |
| X9 ("hoy" en UTC) | **Aceptada**: el cliente envía `to` + `user_settings` | 005 |
| X12 (fechas de Apple) | **Aceptada** | 007-US1 |
| X14–X16 | **Aceptadas** para 009 | 009 |
| R1 (rollback frente a esquema nuevo) | **Aceptada**: expand/contract + runbook | 003-US3 |
| R2, R3 | **Aceptadas**: medir la migración; podar `pre-NNN` y alertar al 70 % | 003 |
| R4–R7 | R5 ya está documentada (runbook de respaldos); R4 y R7 van a 008/009; R6 es un requisito transversal de idempotencia | 007, 009 |
| UX-01 (diario rompe el gesto único) | **Aceptada**: tarjeta posterior y opcional; además queda condicionada a P3 | 006-US5 |
| UX-02, UX-03 | **Aceptadas** | 006 |
| UX-04, UX-05, UX-06 | **Aceptadas**: 3 KPIs, frases y objetivo en línea. UX-05 aplica a B-1 | 005 |
| UX-07, UX-08, UX-09 | **Aceptadas** (UX-08 en 009) | 007, 009 |
| UX-10, UX-11 | **Aceptadas** | 004-US1/US2 |
| UX-12 | Movida a 008 | 008 |
| UX-13 | **Aceptada** | 005-US5 |
| N-01, N-02, N-03 | **Aceptadas** | 005-US4, 006-US4, 004-US4 |
| N-04 (PWA) | Backlog B-3 | — |
| Recortes del Escéptico en C (SRI, jetlag, IC de Fisher, BH) | **Aceptados** | Backlog |
| Escéptico: "B solo descargo + calculadora" | **Parcialmente rechazada**: se mantienen además el estado vacío de fases y el recordatorio (valor alto y coste S, según el Defensor); el diario queda como P3 condicionado | 006 |
| Defensor: A-HU5 exportar como independiente | **Aceptada** | 004-US4 |

## Preguntas abiertas para el usuario (consolidadas, 5)

1. **P1:** ¿Habrá otras personas usando Descanso? ¿Quiénes son (familia o terceros) y en qué país? Esto decide 008, la enmienda MAJOR y el alcance del RGPD.
2. **P2:** ¿Qué reloj o anillo usas o piensas usar (Apple Watch, Oura, Fitbit/Pixel, Garmin, Polar, Withings, WHOOP, ninguno)? Decide 007 y 009.
3. **P3:** Al despertar, ¿aceptas 2 preguntas opcionales (cuánto tardaste en dormirte y cuántas veces despertaste), o prefieres solo el toque? Decide 006-US5.
4. **P4:** "Calidad" y "Energía", ¿las anotas sobre la noche anterior (por la mañana) o sobre el día? Decide el emparejamiento de B-1.
5. **P5:** ¿Qué techo de coste mensual aceptas? Decide si hay una VM de 512 MB, `suspend` o webhooks.

## Estimación agregada

| Feature | Talla | Condición |
|---------|-------|-----------|
| 003 | M | Siempre |
| 004 | M | Siempre |
| 005 | M | Siempre |
| 006 | S/M | Siempre (US5 según P3) |
| 007 | L | Según P2 |
| 008 | L | Según P1 |
| 009 | L | Según P2 |
