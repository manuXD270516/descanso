# Research: Avisos push con la app cerrada (013)

Formato: Decisión / Razón / Alternativas. Entrada y diseño de referencia:
`docs/sdd/features/013-avisos-push.md` ("Contexto técnico" y "Aspectos de código"),
`docs/sdd/propuestas/2026-09-29-set-de-features.md` (feature 013, P5b) y los anexos 17, 26, 27, 32 y 42.
Aclaraciones del 2026-10-08 en [`spec.md`](spec.md). Spike previo al plan en un Android real:
[`spike/README.md`](spike/README.md) (2026-10-23). Constitución v2.2.0.

## R1. Disparador dentro del servicio, siempre encendido

- **Decisión**: un módulo `backend/src/reminders/waker.js` con `startWaker(tick, { intervalMs = 30_000 })`
  → `{ stop() }`:
  - **tick inmediato al arrancar** (recupera lo que siga en ventana tras un despliegue, FR-011) y
    después `setInterval` cada 30 s, con `unref()` para no retener el proceso;
  - **mutex en proceso**: si un tick sigue en curso, el siguiente se salta (no se apilan);
  - `stop()` en `SIGTERM`/`SIGINT` para un cierre limpio durante el despliegue;
  - lo arranca **`server.js`** (no `app.js`, así supertest no levanta temporizadores) solo si
    `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` están definidas y `REMINDER_WAKER` no es
    `off`; si faltan, registra un aviso en el log y la feature queda desactivada (FR-024), igual que
    `/api/admin` sin `BACKUP_TOKEN`.
  - `fly.toml`: `min_machines_running = 1` (la máquina deja de apagarse sin tráfico).
- **Razón**: decisión del owner (P5b, 2026-09-29): sin terceros de programación, porque las horas de
  los avisos revelan hábitos de sueño; sin arranques en frío y con el rate limit en memoria de 004 por
  fin fiable. 30 s de intervalo deja margen de sobra para ± 2 min (FR-009). El spike midió un pico de
  54 MB con la app real, `web-push` y un tick cada 30 s durante 10 min (límite: 256 MB).
- **Alternativas**:
  - `QStashWaker` u otro programador externo (QStash, cron de GitHub, cron-job.org, Cloud Tasks):
    descartados por el owner (P5b) y fuera de alcance (FR-023).
  - Una interfaz `Waker` con suite de contrato común a varias implementaciones (propuesta de la
    entrada): solo hay una implementación; la suite de contrato se reduce a los tests del propio
    `waker.js` (principio VI). Si algún día vuelve QStash, se extrae entonces.
  - `TICK_TOKEN` y un endpoint de tick: solo tenían sentido con un disparador externo.

## R2. Cálculo puro de vencimientos (`backend/src/reminders/schedule.js`)

- **Decisión**: `dueReminders({ now, users })` → `[{ userId, kind, nightDate, dueUtc, dueIso, windowMin, state }]`,
  sin I/O. Cada `user` trae `{ id, timezone, lead_min, kinds, since, versions, pauses, openNight, deliveries }`.
  - **Noches candidatas**: `hoy − 2`, `hoy − 1` y `hoy`, siendo "hoy" la fecha de pared de `now` en la
    zona del perfil. Cubren una hora de acostarse después de medianoche (noche `hoy − 1`), el
    `wake_check` de esta mañana (noche `hoy − 1`) y un `wake_check` que pase de medianoche con una hora
    de levantarse ≥ 23:00 (noche `hoy − 2`).
  - Para cada noche N: versión de 010 vigente en N (mayor `effective_from` ≤ N; a igualdad, id mayor),
    día `weekday(N)` (0 = domingo); sin versión, día inactivo o N en pausa → ningún vencimiento
    (FR-015).
  - Instantes (hora de pared → UTC con `zonedToUtc`, R3):
    - acostarse: fecha N a `bed_min`, o N + 1 si `bed_min` < 720 (después de medianoche, 010-R1);
    - `prepare` = acostarse − `lead_min`; `bedtime` = acostarse;
    - `wake_check` = fecha N + 1 a `wake_min` + 60 min.
    La resta de `lead_min` y la suma de 60 min se hacen **en minutos de pared** antes de convertir,
    para que "22:45" sea 22:45 también el día de un cambio de horario.
  - Tipo desactivado → sin vencimiento. `wake_check` solo si hay una noche abierta cuya **noche de
    horario** es N (la regla de 011-R2: la `date` de la noche registrada si su hora de acostarse es
    ≥ 12:00; si no, la del día anterior), como "¿Ya despertaste?" de 010-R5.
  - **Versión del horario**: la vigente en la fecha de la noche N (FR-009), también para `wake_check`.
    El "¿Ya despertaste?" dentro de la app usa la vigente hoy (010-R5); solo difieren si el horario se
    cambia entre la noche y la mañana siguiente, y entonces manda FR-009 (la spec es explícita).
  - Solo cuentan los vencimientos con `dueUtc ≥ since` (el `created_at` del dispositivo activo más
    antiguo de la persona): activar los avisos a mediodía no genera descartes de la noche anterior.
  - Estado de cada vencimiento, con `w` = ventana del tipo (`windows.js`: 10 min para `prepare` y
    `bedtime`, 60 min para `wake_check`):
    - ya hay entrega para (tipo, N) → se ignora;
    - `now < dueUtc` → futuro (solo cuenta para `pending_dues`);
    - `dueUtc ≤ now < dueUtc + w` → **para enviar**;
    - `now ≥ dueUtc + w` → **para descartar** (`skipped`, motivo `late`).
