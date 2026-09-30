# Propuesta E — Gamificación por rachas del hábito (borrador ReAct v0)

## 1. Resumen y recomendación

- **Qué se premia:** rachas extendidas con hitos a los 7, 21 y 66 días, solo por conductas que la persona controla: registrar la noche y **levantarse a una hora constante**.
- **Qué no se premia nunca:** horas dormidas, "calidad" ni fases.
- **Tolerancia:**
  - la racha aguanta hasta 2 faltas en cualquier ventana de 7 días;
  - hay pausas;
  - el total de días nunca baja;
  - volver a empezar se plantea sin culpa.
- **Relación con el rechazo previo por ortosomnia:** lo que se rechazó fueron las puntuaciones de *resultado* (fases, calidad). La ortosomnia nace de perseguir métricas de sueño; la Sleep Foundation recomienda centrarse en horarios constantes. Regla: nada de puntuaciones de resultado ni de presión.
- **Recomendación:** S/M, opt-in, ocultable y después de la 005.

## 2. Historias

- **US1 (P1) — Racha de constancia.**
  - Si hay hora de levantarse planificada, un día se cumple cuando la noche está cerrada y el despertar cae a ±30 min de esa hora (configurable entre 15 y 60).
  - Texto: "Llevas 12 días de constancia · Tu mejor racha: 25". Sin rojo ni verde.
  - La racha sigue viva con ≤ 2 días no cumplidos en cualquier ventana de 7 días.
- **US2 (P1) — Hitos a los 7, 21 y 66 días.**
  - Se muestran una sola vez, con un mensaje informativo.
  - Sin animación si el usuario tiene `prefers-reduced-motion`.
  - Un hito ganado no se retira.
- **US3 (P1) — Control.**
  - "Mostrar rachas" está desactivado por defecto; al activarlo se explica qué se premia.
  - Si está oculto, no se calcula ni se muestra nada (0 elementos en el DOM).
- **US4 (P2) — Volver a empezar sin culpa.**
  - Mensaje: "Tu mejor racha sigue siendo 25 días. El lunes es buen día para retomarla".
  - Test que prohíbe palabras como "perdiste", "fallaste" o "rompiste".
  - El total no baja nunca.
- **US5 (P2) — Pausar.**
  - Pausas de 1 a 14 días, como máximo 2 cada 30 días.
  - Los días en pausa no cuentan ni rompen la racha.
- **US6 (P3) — Hábito extra.** Enlazar una métrica sí/no (por ejemplo, "sin pantallas") como complemento. No afecta a la racha principal.

## 3. Requisitos funcionales

- **FR-01:** `computeStreak()` es una función pura en `analytics.js` y se calcula al leer.
- **FR-02:** si no hay hora de levantarse planificada, se usa el modo "Registro": basta con cerrar la noche.
- **FR-03:** la hora de acostarse no puntúa.
- **FR-04:** `GET /api/streak` devuelve `{enabled, mode, current, best, total, week[7], milestones, paused_until}`.
- **FR-05:** estados posibles: `cumplido`, `fuera_de_ventana`, `sin_dato`, `pendiente`, `pausado`. Cada uno lleva texto e icono además del color, y hay una tabla alternativa.
- **FR-06:** los recordatorios no mencionan la racha.
- **FR-07:** no hay compras ni coste de ningún tipo por reparar una racha.

**Fuera de alcance, con el motivo:**

| Mecánica | Por qué se excluye |
|----------|--------------------|
| Premiar horas o calidad | Ortosomnia; no es algo controlable |
| Rankings y comparación social | Privacidad |
| Puntos, niveles y monedas | Socavan la motivación propia (Deci 1999) |
| Avisos de "racha en peligro" | Son insistentes y generan ansiedad |
| Reparar la racha con coste o esfuerzo | Patrón oscuro |
| Castigos por desactivar | — |

## 4. Evidencia

| Afirmación | Fuente | Implicación |
|------------|--------|-------------|
| El hábito se automatiza en 66 días de media (rango 18–254); una falta aislada apenas influye | Lally 2010 (vía BPS y Surrey) | Hitos presentados como "de media"; tolerancia a faltas sueltas |
| Romper una racha reduce la conducta siguiente (~66 % frente a ~58 %); poder repararla atenúa el efecto | Silverman y Barasch, JCR 2023 (vía Psychology Today) | Tolerancia, pausa, mejor racha y total |
| Las recompensas esperadas y tangibles socavan la motivación intrínseca (d = −0,36); el feedback positivo la aumenta (d = +0,33) | Deci, Koestner y Ryan 1999 (PDF) | Mensajes informativos, sin premios canjeables |
| Las fechas señaladas (efecto "nuevo comienzo") facilitan retomar | Dai, Milkman y Riis 2014 (PDF) | Mensaje de lunes o de día 1 |
| La gamificación tiene efectos pequeños pero sostenidos; los ensayos no miden sueño | Nishi 2024, eClinicalMedicine (36 ECA) | Expectativa modesta |
| La ortosomnia es la búsqueda perfeccionista de datos; hay quien alarga el tiempo en cama | Sleep Foundation (Baron 2017 solo en snippet) | No premiar duración ni acostarse antes |
| La regularidad predice mortalidad tanto o más que la duración (asociación) | Editorial de Sleep 2024 (PMC); NSF 2023 | Premiar la constancia con lenguaje no causal |
| Control de estímulos: acostarse solo con sueño; la TCC-I es la primera línea | AASM, guía de pacientes 2021 | La ventana se aplica a la hora de levantarse |
| Los "congeladores" de racha reducen el abandono | Smashing 2026 (sin estudios; Duolingo solo en snippet) | Pausa gratuita y limitada |

