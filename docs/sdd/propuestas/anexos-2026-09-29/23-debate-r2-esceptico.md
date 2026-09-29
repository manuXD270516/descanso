# Debate ronda 2 — Escéptico (E gamificación, F recordatorios)

## Veredictos

- **E: recortar fuerte.**
  - El usuario la pidió de forma explícita.
  - Contradice el rechazo anterior a la gamificación, y ese cambio se apoya en fuentes vistas solo en snippets.
  - La regla actual incentiva no registrar (ver E9).
  - Se aprueba solo una versión mínima: opt-in y condicionada a la enmienda VIII.
- **F: aprobar la fase 1 y aplazar la fase 2.**
  - Fase 1: S y 0 $, sin infraestructura nueva.
  - Fase 2: exige PWA, service worker, VAPID, un disparador y romper el auto-stop. Queda condicionada a P5 y al dispositivo.

## Bloqueantes

| ID | Propuesta | Objeción | Cambio exigido |
|----|-----------|----------|----------------|
| E9 | E, §5 "sin_dato no cuenta" | Saltarse el registro de una mala noche mantiene la racha viva. Se premia omitir datos, y eso sesga 005. | En el modo constancia, `sin_dato` cuenta como no cumplido dentro de la ventana 2/7. Test: "saltarse el registro nunca mejora la racha". |
| E10 | E, §1/§4 | Revierte el rechazo anterior con Baron y Jahrami, vistos solo en snippets, más divulgación. | Abrir las fuentes primarias o reformular sin ellas. Registrar el cambio de criterio. Aplicar VIII antes del plan de E. |
| E11 | E vs F | Hay dos modelos de horario (`planned_wake_min` + `schedule_history` frente a `sleep_schedules`). Además, F define "a tiempo" por la hora de acostarse, lo que contradice E FR-03. | F es la única dueña: `sleep_schedules` con `effective_from`. E solo lee la hora de despertar. Se eliminan `schedule_history` y `planned_wake_min`. |
| E12 | F (c)/(d) | Un ping cada minuto o cada 5 min impide el auto-stop: cuesta casi lo mismo que (a), pero con un tercero, un secreto y un cron que se desactiva a los 60 días. Las cifras de 3,1 $ y 6,5 $ no cuadran. | Conciliar el coste con una fuente y medir las horas encendidas. Sin P5 no hay fase 2. |
| E13 | F, cripto propia | Escribir el cifrado a mano es más arriesgado. | Usar `web-push`, justificada en Complexity Tracking. |
| E14 | F, B-3 | Una PWA con service worker puede servir el Angular antiguo tras un despliegue y romper expand/contract. | La PWA es una feature propia, con estrategia de actualización y tests. |

## Recortes

**E**

| Se queda | Se va |
|----------|-------|
| US1: un solo modo, según haya horario | US5: pausas (la tolerancia 2/7 las cubre) |
| US3: opt-in, 0 elementos en el DOM | US6: hábito extra |
| US4: sin culpa y con palabras prohibidas | `user_milestones`: los hitos se calculan |
| `best` y `total` calculados al leer | `week[7]` |

Resultado: 0 tablas nuevas y 2 columnas.

**F**

- Fase 1:
  - `wake_check` se fusiona con 006-US4;
  - fuera DND y "silenciar hoy";
  - fuera `reminder_deliveries`;
  - un solo `lead_min`.
- Fase 2: pasa a condicionadas.

## Conflictos con 003–009

1. **Gamificación**: solo es compatible si VIII dice "motivación solo sobre conductas controlables; nunca horas, calidad ni fases; opt-in" y se corrige E9. La racha no entra en los 3 KPIs.
2. **Horario**: F es la dueña. La calculadora de 006 propone valores para `sleep_schedules`, y el objetivo de 005 solo sugiere.
3. **Noche abierta**: 006-US4 y `wake_check` se unen en una sola regla. Con horario: hora agendada + 30 min. Sin horario: 14 h. La regla vive en 006.
4. **Zona horaria**: `user_settings.timezone` duplica `users.timezone`; debe quedar solo una.
5. **B-3**: la decisión se toma con E14.
6. **Coste**: ninguna feature puede asumir una máquina siempre encendida sin respuesta a P5.
7. **Exportar y borrar**: deben incluir `sleep_schedules`, los ajustes de la racha y `push_subscriptions` (que también se borra al cerrar sesión).

## Preguntas

1. ¿Qué significa "recompensa" y qué conducta se refuerza: registrar, levantarse o acostarse? ¿Aceptas opt-in y sin premios canjeables?
2. ¿iPhone o Android? ¿Te basta el calendario o necesitas push con la app cerrada?
3. P5: ¿entre 3 y 6,5 $/mes para ±1 min, gratis con ±15 min, o solo el calendario?

## Lo que está bien

- **E**:
  - Excluye horas, calidad y fases.
  - Excluye rankings, puntos, monedas, "racha en peligro" y reparación pagada.
  - Acostarse no puntúa.
  - El total no baja.
  - El cálculo es una función pura.
  - FR-06 está bien planteado.
- **F**:
  - Es honesta sobre los límites.
  - El ICS importado es barato y preciso.
  - FR-04 está bien planteado.
  - El permiso se pide tras un gesto del usuario.
  - Descarta `--schedule`.
  - Incluye tests de DST.
