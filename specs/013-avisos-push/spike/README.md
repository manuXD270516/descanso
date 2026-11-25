# Spike de 013: Web Push en un Android real

**Fecha**: 2026-10-23 · **Dispositivo**: HONOR 400 (Android 16, MagicOS), Chrome 155, con servicios de
Google · **Servicio push**: FCM (`fcm.googleapis.com`) · **Librería**: `web-push` 3.6.7 (versión fija,
instalada fuera del repositorio).

Montaje: `spike-server.mjs` (servidor mínimo, independiente de la app) en el PC y el móvil por USB con
`adb reverse tcp:3996 tcp:3996`, de modo que Chrome abre `http://localhost:3996` (contexto seguro sin
HTTPS). Claves VAPID temporales generadas en local y borradas al terminar; la suscripción y el volcado
de notificaciones del móvil (con datos personales) nunca entraron al repositorio y también se
borraron. Textos de prueba de 013, sin datos de salud. Registro de eventos sin identificadores:
[`evidence/spike-log.jsonl`](evidence/spike-log.jsonl).

**Latencia**: se mide con el reloj del servidor (envío → confirmación del service worker por el mismo
cable). El campo `latency_ms` del registro usa el reloj del móvil y arrastra un desfase de ~2 s.

## Resultados

| # | Comprobación | Resultado |
|---|--------------|-----------|
| 1 | Llega con Chrome cerrado desde recientes y la pantalla bloqueada | ✅ `prepare`, `bedtime` y `wake_check` en ~1,2–1,6 s. Android conserva un proceso de Chrome tras cerrar la pestaña (estado real de uso). |
| 1b | Llega tras reiniciar el móvil, con Chrome **sin ningún proceso** | ✅ El aviso arranca Chrome en frío: ~14 s. Válido para ±2 min; supera los < 10 s del aviso de prueba en este caso. |
| 2 | Tocar el aviso abre la app en Noche | ✅ Sin pestaña abierta: abre una nueva en `#noche`. Con la pestaña en segundo plano: la **misma** pestaña navega a `#noche-despertar` (`wake_check`). |
| 3 | Pestaña visible: aviso dentro de la app y no como notificación | ✅ El service worker no llama a `showNotification` y Chrome **no** añade su notificación genérica. Sin pestaña visible, la notificación se muestra normalmente. |
| 4a | Caducidad: un aviso con TTL vencido no llega tarde | ✅ Sin red, TTL 30 s y reconexión a los ~70 s: no llegó. |
| 4b | Colapso: dos avisos del mismo tipo se reducen a uno | ✅ Dos `bedtime` con el mismo `Topic` sin red: al reconectar solo llegó el último. Con red, el mismo `tag` sustituye la notificación en la bandeja. |
| 5 | "No molestar" de Android | ⚠️ El aviso **sí se publica pero en silencio** (bandeja). La explicación de 013 debe advertirlo. El móvil de prueba ya tenía "No molestar" en modo prioridad. |
| 6 | Permiso retirado | ✅ El servicio push responde **410** ("push subscription has unsubscribed or expired") al instante: se marca el dispositivo como no válido y se pide reactivar. |
| 7 | Memoria del servicio | ✅ App real (Express + SQLite) + `web-push` + tick cada 30 s durante 10 min: **pico 54 MB** de 256 (`measure-memory.mjs`). |
| 8 | Doze (reposo profundo) | ⚠️ Con `dumpsys deviceidle force-idle`, **ni la urgencia `high` ni la `normal` se mostraron hasta salir del reposo** (24–40 s de retraso, al desactivarlo). El Doze forzado es más estricto que el real, pero es un riesgo para el margen de ±2 min con el móvil quieto y apagado. |

## Consecuencias para el plan

- **Viable**: Web Push con Chrome en Android cumple el objetivo de 013 sin instalar la app; las cuatro
  piezas clave (entrega con el navegador cerrado, clic que abre Noche, caducidad y colapso, invalidez
  410) funcionan como se esperaba.
- **Enviar con `TTL` = ventana de descarte** (600 s para `prepare`/`bedtime`, 3.600 s para
  `wake_check`), **`Topic` = tipo** y **`urgency: high`**; el `tag` de la notificación = tipo + fecha de
  la noche. Así un aviso que no llega a tiempo no aparece tarde (FR de la ventana de descarte) y nunca
  se acumulan dos del mismo tipo.
- **410/404** al enviar → el dispositivo queda inválido y la app pide reactivar (estado "necesita
  reactivación").
- **Pestaña visible** → el service worker reenvía el aviso a la página (FR-019) sin notificación.
- **Riesgos que la spec debe reconocer** (sin cambiar el diseño):
  - Doze puede retrasar el aviso más allá de ±2 min con el móvil en reposo profundo; el criterio de
    ±2 min se mide hasta la entrega al servicio push y la guía lo explica como límite del sistema.
  - "No molestar" y el ahorro de batería del fabricante pueden silenciar o retrasar el aviso.
  - Arranque en frío tras reiniciar: hasta ~15 s.
- **Pendiente opcional**: confirmar Doze en una noche real (dejar el móvil quieto 1 h y enviar a la
  hora de prepararse) cuando exista el disparador de 013.