- **Razón**: la entrada pide un núcleo puro y testeable con relojes falsos. Recalcular en cada tick
  (en vez de guardar vencimientos futuros) hace que un cambio de tipos, horario, "Avisarme antes",
  zona o pausa rija desde el siguiente aviso no enviado sin invalidar nada (FR-017, US2-11).
- **Alternativas**: materializar una tabla de vencimientos futuros (hay que reprogramarla con cada
  cambio y se desincroniza); evaluar solo `hoy` (pierde las noches después de medianoche y los
  `wake_check` de la mañana).

## R3. Hora de pared + zona IANA → instante (`backend/src/reminders/zoned.js`)

- **Decisión**: `zonedToUtc(dateIso, minuteOfDay, timeZone)` → `{ utcMs, iso }` con
  `Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', … }).formatToParts`, sin librerías:
  1. se toma el instante "ingenuo" (la hora de pared como si fuera UTC) y se le resta el desfase de la
     zona en ese instante; se repite una vez con el desfase del resultado (dos iteraciones bastan con
     cambios de 30 o 60 min);
  2. si la hora de pared del resultado no coincide con la pedida, la hora **no existe** (salto de
     primavera) → se avanza minuto a minuto hasta la primera hora de pared válida posterior (como
     mucho 60 iteraciones);
  3. si la hora de pared existe dos veces (otoño), se elige la **primera** ocurrencia (el desfase
     mayor, el de verano).
  - `iso` es el instante en ISO 8601 **con el desfase de la zona** en ese instante
    (`2026-10-25T02:30:00+02:00`), que es lo que se guarda en `reminder_deliveries.due_at`
    (principio III).
  - `localParts(utcMs, timeZone)` → `{ date, minuteOfDay, weekday }`: "hoy" de la persona y la
    comprobación de "No molestar" (R9).
- **Razón**: FR-009 y la regla de DST de la entrada (inexistente → primera válida posterior; ambigua →
  primera ocurrencia). Node 22 trae ICU completo, así que `Intl` conoce todas las zonas IANA que el
  perfil acepta (008 valida con `Intl.supportedValuesOf('timeZone')`).
- **Pruebas explícitas (principio III)**: `Europe/Madrid` (29-03-2026 02:30 no existe → 03:00;
  25-10-2026 02:30 ambigua → +02:00) y `America/Santiago` (cambios de abril y septiembre de 2026, con el
  salto a medianoche: 00:15 inexistente → 01:00), noche que cruza medianoche y fecha de la noche
  correcta (SC-001).
- **Alternativas**: Luxon, date-fns-tz o Temporal con polyfill (dependencias nuevas, principio I);
  guardar los vencimientos en UTC sin desfase (contradice el principio III).

## R4. Exactamente una vez: reclamo previo y estados