## 5. Reglas de cálculo

- **Día evaluado:** la fecha de la noche según la regla III. Si una fecha tiene varias noches, cuenta la que termina más tarde.
- **Cumplido:** noche cerrada con el `wake_time`, en hora local del offset guardado, a ≤ `wake_window_min` de `planned_wake_min`, comparando de forma circular sobre 1.440 min. Así, los cambios de horario (DST) y los viajes no penalizan.
- **`sin_dato`:** día sin registro. No cuenta como fallo.
- **`pendiente`:** hoy, o una noche que sigue abierta.
- **Racha viva:** no puede haber ninguna ventana de 7 días (sin contar los pausados) con 3 o más días no cumplidos. Su longitud es el número de días cumplidos.
- **Mejor racha:** el máximo alcanzado. **Total:** todos los días cumplidos.
- **Noches importadas (007):** cuentan, leídas de `sleep_records`.
- **Siestas:** se ignoran.
- **Ediciones retroactivas:** cuentan, pero un hito ya celebrado no se retira.
- **Cambio de horario planificado:** afecta desde ese día en adelante; se guarda en `schedule_history`.

## 6. Datos

- `user_settings`:
  - `streaks_enabled` (0 por defecto);
  - `planned_wake_min` (NULL, compartido con recordatorios);
  - `wake_window_min` (30 por defecto);
  - `habit_metric_id`.
- `streak_pauses(user_id, start_date, end_date)`.
- `user_milestones(user_id, key, achieved_on, UNIQUE)`.
- `schedule_history(user_id, effective_from, planned_wake_min)`.

Todas las migraciones son aditivas (fase *expand*).

## 7. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Ortosomnia o ansiedad por la racha | Solo conductas, opt-in, ocultable, sin avisos de peligro |
| Efecto "total, ya da igual" al romper la racha | Tolerancia 2/7, pausa, total que no baja, nuevo comienzo |
| Patrones oscuros | FR-06, FR-07 y test de palabras prohibidas |
| Acostarse antes o quedarse en cama para cumplir | La hora de acostarse no puntúa |
| Editar horas para cumplir | Etiqueta de origen (006) |
| Viajes o turnos | Hora de pared + pausas |

## 8. Dependencias

- **003:** migraciones.
- **004:** `user_settings`.
- **005:** `analytics.js`, la regla "sin dato" y colocar la racha en un plegable (no en los 3 KPIs).
- **006:** honestidad, palabras prohibidas y etiquetas de origen.
- **007:** noches importadas.
- **008:** privacidad.
- **Recordatorios (F):** es la dueña del horario (`planned_wake_min`); no menciona la racha. Sin F, la racha funciona en modo "Registro".

## 9. Estimación y preguntas

**Estimación:** S/M.

**Preguntas abiertas:**
1. ¿La constancia se mide por la hora de levantarse (recomendado) o por la de acostarse?
2. ¿Contar los 7 días de la semana o solo los laborables?
3. ¿Aceptas que esté desactivada por defecto?

## 10. Enmiendas propuestas

- **VIII (MINOR):** la motivación se basa en conductas controlables. Quedan prohibidas las puntuaciones de resultado, la comparación social, las recompensas canjeables y las alertas de pérdida. La gamificación es opcional y ocultable.
- **III (PATCH):** la racha se evalúa por la fecha de la noche y la hora local del offset.

## Fuentes

**Abiertas:**
- Psychology Today (Silverman y Barasch)
- BPS y Surrey (Lally)
- PMC11701442 (Nishi 2024)
- Deci 1999 (PDF)
- Dai 2014 (PDF)
- Sleep Foundation, ortosomnia
- PMC10782489 (editorial de Sleep)
- NSF 2023
- AASM, guía de pacientes sobre insomnio
- Smashing 2026
- FTC (solo la página de portada)

**Solo snippet:**
- Baron 2017
- Jahrami 2023
- Cochran y Tesser 1996
- Duolingo
- Sleepy Birds
- ECA de 2024 sobre comparación social
- Windred 2024
