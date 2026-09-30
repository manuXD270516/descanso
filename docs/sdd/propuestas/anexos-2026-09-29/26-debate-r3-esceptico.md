# Debate, ronda 3: el Escéptico sobre H (push programado)

## Veredicto

**QStash no se justifica.** La opción más simple que cumple el margen de ±2 min es dejar la **máquina siempre encendida (256 MB) con `setInterval` cada 30–60 s**, más `reminder_deliveries` y una recuperación de avisos al arrancar, que hace falta de todos modos por los despliegues.

- **Coste:** ≈ **3,3 $/mes** en total (3,13 $ de cómputo + 0,15 $ de volumen), dentro de los 2–4 $ que ya se daban por aceptables.
- **El ahorro de QStash está sobreestimado:** con 60–100 despertares al día de 5–8 min cada uno, la máquina estaría encendida hasta ~10 h/día. Eso equivale al ~45 % del coste de tenerla siempre encendida (~1,4 $). El ahorro real queda en ~1–1,5 $/mes.
- **Lo que añade QStash:** un tercero, 3 secretos, `scheduler_state`, una cadena de mensajes con su vigilante y su cancelación (vista solo en un snippet), la capa `Waker` y un fake para los tests.
- **Ventajas de la máquina siempre encendida:** el rate limit en memoria de 004 se vuelve fiable y desaparece el arranque en frío.

## Objeciones bloqueantes

| ID | Objeción | Cambio exigido |
|----|----------|----------------|
| E15 | El coste de "~0,3–1 $" contradice la propia matriz (60–100 mensajes/día × 5–8 min) | Recalcular con horarios reales o medir durante una semana |
| E16 | Cadena, vigilante, re-armado y `Waker` son complejidad para ahorrar ~1 $ | Justificarla en Complexity Tracking con la cifra medida |
| E17 | Pone un disparador externo en el camino crítico y añade 3 secretos | Aplicar la enmienda MINOR de V antes del plan y escribir un runbook de rotación |
| E18 | "Sin datos personales" es falso: con < 20 usuarios, la serie de `due` revela hábitos de sueño y hasta conductas (p. ej., "no marcó el despertar"). La URL identifica la app | Tratarlo como dato seudónimo: DPA de Upstash (art. 28), región UE o base legal para la transferencia, y mencionarlo en la política de privacidad |
| E19 | El plan gratuito no tiene SLA | Test de cambio a `AlwaysOnWaker` solo con configuración + alerta si `next_due_utc` vence |
| E20 | Afecta a ambas opciones: los despliegues pierden ticks | Deduplicación + ventana de descarte fija, con tests |

## Condiciones de aceptación

**Siempre encendida (preferida):**
- respuesta a P5;
- nota en R13 y en Complexity Tracking;
- humo con `--memory=256m` incluyendo `web-push`;
- `min_machines_running = 1`;
- VAPID como único secreto nuevo;
- `/api/health` con la antigüedad del último tick.

**QStash:**
- E15–E20 resueltas;
- consentimiento explícito del usuario para el tercero;
- cancelación de mensajes verificada en la documentación oficial;
- un único mensaje coalescido, sin `user_id` ni el tipo de aviso;
- ahorro medido ≥ 1,5 $/mes o se vuelve a la opción siempre encendida.

## Pregunta

¿Qué prefieres?

- **Máquina siempre encendida:** ≈ 3,3 $/mes en total y sin terceros.
- **QStash:** ahorras ~1–1,5 $/mes, pero un servicio externo (Upstash, EE. UU.) conoce las horas de los avisos de tus usuarios.