- **Decisión**: tabla `reminder_deliveries` con PK `(user_id, kind, night_date)` (data-model).
  1. **Reclamo**: `INSERT INTO reminder_deliveries (…, status) VALUES (…, 'claimed') ON CONFLICT DO
     NOTHING`; solo quien inserta (`changes = 1`) sigue. Dos ticks concurrentes, un reinicio o un
     despliegue nunca envían dos veces (FR-010, SC-002).
  2. **Comprobaciones en el momento del envío**, ya reclamado:
     - `prepare`/`bedtime` con una noche abierta → `skipped`, motivo `night_open` (FR-016);
     - noche N ≤ `muted_until` → `skipped`, `muted` (FR-018);
     - instante actual dentro de "No molestar" en la zona del perfil → `skipped`, `dnd` (FR-018: se
       evalúa al enviar, no al calcular).
  3. Envío a todos los dispositivos de la persona (R7); `sent` si al menos uno lo aceptó; si ninguno,
     `failed` con el motivo (`expired`, `timeout`, `error`, `no_devices`).
  4. Vencimientos para descartar (R2) → `INSERT … 'skipped'`, motivo `late`, con el mismo `ON CONFLICT
     DO NOTHING`.
  5. **Envío interrumpido**: un `claimed` con `updated_at` de hace más de 5 min (el proceso murió a
     mitad) pasa a `failed`, motivo `interrupted`, y **no se reintenta** (FR-010).
  - El tick guarda en memoria `last_tick_at` y `pending_dues` para la salud de administración (R13).
