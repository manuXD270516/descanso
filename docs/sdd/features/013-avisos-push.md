# Feature 013 – Avisos push con la app cerrada

> **Estado: pendiente de construir.** Disparador elegido el 2026-09-29: **máquina siempre encendida** (`AlwaysOnWaker`). Se especifica después de 010 y 011; no bloquea a ninguna otra feature.

Quiero que el móvil me avise a la hora de prepararme, a la hora de acostarme y si olvidé marcar el despertar, **aunque tenga Descanso cerrado**, sin instalar ninguna app. Uso Android, que recibe push desde el navegador sin instalar la app (no hace falta 012).

## Historias

### (P1) Activar avisos

- En Ajustes hay un bloque "Avisos en este móvil" con el botón "Activar avisos".
- Antes de pedir el permiso del navegador veo una explicación: qué avisos llegarán, a qué horas (las de mi horario de 010) y que el texto no contiene datos de salud.
- El permiso del navegador **solo se pide tras pulsar "Activar avisos"**, nunca al cargar la app.
- Si deniego el permiso, veo cómo reactivarlo desde los ajustes del navegador, y la app sigue funcionando igual.
- Puedo activar avisos en varios dispositivos; cada uno aparece en la lista con su nombre aproximado ("Chrome en Android") y puedo quitarlo.
- Sin horario agendado (010), el botón está deshabilitado con el texto "Primero agenda tu horario".

### (P1) Recibir los avisos a su hora

Tres tipos de aviso, cada uno activable por separado:

| Tipo | Cuándo | Texto | Ventana de descarte |
|------|--------|-------|---------------------|
| `prepare` | hora de acostarme − `lead_min` (010) | "Descanso: en 30 min es tu hora de dormir" | ≤ 10 min |
| `bedtime` | hora de acostarme | "Descanso: es tu hora de dormir" | ≤ 10 min |
| `wake_check` | hora de levantarme + 60 min, **solo si la noche sigue abierta** | "Descanso: ¿ya despertaste?" | ≤ 60 min |

- El aviso llega con un margen de **±2 min** respecto a la hora agendada (hora de pared en mi zona horaria del perfil, 008).
- **Cada aviso llega como máximo una vez** por usuario, tipo y fecha de la noche, aunque haya varios ticks, reinicios o despliegues.
- Pasada su ventana de descarte, el aviso no se envía y queda como `skipped`: avisar tarde no sirve.
- Tocar el aviso abre la app en la pestaña Noche (`prepare`/`bedtime`: con "Me voy a dormir" visible; `wake_check`: con "Ya desperté").
- No se envían avisos durante el **Modo pausa** (010) ni en los días inactivos del horario.

### (P2) Aviso de prueba

- "Enviarme un aviso de prueba" envía uno al dispositivo actual en menos de 10 s y me dice si falló (permiso retirado, suscripción caducada).

### (P2) No molestar y silenciar hoy

- "Silenciar hoy": ningún aviso hasta la próxima fecha de la noche.
- "No molestar" con franja horaria (p. ej. 23:30–07:00); se evalúa **en el momento del envío**, no al calcular vencimientos.

## Fuera de alcance

- iPhone (requiere app instalada, 012 descartada).
- Sonido personalizado, alarma o vibración configurable.
- Avisos de rachas o logros (011) y cualquier aviso de marketing.
- Terceros de programación (QStash, OneSignal, ntfy, cron externo).
- Email o SMS.

Criterios de aceptación medibles por cada historia. Marca [NEEDS CLARIFICATION] lo ambiguo.

## Contexto técnico

- **Diseño de referencia:** `docs/sdd/propuestas/2026-09-29-set-de-features.md` (feature 013).
- **Anexos:** `17-react-H-push-programado.md`, debate `26` (E15–E20) y `27` (X30–X40), reflexión `32`, evaluación `42` (V-31…V-34).
- **Depende de:**
  - 004: sesión (`__Host-sid`), CSRF, rate limit con `Fly-Client-IP`, `user_settings`.
  - 008: capa `repo/` con `userId`, zona horaria IANA del perfil, suite de aislamiento de dos usuarios.
  - 010: `schedule_versions`/`schedule_days`, `lead_min`, `pauses`.
  - 006: estado de noche abierta (para `wake_check`).
