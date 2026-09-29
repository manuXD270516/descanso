# Feature 006 – Diario opcional, ciclos y honestidad de datos (REM sin sensores)

Quiero orientarme sobre mis ciclos de sueño sin que la app prometa lo que no puede medir. Registrar la noche debe seguir siendo un solo toque.

## Descargo e insignias (P1)

- Cada dato indica su origen: "Anotado por ti", "Estimado" o "Del reloj".
- Siempre está visible el aviso "No es un dispositivo médico".
- Ningún texto de la app nombra trastornos, umbrales clínicos ni alertas médicas. Una prueba automática vigila una lista de palabras prohibidas.

## Calculadora de ciclos (P1)

Junto a "Me voy a dormir" veo ventanas sugeridas para despertar tras 4, 5 o 6 ciclos, por ejemplo "entre 6:45 y 7:15".

- Por defecto usa una latencia de 15 min y un ciclo de 90 min.
- Puedo ajustar la duración del ciclo (entre 70 y 110 min) y el tiempo que tardo en dormirme (entre 0 y 60 min).
- El texto dice siempre: "estimación, no medición; no está demostrado que despertar al final de un ciclo mejore cómo te sientes".
- Mis ajustes se guardan.

## Sección "Fases" (P2)

La sección "Fases" tiene un estado vacío honesto:

- Mientras no exista la importación: "Descanso aún no importa datos de relojes".
- Cuando exista: "Importa tus datos →".

## Recordatorio de noche abierta (P2)

- Si una noche lleva abierta 14 h o más, al abrir la app veo "¿Olvidaste marcar que despertaste?".
- La hora propuesta es la de dormir más mi objetivo.
- No hay notificaciones push.

## Tarjeta "¿Cómo fue la noche?"

**P3, sujeta a la pregunta P3 de la propuesta.** Después de "Ya desperté" aparece una tarjeta opcional y descartable con dos selectores:

- Cuánto tardé en dormirme: <15, 15–30 o >30 min.
- Cuántas veces desperté: 0, 1–2 o 3+.

Cerrar la noche sigue siendo 1 toque.

## Fuera de alcance

- Fases estimadas guardadas como si fueran medidas.
- Tendencias por fase.
- Alarma inteligente.
- Detección por sonido o movimiento.
- Puntuaciones de sueño.

Criterios de aceptación medibles por cada historia. Marca [NEEDS CLARIFICATION] lo ambiguo.

## Contexto técnico

Diseño de referencia: `docs/sdd/propuestas/2026-09-29-set-de-features.md` (feature 006, V-08, V-09, UX-01 a UX-03, N-02). Depende de la 004 (`user_settings`: `cycle_min` y `latency_min`).

- **Antes del plan**: aplicar la enmienda MINOR que crea el principio VIII, "Datos de salud: privacidad y honestidad".
- **Calculadora**: función pura con tests que cruzan la medianoche y cambios de offset.
- **Datos de la tarjeta**: columnas enum nulables `sol_bucket` y `awakenings_bucket` en `sleep_records`.
- **Evidencia**:
  - ciclos de 70 a 110 min;
  - AASM: la tecnología de consumo no diagnostica;
  - riesgo de ortosomnia, por eso no hay puntuaciones.
- **Aislamiento:** Sus rutas usan la capa `repo/` con `userId` (feature 008) y se añaden a la suite de aislamiento de dos usuarios de 008.