- **Razón**: es el patrón de la entrada (`INSERT … ON CONFLICT DO NOTHING`, "solo el que inserta
  envía"); SQLite serializa las escrituras, así que el reclamo es atómico también entre dos ticks del
  mismo proceso en las pruebas.
- **Alternativas**: un `SELECT` previo y luego `INSERT` (carrera entre ticks); reintentar los
  interrumpidos (podría duplicar un aviso que sí llegó, contra FR-010).

## R5. Envío con `web-push` 3.6.7 (versión exacta)

- **Decisión**: dependencia nueva `web-push` con versión **exacta** `"web-push": "3.6.7"` (sin `^`) en
  `backend/package.json` y bloqueada en `package-lock.json`. `backend/src/reminders/push.js` envuelve
  `webpush.sendNotification(subscription, payload, options)`:
  - `TTL` = ventana de descarte del tipo en segundos (600 para `prepare`/`bedtime`, 3.600 para
    `wake_check`; 60 para el aviso de prueba): un aviso que no se entrega a tiempo caduca en el
    servicio de push y nunca aparece tarde (spike 4a);
  - `topic` = tipo (`prepare`, `bedtime`, `wake_check`, `test`): el servicio de push colapsa dos avisos
    pendientes del mismo tipo (spike 4b);
  - `urgency: 'high'` (spike 8: con Doze forzado ni `high` ni `normal` se mostraron antes; `high` es lo
    mejor posible);
  - `timeout: 10_000` ms por envío;
  - carga cifrada (aes128gcm) con `{ kind, night, title, body, tag, url }` (contracts/service-worker.md);
    `tag` = `<tipo>-<fecha de la noche>` y `url` = `/#noche` (`prepare`, `bedtime`, prueba) o
    `/#noche-despertar` (`wake_check`);
  - resultado: `ok`; `expired` si el servicio responde **404 o 410** (spike 6: 410 inmediato al retirar
    el permiso) → se borra el dispositivo (FR-007); `timeout`; `error` (otro código o red).
  - VAPID: `setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)` una vez al arrancar.
- **Razón**: Web Push exige firmar un JWT VAPID (ES256) y cifrar la carga según RFC 8291; hacerlo a
  mano son ~200 líneas de criptografía sensibles a errores. `web-push` es la implementación de
  referencia, la que validó el spike (entrega, TTL, Topic, 410) y la que se midió en memoria. La
  versión exacta evita que una actualización menor cambie el comportamiento sin revisión. Sus
  dependencias (`asn1.js`, `http_ece`, `https-proxy-agent`, `jws`, `minimist`) son pequeñas y sin
  código nativo. Se registra en Complexity Tracking (principio I).
- **Alternativas**:
  - Implementación propia con `node:crypto` (riesgo de errores de cifrado sin beneficio).
  - **Push sin carga** (sin cifrado, solo VAPID): el service worker tendría que pedir el texto a la API
    con la cookie y mostrar algo genérico si falla; más piezas y peor con el móvil sin red estable.

## R6. Solo servicios de push de navegador conocidos (anti-SSRF)

- **Decisión**: `validateSubscription({ endpoint, keys })` en `backend/src/reminders/push.js`:
  - `endpoint`: URL `https:` sin credenciales ni puerto explícito, de ≤ 1.024 caracteres, cuyo host
    es exactamente `fcm.googleapis.com` o `web.push.apple.com`, o termina en
    `.push.services.mozilla.com` o `.notify.windows.com` (FR-023);
  - `keys.p256dh`: base64url de 65 bytes (87 caracteres); `keys.auth`: base64url de 16 bytes
    (22 caracteres);
  - si no → 400 "Este navegador no usa un servicio de avisos compatible" o "Datos del dispositivo no
    válidos".
  - Se valida al guardar **y** antes de cada envío (defensa en profundidad).
  - **Costura de pruebas** (R17): con `NODE_ENV=test` y `PUSH_TEST_ORIGIN=http://127.0.0.1:<puerto>`,
    se admite además ese único origen de loopback. Con cualquier otro `NODE_ENV` la variable se
    ignora y se registra un aviso si está definida; un test lo comprueba. La imagen Docker fija
    `NODE_ENV=production`.
- **Razón**: el servidor hace peticiones salientes a la URL que da el cliente: sin lista cerrada
  sería un SSRF hacia la red interna de Fly. La lista es la de la entrada.
- **Alternativas**: resolver DNS y bloquear IP privadas (más complejo y frágil); aceptar cualquier
  host HTTPS (SSRF).

## R7. Envío aislado por persona, concurrencia ≤ 4

- **Decisión**: `tick.js` procesa las personas con un *pool* de como mucho 4 tareas simultáneas; cada
  tarea envía a los dispositivos de **una** persona en paralelo, con el timeout de 10 s por envío
  (R5). Un 410, un timeout o una excepción en una persona se capturan en su tarea y nunca rompen el
  tick ni retrasan a las demás más allá de 10 s (FR-014). Con 20 personas, el peor caso es
  ⌈20 / 4⌉ × 10 s = 50 s < 2 min (SC-004).
- **Razón**: la entrada; el mutex del tick (R1) evita que un tick lento se solape con el siguiente.
- **Alternativas**: envío secuencial (un dispositivo colgado retrasaría a todos); sin límite (picos de
  sockets y memoria en 256 MB).

## R8. Dispositivos ligados a la sesión, únicos por `endpoint`

- **Decisión**: tabla `push_subscriptions` (data-model):
  - `endpoint` `UNIQUE` en toda la app; `POST /api/push/subscriptions` es idempotente por `endpoint`
    (`INSERT … ON CONFLICT(endpoint) DO UPDATE`): activar de nuevo el mismo navegador no lo duplica
    (FR-006) y, si lo activa **otra persona**, el dispositivo pasa a ser suyo y desaparece de la lista
    de la primera (Edge Cases);
  - **`session_hash`** = huella de la sesión que lo activó, con `REFERENCES sessions(id_hash) ON DELETE
    CASCADE`: cerrar sesión en ese navegador borra su dispositivo sin código extra en el logout de 004
    (FR-007, US1-9), y lo mismo ocurre si la sesión caduca o se cierra al cambiar la contraseña desde
    otro dispositivo (Edge Cases, "Sesión cerrada por otra vía"). El tick solo envía a dispositivos
    cuya sesión sigue vigente (`expires_at > now`), porque 004 borra las sesiones caducadas de forma
    perezosa;
  - como mucho **5 por persona**: el sexto → 409 "Ya tienes 5 dispositivos con avisos; quita uno para
    añadir este" (FR-006);
  - `label` lo calcula el servidor del `User-Agent` con una función pura `deviceLabel(ua)` →
    "<navegador> en <sistema>" (Chrome, Firefox, Edge, Samsung Internet, Opera; Android, iPhone,
    Windows, macOS, Linux; si no se reconoce, "Navegador"), sin guardar el `User-Agent`;
  - la lista (`GET /api/push`) nunca devuelve `endpoint` ni claves (FR-006); devuelve un
    `fingerprint` (16 caracteres hexadecimales del SHA-256 del `endpoint`) para que el navegador
    marque "Este móvil" comparándolo con la huella de su propia suscripción (`crypto.subtle`), sin
    mandar el `endpoint` en una URL.
  - Quitar un dispositivo: `DELETE /api/push/subscriptions/:id` (lo ajeno → 404). Al desactivar en el
    propio navegador, el cliente además llama a `subscription.unsubscribe()`.
  - Al cerrar sesión, el cliente llama a `unsubscribe()` antes del logout (mejor esfuerzo); la garantía
    la da el `ON DELETE CASCADE`.
- **Razón**: FR-006, FR-007 y el caso del navegador compartido sin lógica de reconciliación. Ligar
  el dispositivo a la sesión hace que "dejar de recibir al cerrar sesión" sea una propiedad del
  esquema, también tras un rollback (el código anterior borra sesiones y la FK actúa igual).
- **Alternativas**:
  - Que el logout reciba el `endpoint` y lo borre (depende de que el cliente lo envíe; falla si la
    sesión se cierra por otra vía).
  - Devolver el `endpoint` en la lista (expone un identificador técnico, contra FR-006).

## R9. Preferencias en `user_settings`

- **Decisión**: columnas nuevas (data-model):
  - `push_prepare`, `push_bedtime`, `push_wake_check` `INTEGER NOT NULL DEFAULT 1` (los tres activos
    por defecto, aclaración del 2026-10-08);
  - `dnd_start_min`, `dnd_end_min` `INTEGER NULL` (0–1439, los dos a la vez o ninguno, distintos):
    "No molestar" desactivado por defecto;
  - `muted_until` `TEXT NULL` (`AAAA-MM-DD`, fecha de la noche).
  - **"Silenciar hoy"**: `PUT /api/push/preferences { mute_today: true }` fija `muted_until` = hoy en
    la zona del perfil (lo calcula el servidor); `false` lo vacía (deshacer). Silencia la noche de hoy
    y las anteriores pendientes (`night_date ≤ muted_until`), y vuelve con la noche de mañana (FR-018).
  - **"No molestar"** en el momento del envío: `m` = minuto de pared actual en la zona del perfil; si
    `start < end`, dentro ⇔ `start ≤ m < end`; si `start > end` (cruza medianoche), dentro ⇔
    `m ≥ start` o `m < end`.
- **Razón**: preferencias de la persona, comunes a todos sus dispositivos (FR-017), como `lead_min`
  (010) y la racha (011). Tres columnas booleanas se validan con `CHECK` (una lista en texto no).
- **Alternativas**: tabla `push_preferences` aparte (una fila por persona: es lo que ya es
  `user_settings`); preferencias por dispositivo (contra FR-017).

## R10. API `/api/push`

- **Decisión**: router `backend/src/routes/push.js` montado en `/api/push` **después** de `csrf` y
  `requireAuth` (FR-029); contrato en [`contracts/openapi-delta.yaml`](contracts/openapi-delta.yaml):
  - `GET /api/push` → `{ available, public_key, timezone, preferences, devices[] }` (una sola carga del
    bloque); sin credenciales VAPID, `available: false` y `public_key: null` (FR-024);
  - `PUT /api/push/preferences` → tipos, "No molestar" y "Silenciar hoy";
  - `POST /api/push/subscriptions` → activa este dispositivo (y guarda la zona horaria si el perfil no
    tenía, R14);
  - `DELETE /api/push/subscriptions/:id` → quita un dispositivo;
  - `POST /api/push/subscriptions/:id/test` → aviso de prueba a ese dispositivo propio, ignorando
    "No molestar" y "Silenciar hoy" (FR-020), con límite de **3 por minuto y persona** (FR-021) con
    `createRateLimiter({ max: 3, windowMs: 60_000 })` de 004, clave `user:<id>`, contando cada intento;
    el cuarto → 429 "Espera un momento antes de probar otra vez". Responde `{ result: 'sent' | 'expired'
    | 'failed' }`; con `expired` el dispositivo ya se ha borrado (US4-2).
  - Sin credenciales VAPID, las escrituras responden 503 "Los avisos no están disponibles".
- **Razón**: el mínimo que cubre US1, US3, US4 y US5; `GET /api/push` evita tres peticiones al abrir
  el bloque.
- **Alternativas**: la lista de 6 rutas de la entrada (`public-key`, `subscription` por `endpoint`,
  `test` del dispositivo actual por `endpoint`): obligaba a mandar el `endpoint` para identificar el
  dispositivo actual; con el `fingerprint` (R8) basta el `id`.

## R11. Service worker propio y mínimo (`frontend/public/push-sw.js`)

- **Decisión**: un service worker de unas 50 líneas, servido como recurso estático, registrado con
  `navigator.serviceWorker.register('/push-sw.js')` solo desde "Activar avisos" o si el navegador ya
  tiene permiso concedido. Contrato en [`contracts/service-worker.md`](contracts/service-worker.md):
  - **`push`**: lee la carga; si hay una ventana de Descanso **visible**, le hace `postMessage` y **no**
    muestra notificación (FR-019; spike 3: Chrome no añade su notificación genérica); si no,
    `showNotification(title, { body, tag, icon, data: { url } })`.
  - **`notificationclick`**: cierra la notificación; si hay una ventana de Descanso, la enfoca y la
    navega a `data.url`; si no, `clients.openWindow(data.url)` (FR-013; spike 2).
  - **Sin manejador `fetch`** ni caché: no intercepta nada y no puede servir versiones viejas tras un
    despliegue.
- **Razón**: Web Push exige un service worker. El de Angular (`@angular/service-worker`) trae caché y
  ciclo de actualización que no hacen falta y que la 012 descartó por el riesgo de caché obsoleta.
- **Pruebas**: `backend/test/push-sw.test.js` carga el archivo en un `vm` de Node con `self`,
  `clients` y `registration` simulados (los tests de backend ya leen el frontend en
  `forbidden-terms.test.js`); Karma no puede ejecutar un service worker y el e2e no puede recibir un
  push real (R17).
- **Alternativas**: `@angular/service-worker` (más complejo, caché); importar un módulo compartido
  (un service worker clásico no comparte código con el bundle de Angular sin otra configuración de
  build).

## R12. Frontend: bloque "Avisos en este móvil"

- **Decisión**:
  - **Dónde**: "Ajustes" es, en esta app, el menú Cuenta; el bloque va en **Cuenta → Mi horario**
    (`my-schedule`), bajo el calendario de 010 y junto a la racha de 011, porque sus horas salen del
    horario. El enlace de FR-003 ("Primero agenda tu horario" → "Mi horario") lleva al editor de la
    misma vista.
  - `core/push.ts` (puro): `reminderTimes(version, weekday, lead)` → horas de hoy por tipo
    ("Prepárate · 22:45"), `blockState(...)` → `unsupported | unavailable | no_schedule | denied |
    needs_reactivation | off | on`, y los textos.
  - `core/push.service.ts`: `isSupported()` (`'serviceWorker' in navigator && 'PushManager' in window
    && 'Notification' in window`), `permission` (signal), `enable()` (registra el service worker,
    `Notification.requestPermission()` **solo dentro del manejador del clic**, `pushManager.subscribe({
    userVisibleOnly: true, applicationServerKey })` y `POST`), `disable()`, `sendTest(id)`,
    `currentFingerprint()` y el puente de mensajes del service worker.
  - `features/push/push-settings.component.ts`: explicación previa (FR-002, FR-005, FR-012 y los
    límites del spike: No molestar, ahorro de batería, reposo), estados (FR-004), lista de
    dispositivos con "Este móvil" (FR-006), interruptores por tipo con su hora de hoy (US3-1), "No
    molestar" con inicio y fin, "Silenciar hoy" / deshacer, y "Enviarme un aviso de prueba".
  - **Reactivación (FR-025)**: si el navegador tiene suscripción pero su `applicationServerKey` no
    coincide con `public_key` (rotación de VAPID) o su `fingerprint` no está en la lista (borrado por
    410, por otra sesión o por el owner), el estado es `needs_reactivation` con "Vuelve a activar los
    avisos"; activar de nuevo hace `unsubscribe()` y una suscripción nueva.
  - **Deep link**: `app.ts` amplía `openNightLink()` para `#noche-despertar` (Noche con "Ya desperté"
    a la vista) además de `#noche` (010). Sin sesión, la pantalla de entrada aparece y, tras entrar,
    la pestaña inicial ya es Noche (FR-013).
  - **Con la app visible (FR-019)**: `PushService` escucha `navigator.serviceWorker` `message` y lo
    pasa a `shared/bedtime-notice.component.ts` (010-R7), que muestra el texto con `role="status"`;
    si el aviso de 010 de ese día ya se mostró (`prepare`), no lo repite.
  - **Nunca se pide permiso al cargar** (FR-001, SC-007): ningún código llama a
    `requestPermission()` fuera de `enable()`; un spec lo vigila con un espía.
- **Razón**: principio VII (etiquetas, foco visible, `role="status"`, textos en español) y la UX de
  la entrada; el patrón `core/*.ts` puro + servicio + componente es el de 010 y 011.
- **Alternativas**: una vista "Ajustes" nueva (otra entrada de menú para un solo bloque).

## R13. Operación: salud de administración, poda, secretos y coste

- **Decisión**:
  - `GET /api/admin/health` (en `routes/admin.js`, con el mismo `Bearer BACKUP_TOKEN` que el respaldo)
    → `{ reminders: { enabled, last_tick_at, pending_dues, skipped_24h, failed_24h } }`, sin datos
    personales (FR-026). `/api/health` público no cambia.
  - **Poda** (FR-027): una vez al día dentro del tick (fecha UTC distinta de la última poda, en
    memoria), `DELETE FROM reminder_deliveries WHERE night_date < hoy − 90 días`. Es un registro
    operativo sin datos de salud, no historia personal: no le aplica la prohibición de DROP del
    principio II (la spec fija su retención).
  - **Secretos**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (`mailto:`) con
    `flyctl secrets set`; se generan en local con `npx web-push generate-vapid-keys` y nunca entran en
    el repositorio ni en el chat (principio V). `compose.yaml` las acepta como variables opcionales.
  - **Runbook** `docs/runbooks/rotar-vapid.md`: rotar invalida todas las suscripciones; los envíos
    responden 401/403/410, la app detecta la clave distinta y pide reactivar (FR-025).
  - **Coste**: `min_machines_running = 1` → ≈ 3,1 $/mes de cómputo (shared-cpu-1x, 256 MB, gru) +
    0,15 $/mes del volumen ≈ **3,3 $/mes** (SC-011); se anota en `README.md` y en R13 de 002 que deja de
    aplicarse el auto-stop.
- **Razón**: FR-024 a FR-027 y SC-011.

## R14. Zona horaria del perfil sin fijar

- **Decisión**: si `users.timezone` es `NULL` (008 la deja sin fijar hasta que se acepta), el bloque
  muestra en la explicación "Tus avisos usarán la zona horaria <zona del navegador>" y
  `POST /api/push/subscriptions` acepta `timezone` (validada como en `PUT /api/me`) y la guarda en el
  perfil **solo si estaba vacía**. Sin zona horaria, el tick no calcula avisos para esa persona.
- **Razón**: la regla de 008 ("el perfil propone la del navegador") aplicada al único sitio donde 013
  la necesita, sin añadir un paso (SC-008: 2 toques). Queda como pregunta de confirmación no
  bloqueante para el owner.
- **Alternativas**: deshabilitar el botón con "Primero fija tu zona horaria" (un paso más); usar UTC
  (avisos a una hora equivocada).

## R15. Exportación, borrado de cuenta y aislamiento

- **Decisión**:
  - La exportación JSON (`repo/export.js`) añade `push_preferences` (tipos, "No molestar",
    `muted_until`); **no** exporta `push_subscriptions` (credenciales del navegador) ni
    `reminder_deliveries` (registro operativo de 90 días sin datos de la persona más allá de su
    horario, que ya se exporta) (FR-028).
  - Borrar la cuenta borra todo por `ON DELETE CASCADE` (`users` → `push_subscriptions`,
    `reminder_deliveries`; `user_settings` ya lo hacía).
  - `isolation.test.js`: las 5 rutas de `/api/push` (B no ve, cambia, prueba ni borra los dispositivos
    ni las preferencias de A; lo ajeno → 404); un tick con A y B nunca envía a un dispositivo de otra
    persona. `schema-isolation.test.js`: `push_subscriptions` y `reminder_deliveries` como tablas con
    `user_id` (SC-010).
- **Razón**: FR-028, FR-029 y la sección de Alcance de la constitución.

## R16. Migración y compatibilidad (expand/contract)

- **Decisión**: `backend/src/migrations/011_avisos_push.js` (la siguiente tras `010_rachas.js`), solo
  *expand*: `CREATE TABLE IF NOT EXISTS` para las dos tablas e índices, y `ADD COLUMN` con `DEFAULT` o
  `NULL` en `user_settings`, comprobando antes `PRAGMA table_info` (patrón de 009 y 010).
  `compat-previous-013.test.js` ejecuta las sentencias de 011 (master antes de 013) que tocan
  `user_settings` y `sessions` (racha, `lead_min`, crear y borrar sesión, cambiar contraseña,
  exportar, borrar cuenta) sobre el esquema con 011, y comprueba que borrar una sesión borra su
  dispositivo. Los tests de migraciones anteriores que hagan huellas de `user_settings` se fijan a su
  era con `migrationsUpTo(10)`.
- **Razón**: principio II y `docs/sdd/guia-migraciones.md`; el rollback a la imagen de 011 sigue
  funcionando (no ejecuta el tick y las tablas nuevas quedan quietas).

## R17. Costura de pruebas para el e2e (sin push real)

- **Decisión**: el e2e (`e2e/tests/avisos.spec.ts`) no puede recibir un push real: Chromium de
  Playwright no tiene servicio de push (FCM) y el servidor no debe hablar con Google en CI.
  1. **Navegador**: `context.grantPermissions(['notifications'])` y un `page.addInitScript` **del propio
     test** que sustituye `PushManager.prototype.subscribe`/`getSubscription` por una suscripción
     falsa con `endpoint = <PUSH_TEST_ORIGIN>/push/<id>` y claves válidas generadas con
     `crypto.subtle`. Vive solo en `e2e/`, nunca en `frontend/src`.
  2. **Servicio de push simulado**: `e2e/support/fake-push.ts`, un servidor HTTP local que registra
     cada petición (cabeceras `TTL`, `Topic`, `Urgency`, `Authorization: vapid …`) y responde 201 o,
     si el test lo pide, 410.
  3. **Servidor**: `AppServer.start(..., { NODE_ENV: 'test', PUSH_TEST_ORIGIN, VAPID_* , REMINDER_WAKER:
     'off' })` con claves VAPID generadas al vuelo con `web-push` del backend (`createRequire`). La
     única costura del código productivo es la de R6 (`PUSH_TEST_ORIGIN` solo con `NODE_ENV=test` y
     solo loopback), cubierta por un test que demuestra que con `NODE_ENV=production` se ignora.
  4. **Con la app visible (FR-019)**: una sesión CDP de Chromium entrega un push al service worker
     real (`ServiceWorker.deliverPushMessage`) y el test comprueba el aviso con `role="status"` y
     que `registration.getNotifications()` está vacío.
  - Lo que el e2e no cubre lo cubren: el `vm` del service worker (R11), los tests de `tick.js` con
    `send` simulado y reloj falso, y la verificación manual en Android del quickstart.
- **Razón**: SC-005 y SC-007 piden un e2e con un servicio de push simulado; la costura queda fuera de
  la imagen de producción (`NODE_ENV=production` en el Dockerfile) y está probada.
- **Alternativas**: un endpoint `POST /api/push/__test` (código de pruebas en la API);
  interceptar el HTTPS saliente con un proxy (frágil y también necesita configuración en el
  servidor); no tener e2e de push (contra SC-005).

## R18. Consecuencias del spike recogidas en el diseño

| Hallazgo del spike | Dónde se recoge |
|--------------------|-----------------|
| Entrega con Chrome cerrado ~1,2–1,6 s; en frío tras reiniciar ~14 s | SC-005 y Edge Cases de la spec; quickstart §4 |
| Clic abre `#noche` o navega la misma pestaña a `#noche-despertar` | R11, R12 (deep link) |
| Pestaña visible: sin notificación del sistema | R11 (`postMessage`), R17 (CDP) |
| TTL vencido no llega; mismo `Topic` colapsa | R5 (`TTL` = ventana, `topic` = tipo, `tag` = tipo + noche) |
| "No molestar" de Android publica en silencio | Explicación previa (R12), Edge Cases |
| 410 al retirar el permiso | R5 (404/410 → borrar), US4-2 |
| Pico de 54 MB de 256 | R1; quickstart §5 (humo con `--memory=256m`) |
| Doze retrasa 24–40 s o más | Assumptions y Edge Cases de la spec; ± 2 min se mide hasta el servicio de push |