- **Constitución:**
  - V: el disparador vive **dentro del mismo servicio**, así que no hace falta enmienda. El único secreto nuevo es VAPID (Fly secrets).
  - III: los vencimientos se calculan como hora de pared + zona IANA → instante UTC; se guardan en ISO 8601 con offset. Pruebas explícitas de DST.
  - VI: Complexity Tracking debe registrar que se **abandona el auto-stop** (R13 de 002): ≈ 3,3 $/mes en total, ≈ 1–1,5 $/mes más que QStash, a cambio de privacidad (sin terceros), precisión y sin arranques en frío.

## Aspectos de código (propuesta para el plan)

### Backend: módulo `backend/src/reminders/`

| Archivo | Responsabilidad |
|---------|-----------------|
| `schedule.js` | **Puro.** `dueReminders({ now, users, schedules, pauses, openNights, deliveries })` → lista de `{ userId, kind, nightDate, dueUtc }` pendientes dentro de su ventana. Sin I/O, testeable con relojes falsos. |
| `zoned.js` | **Puro.** `zonedToUtc(dateIso, minuteOfDay, tz)` con `Intl.DateTimeFormat` (sin librerías). Horas inexistentes (salto de primavera) → se adelantan a la primera válida; ambiguas (otoño) → primera ocurrencia. |
| `windows.js` | Constantes por tipo: `prepare`/`bedtime` 10 min, `wake_check` 60 min; catch-up máximo = mayor que un despliegue. |
| `waker.js` | Interfaz `Waker { start(tick), stop() }`. `AlwaysOnWaker`: `setInterval(tick, 30_000)` + **tick inmediato al arrancar** (recuperación tras despliegue) + mutex en proceso (si un tick sigue en curso, el siguiente se salta). `stop()` en `SIGTERM` para cierre limpio. Se elige con `REMINDER_WAKER=always-on` (por defecto) u `off` (tests, desarrollo). |
| `tick.js` | Orquesta: lee datos vía `repo/`, llama a `dueReminders`, **reclama** cada vencimiento (`INSERT … ON CONFLICT DO NOTHING` en `reminder_deliveries`; solo el que inserta envía), evalúa No molestar/silenciar y envía con concurrencia ≤ 4 aislada por usuario. Marca `sent` / `skipped` / `failed`. Actualiza `last_tick_at` en memoria. |
| `push.js` | Envío con `web-push` (**versión exacta fijada** en `package.json`, justificada en research.md). `TTL` = ventana del tipo, `Topic` = tipo (colapsa duplicados en el servicio de push), `urgency: high`. Timeout 10 s por envío. 404/410 → borra la suscripción. **Lista de hosts permitidos** para el `endpoint` (anti-SSRF): `fcm.googleapis.com`, `*.push.services.mozilla.com`, `web.push.apple.com`, `*.notify.windows.com`. |

Arranque: `server.js` (no `app.js`, para que los tests de supertest no levanten timers) crea el `Waker` si están definidas `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`; si faltan, registra un aviso y la feature queda desactivada (igual que `/api/admin` sin `BACKUP_TOKEN`).

### Backend: rutas `backend/src/routes/push.js` (montadas en `/api/push`, tras sesión y CSRF de 004)

| Método y ruta | Uso |
|---------------|-----|
| `GET /api/push/public-key` | Devuelve la clave VAPID pública (o 404 si la feature está desactivada). |
| `POST /api/push/subscription` | Guarda `{ endpoint, keys: { p256dh, auth } }` del dispositivo actual. Valida host permitido, longitudes y formato base64url. Idempotente por `endpoint`. Máx. 5 por usuario. |
| `DELETE /api/push/subscription` | Borra la del dispositivo actual (por `endpoint`) o una de la lista (por `id`). |
| `GET /api/push/subscriptions` | Lista de dispositivos (id, etiqueta, fecha), **sin** endpoint ni claves. |
| `PUT /api/push/preferences` | Tipos activos, franja No molestar, "silenciar hoy". |
| `POST /api/push/test` | Aviso de prueba al dispositivo actual. Rate limit 3/min por usuario. |

Además:
- **Logout** (004) borra la suscripción del dispositivo que cierra sesión; **borrar cuenta** (008) borra todas (FK `ON DELETE CASCADE`).
- La **exportación** (004) **excluye** `push_subscriptions` (son credenciales del navegador, no datos del usuario).
- `/api/health` de administración (con `BACKUP_TOKEN`) añade `reminders: { last_tick_at, pending_dues, skipped_24h, failed_24h }`, sin datos personales. El `/api/health` público no cambia.

### Datos: migración aditiva (sistema de migraciones de 003)

