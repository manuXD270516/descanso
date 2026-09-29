# Propuesta: set de nuevas funcionalidades para Descanso

**Fecha**: 2026-09-29 · **Estado**: v3 (con gamificación y recordatorios), lista para decidir · **Destino**: entradas de `/sdd-feature`
en [`docs/sdd/features/`](../features/)

## Resumen

Proponemos **siete features en orden de entrega** y **cuatro condicionadas** a tus respuestas. Cubren
las seis áreas que pediste: las cuatro iniciales más gamificación y recordatorios.

| # | Feature | Área | Talla | Estado |
|---|---------|------|-------|--------|
| 003 | Fundaciones de datos: migraciones y endurecimiento | Transversal (lo exigen las 4 áreas) | M | Lista para especificar |
| 004 | Acceso protegido y portabilidad | **Multiusuario, paso 1** | M | Lista para especificar |
| 005 | Tendencias y sueño pendiente (dashboard) | **Métricas y dashboard** | M | Lista para especificar |
| 006 | Diario opcional, ciclos y honestidad de datos | **REM / fases (sin sensores)** | S/M | Lista para especificar |
| 010 | Mi horario de sueño y recordatorios (sin servidor) | **Recordatorios** | S/M | Lista para especificar (tras un spike de calendario) |
| 011 | Rachas de constancia | **Gamificación** | S/M | Lista para especificar |
| 007 | Importar mi sueño de la pulsera o reloj por archivo (**Huawei** y Apple) | **REM medido + wearables, paso 1** | L | **Lista** tras un spike con tu exportación real de Huawei |
| 008 | Multiusuario con perfiles (invitaciones, aislamiento, perfil, borrar cuenta) | **Multiusuario, paso 2** | L | **Lista para especificar** (P1 = sí) |
| 009 | Sincronización automática con un reloj o anillo (OAuth) | **Wearables, paso 2** | L | Condicionada: ¿qué dispositivo usas? |
| 012 | App instalable en el móvil (PWA) | **Recordatorios, paso 2** | S–M | **Descartada por ahora**: usas Android, que recibe push sin instalar la app |
| 013 | Avisos push con la app cerrada | **Recordatorios, paso 3** | M | **Pendiente de construir** (entrada [`013-avisos-push.md`](../features/013-avisos-push.md)). Disparador elegido: máquina siempre encendida (≈ 3,3 $/mes) |

**Orden de ejecución** (actualizado con tus respuestas): 003 → 004 → **008** → 005 → 006 → 010 → 011 → 007 (Huawei) → 013 (avisos push) → [009].

008 se adelanta para que todo lo posterior nazca aislado por usuario y no haya que reescribir consultas dos veces.
Los corchetes indican una feature condicionada.

Hay dos decisiones que ordenan todo el conjunto:
- **Hoy la app expone datos de salud en internet sin autenticación** (DT-17). Por eso el acceso
  protegido (004) va antes que cualquier funcionalidad nueva.
- **Las cuatro áreas necesitan migraciones versionadas** (DT-01), que hoy no existen. Por eso 003 va
  primero.

## Cómo se construyó esta propuesta

Se usaron cuatro patrones de trabajo con agentes, en dos rondas: la primera para las 4 áreas iniciales y la segunda para gamificación y recordatorios. En cada ronda, en este orden:

1. **ReAct.** Seis agentes (cuatro en la primera ronda y dos en la segunda) investigaron un área cada uno, alternando razonamiento y acción: leer el
   código, abrir documentación oficial y estudios, observar y ajustar. Las fuentes que solo se vieron en
   resultados de búsqueda quedaron marcadas y no se usan como evidencia.
2. **Debate.** Tres críticos con roles enfrentados revisaron a la vez las propuestas de cada ronda:
   - **Escéptico**: constitución, YAGNI, coste y privacidad.
   - **Arquitecto**: dependencias, esquema, seguridad y operación en Fly.
   - **Defensor del usuario**: valor, UX de noche y en el móvil, lenguaje.
3. **Reflection.** El orquestador reescribió el conjunto respondiendo a cada objeción (aceptada,
   rechazada con razón o convertida en pregunta). El registro está al final.
4. **Evaluación (evaluator-optimizer).** Un evaluador independiente aplicó una rúbrica **fijada antes de
   ver los resultados**:
   - seis criterios ponderados: valor, factibilidad, constitución, privacidad, esfuerzo y testabilidad;
   - para aprobar: nota ≥ 3,5, criterios obligatorios ≥ 3 y un checklist de calidad;
   - en cada ronda hubo una revisión dirigida y una reevaluación: V-01…V-13 en la primera y V-14…V-23 en la segunda.

