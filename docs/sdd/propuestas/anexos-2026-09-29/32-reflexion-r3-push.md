# Reflection ronda 3: disparador del push programado (013)

Pregunta del usuario: "Analiza opciones para notificaciones push". Contexto: Android, menos de 20 usuarios, multiusuario confirmado.

Material: investigación [17-react-H](17-react-H-push-programado.md) y debate con el escéptico ([26](26-debate-r3-esceptico.md)) y el arquitecto ([27](27-debate-r3-arquitecto.md)).

## Desacuerdo

| | Escéptico | Arquitecto |
|---|---|---|
| Opción preferida | **Máquina siempre encendida** | **QStash** (rediseñado) |
| Argumento | Lo más simple y sin terceros. El ahorro real es ~1–1,5 $/mes, no 2–3 (E15) | Mantiene el auto-stop; es factible con mensajes por vencimiento |

## Decisión del orquestador (recomendación al usuario)

**Máquina siempre encendida** (`min_machines_running = 1` + `setInterval`), por cuatro motivos:

1. **Coste.** La diferencia real es de ~1–1,5 $/mes. El escéptico demostró que la estimación de 0,3–1 $ de H contradecía su propia matriz (E15): 60–100 despertares de 5–8 min.
2. **Privacidad.** Ahora hay multiusuario confirmado. Las horas de los avisos revelan los hábitos de sueño de cada persona (E18, X40). Evitar a un tercero en EE. UU. elimina la necesidad de DPA, transferencia internacional y consentimiento.
3. **Experiencia de uso** (argumento nuevo, **matizado por el evaluador**, V-33). Con QStash la máquina queda encendida 5–8 min tras enviar el aviso, así que tocarlo enseguida no provoca arranque en frío. Sí lo provoca tocarlo varios minutos después, por ejemplo el aviso de "prepárate" 30 min antes de dormir. Con la máquina siempre encendida nunca ocurre. Es un argumento secundario.
4. **Robustez y efectos colaterales.**
   - Sin cadena ni vigilante.
   - El rate limit en memoria de 004 se vuelve fiable.
   - Solo VAPID como secreto nuevo.

**QStash queda como alternativa documentada**, con el diseño corregido por el arquitecto: mensajes por vencimiento, deduplicación y sin cancelación. Se usaría si el usuario prioriza el coste. La interfaz `Waker` y la suite de contrato permiten cambiar de una opción a otra solo con configuración.

## Aceptadas en ambos casos

- **Deduplicación y ventana de descarte fija por tipo** (E20, X37):
  - `prepare` y `bedtime`: ≤ 10 min.
  - `wake_check`: ≤ 60 min.
  - Fuera de ventana, el aviso se marca como `skipped`.
- **Envío** (X39): aislado por usuario, con concurrencia ≤ 4.
- **Tick en proceso** (X38): con mutex.
- **`/api/health` de administración** (X34): `last_tick_at`, `pending_dues` y `skipped_24h`, sin datos personales.
- **Pruebas:**
  - concurrencia con una sola entrega;
  - 20 usuarios, con respuestas 410 y timeouts;
  - recuperación tras un despliegue;
  - humo en Docker con 256 MB que incluya `web-push`.

## Solo si se elige QStash

- Todas las objeciones X30–X36 y X40 deben estar resueltas.
- Condiciones del escéptico:
  - E15: ahorro medido de al menos 1,5 $/mes;
  - E17: enmienda MINOR del principio V y runbook de secretos;
  - E18: DPA, base legal para la transferencia y mención en la política de privacidad;
  - E19: test de cambio de proveedor y alerta.
- Consentimiento explícito del usuario al tercero.
- La cancelación verificada en la documentación abierta.

## Pregunta al usuario

¿Qué prefieres?

- **Máquina siempre encendida (recomendada):** ≈ 3,3 $/mes en total. Sin terceros y sin arranques en frío.
- **QStash:** ≈ 2 $/mes. Upstash (EE. UU.) conocería las horas de los avisos.