```sql
CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL,
  last_success_at TEXT
);
CREATE TABLE reminder_deliveries (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('prepare','bedtime','wake_check')),
  night_date TEXT NOT NULL,
  due_at TEXT NOT NULL,          -- ISO 8601 con offset (principio III)
  status TEXT NOT NULL CHECK (status IN ('claimed','sent','skipped','failed')),
  reason TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, kind, night_date)
);
```

- `user_settings` + `push_kinds` (lista de tipos activos), `dnd_start_min`, `dnd_end_min`, `muted_until` (fecha de la noche).
- Poda diaria (dentro del tick, una vez al día): `reminder_deliveries` con más de 90 días.
- Un `claimed` con más de 5 min (proceso muerto a mitad de envío) pasa a `failed`; no se reintenta para no duplicar.

### Frontend (Angular 20)

- **Service worker mínimo propio** `frontend/public/push-sw.js`, **sin** `@angular/service-worker` ni caché: solo maneja `push` (muestra la notificación con `tag` = tipo, `icon`, `data.url`) y `notificationclick` (enfoca una pestaña abierta o abre `/noche`). Sin manejador `fetch`, así no interfiere con despliegues (evita el riesgo de caché obsoleta de 012).
- `core/push.service.ts`: `isSupported()`, `permissionState` (signal), `enable()` → registra el SW, `Notification.requestPermission()` **solo desde el clic**, `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, `POST` de la suscripción; `disable()`; `sendTest()`.
- Componente `settings/push-settings`: explicación previa, estados (no soportado / denegado / activo), lista de dispositivos, tipos, No molestar, silenciar hoy, botón de prueba. Accesible (principio VII), textos en español.
- Ruta `/noche` debe existir como deep link para `notificationclick` (si hoy las pestañas no usan router, añadir un parámetro `?tab=noche`).

### Infraestructura

- `fly.toml`: `min_machines_running = 1` (se mantiene `auto_stop_machines = "stop"` para máquinas extra en despliegues, pero siempre queda una).
- Secretos: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:`) con `flyctl secrets set`. Se generan en local con `npx web-push generate-vapid-keys` y **nunca** se pegan en el chat ni en el repo.
- Runbook nuevo `docs/runbooks/rotar-vapid.md`: rotar la clave invalida todas las suscripciones → la app detecta la clave pública distinta y pide reactivar.
- `compose.yaml`: variables VAPID opcionales para probar en local.
- README: coste actualizado (≈ 3,3 $/mes) y nota de R13.

### Pruebas (principio IV)

- **Unitarias puras:** `zonedToUtc` (DST de primavera y otoño en `Europe/Madrid` y `America/Santiago`), `dueReminders` (días inactivos, pausa, noche ya cerrada para `wake_check`, ventanas por tipo, noche que cruza medianoche → fecha de la noche correcta).
- **Contrato del `Waker`:** suite común (arranque hace tick inmediato, mutex, `stop()`), reutilizable si algún día se añade otra implementación.
- **Exactamente una entrega:** dos ticks concurrentes sobre la misma BD → un solo envío.
- **Aislamiento del envío:** 20 usuarios, uno con 410 (se borra su suscripción) y otro con timeout; los otros 18 reciben su aviso.
- **Recuperación tras despliegue:** reloj falso, proceso "caído" 3 min → al arrancar envía lo que sigue en ventana y marca `skipped` lo demás.
- **Rutas:** validación de suscripción (host no permitido → 400), límite de 5, rate limit del aviso de prueba, CSRF, 401 sin sesión, suite de aislamiento de dos usuarios (008).
- **Frontend:** `PushService` con `navigator.serviceWorker`/`PushManager` simulados; componente en sus estados.
- **E2E (Playwright, PR #5):** servicio de push simulado (endpoint local permitido solo con `NODE_ENV=test`) + flujo "Activar avisos" → "aviso de prueba".
- **Humo Docker:** `docker run --memory=256m` con `web-push` cargado y un tick en marcha, sin OOM durante 10 min.

### Orden sugerido de tareas

1. Migración + `repo/` de suscripciones y entregas.
2. `zoned.js` + `schedule.js` con sus tests (núcleo puro).
3. `push.js` + `tick.js` + `waker.js` con tests de concurrencia y recuperación.
4. Rutas `/api/push/*` + logout/borrado/exportación.
5. Service worker + `PushService` + ajustes.
6. `fly.toml`, secretos VAPID, runbook, README, health de admin.
7. E2E y humo de memoria.

**Spike antes del plan (½ día):** en 1 Android real, confirmar que llega un push con Chrome cerrado (sin instalar la app), que `notificationclick` abre `/noche` y medir la memoria con `web-push` cargado en la VM de 256 MB.
