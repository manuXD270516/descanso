# Reflection, ronda 2: gamificación (E) y recordatorios (F)

Respuesta del orquestador a las críticas de la ronda 2 ([23](23-debate-r2-esceptico.md), [24](24-debate-r2-defensor.md), [25](25-debate-r2-arquitecto.md)).

## Resultado

| Feature | Qué es | Estado |
|---|---|---|
| **010** | Horario de sueño y recordatorios sin servidor (F, fase 1) | Lista para especificar |
| **011** | Rachas de constancia (E) | Lista para especificar |
| **012** | App instalable / PWA (B-3) | Condicionada: iPhone + P5 |
| **013** | Notificaciones push (F, fase 2) | Condicionada: 012 + P5 |

## Registro de decisiones

| Crítica | Decisión | Dónde |
|---|---|---|
| E9 / X17 (si no registrar no cuenta como fallo, se premia omitir) | **Aceptada** (los tres críticos coinciden). Un día pasado sin registro cuenta como no cumplido en ambos modos. Test de propiedades: saltarse el registro nunca mejora la racha | 011-US1 |
| E10 (el cambio de postura sobre la gamificación se apoya en fuentes vistas solo en snippets) | **Aceptada**. La evidencia pasa a basarse solo en fuentes abiertas (AASM, NSF, editorial de SLEEP, Deci 1999, Dai 2014, Nishi 2024, Sleep Foundation). Baron y Jahrami quedan como contexto. El cambio de criterio se registra: se prohíben las puntuaciones de **resultado** y se permite motivar **conductas controlables**, siempre opcional y ocultable. La enmienda VIII se aplica antes del plan de 011 | 011, Enmiendas |
| E11 / X18 (dos modelos de horario; "a tiempo" definido por la hora de acostarse frente a "acostarse no puntúa") | **Aceptada**. 010 es la dueña del horario (`schedule_versions` + `schedule_days`). Se eliminan `schedule_history` y `planned_wake_min`. Solo puntúa la hora de levantarse, según el horario del día local del despertar | 010, 011 |
| E12 / X21 (los pings externos impiden el auto-stop; las cifras de coste no concuerdan) | **Aceptada**. Se descartan (c) y (d). La fase 2 solo usa el disparador (a) y queda condicionada a P5. El coste se concilia con la calculadora de Fly antes de responder P5 (≈ +3 a +6,5 $/mes según la memoria y la región) | 013 |
| E13 / X24 (criptografía hecha a mano) | **Aceptada**: `web-push` con versión fijada y justificada, o push sin payload | 013 |
| E14 / X29 (una PWA puede servir código viejo y cachear la API) | **Aceptada**. 012 es una feature propia: el SW nunca cachea `/api/*`, el shell va versionado y hay tests de actualización | 012 |
| X19 (un GET con efectos secundarios) | **Aceptada**: POST `/milestones/:key/seen` | 011 |
| X20 (rendimiento) | **Aceptada**: O(n), 3.650 días en < 20 ms | 011 |
| X22, X23, X25, X27 | **Aceptadas** para 013 | 013 |
| X26 (VTIMEZONE sin librería) | **Aceptada**: hora flotante, DTSTAMP, CRLF, plegado, UID y SEQUENCE | 010 |
| X28 (pausas solapadas) | **Aceptada**: validación con 409 | 011 |
| Recorte del escéptico: quitar las pausas | **Rechazado**. La tolerancia 2/7 no cubre un viaje de 5 días. Se sigue al defensor (UX-22): un único "Modo pausa" para racha y avisos, con los límites de 14 días y 2 pausas en 30 días | 010, 011 |
| Recorte del escéptico: quitar `user_milestones` y `week[7]` | **Rechazado**. El usuario pidió **recompensa**; la colección permanente de constelaciones es la recompensa, y el defensor la considera necesaria. Guardar los hitos garantiza que no se pierden, que es la lección de Silverman y Barasch | 011 |
| Recorte del escéptico: el hábito extra US6 | **Aceptado**: pasa al backlog | 011 |
| Recorte del escéptico: `dnd`, "silenciar hoy" y `reminder_deliveries` en la fase 1 | **Aceptado**: pasan a 013 | 010 |
| Defensor: desactivada por defecto = invisible (UX-15) | **Aceptado**. Se ofrece en la bienvenida o tras 3 noches, con explicación; sigue siendo opt-in | 011 |
| Defensor: la recompensa se queda en mensajes | **Aceptado**: estrellas semanales + constelaciones con dato personal, sin nada canjeable | 011 |
| UX-14 (una sola bienvenida para horario y objetivo) | **Aceptado** | 010 |
| UX-16 (Google Calendar en Android no importa archivos .ics) | **Aceptado**: guía por plataforma + spike en 1 iPhone y 2 Android | 010 |
| UX-17, UX-18 (permiso de notificaciones y el toque que lleva a dormir) | UX-18 va al texto del aviso de 010. UX-17 va a 013 | 010, 013 |
| UX-19 (nada de rachas antes de dormir) | **Aceptado** | 011 |
| UX-20, UX-21 (hitos sin modal; estrella apagada sin rojo) | **Aceptados** | 011 |
| UX-23 / conflicto 3 (`wake_check` frente a 006-US4) | **Aceptado**: una sola regla. Con horario: +60 min del despertar agendado (010). Sin horario: 14 h (006) | 010 |
| Conflicto 4 (zona horaria duplicada) | **Aceptado**: solo `users.timezone` | 010 |
| Conflicto 7 (exportar y borrar) | **Aceptado**: el horario, los ajustes, los logros y las suscripciones entran en la exportación y el borrado. Las suscripciones se excluyen de la exportación (X23) | 010, 011, 013 |
| Faltaba: aviso de prueba | Va a 013 | 013 |
| Faltaba: resumen de la semana | **Aceptado** como P3, dentro de la app | 011 |
| Faltaba: horario único | Cubierto por 010 | 010 |

## Preguntas nuevas para el usuario

- **P6.** ¿Qué hábito quieres que se premie: levantarte a tu hora (recomendado), acostarte a tu hora o simplemente registrar? ¿Te sirve como recompensa una colección de logros con datos personales, sin puntos ni premios canjeables?
- **P7.** ¿Usas iPhone o Android, y qué calendario? ¿Te basta con la alarma del calendario (010, gratis) o necesitas avisos con la app cerrada (012 + 013, con coste; ver P5)?
