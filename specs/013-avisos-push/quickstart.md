# Quickstart: validar la feature 013

## 1. Puertas automáticas

```bash
cd backend && npm ci && npm test && npm run lint
cd frontend && npx ng lint && npx ng test --watch=false --browsers=ChromeHeadless && npx ng build
cd e2e && npm test
```

Incluyen:
- `migrations-011.test.js` y `compat-previous-013.test.js` (código de 011 sobre el esquema nuevo;
  borrar una sesión borra su dispositivo);
- `reminders-zoned.test.js`: `zonedToUtc` con los cambios de horario de `Europe/Madrid` y
  `America/Santiago` (principio III, research R3);
- `reminders-schedule.test.js`: `dueReminders` con reloj falso: semana de prueba de SC-001, noche que
  cruza medianoche, día inactivo, pausa, tipos desactivados, `wake_check` solo con la noche abierta,
  ventanas y descartes ([`data-model.md`](data-model.md), "Derivados");
- `reminders-tick.test.js`: reclamo único con dos ticks concurrentes y tras reiniciar (SC-002),
  recuperación tras 3 min caído (SC-003), 20 personas con un 410 y un timeout (SC-004), noche abierta,
  "Silenciar hoy", "No molestar" (SC-009), envío interrumpido, poda de 90 días y aislamiento del envío;
- `reminders-waker.test.js`: tick inmediato al arrancar, intervalo, mutex y `stop()`;
- `reminders-push.test.js` y `push-sw.test.js`: hosts permitidos, costura `PUSH_TEST_ORIGIN` ignorada
  fuera de `NODE_ENV=test`, opciones del envío (`TTL`, `topic`, `urgency`), textos exactos
  ([`contracts/service-worker.md`](contracts/service-worker.md)) y el service worker en un `vm`;
- `push.test.js`: rutas de [`contracts/openapi-delta.yaml`](contracts/openapi-delta.yaml) (límite de 5,
  idempotencia, 429 del aviso de prueba, 503 sin VAPID, CSRF, 401);
- `isolation.test.js`, `schema-isolation.test.js`, `export.test.js`, `delete-account.test.js`,
  `admin.test.js` y `forbidden-terms.test.js` ampliados;
- specs de frontend: `core/push.ts`, `PushService` (permiso solo desde el clic, SC-007),
  `push-settings` en sus estados, `#noche-despertar` y el aviso con la app visible;
- e2e `avisos.spec.ts` con el servicio de push simulado (research R17).

## 2. Claves VAPID en local (nunca en el repositorio ni en el chat)

```bash
cd backend && npx web-push generate-vapid-keys
```

Exportar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT=mailto:<tu email>` en la terminal (o
en un `.env` ignorado por git para `docker compose`). Sin ellas, Cuenta → Mi horario muestra "Los
avisos no están disponibles" y el resto de la app funciona igual (FR-024).

## 3. Verificación local en el navegador del PC

```bash
node scripts/smoke-local.mjs serve --build --fresh
```

1. Cargar la app y recargar: el navegador **no** pide permiso de notificaciones (SC-007).
2. Sin horario: Cuenta → Mi horario → "Avisos en este móvil" con "Activar avisos" deshabilitado y
   "Primero agenda tu horario".
3. Agendar 23:15 → 7:00 con "Avisarme antes" 30: la explicación muestra 22:45, 23:15 y 8:00, que el
   texto no lleva datos de salud, quién entrega el aviso, el doble "prepárate" si se importó el
   calendario y los límites de No molestar y reposo del móvil.
4. "Activar avisos" → permiso → el dispositivo aparece como "Chrome en Windows" marcado "Este móvil".
5. "Enviarme un aviso de prueba" → llega la notificación del sistema (pestaña en segundo plano) o el
   aviso dentro de la app (pestaña visible); 4 pruebas en un minuto → "Espera un momento…".
6. `GET /api/admin/health` con `Authorization: Bearer $BACKUP_TOKEN` → `reminders` con `last_tick_at`
   reciente.

## 4. Verificación manual en Android (como el spike)

Con el móvil por USB y `adb reverse tcp:3000 tcp:3000`, abrir `http://localhost:3000` en Chrome
(contexto seguro sin HTTPS):

1. Activar los avisos y cerrar Chrome desde recientes con la pantalla bloqueada.
2. Ajustar el horario para que `prepare` venza en 3 min → llega "Descanso: en 30 min es tu hora de
   dormir" a ± 2 min; tocarlo abre Noche con "Me voy a dormir" a la vista.
3. Con la noche abierta y `wake_check` vencido → "Descanso: ¿ya despertaste?"; tocarlo con la pestaña
   en segundo plano navega la misma pestaña a Noche con "Ya desperté".
4. Retirar el permiso desde Chrome y pulsar el aviso de prueba → "Permiso retirado" con cómo
   reactivarlo; el dispositivo desaparece de la lista.
5. Opcional (pendiente del spike): dejar el móvil quieto 1 h y comprobar el retraso de Doze en un
   aviso real.

## 5. Memoria en Docker (SC-011)

```bash
docker build -t descanso:013 .
docker run --rm --memory=256m -e VAPID_PUBLIC_KEY -e VAPID_PRIVATE_KEY -e VAPID_SUBJECT -p 3000:3000 descanso:013
```

Dejarlo 10 min con el disparador en marcha y `docker stats`: sin OOM y por debajo de ~100 MB (el spike
midió un pico de 54 MB).

## 6. Despliegue

- `flyctl secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:…` (una vez).
- `fly.toml` con `min_machines_running = 1`; tras desplegar, `flyctl status` muestra la máquina
  encendida sin tráfico y `GET /api/admin/health` avanza `last_tick_at` cada 30 s.
- Rotar las claves: [`docs/runbooks/rotar-vapid.md`](../../docs/runbooks/rotar-vapid.md).
