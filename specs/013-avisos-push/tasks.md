# Tasks: Avisos push con la app cerrada

**Input**: Design documents from `specs/013-avisos-push/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md, spike/

**Tests**: obligatorios (principio IV). Se escriben antes de implementar. Incluyen las pruebas que
exige la constitución: fecha de la noche y DST (III), migración y compatibilidad expand/contract (II),
suite de aislamiento de dos usuarios (Alcance) y términos prohibidos (VIII).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [ ] T001 Añadir `"web-push": "3.6.7"` (versión **exacta**, sin `^`; research R5) a `dependencies` de `backend/package.json` y actualizar `backend/package-lock.json` con `npm install --save-exact web-push@3.6.7`. Comprobar que la imagen Docker (`Dockerfile`, etapa `backend-deps`) la instala sin compilar nada nativo.

---

## Phase 2: Foundational (bloquea las historias)

- [ ] T002 Tests `backend/test/migrations-011.test.js` sobre la base legacy migrada hasta 010 con 2 usuarios y una sesión de cada uno. Tras 011:
  - existe `push_subscriptions` con `endpoint TEXT NOT NULL UNIQUE` y `CHECK (length(endpoint) <= 1024)`, `p256dh`, `auth`, `label` y `created_at` `NOT NULL`, `last_success_at` NULL, `user_id … REFERENCES users(id) ON DELETE CASCADE` y `session_hash TEXT NOT NULL REFERENCES sessions(id_hash) ON DELETE CASCADE`, con los índices `idx_push_subscriptions_user` y `idx_push_subscriptions_session`;
  - existe `reminder_deliveries` con `PRIMARY KEY (user_id, kind, night_date)`, `CHECK (kind IN ('prepare','bedtime','wake_check'))`, `CHECK (status IN ('claimed','sent','skipped','failed'))`, `CHECK (reason IS NULL OR reason IN ('late','night_open','muted','dnd','expired','timeout','error','no_devices','interrupted'))` y el índice `idx_reminder_deliveries_updated`;
  - `user_settings` tiene `push_prepare`, `push_bedtime` y `push_wake_check` (`INTEGER NOT NULL DEFAULT 1`, `CHECK (… IN (0, 1))`), `dnd_start_min` y `dnd_end_min` (NULL, `CHECK (… IS NULL OR … BETWEEN 0 AND 1439)`) y `muted_until` (NULL); las filas existentes quedan con los tres tipos a 1 y el resto a NULL;
  - CASCADE: borrar un usuario borra sus dispositivos y entregas; borrar una sesión borra solo el dispositivo ligado a ella;
  - las columnas previas de `user_settings` mantienen la misma huella;
  - `foreign_key_check` vacío y el `up` es idempotente.
- [ ] T003 Crear `backend/src/migrations/011_avisos_push.js` según `data-model.md` (solo *expand*: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` y `PRAGMA table_info` antes de cada `ADD COLUMN`, como `010_rachas.js`; cabecera "NO EDITAR").
- [ ] T004 [P] Compatibilidad `backend/test/compat-previous-013.test.js` (`migrationsUpTo(11)`): las sentencias de 011 de master (crear usuario con `INSERT INTO user_settings (user_id, updated_at)`, `lead_min`, ajustes de la racha, crear y borrar sesión, `changePassword` que cierra las demás sesiones, exportar y borrar cuenta) operan sobre el esquema de 013; la fila nueva queda con los tres tipos activos; borrar una sesión borra su dispositivo y no los de otras sesiones. Fijar a su era (`migrationsUpTo(10)`) los tests de migraciones anteriores que hagan huellas de `user_settings`.
- [ ] T005 [P] Añadir `push_subscriptions` y `reminder_deliveries` (tablas con `user_id`) a `backend/test/schema-isolation.test.js`.
- [ ] T006 [P] Tests `backend/test/reminders-zoned.test.js` de `zonedToUtc(dateIso, minuteOfDay, tz)` y `localParts(utcMs, tz)` (principio III, research R3):
  - `Europe/Madrid`: 2026-03-29 02:30 (no existe) → 03:00 `+02:00`; 2026-10-25 02:30 (ambigua) → primera ocurrencia `+02:00`; 23:15 de un día normal en invierno `+01:00` y en verano `+02:00`;
  - `America/Santiago`: salto de septiembre de 2026 a medianoche (00:15 no existe → 01:00) y vuelta de abril de 2026 (hora ambigua → primera ocurrencia);
  - `iso` con el desfase de la zona en ese instante (`AAAA-MM-DDTHH:MM:SS±HH:MM`);
  - `localParts` devuelve fecha, minuto del día y día de la semana de pared; `UTC` funciona.
