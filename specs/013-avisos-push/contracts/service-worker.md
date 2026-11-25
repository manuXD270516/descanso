# Contrato: carga del aviso y service worker (013)

`frontend/public/push-sw.js` (research R11). Sin manejador `fetch` ni caché.

## Carga cifrada que envía el servidor (`reminders/push.js`)

JSON, cifrado aes128gcm por `web-push`. Nunca contiene datos de sueño ni de salud ni menciones de la
racha (FR-022): solo el tipo, la fecha de la noche y los textos fijos de FR-008.

| Campo | Valor |
|-------|-------|
| `kind` | `prepare` \| `bedtime` \| `wake_check` \| `test` |
| `night` | `AAAA-MM-DD` (fecha de la noche); `null` en `test` |
| `title` | `"Descanso"` |
| `body` | `prepare`: `"en X min es tu hora de dormir"` (X = "Avisarme antes"); `bedtime`: `"es tu hora de dormir"`; `wake_check`: `"¿ya despertaste?"`; `test`: `"aviso de prueba"` |
| `tag` | `"<kind>-<night>"` (`"test"` en la prueba): una notificación nueva del mismo tipo y noche sustituye a la anterior |
| `url` | `"/#noche"` (`prepare`, `bedtime`, `test`) o `"/#noche-despertar"` (`wake_check`) |

El texto visible es `"<title>: <body>"` ("Descanso: es tu hora de dormir"), idéntico al de FR-008; un
test de `push.js` compara las cuatro cargas con esos literales y con la lista de términos prohibidos.

Opciones del envío: `TTL` = ventana del tipo (600 s / 3.600 s; 60 s la prueba), `topic` = `kind`,
`urgency: 'high'`, `timeout: 10_000`.

## Evento `push`

1. `data = event.data.json()`; si falla, no hace nada salvo mostrar `"Descanso"` (Chrome exige una
   notificación visible por push sin ventana visible).
2. `wins = clients.matchAll({ type: 'window', includeUncontrolled: true })`.
3. Si alguna ventana tiene `visibilityState === 'visible'` → `win.postMessage({ type: 'descanso-push',
   ...data })` y **no** se muestra notificación (FR-019).
4. Si no → `registration.showNotification(data.title, { body: data.body, tag: data.tag, icon:
   '/favicon.ico', data: { url: data.url } })`.

## Evento `notificationclick`

1. `event.notification.close()`.
2. Si hay alguna ventana de Descanso → `focus()` y `navigate(data.url)` (la misma pestaña, spike 2).
3. Si no → `clients.openWindow(data.url)`.

## Mensaje a la página (`descanso-push`)

`PushService` lo recibe por `navigator.serviceWorker.addEventListener('message', …)` y lo entrega a
`bedtime-notice` (010-R7), que muestra `"<title>: <body>"` con `role="status"`, sin sonido y sin
animación con `prefers-reduced-motion`. Un `prepare` cuyo aviso de 010 ya se mostró ese día no se
repite.

## Enlaces

- `#noche` (010): pestaña Noche con "Me voy a dormir" a la vista.
- `#noche-despertar` (nuevo): pestaña Noche con "Ya desperté" a la vista (foco en el botón).
- Ambos se limpian del historial (`history.replaceState`) tras abrirse; sin sesión, tras entrar la
  pestaña inicial ya es Noche.
