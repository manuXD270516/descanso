# Propuesta H: disparadores para push a la hora exacta (ReAct, verificado el 2026-09-29)

**Contexto**

- El usuario pidió "analiza opciones para notificaciones push".
- El usuario usa Android, así que Web Push funciona sin instalar la app.
- Hasta ahora, la semilla de la feature 013 solo contemplaba mantener la máquina siempre encendida.

## Resumen

**Coste de la máquina siempre encendida en gru:**
- 256 MB: **3,13 $/mes** (1,94 $ de la región base × 1,615 de recargo de gru).
- 512 MB: 4,71 $/mes.
- Volumen: +0,15 $/mes.

**Upstash QStash como alternativa:**
- Plan gratuito: 1.000 mensajes/día.
- Admite mensajes diferidos hasta 7 días (`Upstash-Not-Before`).
- Firma JWT con clave current/next.
- La máquina solo despierta a la hora de cada aviso, así que **se mantiene el auto-stop**. Coste extra estimado: ~0,3–1 $/mes de cómputo (estimación propia).

**Recomendación**
- 1.ª opción: QStash con **un único mensaje pendiente encadenado**, más recuperación al arrancar y un vigilante diario.
- Alternativa: máquina siempre encendida con `setInterval`.

## Matriz

| Opción | Precisión | Coste/mes | ¿Mantiene el auto-stop? | Terceros | Veredicto |
|--------|-----------|-----------|-------------------------|----------|-----------|
| Fly siempre encendida + `setInterval` | ±1 min | 3,13 $ (256 MB) / 4,71 $ (512 MB) | No | Ninguno | **Alternativa** |
| **QStash** (Not-Before + cadena) | Segundos + arranque en frío; el plan gratuito no tiene SLA | 0 $ QStash (≈60–100 mensajes/día ≪ 1.000) + ~0,3–1 $ de cómputo | **Sí** | Upstash (1 token + 2 claves de firma); el payload solo lleva `{due}` | **1.ª** |
| cron-job.org + API | Al minuto, sin garantía | 0 $ | Sí | Clave de API. Límites: 100 peticiones de API/día y timeout de 30 s; se desactiva tras más de 25 fallos | Plan C |
| GitHub Actions cron | Retrasos y descartes; mínimo 5 min | 0 $ | Sí | PAT | Descartar (se desactiva a los 60 días) |
| EventBridge Scheduler `at()` | 60 s | 0 $ | Sí | AWS + IAM + destino | Descartar por complejidad |
| Cloud Tasks / Cloud Scheduler | — | Scheduler: 3 jobs gratis (*snippet*) | Sí | GCP + OIDC | Descartar |
| Cloudflare DO alarms | Segundos | 0 $ | Sí | **Segundo servicio** | Descartar: rompe "un solo servicio" |
| ntfy (`X-At`) | Segundos | 0 $ | Casi | App ntfy; los temas funcionan como contraseña | Solo si se rechaza Web Push (máx. 3 días de retraso programado) |
| OneSignal (`send_after`) | Buena | 0 $ | Sí | SDK de un tercero; comparte hábitos | Descartar |
| FCM con entrega programada | — | — | — | — | No existe (*no verificado*) |
| Solo cliente (Notification Triggers, Periodic Background Sync) | Ninguna | — | — | — | Descartar: abandonado, requiere PWA y no da hora exacta |

## Diseño con QStash

- **Tablas:**
  - `reminder_deliveries(user_id, kind, night_date, status, claimed_at, PK(user_id, kind, night_date))`;
  - `scheduler_state(id = 1, next_due_utc, qstash_message_id)`.
- **Programar:**
  - `computeNextDue()` calcula el mínimo global de (hora de acostarse − antelación, hora de acostarse, hora de despertar + 60 min si la noche sigue abierta), convirtiendo con `zonedToUtc` e `Intl`.
  - Publica un único mensaje a `POST /api/internal/tick` con `Upstash-Not-Before` y guarda el `messageId`.
- **Tick:**
  1. Verifica la firma (`Receiver` sobre el cuerpo crudo con `express.raw`, claves current y next).
  2. Hace el claim con `ON CONFLICT DO NOTHING` y confirma la transacción.
  3. Envía con `web-push` (versión fijada), con `TTL` y `Topic`.
  4. Marca el aviso como `sent`.
  5. Publica el siguiente mensaje **antes** de responder 200; si la publicación falla, responde 500 para que QStash reintente.
- **Recuperación:**
  - Al arrancar, y como mucho cada 10 min en cualquier petición de usuario, ejecuta `tick()` con una ventana de recuperación. Lo que queda fuera de la ventana se marca `skipped`.
  - Si la cadena está vencida o no existe, la vuelve a armar.
  - Un schedule diario de QStash actúa como vigilante (el plan gratuito permite 10 schedules).
- **Cambios de horario, pausa o "ya desperté":**
  - Se recalcula el siguiente vencimiento.
  - Si es anterior al pendiente, se cancela el mensaje (`DELETE /v2/messages/:id`, visto solo en *snippet*) y se publica otro.
  - Si es posterior, no se toca: el tick llegará antes, verá que no hay nada que enviar y reprogramará.
- **Secretos:**
  - `QSTASH_TOKEN` y las claves de firma current/next como secretos de Fly, más VAPID.
  - Rotación de las claves de firma con "Roll".
- **Abstracción `Waker`:** permite cambiar a `AlwaysOnWaker` (setInterval) solo con `min_machines_running = 1`.
- **Pruebas:**
  - `computeNextDue` (cambio de hora, horas inexistentes o ambiguas, pausa);
  - claim concurrente;
  - JWT de prueba: válido, alterado y expirado;
  - servidor de desarrollo de QStash o un fake;
  - E2E con el endpoint de push simulado;
  - botón "aviso de prueba".

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| La cadena se rompe en silencio | Vigilante diario, re-armado al arrancar, `next_due_utc` en `/api/health` (solo admin) |
| Upstash cambia su plan o se cae | `Waker` intercambiable → siempre encendida |
| Arranque en frío + ciclo de parada de Fly | Precisión ≤ 2 min; ~5–8 min de máquina encendida por despertar |
| Reintentos que consumen cuota | Uso ≪ 1.000; `489 NonRetryable` cuando no hay nada que enviar |
| SSRF y criptografía | Lista de hosts permitidos + `web-push` |
| Un tercero en el camino | Solo recibe `{due}`, sin datos personales |

## Preguntas

1. ¿Aceptas Upstash como tercero, sabiendo que solo recibe un timestamp?
2. ¿Qué retraso máximo es aceptable antes de descartar un aviso? Por ejemplo, 10 min.

## Fuentes

**Abiertas**

- **Fly.io:** pricing, regions, autostop.
- **Upstash:** pricing (×2), delay, signature, retry.
- **cron-job.org:** REST API y FAQ.
- **GitHub:** schedule.
- **AWS:** EventBridge pricing, schedule types, targets.
- **Cloudflare:** DO pricing.
- **ntfy:** publish, config, pricing.
- **OneSignal:** API y pricing.
- **Chrome:** Notification Triggers y Periodic Background Sync.

**Solo snippet:** cancelación en QStash (404), Cloud Scheduler y Cloud Tasks.