- [ ] T007 [P] Implementar `backend/src/reminders/zoned.js` (puro, `Intl.DateTimeFormat` con `hourCycle: 'h23'`, sin librerías) y `backend/src/reminders/windows.js` (`WINDOW_MIN = { prepare: 10, bedtime: 10, wake_check: 60 }`, `TEST_TTL_S = 60`).
- [ ] T008 [P] Tests `backend/test/reminders-push.test.js`:
  - `validateSubscription`: acepta `https://fcm.googleapis.com/…`, `https://web.push.apple.com/…`, `https://updates.push.services.mozilla.com/…` y `https://*.notify.windows.com/…`; rechaza `http:`, otros hosts (`fcm.googleapis.com.evil.test`, `127.0.0.1`, `localhost`), credenciales o puerto en la URL, más de 1.024 caracteres, `p256dh` que no sea base64url de 87 caracteres y `auth` que no sea de 22;
  - costura (R6/R17): con `NODE_ENV=test` y `PUSH_TEST_ORIGIN=http://127.0.0.1:<p>` admite ese origen; con `NODE_ENV=production` (o sin `NODE_ENV`) lo ignora aunque la variable exista, y un `PUSH_TEST_ORIGIN` no loopback se ignora siempre;
  - `deviceLabel(ua)`: Chrome en Android, Firefox en Android, Samsung Internet en Android, Edge en Windows, Chrome en Windows, Safari → "Safari en iPhone", desconocido → "Navegador"; ≤ 40 caracteres;
  - `payloadFor(kind, night, leadMin)`: los cuatro textos exactos de `contracts/service-worker.md` (`"Descanso: en 45 min es tu hora de dormir"` con 45), `tag` = `<kind>-<night>`, `url` = `/#noche` o `/#noche-despertar`; ningún texto contiene términos de `docs/sdd/terminos-prohibidos.txt` ni "racha" (SC-006);
  - `send(sub, payload, kind)` con `webpush.sendNotification` simulado: opciones `TTL` 600 / 3.600 / 60, `topic` = tipo, `urgency: 'high'`, `timeout: 10000`; 201 → `ok`; 404 y 410 → `expired`; timeout → `timeout`; 500 o error de red → `error`; nunca lanza.
