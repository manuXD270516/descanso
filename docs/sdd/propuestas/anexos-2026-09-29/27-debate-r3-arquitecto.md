# Debate, ronda 3: el Arquitecto sobre H (push programado)

## Veredicto

**QStash es factible con cambios.** No contradice X21 (pings frecuentes), porque la máquina solo despierta a la hora de cada aviso. Aun así, añade:

- un tercero;
- 3 secretos;
- un invariante frágil (la cadena de mensajes).

La máquina **siempre encendida es trivialmente correcta**.

Cambio principal: **descartar la cadena de un único mensaje**. En su lugar, **un mensaje por vencimiento**:

- idempotente y sin cancelaciones;
- publicado con un horizonte de 24–48 h;
- con `Upstash-Deduplication-Id = hash(user|kind|night_date|due)`, a verificar en el spike;
- los ticks obsoletos no tienen efecto;
- volumen estimado: ~60–100 mensajes/día, frente a un límite de 1.000.

## Objeciones bloqueantes

| ID | Problema | Cambio exigido |
|----|----------|----------------|
| X30 | Carrera en la cadena: si se pierde el 200 y QStash reintenta, aparece una segunda cadena que se multiplica | Mensajes por vencimiento con dedup (o, si se mantiene la cadena, dedup `next_due` + CAS) |
| X31 | La operación `DELETE` solo aparece en un snippet | Diseño sin cancelación |
| X32 | QStash entrega *at-least-once* | El claim es la barrera, junto con `TTL` y `Topic`. Verificar `489` |
| X33 | El vigilante comparte dominio de fallo con Upstash | Usar `backup.yml` (que despierta a diario) + recuperación al arrancar |
| X34 | Arranque en frío | Claim → responder **202** → enviar dentro del proceso. Medir el p95 de arranque en frío en `gru`. Timeout de QStash > arranque + envío |
| X35 | `computeNextDue` global: dos editores se pisan | Vencimientos **por usuario**, recalculados solo para ese usuario |
| X36 | `express.json` global consume el cuerpo | Ruta tick con `express.raw({limit:'4kb'})` antes de `json`, fuera de `requireAuth` y de CSRF. Verificar `sub`/`url` y el hash del cuerpo |
| X37 | Una ventana de recuperación única puede avisar "hora de dormir" a las 00:40 | Ventana por tipo (`prepare`/`bedtime` ≤ 10 min; `wake_check` ≤ 60 min). No molestar se evalúa al enviar |
| X38 | Ejecutar `tick()` dentro de las peticiones de usuario añade latencia y paralelismo | `setImmediate` tras la respuesta, como mucho cada 10 min, con mutex |
| X39 | Un 410 o un timeout aborta el reparto | Aislamiento por usuario, concurrencia ≤ 4 |
| X40 | Los metadatos de horario revelan hábitos (RGPD art. 9) | Payload con un id opaco, sin `user_id`. Upstash como encargado en la política de privacidad |

## Cambios exigidos a 013

1. `Waker` con `QStashWaker` y `AlwaysOnWaker`, que pasen **la misma suite de contrato**.
2. Spike con el servidor de desarrollo de QStash: `Not-Before`, dedup, reintentos, timeout, `489`, `DELETE` y arranque en frío en Fly.
3. Vencimientos por usuario con horizonte de 48 h, generados al editar, en el schedule diario y en la recuperación al arrancar.
4. Orden de middlewares de 004 documentado.
5. Ventanas por tipo de aviso.
6. `/api/health` de administración con `pending_dues`, `last_tick_at` y `skipped_24h`, sin datos personales.
7. Secretos QStash con un runbook de rotación.
8. Criterio de salida hacia la máquina siempre encendida: `skipped` > 5 % en 7 días, o un cambio en el plan gratuito.

## Pruebas adicionales

- QStash simulado (not-before, reintentos, duplicados, timeouts): cada aviso llega exactamente una vez.
- Propiedad: todo vencimiento en las próximas 48 h está cubierto.
- JWT: válido, alterado, expirado, clave `next`, `url` distinta y hash distinto.
- Orden de middlewares.
- Recuperación tras 1 h de QStash caído.
- Concurrencia con 1 entrega.
- 20 usuarios, incluidos casos 410 y timeout.
- Aislamiento de vencimientos por usuario.
- Humo en Fly con p95 ≤ 2 min.
- E2E.