Las puntuaciones están en [Evaluación](#evaluación).

## Decisiones tomadas (2026-09-29)

| # | Respuesta | Efecto |
|---|-----------|--------|
| P1 | **Sí**: habrá varios usuarios, con perfiles | 008 lista para especificar (entrada [`008-multiusuario-perfiles.md`](../features/008-multiusuario-perfiles.md)), adelantada tras 004. Enmienda MAJOR de alcance antes de su plan |
| P2 | **Huawei Band** ("Band Pro 7"; probablemente una Band 7), con la app Huawei Health | **Sí se obtienen horas y fases.** 007 pasa a estar lista, con la importación de Huawei como P1 (anexo [16-react-G-huawei](anexos-2026-09-29/16-react-G-huawei.md)). La sincronización automática solo sería posible vía Health Sync (de pago) → Google Health API (009, opcional) |
| P5 | **Android** | **012 (PWA) se descarta**. La guía de 010 prioriza Android (Google Calendar web o el calendario del fabricante) |
| P5b | **Máquina siempre encendida** (`AlwaysOnWaker`) | 013 queda pendiente de construir, con entrada [`013-avisos-push.md`](../features/013-avisos-push.md) y propuesta de código. QStash se descarta: el ahorro (≈ 1,3 $) no alcanza su propio umbral y añadiría un tercero |

## Tus decisiones pendientes (6 preguntas)

P1, P2, P5 y P5b ya están respondidas (ver arriba). P3, P4 y P6 tienen una respuesta recomendada por defecto y se confirman en el clarify de su feature.

| # | Pregunta | Qué decide |
|---|----------|------------|
| P1 | ¿Habrá otras personas usando Descanso? ¿Quiénes (familia o terceros) y en qué país? | Si se especifica 008, la enmienda MAJOR de alcance y el alcance del RGPD (art. 9) |
| P2 | ¿Qué reloj o anillo usas o piensas usar (Apple Watch, Oura, Fitbit/Pixel, Garmin, Polar, Withings, WHOOP, ninguno)? ¿Te basta una **estimación** de tus ciclos o necesitas ver tus fases **medidas**? | El orden y la existencia de 007 y 009; el peso de 006 |
| P3 | Al despertar, ¿aceptas 2 preguntas opcionales (cuánto tardaste en dormirte y cuántas veces despertaste) o prefieres solo el toque? | 006-US5 |
| P4 | "Calidad" y "Energía", ¿las anotas sobre la noche anterior (por la mañana) o sobre el día? | El emparejamiento sueño ↔ métricas del backlog B-1 |
| P5 | ¿iPhone o Android, y qué calendario usas? ¿Te basta la alarma del calendario (010, gratis) o quieres avisos con la app cerrada (013)? Estos requieren la máquina siempre encendida: ≈ **3,1 $/mes de cómputo en total** (hoy se paga menos, porque se apaga sin tráfico). Cálculo: shared-cpu-1x de 256 MB a 0,00000075 $/s × 2.592.000 s × 1,615 (región gru), según los [precios de Fly.io](https://docs.fly.io/about/pricing/); confírmalo en su calculadora. ¿Qué techo mensual aceptas? A esto se suman 0,15 $/mes del volumen. | 010 frente a 012/013; también la VM de 512 MB, `suspend` o los webhooks de 004/009 |
| P5b | **Disparador de los avisos push (013).** ¿Máquina siempre encendida (≈ 3,3 $/mes en total, sin terceros, **recomendada**) o QStash (≈ 2 $/mes; Upstash, en EE. UU., conocería las horas de los avisos; probablemente no alcanza el ahorro mínimo exigido)? | Disparador de 013 |
| P6 | ¿Qué hábito quieres que se premie? Por defecto, **levantarte a tu hora**; también puede ser acostarte a tu hora o simplemente registrar. ¿Te sirve como recompensa una colección de logros con datos personales, sin puntos ni premios canjeables? | Regla de 011 |

## Factibilidad de smartwatches y bands

Verificado el 2026-09-29 con documentación oficial. Descanso es una **app web**. Las plataformas que solo
exponen datos en el propio dispositivo requieren una app nativa, que queda fuera de alcance.

| Plataforma | Fases del sueño | ¿Accesible desde la web? | Coste y requisitos | Veredicto |
|------------|-----------------|--------------------------|--------------------|-----------|
| Apple Health (Apple Watch) | Sí (REM, núcleo, profundo, despierto) | **No por API** (HealthKit es solo del dispositivo). **Sí importando el archivo de exportación** | Por API: app iOS + 99 $/año. Por archivo: 0 $ | **Viable por archivo (007)** |
| Oura | Sí (fases cada 5 min) | Sí: OAuth2 + webhooks | Gratis; 10 usuarios sin aprobación* | **Viable (009)** |
| Polar | Sí | Sí: OAuth2 + webhooks firmados | Gratis | **Viable (009)** |
| Withings | Sí (resumen por fase) | Sí: OAuth + notificaciones | Gratis | **Viable (009)** |
| WHOOP | Solo totales por fase | Sí: OAuth2 + webhooks v2 | Gratis; 10 miembros en sandbox | **Viable (009)** |
| Google Health API (sustituye a Fitbit) | Sí | Sí: OAuth + REST + webhooks | Gratis hasta 100 usuarios; más allá, auditoría CASA (500–4.500 $/año) | **Condicionado (009)** |
| Fitbit Web API (antigua) | Sí | Se apaga el **30-sep-2026** según Google (un blog habla de una prórroga para migrar usuarios hasta el 30-oct, sin confirmar) | — | No viable (migrar a Google Health API) |
| Google Health Connect (Android) | Sí | No: solo en el dispositivo | App Android | No viable |
| Garmin | Sí | Sí, pero **solo para empresas** | Aprobación comercial | No viable para uso personal |
| Samsung Health | Sí | No: solo socios | Programa de socios | No viable |
| **Huawei Band / Huawei Health** (tu dispositivo) | Sí (ligero, profundo, REM, despierto + siestas) | **No por API** para particulares (Health Kit REST exige una app en AppGallery o ser empresa). **Sí importando la exportación** del Centro de privacidad (ZIP cifrado con JSON) | 0 $; el export tarda hasta 7 días | **Viable por archivo (007)**; sincronización automática solo vía la app de pago Health Sync → Google Health API (009, condicionado) |
| Xiaomi / Amazfit (Zepp) | En su app | Sin API pública oficial | — | No viable de forma directa |
| Agregadores (Terra, Rook, Sahha…) | Normalizan | Sí | 299–499 $/mes | No viable por coste |

\* Cifras vistas solo en resultados de búsqueda (sandbox de Oura, precios de Rook y Sahha). Tampoco está
verificado si la API de Oura exige una membresía activa. **Todo esto se verifica antes de especificar 009.**

**Precisión de los wearables (evidencia abierta).** Distinguen bien dormido y despierto (sensibilidad
> 90 %). Clasifican las fases solo de forma moderada: acuerdo κ 0,2–0,65 frente a polisomnografía, y
**todos subestiman el tiempo despierto**, entre 12 y 40 min (Chinoy 2021, Robbins 2024, Schyvens 2025).
Sirven para ver tendencias, no para comparar una noche con otra.

## Las features

### 003 · Fundaciones de datos: migraciones y endurecimiento (M)

Entrada para `/sdd-feature`: [`003-fundaciones-datos.md`](../features/003-fundaciones-datos.md).

- **US1 (P1) · Runner de migraciones versionadas.**
  - Se ejecuta antes de `listen()`.
  - Cada migración corre en una transacción y guarda su checksum; si el checksum no coincide, el
    arranque aborta.
  - Antes de migrar hace un `db.backup` automático a `pre-NNN.db` (se conservan 3).
  - La migración 001 es el DDL actual y se marca como aplicada **sin tocar datos**.
- **US2 (P1) · Regla expand/contract.** El código N−1 debe funcionar con el esquema N, para que el
  rollback automático del pipeline siga siendo seguro. Incluye un runbook de "rollback + restauración de
  `pre-NNN.db`".
- **US3 (P1) · Validación y correcciones** (sin funcionalidades nuevas):
  - DT-02 y DT-03: fechas inválidas → 400;
  - DT-04: `date` coherente con el día local de `bedtime`;
  - DT-08: sí/no no booleano → 400;
  - DT-11: la cinta muestra todas las noches de una fecha;
  - DT-21: `% 1440`;
  - índice único parcial "una noche abierta", con verificación previa que aborta limpio si hay dos.
- **US4 (P2) · Salud del volumen.** Si el uso del volumen llega al 70 %, se avisa en el log y en `/api/health`,
  sin datos personales.

### 004 · Acceso protegido y portabilidad (M): multiusuario, paso 1

Entrada: [`004-acceso-protegido.md`](../features/004-acceso-protegido.md). Cierra DT-17.

- **US1 (P1) · Entrar con mi cuenta.**
  - Un único usuario (el propietario) con email y contraseña, guardada con `crypto.scrypt`.
  - Sesión en SQLite con cookie `__Host-sid` (`HttpOnly; Secure; SameSite=Lax`), deslizante de 30 días.
  - Dormir y despertar **nunca piden login** mientras la sesión esté vigente.
  - Si la sesión caduca con una noche abierta, al entrar se ve esa noche.
- **US2 (P1) · Alta y recuperación del propietario sin terminal.**
  - `OWNER_SETUP_TOKEN` es un secreto de Fly. Se guarda solo su hash y se marca como usado al crear la
    contraseña.
  - Mientras no haya contraseña, `/api/*` → 401.
  - Rotar el secreto en el panel de Fly reactiva el alta: esa es la recuperación del propietario.
  - Pantalla "Crea tu contraseña" con el mensaje "Tus N noches están a salvo".
- **US3 (P1) · Defensas.**
  - CSRF: se rechazan las peticiones que no son GET sin `Origin` o `Sec-Fetch-Site` válidos (excepción:
    `/api/admin/*` con token).
  - CORS solo del mismo origen.
  - Rate limit por `Fly-Client-IP` + email: 5 intentos en 15 min → 429.
  - Un solo cálculo de scrypt a la vez, con un hash ficticio si el email no existe.
  - Cabeceras de seguridad.
  - Humo con Docker `--memory=256m` y 10 logins concurrentes sin quedarse sin memoria.
- **US4 (P2) · Exportar mis datos** en JSON y CSV. Criterio de aceptación: un test reconstruye una base
  vacía desde el JSON y los recuentos coinciden.

**Esquema:**
- Tablas `users`, `sessions` y `user_settings`.
- `user_id` en `sleep_records`, `naps` y `metrics`, creado como **`NOT NULL DEFAULT <id del propietario>`**
  para que el código anterior pueda seguir escribiendo (expand/contract). Criterio de aceptación: con el
  esquema de 004, el código de 003 pasa su humo.
- Las tablas se reconstruyen copiando y verificando, no con triggers.

**Fuera de alcance:** más usuarios, invitaciones, recuperación por email, passkeys, inicio de sesión con
OAuth, 2FA, webhooks.

### 005 · Tendencias y sueño pendiente (M): el dashboard

Entrada: [`005-tendencias-sueno.md`](../features/005-tendencias-sueno.md).

- **US1 (P1) · Horas dormidas frente a mi objetivo** (7, 30 o 90 días).
  - Gráfico de líneas en SVG propio con una banda que marca el objetivo (7 h por defecto, recomendación
    de los CDC para adultos de 18 a 60 años).
  - KPI "Noches con tus horas objetivo: X de Y".
  - El objetivo se edita en línea.
  - **Regla única**: el sueño de un día = noche + siestas de esa fecha, sumando todas las noches de la
    fecha.
  - Un día sin datos se muestra como "sin dato", no como 0. Si la noche actual sigue abierta, se muestra
    "en curso".
- **US2 (P1) · Sueño pendiente de 14 días**: "Te faltan 3 h 20 min esta quincena". Se calcula solo sobre
  las noches registradas y dice cuántas cubre.
- **US3 (P2) · Regularidad en palabras**: "Tu hora de dormir varía ±40 min". Requiere al menos 7 noches;
  si no, muestra "Aún no hay datos suficientes".
- **US4 (P2) · Bienvenida con objetivo.** Pantalla opcional la primera vez. Si se salta, el objetivo
  queda en 420 min.
- **US5 (P2) · Gráficos accesibles.** `figure`, `figcaption` y una tabla alternativa, también para la
  cinta actual. El texto tenue pasa a un contraste ≥ 4,5:1.

**Presentación:**
- 3 KPIs: media, objetivo cumplido y sueño pendiente. La regularidad va en un plegable.
- Sin siglas, sin rojo/verde y sin puntuaciones.

**Contrato y cálculo:**
- `GET /api/dashboard?days=7|30|90&to=` y `GET`/`PUT /api/settings`.
- El cálculo se hace en `analytics.js` con funciones puras.
- La duración **solo** se lee de `sleep_records`, para no contar dos veces lo que se importe en 007.

### 006 · Diario opcional, ciclos y honestidad de datos (S/M): REM sin sensores

Entrada: [`006-diario-ciclos.md`](../features/006-diario-ciclos.md).

- **US1 (P1) · Descargo e insignias.**
  - Cada dato muestra su origen: "Anotado por ti", "Estimado" o "Del reloj".
  - Aviso visible: "No es un dispositivo médico".
  - Un test de snapshot vigila una lista de palabras prohibidas: trastornos, umbrales clínicos y alertas
    médicas.
- **US2 (P1) · Calculadora de ciclos** junto a "Me voy a dormir".
  - Propone ventanas para despertar tras 4, 5 o 6 ciclos ("entre 6:45 y 7:15").
  - Latencia de 15 min y ciclo de 90 min, configurable entre 70 y 110 min.
  - Texto fijo: "estimación, no medición; no está demostrado que despertar al final de un ciclo mejore
    cómo te sientes".
  - La configuración se guarda en `user_settings`.
- **US3 (P2) · Sección "Fases" con un estado vacío honesto.**
  - Mientras 007 no exista: "Descanso aún no importa datos de relojes".
  - Cuando exista: "Importa tus datos →".
- **US4 (P2) · Recordatorio de noche abierta.**
  - Si la noche lleva ≥ 14 h abierta: "¿Olvidaste marcar que despertaste?".
  - Hora propuesta = hora de acostarse + objetivo.
  - Sin notificaciones push.
- **US5 (P3, según P3) · Tarjeta opcional "¿Cómo fue la noche?"** después de "Ya desperté".
  - Chips con dos rangos: tiempo en dormirse (<15 / 15–30 / >30) y despertares (0 / 1–2 / 3+).
  - Se guardan en las columnas enum `sol_bucket` y `awakenings_bucket`.
  - Cerrar la noche sigue siendo **1 toque**.

### 007 · Importar mi sueño del reloj por archivo (L): REM medido, wearables paso 1

Entrada: [`007-importar-reloj.md`](../features/007-importar-reloj.md). **Condicionada a P2**: solo si usas
Apple Watch u otro dispositivo que exporte archivos.

- **Spike previo al plan.**
  - Prueba de concepto con un `export.zip` real de ≥ 1 GB.
  - Librerías de descompresión y de XML en streaming, **nombradas y justificadas en Complexity
    Tracking**.
  - Entidades y DTD desactivadas.
  - Tamaño máximo aceptado.
- **US1 (P1) · Importar la exportación de Apple Health en el navegador.**
  - Se procesa en un Web Worker con `File.stream()` y solo se envían sesiones en JSON, en lotes de
    ≤ 5 MB.
  - Incluye una guía con capturas, barra de progreso y resumen previo ("212 noches, 180 con fases").
  - Criterios de aceptación:
    - memoria del worker < 300 MB en Chromium (medida con Playwright/CDP), más una prueba manual en
      Safari iOS con un export de 1 GB. Si falla en iOS, la guía indica usar un ordenador;
    - reimportar crea 0 filas nuevas.
- **US2 (P1) · Muestras → sesiones.**
  - Agrupar las muestras fragmentadas y deduplicar por fuente, con prioridad al Watch sobre el iPhone.
  - Aplicar la regla III de fecha de la noche, con tests antes y después de medianoche y en cambios de
    hora.
  - Validador ISO estricto que acepte el formato de Apple.
- **US3 (P1) · Conciliación sin fricción.**
  - Preferencia global: "usar el reloj" o "usar mis noches anotadas".
  - Un único aviso agrupado para los solapes.
  - Nunca se sobrescribe lo anotado a mano por defecto.
  - Una sesión sin noche anotada crea un `sleep_record` con `source='apple'`.
- **US4 (P2) · Hipnograma "Tus fases de la noche".**
  - SVG con 4 carriles y una tabla equivalente.
  - Las fases suman el tiempo dormido ± 1 min.
  - Aviso: "los relojes subestiman el tiempo despierto".
- **US5 (P2) · CSV genérico** (inicio, fin, fase) y **borrar lo importado de una fuente**. Requiere la
  enmienda MINOR del principio II.

### 010 · Mi horario de sueño y recordatorios, sin servidor (S/M): recordatorios, paso 1

Entrada: [`010-horario-recordatorios.md`](../features/010-horario-recordatorios.md). El coste de operación es 0 $.

- **US1 (P1) · Agendar mi horario.**
  - Una sola bienvenida que se puede saltar.
  - Pregunta la hora de levantarse y propone la de acostarse: despertar − objetivo − 15 min.
  - Horario igual todos los días, distinto el fin de semana o uno por día.
  - Horas de reloj de pared, versionadas: cada edición se aplica desde ese día y no cambia el pasado.
  - **Es el único horario de la app.**
- **US2 (P1) · Añadir a mi calendario con alarma.**
  - Un archivo `.ics` importable con un evento semanal y una alarma X min antes (15–60 min).
  - Hora flotante y un UID/SEQUENCE que actualiza el calendario en lugar de duplicar eventos.
  - Guía por plataforma: en iPhone, "Añadir todo"; en Android, Google Calendar web o el calendario del fabricante.
  - Spike previo en 1 iPhone y 2 Android.
  - Los avisos no llevan datos de salud: "Descanso: en 30 min es tu hora de dormir".
- **US3 (P2) · "¿Ya despertaste?"** si la noche sigue abierta 60 min después del despertar agendado. Amplía 006-US4, que se queda con la regla de 14 h cuando no hay horario.
- **US4 (P2) · Modo pausa** (viaje, enfermedad, turnos): hasta 14 días; pausa también la racha.
- **US5 (P3) · Aviso dentro de la app** si está abierta a la hora de prepararse.

### 011 · Rachas de constancia (S/M): gamificación

Entrada: [`011-rachas-constancia.md`](../features/011-rachas-constancia.md).

Se premian **conductas que controlas**, nunca las horas ni la calidad del sueño. Así se reconcilia con el
rechazo previo a las puntuaciones por ortosomnia: se prohíben las puntuaciones de *resultado* y se permite
motivar la *constancia*. Es opcional y se puede ocultar (enmienda VIII).

- **US1 (P1) · Racha de constancia.**
  - Con horario: un día cuenta si registras la noche y te levantas dentro de ±30 min de la hora agendada. La hora de acostarse no cuenta, para no incentivar quedarse en cama (AASM).
  - Sin horario: cuenta con cerrar la noche.
  - **Un día sin registrar cuenta como no cumplido.** Así no se premia ocultar las malas mañanas.
  - Tolerancia: hasta 2 faltas en cualquier ventana de 7 días. El récord y el total nunca bajan.
- **US2 (P1) · Recompensa visible que no caduca.**
  - Una estrella por cada día cumplido.
  - A los 7, 21 y 66 días, una **constelación** permanente con un dato personal ("tu hora de levantarte varió solo ±18 min").
  - Sin puntos, monedas, premios canjeables ni rankings.
- **US3 (P1) · En su sitio.**
  - Se ofrece en la bienvenida o tras 3 noches.
  - Nunca aparece antes de dormir: se ve tras "Ya desperté" y en un plegable del dashboard.
  - Desactivada no calcula ni muestra nada.
- **US4 (P2) · Volver a empezar sin culpa.**
  - "Tu récord sigue siendo 25. Mañana es un buen día para empezar otra".
  - Hay palabras prohibidas y no hay avisos de "racha en peligro".
- **US5 (P2) · Pausa**, compartida con 010 (máximo 2 cada 30 días).
- **US6 (P3) · Resumen de la semana** dentro de la app, sin notificaciones.

### Condicionadas (semillas para especificar cuando se cumpla la condición)

**012 · App instalable (PWA) (S–M).** Condición: P5 = iPhone **y** quieres avisos con la app cerrada (en iOS, el push solo llega con la app instalada). No tiene coste de operación. Sustituye a B-3 del backlog.

- "Ya desperté" visible sin scroll a 375 px al abrir la app con una noche abierta (N-04).

- Manifest.
- Service worker que **nunca cachea `/api/*`**, con shell versionado y actualización forzada. Es compatible con la regla expand/contract de 003.
- Guía "Instalar en tu pantalla de inicio".
- Tests de actualización tras un despliegue.

**013 · Avisos push con la app cerrada (M).** **Disparador elegido: `AlwaysOnWaker`** (P5b). Entrada: [`013-avisos-push.md`](../features/013-avisos-push.md), con los aspectos de código propuestos. Tus usuarios están en Android, que recibe push sin instalar la app, así que no hace falta 012. Análisis completo: [17-react-H](anexos-2026-09-29/17-react-H-push-programado.md), debate [26](anexos-2026-09-29/26-debate-r3-esceptico.md)/[27](anexos-2026-09-29/27-debate-r3-arquitecto.md) y reflexión [32](anexos-2026-09-29/32-reflexion-r3-push.md).

- **Disparador**: interfaz `Waker`. Hay dos implementaciones que pasan **la misma suite de contrato**, y se cambia de una a otra solo con configuración.
  - **Recomendada: `AlwaysOnWaker`**
    - Cómo funciona: `min_machines_running = 1` y `setInterval` cada 30–60 s.
    - Coste: ≈ **3,3 $/mes** en total (≈ 3,1 $ de cómputo con 256 MB en gru, más 0,15 $ del volumen).
    - Por qué es la recomendada:
      - no hay terceros: las horas de los avisos revelan hábitos de sueño (RGPD art. 9);
      - nunca hay arranque en frío. Con la alternativa, si tocas el aviso varios minutos después (por ejemplo, el de "prepárate"), la máquina ya se habrá parado y la app tardará unos segundos en abrir;
      - el rate limit de 004 pasa a ser fiable;
      - el único secreto nuevo es VAPID.
    - **Complexity Tracking**: se abandona el auto-stop de R13 a cambio de precisión y privacidad. El coste es de ≈ 1–1,5 $/mes más que la alternativa.
    - Hay que anotar en R13 que deja de aplicarse el auto-stop.
  - **Alternativa: `QStashWaker`** (Upstash)
    - Cómo funciona: **un mensaje por vencimiento**, con horizonte de 48 h y `Deduplication-Id`, sin cadena ni cancelaciones. El tick hace un claim y responde 202. Los vencimientos se gestionan por usuario.
    - Montaje: la ruta usa `express.raw` antes de `json` y queda fuera de auth/CSRF. La firma JWT se verifica con las claves current/next y comprobando la url y el hash del cuerpo.
    - Coste: ≈ 2 $/mes, porque se mantiene el auto-stop. El ahorro real es de ~1–1,5 $/mes.
    - Requisitos:
      - un spike con el servidor de desarrollo de QStash;
      - DPA y base legal, porque las horas de los avisos revelan hábitos de sueño (RGPD art. 9);
      - consentimiento;
      - la enmienda MINOR del principio V;
      - un runbook para rotar los 3 secretos;
      - un **payload con solo un id opaco del vencimiento**, sin `user_id` ni tipo de aviso (X40);
      - un **vigilante independiente de Upstash**: el workflow diario de respaldo ya despierta la máquina, y la recuperación al arrancar vuelve a armar los vencimientos (X33);
      - un **test de cambio de proveedor** a `AlwaysOnWaker` solo con configuración, más una alerta si un vencimiento pasa sin tick (E19).
    - Se vuelve a la opción recomendada si:
      - más del 5 % de los avisos quedan `skipped` en 7 días;
      - cambia el plan gratuito;
      - el **ahorro medido en una semana es menor de 1,5 $/mes** (E15).
    - **Ojo**: el ahorro estimado (≈ 1,3 $) ya está por debajo de ese umbral, así que lo más probable es que QStash no supere su propia condición.
  - **Descartadas**: el cron de GitHub, los pings frecuentes, cron-job.org, EventBridge, Cloud Tasks, Cloudflare (sería un segundo servicio), ntfy (obliga a instalar una app), OneSignal y las soluciones solo en el cliente.
- **Envío**:
  - idempotencia con reclamo previo (`reminder_deliveries`, PK usuario + tipo + fecha de la noche);
  - `TTL` y `Topic`;
  - `web-push` con versión fijada y justificada, o push sin payload;
  - `zonedToUtc` con Intl: las horas inexistentes se adelantan y las ambiguas usan la primera ocurrencia.
- **Seguridad**:
  - lista de hosts de push permitidos (anti-SSRF);
  - VAPID como secreto de Fly, con runbook.
- **Experiencia**:
  - el permiso se pide solo tras "Activar avisos", con una explicación previa;
  - botón "Enviarme un aviso de prueba";
  - "No molestar" y "silenciar hoy".
- **Operación**:
  - podar `reminder_deliveries` a los 90 días;
  - borrar la suscripción al cerrar sesión y excluirla de la exportación;
  - `TICK_TOKEN` con rate limit;
  - ventana de recuperación de avisos perdidos mayor que la duración de un despliegue;
  - **ventanas de descarte por tipo de aviso**: `prepare` y `bedtime` hasta 10 min de retraso, `wake_check` hasta 60 min. Pasado ese tiempo se marcan como `skipped`, porque avisar tarde no sirve;
  - envío aislado por usuario con concurrencia ≤ 4, para que un 410 o un timeout no bloqueen a los demás;
  - `/api/health` de administración con `last_tick_at`, `pending_dues` y `skipped_24h`, sin datos personales.
- **Pruebas** (con cualquier disparador):
  - suite de contrato común a los dos `Waker`;
  - exactamente una entrega aunque haya ticks concurrentes;
  - 20 usuarios, uno con 410 y otro con timeout, sin afectar al resto;
  - recuperación de avisos tras un despliegue, respetando las ventanas por tipo;
  - humo en Docker con `--memory=256m` que incluya `web-push`;
  - E2E con el servicio de push simulado y el botón "aviso de prueba".

**008 · Multiusuario con perfiles (L).** **Condición cumplida** (P1 = sí). Entrada: [`008-multiusuario-perfiles.md`](../features/008-multiusuario-perfiles.md). Añade la historia "Mi perfil": nombre, zona horaria, objetivo y preferencias. Se apoya en 004, que ya
deja `user_id` en todas las tablas.

- Invitaciones de un solo uso que caducan a las 72 h. Registro sin invitación → 403.
- Capa `repo/` con `userId` obligatorio, meta-test sobre `sqlite_master` y **suite de aislamiento de dos
  usuarios** en todos los endpoints: un id ajeno → 404.
- Corrige el IDOR de `DELETE /metrics/:id/entries/:date`. `assertNoOtherOpen` y `/sleep/open` pasan a ser
  por usuario, con índice parcial por `user_id`.
- Semilla de métricas por usuario (hoy es global en `db.js`).
- Zona horaria por usuario.
- Recuperación de contraseña por email. Hasta ≤ 5 usuarios se admite la recuperación manual (UX-12). La
  invitación explica que "nadie más ve tus datos".
- **Borrar la cuenta**: 0 filas en la base viva y **purga de los respaldos en ≤ 14 días** (retención S3).
- `BACKUP_TOKEN` pasa a ser global de operación, con **respaldos cifrados en el cliente**.
- RGPD art. 9: consentimiento explícito y política de privacidad. Valorar la exención doméstica si solo es
  familia.
- Enmienda MAJOR de alcance.

**009 · Sincronización OAuth con un proveedor (L).** Condiciones: P2 (Oura, Polar, Withings, WHOOP o Google
Health API; la API antigua de Fitbit se apaga el 30-sep-2026), 004 hecha, 008 si conecta más de una
persona, y P5 (coste).

- Tablas `user_connections`, `sync_jobs` con lease y reanudación, y `webhook_events` para deduplicar.
- Cifrado AES-256-GCM con AAD `user_id|provider` y `key_version`.
- `express.raw` + HMAC en los webhooks; el payload se trata como aviso y se hace pull.
- Un mutex por conexión para el refresh token.
- SLA: "al abrir la app o recibir un webhook" (sin < 15 min).
- UX-08: qué se comparte ("solo tu sueño") y, al desconectar, elegir entre conservar o borrar.
- R7: estado de sincronización visible y contador en `/api/health`.
- R4: si se pierde `TOKEN_ENC_KEY`, hay que reconectar, pero no se pierden datos. El respaldo global incluye los tokens cifrados.
- Política de privacidad publicada (la exigen WHOOP y Google), y consentimiento y revocación según el
  principio VIII.
- **Reverificar** las cifras vistas solo en resultados de búsqueda antes de especificar.

### Backlog y descartes

| ID | Idea | Cuándo |
|----|------|--------|
| B-1 | Relación sueño ↔ métricas, en frases ("suelen ir juntos; puede ser casualidad") | ≥ 30 noches con la métrica y P4 respondida. Emparejar por la mañana del despertar. Sin IC de Fisher sobre Spearman |
| B-2 | Diferencia entre semana y fin de semana, mapa de calor, índice de regularidad (SRI) | Con datos de despertares (007/009). Antes, verificar la fuente del SRI |
| B-4 | Passkeys | Tras 008 |
| — | **Descartadas**: tendencias por fase (riesgo de ortosomnia, κ bajo), agregadores de pago, Garmin/Samsung/Zepp directo, apps nativas | — |

## Esquema de datos unificado (destino tras 003–013)

```text
schema_migrations(version PK, name, checksum, applied_at)                         -- 003
users(id, email UNIQUE NOCASE, password_hash, role, timezone, created_at)       -- 004
sessions(id_hash PK, user_id → users CASCADE, expires_at, last_seen_at)         -- 004
user_settings(user_id PK, sleep_goal_min 240..720, cycle_min 70..110,
              latency_min, metric_lag, workdays)                                -- 004/005/006
sleep_records(+user_id NOT NULL DEFAULT owner, +source DEFAULT 'manual',
              +sol_bucket, +awakenings_bucket)                                  -- 004/006/007
  UNIQUE INDEX una_noche_abierta(user_id) WHERE wake_time IS NULL               -- 003 → por usuario en 004
naps(+user_id), metrics(+user_id)                                               -- 004
import_batches(id, user_id, kind, sha256, UNIQUE(user_id, sha256))              -- 007
sleep_sessions(id, user_id, source, external_id, start_time, end_time, night_date,
               sleep_record_id NULL, status, is_primary, import_batch_id,
               UNIQUE(user_id, source, external_id))                            -- 007
sleep_stages(session_id → CASCADE, stage awake|light|deep|rem|unknown, start_time, end_time)  -- 007
schedule_versions(id, user_id, effective_from, UNIQUE(user_id, effective_from))  -- 010, solo inserciones
schedule_days(version_id, weekday 0..6, bed_min, wake_min, active)             -- 010
user_settings(+lead_min)                                                       -- 010
pauses(id, user_id, start_date ≥ hoy, end_date)                              -- 010, compartida con 011
user_settings(+streaks_enabled, +wake_window_min)                              -- 011
user_milestones(user_id, key, achieved_on, seen_at, UNIQUE(user_id, key))      -- 011
invites / password_resets                                                        -- 008
user_connections / sync_jobs / webhook_events                                   -- 009
push_subscriptions / reminder_deliveries                                        -- 013
```

## Enmiendas a la constitución (calendario)

Se aplican con `/speckit-constitution`, cada una **antes del plan** de la feature que la necesita:

| Enmienda | Tipo | Antes de |
|----------|------|----------|
| II: reconstruir una tabla con copia verificada en la misma migración (patrón SQLite de 12 pasos) no es "DROP de datos"; toda migración va por el runner con respaldo previo | PATCH | Plan de 004 |
| VIII nuevo "Datos de salud: privacidad y honestidad": origen declarado, lenguaje no clínico, "sin dato" ≠ 0, estadísticos solo con n mínima y en lenguaje no causal, consentimiento y revocación por fuente, tokens cifrados, **notificaciones sin datos de salud** | MINOR | Plan de 006 |
| VIII, ampliación: la motivación se basa solo en conductas controlables; se prohíben las puntuaciones de resultado, la comparación social, las recompensas canjeables y las alertas de pérdida; toda gamificación es opcional y ocultable | MINOR | Plan de 011 |
| II: el borrado que pide el propio usuario (de una fuente o de su cuenta) no es DROP | MINOR | Plan de 008 (el primero que la necesita) |
| Alcance: de mono-usuario a multiusuario con aislamiento estricto | MAJOR | Plan de 008 |

## Evaluación

Rúbrica: C1 valor 25 %, C2 factibilidad 20 % (O), C3 constitución 20 % (O), C4 privacidad 15 % (O),
C5 esfuerzo y riesgo 10 %, C6 testabilidad 10 %. Aprueba con nota ≥ 3,5, criterios obligatorios ≥ 3 y el
checklist completo.

| Feature | Ronda 1 | Revisiones aplicadas | Ronda 2 |
|---------|---------|----------------------|---------|
| 003 | 4,25 · aprobada | V-05, V-06 | **4,25 · aprobada** |
| 004 | 3,70 · revisión (R1) | V-01 a V-04 | **4,00 · aprobada** |
| 005 | 4,65 · aprobada | V-07 | **4,65 · aprobada** |
| 006 | 4,20 · aprobada | V-08, V-09 | **4,20 · aprobada** |
| 007 | 3,30 · revisión | V-10 a V-12, V-13 | **3,90 · aprobada** (sujeta a P2 y al spike) |
| 007 con Huawei (tras P2) | 3,80 · revisión | V-27 a V-29 | **4,10 · aprobada** (sujeta al spike con tu exportación real) |
| 008 como entrada completa (tras P1) | 4,30 · revisión | V-24 a V-26, V-30 | **4,45 · aprobada** |
| 010 | 4,50 · revisión | V-14, V-16, V-17 | **4,60 · aprobada** (sujeta al spike de calendario) |
| 011 | 4,10 · revisión | V-15, V-18 a V-23 | **4,45 · aprobada** |

En la ronda 2 el evaluador confirmó que todas las revisiones quedaron resueltas (V-10 era parcial; se completó con el criterio de salida del spike). También pidió correcciones en las entradas, ya aplicadas: prioridades por historia, la regla de conciliación en 007, la rotación de sesiones y la entrada del token por formulario en 004, el rango del objetivo en 005 y la latencia configurable en 006. 008 y 009 son semillas bien condicionadas.

## Registro de debate (resumen)

| Crítica | Decisión |
|---------|----------|
| El multiusuario sin demanda confirmada choca con VI (E1) | Se divide: 004 (paso 1, sin cambio de alcance) + 008 condicionada. **No se descarta**: 004 deja `user_id` en todas las tablas |
| scrypt en 256 MB (E2/X3) | Un hash a la vez, rate limit antes del hash, humo con 256 MB |
| Triggers para NOT NULL (E3) | Reconstrucción verificada + PATCH de II |
| Rollback con esquema nuevo (R1, V-01) | Expand/contract: `NOT NULL DEFAULT <propietario>`; el código N−1 pasa el humo con el esquema N |
| Dos modelos de fases (E5/X10) | Esquema unificado; 007 es el dueño |
| Export de Apple > 1 GB en 256 MB (E6/X11/V-10/V-11) | Procesado en el navegador + spike con un export real + criterio medible en Chromium e iOS |
| SLA de 15 min con auto-stop (E7/X13) | Sin SLA; lease + pull al abrir |
| Fuentes vistas solo en resultados de búsqueda (E8) | SRI aplazado; cifras de 009 marcadas para reverificar; ciclo 70–110 min (fuente abierta) |
| Horas duplicadas (X8) | La duración solo se lee de `sleep_records` |
| El diario rompe el gesto único (UX-01) | Tarjeta posterior, opcional y condicionada a P3 |
| Jerga estadística (UX-04/05) | 3 KPIs, frases, glosario; correlaciones al backlog |
| Migración con terminal (UX-10, V-02) | Alta y recuperación con `OWNER_SETUP_TOKEN` rotando el secreto en el panel de Fly |
| Índice único con datos sucios (V-05) | Verificación previa que aborta limpio |
| Faltaba la matriz de factibilidad (evaluador) | Añadida arriba |
| **Ronda 2**: una racha que no cuenta los días sin registrar premia omitir datos (E9/X17) | Un día sin registrar cuenta como no cumplido |
| **Ronda 2**: la gamificación reabre el rechazo por ortosomnia (E10) | Solo conductas controlables, opt-in, sin puntuaciones de resultado; evidencia de fuentes abiertas; enmienda VIII ampliada |
| **Ronda 2**: dos modelos de horario; "a tiempo" por la hora de acostarse (E11/X18) | 010 es la dueña (`schedule_versions`); solo puntúa la hora de levantarse |
| **Ronda 2**: los disparadores externos impiden el auto-stop (E12/X21) | Solo máquina encendida (013, condicionada a P5); la fase 1 no necesita servidor |
| **Ronda 2**: la recompensa se queda en mensajes y la opción desactivada queda invisible (defensor) | Constelaciones permanentes con dato personal; se ofrece en la bienvenida |
| **Ronda 2**: PWA, criptografía, SSRF, VAPID, ICS y zonas horarias (E13–E14, X22–X29) | Resuelto en 010, 012 y 013 (ver [31-reflexion-r2](anexos-2026-09-29/31-reflexion-r2.md)) |

Material completo de la sesión en [`anexos-2026-09-29/`](anexos-2026-09-29/):

- la rúbrica;
- 6 investigaciones ReAct: A–D, y E–F sobre gamificación y recordatorios;
- 2 rondas de debate con 3 críticos cada una;
- las 2 reflexiones;
- las evaluaciones.