- [ ] T009 Implementar `backend/src/reminders/push.js` (R5, R6, R8): `validateSubscription`, `deviceLabel`, `fingerprint(endpoint)` (16 hex del SHA-256), `payloadFor`, `configure()` (VAPID desde `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; `available()` = las tres definidas) y `send`. Si `PUSH_TEST_ORIGIN` está definido fuera de `NODE_ENV=test`, registrar un aviso en el log.
- [ ] T010 Implementar `backend/src/repo/push.js` (por `userId`, `requireUser`): `devices(userId)` (sin `endpoint` ni claves; con `fingerprint`), `upsertDevice(userId, sessionHash, { endpoint, p256dh, auth, label })` en transacción `IMMEDIATE` con el límite de 5 (409 "Ya tienes 5 dispositivos con avisos; quita uno para añadir este") e `ON CONFLICT(endpoint) DO UPDATE`, `removeDevice(userId, id)`, `deviceForSend(userId, id)`, `deleteByEndpoint(endpoint)`, `markSuccess(id, at)`, `preferences(userId)` / `setPreferences(userId, …)` (con `INSERT … ON CONFLICT(user_id)` para filas de `user_settings` que no existan), `setTimezoneIfEmpty(userId, tz)`, y para el tick `tickInputs(nowIso)` (personas con algún dispositivo cuya sesión tenga `expires_at > now`, con zona, `lead_min`, tipos, `since`, versiones, pausas, noche abierta y entregas de las noches candidatas), `claim`, `finish`, `insertSkipped`, `failStaleClaims(beforeIso)`, `prune(beforeDate)` y `counts24h(nowIso)`.

**Checkpoint**: esquema 011 compatible; conversión de zonas, envío y repositorio probados.

---

## Phase 3: User Story 1 - Activar avisos en este móvil (Priority: P1) 🎯 MVP

**Goal**: activar, listar y quitar dispositivos, con explicación previa y permiso solo tras el clic.

**Independent Test**: `push.test.js` (rutas de dispositivos) + specs de `push-settings` y `PushService` + paso 1–4 del quickstart §3.

- [ ] T011 [P] [US1] Tests `backend/test/push.test.js` (dispositivos), con `NODE_ENV=test` y claves VAPID generadas en el test:
  - `GET /api/push` → `available`, `public_key`, `timezone`, `preferences` por defecto (tres tipos `true`, `dnd: null`, `muted_until: null`) y `devices` sin `endpoint` ni claves, con `fingerprint`;
  - sin VAPID → `available: false`, `public_key: null`, y `POST /api/push/subscriptions` → 503 "Los avisos no están disponibles";
  - `POST /api/push/subscriptions` → 201 con `label` "Chrome en Android" desde el `User-Agent`; repetir el mismo `endpoint` → la misma fila (sin duplicar); host no permitido → 400; claves mal formadas → 400; el sexto → 409; el mismo `endpoint` activado por B pasa a B y desaparece de la lista de A;
  - `timezone`: con el perfil sin zona se guarda; con zona ya fijada se ignora; zona desconocida → 400; sin zona en perfil ni petición → 400;
  - `DELETE /api/push/subscriptions/:id` → 204; de otra persona → 404;
  - `POST /api/auth/logout` borra el dispositivo de esa sesión y no el de otra sesión de la misma persona;
  - sin sesión → 401; escritura sin origen propio → 403 (CSRF).
- [ ] T012 [US1] Implementar `backend/src/routes/push.js` (`GET /api/push`, `POST /api/push/subscriptions`, `DELETE /api/push/subscriptions/:id`; `session_hash` = `sha256` de la cookie de la petición, de `auth/sessions.js`) y montarlo en `backend/src/app.js` (`app.use('/api/push', require('./routes/push'))`, después de `requireAuth`).
- [ ] T013 [P] [US1] Frontend `frontend/src/app/core/push.ts` (puro) con spec `core/push.spec.ts`:
  - `reminderTimes(version, weekday, leadMin)` → "Prepárate · 22:45", "Hora de dormir · 23:15", "¿Ya despertaste? · 8:00" (con 23:15 → 7:00 y 30 min; acostarse a la 0:15 → prepárate 23:45; levantarse 23:30 → 0:30);
  - `blockState({ supported, available, hasSchedule, permission, subscribed, keyMatches, listed })` → `unsupported | unavailable | no_schedule | denied | needs_reactivation | off | on` (FR-004, FR-025);
  - textos de la explicación previa (FR-002, FR-005, FR-012 y los límites del spike: No molestar, ahorro de batería y reposo del móvil).
- [ ] T014 [P] [US1] Frontend `frontend/src/app/core/push.service.ts` con spec (`navigator.serviceWorker`, `PushManager` y `Notification` simulados):
  - `isSupported()`; `permission` (signal);
  - `enable(publicKey, timezone)`: registra `/push-sw.js`, llama a `Notification.requestPermission()` **solo** desde esta función (SC-007: un espía comprueba que construir el servicio, cargar el estado o `refresh()` no lo llaman), `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` y `POST /api/push/subscriptions`; si ya había suscripción con otra clave, `unsubscribe()` antes;
  - `disable(id)`: `DELETE` + `unsubscribe()`;
  - `currentFingerprint()` con `crypto.subtle` (igual que el servidor) y `keyMatches(publicKey)`;
  - `unsubscribeOnLogout()` de mejor esfuerzo (nunca bloquea el cierre de sesión).
- [ ] T015 [US1] Frontend `frontend/src/app/features/push/push-settings.component.ts` con spec:
  - bloque "Avisos en este móvil" con explicación previa (las tres horas de hoy, "Avisarme antes", sin datos de sueño ni de salud, quién entrega el aviso, doble "prepárate" con el calendario de 010 y la opción de desactivar `prepare`, límites del móvil, zona horaria propuesta si el perfil no tiene);
  - estados: no compatible ("Este navegador no puede recibir avisos con la app cerrada" + alternativa del calendario de 010, sin botón activo), no disponible ("Los avisos no están disponibles"), sin horario ("Primero agenda tu horario" con enlace a "Mi horario" y botón deshabilitado), permiso denegado (cómo reactivarlo en los ajustes del navegador), "Vuelve a activar los avisos", activado;
  - lista de dispositivos con nombre, fecha de activación, "Este móvil" y "Quitar";
  - accesible (principio VII): etiquetas, foco visible, `aria-describedby` de la explicación, responsive;
  - specs: cada estado, 2 toques para activar (SC-008), quitar un dispositivo, y que sin pulsar "Activar avisos" no se pide permiso.
- [ ] T016 [US1] Montar `push-settings` en `frontend/src/app/features/schedule/my-schedule.component.ts` (bajo el calendario de 010), y en `frontend/src/app/app.ts` llamar a `PushService.unsubscribeOnLogout()` antes de `auth.logout()`. Specs ampliados.
- [ ] T017 [P] [US1] Política de privacidad (FR-005): sección "Avisos en el móvil" en `frontend/src/app/core/privacy.ts` (lo entrega el servicio de avisos del navegador, Google en Chrome de Android, que ve cuándo llega un aviso pero no su contenido; sin otros terceros) y nueva `POLICY_VERSION` igual en `frontend/src/app/core/privacy.ts` y `backend/src/policy.js` (la fecha del PR; `policy-version.test.js` comprueba que coinciden).

**Checkpoint**: un móvil puede activarse y aparecer en la lista; todavía no recibe avisos programados.

---

## Phase 4: User Story 2 - Recibir los avisos a su hora (Priority: P1)

**Goal**: el servicio envía cada aviso una sola vez, a su hora y nunca tarde, a todos los dispositivos.

**Independent Test**: `reminders-schedule.test.js` + `reminders-tick.test.js` con reloj falso (el Independent Test de la spec, literal) + `push-sw.test.js` + quickstart §4.

- [ ] T018 [P] [US2] Tests `backend/test/reminders-schedule.test.js` de `dueReminders({ now, users })` con reloj falso (research R2):
  - `Europe/Madrid`, L–V 23:15 → 7:00, 30 min: lunes 22:45 `prepare`, 23:15 `bedtime`, martes 8:00 `wake_check` con la noche del lunes abierta; sin noche abierta, ningún `wake_check`;
  - noche que cruza medianoche: sábado acostarse 1:15 → `prepare` 0:45 y `bedtime` 1:15 del domingo con `nightDate` = sábado; acostarse 0:15 con 30 min → `prepare` 23:45 del día N con `nightDate` = N;
  - `wake_check` de una noche abierta registrada con `bedtime` a la 0:30 del domingo → noche del sábado (011-R2);
  - versión vigente en la fecha de la noche (una guardada hoy rige ya esta noche), día inactivo y noche en pausa → sin vencimientos; tipo desactivado → sin ese tipo;
  - ventanas: `prepare`/`bedtime` en ventana hasta +9:59 y descartable desde +10:00; `wake_check` hasta +59:59 / desde +60:00; entregas existentes se ignoran; vencimientos anteriores al `since` del dispositivo más antiguo no cuentan;
  - días de DST (los de T006): la hora agendada inexistente pasa a la primera válida; `dueIso` con su desfase;
  - cambio de zona del perfil (US2-11): con `America/Santiago` en vez de `Europe/Madrid`, los vencimientos siguientes son las 23:15 de la nueva hora local;
  - SC-001: una semana simulada con noches después de medianoche y los dos cambios de horario de `Europe/Madrid` y `America/Santiago` → el 100 % de los vencimientos a ± 2 min y con la fecha de la noche correcta.
- [ ] T019 [US2] Implementar `backend/src/reminders/schedule.js` (puro; noches candidatas `hoy − 2 … hoy` en la zona del perfil; resta de `lead_min` y suma de 60 min en minutos de pared antes de convertir).
- [ ] T020 [P] [US2] Tests `backend/test/reminders-tick.test.js` de `runTick({ now, send })` sobre la base de pruebas (`send` simulado):
  - exactamente una vez (SC-002): dos `runTick` concurrentes con el mismo `now` → un solo envío por dispositivo; repetir el tick y "reiniciar" (nuevo estado en memoria) → ninguno más;
  - recuperación (SC-003, FR-011): sin ticks de 22:40 a 22:50 → el primer tick a las 22:50 envía el `prepare` de las 22:45 (en ventana) y el `bedtime` de las 23:15 llega a su hora; sin ticks de 22:40 a 23:00 → el `prepare` queda `skipped` (`late`) y nunca se envía; con 3 min caído se envía todo lo que sigue en ventana y se descarta el resto;
  - noche abierta antes de `prepare`/`bedtime` → `skipped` (`night_open`) (FR-016);
  - varios dispositivos de la misma persona → llega a todos; `sent` si alguno acepta, `failed` (`expired`) si ninguno; un 410 borra ese dispositivo;
  - aislamiento del envío (SC-004): 20 personas, una con 410 y otra cuyo `send` tarda más que el timeout → las otras 18 `sent` en el mismo tick y el tick completo < 60 s con reloj simulado; concurrencia máxima observada ≤ 4;
  - `claimed` de hace más de 5 min → `failed` (`interrupted`) y no se reenvía;
  - dos usuarios: un tick con A y B nunca envía la carga de A a un dispositivo de B;
  - un dispositivo cuya sesión caducó (`expires_at` pasado) no recibe nada;
  - persona sin zona horaria → sin vencimientos;
  - estado en memoria: `last_tick_at` y `pending_dues`.
- [ ] T021 [US2] Implementar `backend/src/reminders/tick.js` (R4, R7): `failStaleClaims`, lectura de `tickInputs`, `dueReminders`, `insertSkipped` de lo vencido, `claim` + comprobación de noche abierta + envío con pool ≤ 4 por persona + `finish`, `markSuccess`, borrado por 404/410, y `status()` → `{ last_tick_at, pending_dues }`. Las comprobaciones de "Silenciar hoy" y "No molestar" se añaden en T034.
- [ ] T022 [P] [US2] Tests `backend/test/reminders-waker.test.js` de `startWaker(tick, { intervalMs })` con temporizadores simulados (`mock.timers` de `node:test`): tick inmediato al arrancar; un tick cada intervalo; si un tick sigue en curso, el siguiente se salta; `stop()` detiene los ticks; un tick que lanza no detiene el disparador (se registra en el log).
- [ ] T023 [US2] Implementar `backend/src/reminders/waker.js` y arrancarlo en `backend/src/server.js` (no en `app.js`) solo si `push.available()` y `REMINDER_WAKER !== 'off'`; si faltan las claves VAPID, registrar "Avisos push desactivados: faltan VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT"; `stop()` en `SIGTERM` y `SIGINT`.
- [ ] T024 [P] [US2] Tests `backend/test/push-sw.test.js`: carga `frontend/public/push-sw.js` en un `vm` de Node con `self`, `clients` y `registration` simulados (contracts/service-worker.md):
  - `push` sin ventana visible → `showNotification("Descanso", { body, tag, icon, data: { url } })`;
  - `push` con una ventana visible → `postMessage({ type: 'descanso-push', … })` y ninguna notificación (FR-019);
  - carga ilegible → notificación genérica "Descanso";
  - `notificationclick` con una ventana abierta → `focus()` + `navigate(url)` de esa misma ventana; sin ventanas → `openWindow(url)` (`/#noche` o `/#noche-despertar`);
  - el archivo no registra manejador `fetch`.
- [ ] T025 [US2] Crear `frontend/public/push-sw.js` (sin `fetch`, sin caché, sin dependencias) según `contracts/service-worker.md`.
- [ ] T026 [US2] Frontend: en `frontend/src/app/app.ts`, `openNightLink()` acepta también `#noche-despertar` (Noche con "Ya desperté" a la vista y con foco) y limpia el fragmento; en `frontend/src/app/features/night/night.component.*`, recibir esa intención y desplazar/enfocar "Ya desperté". En `frontend/src/app/shared/bedtime-notice.component.ts`, mostrar los mensajes `descanso-push` que entrega `PushService` (`role="status"`, sin sonido, sin animación con `prefers-reduced-motion`), sin repetir un `prepare` cuyo aviso de 010 ya salió ese día. Sin sesión (FR-013), la intención del fragmento se conserva y, tras entrar, se muestra Noche (con "Ya desperté" a la vista si era `#noche-despertar`). Specs: los dos fragmentos con y sin sesión, el aviso con la app visible y la deduplicación.

**Checkpoint**: MVP completo (US1 + US2): avisos a su hora con la app cerrada.

---

## Phase 5: User Story 3 - Elegir qué avisos recibo (Priority: P1)

**Goal**: un interruptor por tipo, común a todos los dispositivos.

**Independent Test**: tests de `PUT /api/push/preferences` (tipos) + un tick con `prepare` desactivado + spec del componente.

- [ ] T027 [P] [US3] Tests en `backend/test/push.test.js`: `PUT /api/push/preferences { kinds: { prepare: false } }` → 200 y solo cambia `prepare`; tipos no booleanos → 400; sin sesión → 401; CSRF → 403. Test en `backend/test/reminders-tick.test.js`: con `prepare` desactivado no hay `prepare` y sí `bedtime`; reactivado, el `prepare` de la noche siguiente llega; un cambio hoy rige ya el siguiente aviso no enviado de esta noche (FR-017).
- [ ] T028 [US3] Implementar `PUT /api/push/preferences` (campo `kinds`) en `backend/src/routes/push.js` con `repo/push.js#setPreferences`.
- [ ] T029 [US3] Frontend en `push-settings.component.ts`: un interruptor por tipo con su hora de hoy al lado ("Prepárate · 22:45") y, en la explicación del doble "prepárate", el atajo para desactivar el `prepare` de Descanso (FR-012). Specs.

---

## Phase 6: User Story 4 - Aviso de prueba (Priority: P2)

**Goal**: comprobar que este móvil recibe los avisos y saber por qué falla.

**Independent Test**: tests de `POST /api/push/subscriptions/:id/test` + e2e con el servicio de push simulado.

- [ ] T030 [P] [US4] Tests en `backend/test/push.test.js` (`send` simulado): `POST /api/push/subscriptions/:id/test` → `{ result: 'sent' }` con la carga `test` y `TTL` 60, aunque haya "No molestar" o "Silenciar hoy" (FR-020); 410 → `{ result: 'expired' }` y el dispositivo ya no está en la lista; timeout → `{ result: 'failed' }`; de otra persona → 404; el cuarto intento en un minuto → 429 "Espera un momento antes de probar otra vez" (FR-021; cuentan todos los intentos); sin VAPID → 503.
- [ ] T031 [US4] Implementar la ruta en `backend/src/routes/push.js` con `createRateLimiter({ max: 3, windowMs: 60_000 })` de `backend/src/auth/rate-limit.js` y la clave `user:<id>`.
- [ ] T032 [US4] Frontend en `push-settings.component.ts` y `push.service.ts`: "Enviarme un aviso de prueba" para el dispositivo actual; resultados "Enviado", "Permiso retirado: …cómo reactivarlo" (si `Notification.permission` es `denied`), "Este dispositivo ya no es válido: vuelve a activar los avisos" (`expired`, refresca la lista), "No se pudo enviar" y el 429 con mensaje amable (`role="status"`). Specs.

---

## Phase 7: User Story 5 - No molestar y silenciar hoy (Priority: P2)

**Goal**: silenciar la noche de hoy con un toque o fijar una franja sin avisos.

**Independent Test**: tests de preferencias y del tick (el Independent Test de la spec, literal) + spec del componente.

- [ ] T033 [P] [US5] Tests en `backend/test/push.test.js`: `PUT /api/push/preferences { mute_today: true }` → `muted_until` = hoy en la zona del perfil (también cerca de medianoche en una zona distinta de UTC); `false` → `null`; `dnd: { start_min: 1380, end_min: 420 }` → guardada; `dnd: null` → desactivada; franja incompleta, fuera de 0–1439 o con inicio = fin → 400 "La franja de No molestar necesita inicio y fin distintos". Tests en `backend/test/reminders-tick.test.js` (SC-009): "Silenciar hoy" el lunes a las 20:00 → `skipped` (`muted`) para 22:45, 23:15 y el `wake_check` de las 8:00 del martes (noche del lunes), y el martes a las 22:45 vuelve a llegar; "Silenciar hoy" por la mañana silencia también el `wake_check` pendiente de la noche anterior; "No molestar" 23:00–07:00 → llega el de las 22:45 y el de las 23:15 queda `skipped` (`dnd`), sin aplazarse; cambiar la franja después de calcular pero antes de enviar → rige la nueva (se comprueba al enviar); se aplica a todos los dispositivos.
- [ ] T034 [US5] Implementar `mute_today` y `dnd` en `PUT /api/push/preferences` (`backend/src/routes/push.js`, `repo/push.js`) y las comprobaciones `muted` (`night_date ≤ muted_until`) y `dnd` (minuto de pared actual en la zona del perfil; `start < end` → `start ≤ m < end`; `start > end` → `m ≥ start || m < end`) en `backend/src/reminders/tick.js`, después del reclamo.
- [ ] T035 [US5] Frontend en `push-settings.component.ts`: "Silenciar hoy" / "Avisos silenciados hasta mañana" con "Deshacer", y "No molestar" con inicio y fin (`input type="time"` con etiquetas), que puede cruzar medianoche. Specs.

---

## Phase 8: Polish & cross-cutting

- [ ] T036 [P] Aislamiento y esquema (SC-010): en `backend/test/isolation.test.js`, añadir `/api/push` a `ROUTERS`, los dispositivos y preferencias de A a `fingerprintOf`, y comprobar que B no ve, prueba, quita ni cambia nada de A (lo ajeno → 404) en las 5 rutas; la huella de A no cambia tras las peticiones de B.
- [ ] T037 [P] Exportación y borrado (FR-028): `backend/src/repo/export.js` y `backend/src/routes/export.js` añaden `push_preferences` (tipos, `dnd`, `muted_until`) al JSON y **no** `push_subscriptions` ni `reminder_deliveries`; tests en `backend/test/export.test.js` (sin `endpoint`, `p256dh` ni `auth` en ninguna parte del JSON) y en `backend/test/delete-account.test.js` (borrar la cuenta borra dispositivos, entregas y preferencias).
- [ ] T038 [P] Salud de administración y poda (FR-026, FR-027): `GET /api/admin/health` en `backend/src/routes/admin.js` (Bearer `BACKUP_TOKEN`) → `{ reminders: { enabled, last_tick_at, pending_dues, skipped_24h, failed_24h } }` sin datos personales; poda diaria en `tick.js` (`night_date < hoy − 90 días`, una vez por fecha UTC). Tests en `backend/test/admin.test.js` (token incorrecto → 401; sin `BACKUP_TOKEN` → 404; ningún `user_id`, email ni endpoint en la respuesta; `/api/health` público sin cambios) y en `reminders-tick.test.js` (poda a los 90 días, una sola vez al día).
- [ ] T039 [P] Términos prohibidos (VIII): ampliar `backend/test/forbidden-terms.test.js` para recorrer también `frontend/public/push-sw.js`; los textos de la explicación previa y de los avisos pasan la lista (SC-006).
- [ ] T040 E2E `e2e/tests/avisos.spec.ts` con `e2e/support/fake-push.ts` (servidor HTTP local que registra peticiones y responde 201 o 410) y `AppServer.start(..., { NODE_ENV: 'test', PUSH_TEST_ORIGIN, VAPID_*, REMINDER_WAKER: 'off' })` (claves VAPID generadas con `web-push` del backend vía `createRequire`); en el test, `context.grantPermissions(['notifications'])` y un `page.addInitScript` que sustituye `PushManager.prototype.subscribe`/`getSubscription` por una suscripción falsa hacia el servicio simulado (research R17; nada de esto en `frontend/src`):
  - cargar y recargar la app sin pulsar nada → ninguna llamada a `Notification.requestPermission` (SC-007, con un espía en el init script);
  - sin horario → botón deshabilitado con "Primero agenda tu horario";
  - con horario → "Activar avisos" → el dispositivo aparece como "Este móvil" (2 toques, SC-008);
  - "Enviarme un aviso de prueba" → el servicio simulado recibe una petición con `TTL: 60`, `Topic: test`, `Urgency: high` y `Authorization: vapid …` en < 10 s y la app dice "Enviado" (SC-005);
  - el servicio simulado responde 410 → la app explica que el dispositivo ya no es válido y lo quita de la lista;
  - con la pestaña visible, `ServiceWorker.deliverPushMessage` por CDP → aviso con `role="status"` en la app y `registration.getNotifications()` vacío (FR-019);
  - abrir `/#noche-despertar` → Noche con "Ya desperté" a la vista.
- [ ] T041 [P] Infraestructura y documentación:
  - `fly.toml`: `min_machines_running = 1` con un comentario del coste (≈ 3,3 $/mes) y de 013;
  - `compose.yaml`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` opcionales (vacías = avisos desactivados);
  - `docs/runbooks/rotar-vapid.md` (nuevo): generar claves en local, `flyctl secrets set`, efecto (todas las suscripciones dejan de valer; la app pide "Vuelve a activar los avisos") y comprobación con `/api/admin/health`;
  - `README.md`: avisos push, API `/api/push`, variables VAPID y coste actualizado (≈ 3,3 $/mes, la máquina ya no se apaga);
  - `specs/002-pipeline-ci-cd/research.md`: nota en R13 de que el auto-stop deja de aplicarse desde 013;
  - `docs/sdd/guia-migraciones.md`: `011_avisos_push.js` como *expand* con tablas nuevas y FK a `sessions`.
- [ ] T042 Puertas de calidad (principio IV) y verificación:
  - backend `npm test` y `npm run lint`; frontend `ng lint`, `ng test` y `ng build`; e2e;
  - compatibilidad en Docker con la imagen de master (011) sobre una base migrada por 013;
  - quickstart §3 (navegador del PC), §4 (Android real) y §5 (`docker run --memory=256m` 10 min sin OOM);
  - anotar los resultados en el PR.

---

## Dependencies & Execution Order

- **Setup** (T001) antes de T008/T009.
- **Foundational** (T002–T010) bloquea todo: T002 → T003; T004–T008 [P]; T009 tras T008; T010 tras T003.
- **US1** (T011–T017) depende de Foundational. **US2** (T018–T026) depende de Foundational; su frontend (T026) usa el `PushService` de T014.
- **US3** (T027–T029) y **US5** (T033–T035) dependen de US1 (ruta y componente) y de US2 (tick); **US4** (T030–T032) depende de US1.
- **Polish** (T036–T042) al final; T040 necesita US1, US2 y US4.

## Parallel Example

```text
Foundational: T004 ∥ T005 ∥ T006 ∥ T008 mientras T002 → T003; luego T007 ∥ T009, y T010.
US1 ∥ US2 (backend): T011 ∥ T013 ∥ T014 ∥ T018 ∥ T020 ∥ T022 ∥ T024.
Polish: T036 ∥ T037 ∥ T038 ∥ T039 ∥ T041.
```

## Implementation Strategy

1. Setup + Foundational.
2. **MVP = US1 + US2** (activar y recibir a su hora): ya cumple el objetivo de la feature.
3. US3 (tipos), después US4 (prueba) y US5 (silencios).
4. Polish: aislamiento, exportación, operación, e2e, infraestructura y puertas.

## Revisión de sobre-ingeniería (eliminado respecto a la propuesta de la entrada)

- **Interfaz `Waker` genérica con suite de contrato común**: solo hay una implementación
  (`AlwaysOnWaker`); queda un módulo `waker.js` con sus propios tests (principio VI).
- **`TICK_TOKEN` y endpoint de tick**: solo servían a un disparador externo, descartado por el owner.
- **Rutas separadas `GET /api/push/public-key` y `DELETE`/`test` por `endpoint`**: fusionadas en
  `GET /api/push` y rutas por `id` (5 rutas en vez de 6), sin enviar el `endpoint` para identificar el
  dispositivo actual.
- **Humo automatizado en Docker de 10 min** como tarea propia: el spike ya midió 54 MB; queda como paso
  manual del quickstart §5 dentro de T042.
- **Ampliar `scripts/smoke-local.mjs`** con comprobaciones de 013: exigiría claves VAPID en el humo y
  lo cubren los tests de backend y el e2e.
- **Ruta `/noche` con router de Angular**: se reutiliza el fragmento `#noche` de 010 y se añade
  `#noche-despertar`.
- **Exportar `reminder_deliveries`** y **persistir `last_tick_at`**: la spec no lo pide (FR-028 solo
  exige las preferencias) y no aportan a la persona.
