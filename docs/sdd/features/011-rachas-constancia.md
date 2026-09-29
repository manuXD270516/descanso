# Feature 011 – Rachas de constancia (gamificación del hábito)

Quiero sentirme recompensado cuando mantengo el hábito de sueño durante muchos días. La app premia las **conductas que dependen de mí**. Nunca puntúa cuántas horas dormí ni cómo dormí, y nunca me hace sentir culpable.

## Historias

### (P1) Mi racha de constancia

- **Con horario (feature 010):** un día cuenta cuando registro la noche y me levanto dentro de ±30 min de mi hora agendada (ajustable entre 15 y 60 min).
  - Se usa el horario del día en que me levanto.
  - La hora de acostarme **no** cuenta. Así no se incentiva quedarse en la cama.
- **Sin horario (modo "Registro"):** un día cuenta con solo cerrar la noche.
- **Días sin registrar:** cuentan como no cumplidos, igual que un día fuera de horario. Saltarse el registro nunca mejora la racha.
- **Anotado después:** un despertar registrado más de 60 min después de ocurrir, o confirmado a partir de la hora propuesta sin corregirla (010-US3), cuenta como registrado pero **no** como "a tu hora". Solo cuenta como "a tu hora" si corrijo la hora.
- **Noche abierta:** es "aún no" solo hasta el final del día siguiente; después cuenta como no cumplida.
- **Tolerancia:** la racha se mantiene aunque falle hasta 2 días en cualquier periodo de 7 días seguidos (sin contar los días en pausa). Se explica así: "Puedes fallar hasta 2 días en cualquier periodo de 7 días seguidos".
- **Definición exacta:**
  - la racha viva empieza en el primer día cumplido posterior a la última ventana de 7 días no pausados que tuvo 3 o más días no cumplidos;
  - "Día N de constancia" = número de días cumplidos dentro de esa racha;
  - los hitos se miden sobre ese N.
- **Qué veo:**
  - "Día 12 de constancia · Tu récord: 25 · Mañanas a tu hora en total: 60".
  - El total y el récord nunca bajan: el récord se guarda (`best_streak`) en la misma transacción que los logros, así que editar o borrar noches antiguas no lo reduce.
  - La noche abierta o el día de hoy aparecen como "aún no", sin contar ni romper la racha.

### (P1) Recompensa visible que no caduca

- Cada día cumplido enciende una estrella en la semana actual.
- Al llegar a 7, 21, 66, 100, 180 y 365 días de constancia se desbloquea una **constelación** permanente en mi colección. De 66 se dice que es la media que tarda un hábito en volverse automático, no que sea el mismo para todos. Cada una trae un dato personal, por ejemplo: "21 días: tu hora de levantarte varió solo ±18 min".
- Un logro ganado nunca se retira, aunque luego edite noches antiguas.
- **Presentación del logro:**
  - aparece una sola vez, en una tarjeta que puedo descartar;
  - si tengo `prefers-reduced-motion`, sin animación; si no, un brillo de ≤ 400 ms;
  - se anuncia con `role="status"`.
- **Sin** puntos, monedas, niveles, premios canjeables ni rankings.

### (P1) La racha está donde la busco y nunca antes de dormir

- En la bienvenida, o tras 3 noches registradas, una tarjeta me pregunta: "¿Quieres llevar una racha de constancia?". Muestra un ejemplo y explica qué se premia y por qué.
- Si digo "Ahora no", puedo activarla después en Ajustes.
- Con la racha desactivada no se calcula ni se muestra nada.
- **Dónde aparece:**
  - **Nunca** antes de dormir.
  - Tras "Ya desperté", una línea: "Día 12 de constancia ★".
  - La semana de estrellas y la colección van en un plegable del dashboard, fuera de los 3 indicadores principales.

### (P2) Volver a empezar sin culpa

- Si la racha se corta, veo: "Tu récord sigue siendo 25. Mañana es un buen día para empezar otra". Los lunes, ese mensaje invita a empezar la semana.
- Un día fuera de horario se muestra como estrella apagada con el motivo, por ejemplo: "Te levantaste a las 9:10 (fuera de tu horario)". Nunca en rojo.
- Una prueba automática prohíbe estas palabras: perdiste, fallaste, rompiste, en peligro, castigo.
- Nunca hay avisos del tipo "tu racha está en peligro". Los recordatorios no mencionan la racha.

### (P2) Pausa

- El "Modo pausa" de la feature 010 deja la racha en pausa: esos días no cuentan ni la rompen.
- Los límites los fija 010: empieza hoy o después, nunca en el pasado; máximo 14 días; 2 pausas cada 30 días; sin solapes.

### (P3) Resumen de la semana

- Al abrir la app el primer día de la semana, una tarjeta que puedo descartar muestra, por ejemplo: "Esta semana: 5 de 7 mañanas a tu hora · media 7 h 10 min".
- No se envía por notificación.

## Fuera de alcance

- Premiar horas dormidas, calidad o fases.
- Rankings y comparación social.
- Puntos, monedas, niveles y premios canjeables.
- Avisos de pérdida.
- Pagar o hacer esfuerzo extra para recuperar una racha.
- Hábito extra ligado a una métrica (queda en backlog).

**Límite conocido:** la regla de "Anotado después" funciona por confianza. Quien corrige la hora propuesta por otra casi igual sí cuenta "a tu hora". Es aceptable en una app personal y va señalado con el origen de cada dato (006).

Criterios de aceptación medibles por cada historia. Marca [NEEDS CLARIFICATION] lo ambiguo.

## Contexto técnico

**Referencias**
- Diseño: `docs/sdd/propuestas/2026-09-29-set-de-features.md` (feature 011).
- Anexos: `14-react-E-gamificacion.md` y la ronda 2 del debate (E9, E10, X17, X19, X20, X28, UX-15, UX-19 a UX-22).

**Dependencias**
- 005: `analytics.js` y la regla "sin dato".
- 006: palabras prohibidas y origen de los datos.
- 010: horario versionado y pausa.

**Requisito previo al plan**
- Enmienda MINOR del principio VIII: la motivación solo puede basarse en conductas controlables. Quedan prohibidas las puntuaciones de resultado, la comparación social, las recompensas canjeables y las alertas de pérdida. La gamificación es opcional y se puede ocultar.

**Evidencia (fuentes abiertas)**
- AASM, guía de pacientes de 2021: control de estímulos, la hora de levantarse es la que se fija.
- NSF 2023 y editorial de *SLEEP* 2024: la regularidad importa.
- Deci, Koestner y Ryan 1999: las recompensas tangibles restan motivación; el feedback informativo la suma.
- Silverman y Barasch, JCR 2023 (fuente **secundaria**, leída en divulgación): romper una racha reduce la conducta siguiente.
- Dai, Milkman y Riis 2014: efecto "nuevo comienzo".
- Nishi 2024: efectos pequeños pero sostenidos.
- Sleep Foundation: ortosomnia.

**Cálculo**
- `computeStreak()` es una función pura en `analytics.js`, O(n) con ventana deslizante.
- Criterio de rendimiento: 3.650 días en menos de 20 ms. Sin tabla materializada.
- Tests de propiedades:
  - la racha no crece sin días cumplidos;
  - las pausas son neutras;
  - el récord y el total son monótonos;
  - saltarse un registro nunca mejora la racha;
  - confirmar la hora propuesta sin corregirla nunca mejora la racha;
  - una noche que nunca se cierra acaba contando como no cumplida;
  - no se puede crear una pausa en el pasado.

**API**
- `GET /api/streak` no tiene efectos secundarios.
- El logro se guarda (`achieved_on`) **dentro de la transacción que cierra o edita una noche**, cuando el récord alcanza el umbral. Así no desaparece aunque después se editen noches.
- `POST /api/streak/milestones/:key/seen` marca un logro como visto.

**Esquema (aditivo)**
- `user_settings`: `streaks_enabled` (0 por defecto), `wake_window_min` (30 por defecto) y `best_streak` (persistido, solo crece).
- La pausa se lee de la tabla `pauses` de 010.
- `user_milestones(user_id, key, achieved_on, seen_at, UNIQUE)`.

**Exportación y borrado**
- Incluyen los ajustes y los logros.
