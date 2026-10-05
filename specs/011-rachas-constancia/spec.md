# Feature Specification: Rachas de constancia (gamificación del hábito)

**Feature Branch**: `011-rachas-constancia`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: `docs/sdd/features/011-rachas-constancia.md`. Sentirme recompensado cuando
mantengo el hábito de sueño muchos días. La app premia solo las **conductas que dependen de mí**
(acostarme y levantarme a mi hora, y registrar la noche); nunca puntúa cuántas horas dormí ni cómo
dormí, y nunca me hace sentir culpable. Reutiliza el horario versionado y la pausa de 010. Cada usuario
ve solo lo suyo (constitución v2.0.0) y rige el principio VIII, ampliado antes del plan (enmienda MINOR
v2.2.0, borrador en [`constitution-amendment-draft.md`](constitution-amendment-draft.md)): la
motivación solo puede basarse en conductas controlables, sin puntuaciones de resultado, comparación
social, recompensas canjeables ni alertas de pérdida, y toda gamificación es opcional y ocultable.

## Clarifications

### Session 2026-10-05

- Q: ¿Qué conducta cuenta como «día cumplido»? → A: **Acostarse y levantarse a tiempo** según el
  horario vigente esa noche (las dos condiciones). Ninguna de las dos horas registradas puede pasar de
  la agendada + el margen (30 min por defecto); adelantarse no resta.
- Q: ¿Un despertar anotado tarde (más de 60 min después, origen «Anotado después») cuenta? → A: **Sí,
  cuenta, pero el día queda marcado** con la misma marca «Anotado después»; la comprobación usa la
  hora de levantarse guardada (la corregida).
- Q: ¿Cómo cuentan las noches sin horario activo (día desmarcado del horario o en pausa)? → A: **Como
  modo «Registro»**: basta con cerrar la noche para que cuente. Una noche en pausa sin registrar sigue
  siendo neutra.

## Glosario

- **Día de constancia N**: la **noche** con fecha N, el día en que te acuestas (principio III). Una
  noche registrada se asigna a N si su hora de acostarse cae el día N desde las 12:00 o el día N + 1
  antes de las 12:00 (la misma regla que el horario de 010: antes de mediodía = después de
  medianoche). Así, acostarse a las 0:30 del sábado es la noche del viernes, como en el horario.
- **Horario de la noche N**: el día de la semana de N en la versión del horario vigente en N (010:
  mayor "desde" ≤ N; el mismo día, la última). **Hora de acostarse agendada**: N a `acostarse` (N + 1
  si es antes de mediodía). **Hora de levantarse agendada**: N + 1 a `levantarse`. Horas de reloj de
  pared.
- **Margen**: minutos del ajuste "Margen" (30 por defecto, 15–60) que se suman a cada hora agendada;
  el límite cuenta como dentro. **A tu hora** = la hora registrada no pasa de la agendada + margen.
  Acostarse o levantarse antes nunca resta.
- **Noche con horario activo**: hay versión vigente en N, el día de la semana de N está activo y N no
  está en pausa. Si no, la noche se evalúa en **modo "Registro"**.
- **Estados de un día**: **cumplido**, **no cumplido** (con su motivo), **en pausa** (neutro) y **aún
  no** (todavía no se puede decidir; neutro). Un día cumplido o no cumplido puede llevar además la
  marca **"Anotado después"**. Las noches anteriores a la activación no tienen estado (sin estrella).
- **Ajustes**: la sección de la racha en Cuenta → "Mi horario" (010), junto al horario y la pausa.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mi racha de constancia (Priority: P1)

Como usuario, veo cuántos días llevo manteniendo mi hábito ("Día 12 de constancia"), mi récord y el
total de días cumplidos, calculados con reglas claras que no se pueden mejorar dejando de registrar ni
confirmando sin mirar la hora que propone la app.

**Why this priority**: es la base de toda la feature; sin un cálculo honesto, las estrellas y las
constelaciones no significan nada.

**Independent Test**: horario de 23:00 a 7:00 todos los días y margen de 30 min. Registrar 10 noches
seguidas acostándose a las 23:10 y levantándose a las 7:10 → "Día 10 de constancia"; la noche 11
levantarse a las 9:10 y la 12 no registrar nada → siguen 10 días cumplidos y la racha no se corta
(2 no cumplidos en 7 días); la noche 13 acostarse a las 0:15 y levantarse a las 7:00 → 3 no cumplidos
en 7 días: la racha se corta, el récord sigue en 10 y el total en 10; la noche 14 de 23:00 a 7:00 →
"Día 1 de constancia · Tu récord: 10 · Días cumplidos en total: 11".

**Acceptance Scenarios**:

1. **Given** un horario activo para la noche N con acostarse a B y levantarse a W, **When** cierro esa
   noche con hora de acostarse ≤ B + margen y hora de levantarse ≤ W + margen, **Then** N cuenta como
   cumplido.
2. **Given** la misma noche con hora de acostarse posterior a B + margen, aunque me levante a mi hora,
   **When** veo la racha, **Then** N es no cumplido con el motivo "Te acostaste a las 0:15 (fuera de
   tu horario)".
3. **Given** la misma noche con hora de levantarse posterior a W + margen, **When** veo la racha,
   **Then** N es no cumplido con el motivo "Te levantaste a las 9:10 (fuera de tu horario)".
4. **Given** una noche en la que me acuesto o me levanto antes de la hora agendada, **When** veo la
   racha, **Then** N cuenta como cumplido si ninguna hora pasa de la agendada + margen.
5. **Given** una noche sin horario activo (sin horario, día desactivado o en pausa), **When** la
   cierro, **Then** N cuenta como cumplido, sean cuales sean las horas (modo "Registro").
6. **Given** una noche N sin registrar y fuera de pausa, **When** termina el día N + 1, **Then** N
   cuenta como no cumplido con el motivo "Sin registro".
7. **Given** una noche con horario activo cerrada confirmando la hora propuesta por "¿Ya
   despertaste?" sin corregirla (010-US3), **When** veo la racha, **Then** N es no cumplido con el
   motivo "Hora propuesta, sin anotar la real"; en modo "Registro" es cumplido.
8. **Given** un despertar anotado más de 60 min después de ocurrir ("Anotado después") en el que
   escribo la hora real, **When** veo la racha, **Then** N se evalúa con esa hora y, si cumple, cuenta
   como cumplido con la marca "Anotado después".
9. **Given** una noche abierta o sin registrar cuya fecha es hoy o ayer, **When** veo la racha,
   **Then** aparece como "aún no", sin contar ni cortar; si al terminar el día N + 1 sigue sin
   cerrarse, N pasa a no cumplido.
10. **Given** 2 no cumplidos en cualquier periodo de 7 días seguidos no pausados de la racha en curso,
    **When** veo la racha, **Then** se mantiene; la explicación dice "Puedes fallar hasta 2 días en
    cualquier periodo de 7 días seguidos".
11. **Given** un no cumplido que deja 3 en el periodo de 7 días no pausados que termina en él (dentro
    de la racha en curso), **When** veo la racha, **Then** la racha se corta ahí: la siguiente empieza
    en el primer día cumplido posterior y "Día N" cuenta solo los días cumplidos desde entonces.
12. **Given** un récord de 25 y un total de 60, **When** edito o borro noches antiguas que los harían
    bajar, **Then** el récord sigue en 25 y el total en 60.
13. **Given** que cambio el margen (entre 15 y 60 min) en Ajustes, **When** vuelvo a la racha,
    **Then** se recalcula con el nuevo margen, sin bajar el récord ni el total.

---

### User Story 2 - Recompensa visible que no caduca (Priority: P1)

Como usuario, cada día cumplido enciende una estrella en la semana actual y, al llegar a ciertos
días de constancia, gano una constelación permanente con un dato personal sobre mi constancia.

**Why this priority**: es la recompensa en sí; feedback informativo, no premios tangibles (Deci,
Koestner y Ryan 1999).

**Independent Test**: con 6 días de constancia, cumplir el séptimo → tras "Ya desperté" aparece una
sola vez una tarjeta descartable "Constelación de 7 días" con un dato como "tu hora de levantarte
varió solo ±12 min", anunciada con `role="status"`; editar después una noche de esa semana para que
deje de estar a tu hora → la constelación sigue en la colección y la tarjeta no reaparece.

**Acceptance Scenarios**:

1. **Given** la semana actual (noches de lunes a domingo), **When** la veo, **Then** hay 7 estrellas:
   encendida si el día está cumplido, apagada si no lo está, y "en pausa" o "aún no" con su propio
   estilo neutro; un día "Anotado después" lleva esa marca.
2. **Given** que el número de días de constancia (N de la racha viva) llega a 7, 21, 66, 100, 180 o
   365, **When** se cierra o edita la noche que lo provoca, **Then** se desbloquea en ese mismo
   momento la constelación correspondiente, con la fecha en que se logró.
3. **Given** la constelación de 66 días, **When** la veo, **Then** dice que 66 es la **media** que
   tarda un hábito en volverse automático, no que sea igual para todos.
4. **Given** una constelación, **When** la veo, **Then** incluye un dato personal calculado sobre la
   racha que la desbloqueó y basado solo en conductas (la variación de la hora de levantarse), nunca
   en horas dormidas ni en calidad.
5. **Given** un logro desbloqueado, **When** edito o borro noches antiguas, **Then** el logro no se
   retira ni cambia de fecha.
6. **Given** un logro nuevo, **When** aparece, **Then** lo hace una sola vez, en una tarjeta que puedo
   descartar; con `prefers-reduced-motion` no hay animación y si no, un brillo de 400 ms como máximo;
   se anuncia con `role="status"`. Una vez descartada, no vuelve a aparecer.
7. **Given** cualquier pantalla de la feature, **When** la reviso, **Then** no hay puntos, monedas,
   niveles, premios canjeables ni rankings.

---

### User Story 3 - La racha está donde la busco y nunca antes de dormir (Priority: P1)

Como usuario, decido si quiero llevar una racha; si la activo, la veo al despertar y en un plegable
de Tendencias, nunca cuando voy a acostarme.

**Why this priority**: la gamificación es opcional (enmienda VIII) y verla antes de dormir puede
generar presión justo cuando hay que relajarse.

**Independent Test**: usuario con 3 noches registradas → tras "Ya desperté" aparece la tarjeta
"¿Quieres llevar una racha de constancia?" con un ejemplo; "Ahora no" la oculta y Ajustes ofrece
activarla; con la racha desactivada no aparece nada de la feature en ninguna pantalla; activada, tras
el siguiente "Ya desperté" se ve "Día 1 de constancia ★" y en Noche, sin noche abierta, no hay ningún
rastro de la racha antes de pulsar "Me voy a dormir".

**Acceptance Scenarios**:

1. **Given** la bienvenida de 005 o, si ya la vi, la tercera noche cerrada, **When** abro la
   bienvenida o pulso "Ya desperté" (o abro Tendencias), **Then** veo una sola vez la tarjeta
   "¿Quieres llevar una racha de constancia?", con un ejemplo y la explicación de qué se premia
   (acostarte y levantarte a tu hora, o registrar la noche si no tienes horario) y por qué (la
   regularidad de los horarios ayuda a fijar el hábito), y las opciones "Sí, activarla" y "Ahora no".
2. **Given** que elegí "Ahora no", **When** voy a Ajustes, **Then** puedo activarla; la tarjeta no
   vuelve a aparecer por sí sola.
3. **Given** la racha desactivada (estado por defecto), **When** uso la app, **Then** no se calcula,
   no se guarda ni se muestra nada de la racha, ni se desbloquean logros.
4. **Given** la racha activada, **When** pulso "Ya desperté", **Then** veo una línea "Día N de
   constancia ★" (si el día está cumplido) o un mensaje neutro (si no lo está).
5. **Given** la racha activada, **When** abro Tendencias, **Then** la semana de estrellas, el récord,
   el total y la colección están en un plegable aparte, fuera de los 3 indicadores principales de 005.
6. **Given** la racha activada, **When** estoy en la pantalla de acostarme ("Me voy a dormir", el
   panel "¿Hora de dormir?" y el aviso de 010-US5), **Then** no veo nada de la racha.
7. **Given** la racha activada, **When** la desactivo en Ajustes, **Then** desaparece de todas las
   pantallas; el récord y los logros se conservan por si la vuelvo a activar.

---

### User Story 4 - Volver a empezar sin culpa (Priority: P2)

Como usuario, si la racha se corta o un día no cumplo, la app me lo cuenta sin culpa y me invita a
empezar de nuevo.

**Why this priority**: romper una racha reduce la conducta siguiente; el mensaje de "nuevo comienzo"
lo amortigua (Dai, Milkman y Riis 2014).

**Independent Test**: con récord de 25 y la racha cortada → "Tu récord sigue siendo 25. Mañana es un
buen día para empezar otra"; si hoy es domingo, el texto invita a empezar la semana; un día fuera de
horario aparece como estrella apagada con "Te levantaste a las 9:10 (fuera de tu horario)", sin rojo;
la prueba automática de palabras prohibidas pasa.

**Acceptance Scenarios**:

1. **Given** una racha cortada sin ningún día cumplido después (N = 0 y récord R > 0), **When** veo
   la racha, **Then** leo "Tu récord sigue siendo R. Mañana es un buen día para empezar otra"; si
   mañana es lunes, el mensaje invita a empezar la semana.
2. **Given** un día no cumplido, **When** lo veo, **Then** es una estrella apagada con su motivo ("Te
   acostaste a las 0:15 (fuera de tu horario)", "Te levantaste a las 9:10 (fuera de tu horario)",
   "Hora propuesta, sin anotar la real" o "Sin registro"); nunca en rojo ni con iconos de error.
3. **Given** todos los textos de la feature, **When** se ejecuta la prueba automática, **Then**
   ninguno contiene "perdiste", "fallaste", "rompiste", "en peligro" ni "castigo".
4. **Given** cualquier momento, **When** reviso avisos y recordatorios (010 y futuros), **Then**
   ninguno menciona la racha ni avisa de que puede cortarse.

---

### User Story 5 - Pausa (Priority: P2)

Como usuario, cuando activo el "Modo pausa" de 010 (viaje, malestar, turnos), la racha queda en
pausa: no registrar esos días no la corta, y si registro la noche, cuenta como en modo "Registro".

**Why this priority**: sin pausa, un viaje cortaría la racha por algo que no controlo.

**Independent Test**: racha de 10 días; pausa de 5 días sin registrar nada → al terminar, sigue
"Día 10 de constancia" y esas estrellas se ven "En pausa"; en otra pausa, registrar una noche a
cualquier hora → "Día 11".

**Acceptance Scenarios**:

1. **Given** una noche N dentro de una pausa de 010 sin noche cerrada, **When** veo la racha,
   **Then** N es "en pausa": no suma cumplidos ni no cumplidos y no entra en los periodos de 7 días.
2. **Given** que cierro una noche N durante la pausa, **When** veo la racha, **Then** N cuenta como
   cumplido en modo "Registro", sean cuales sean las horas.
3. **Given** las reglas de pausa de 010 (empieza hoy o después, máximo 14 días, 2 cada 30 días, sin
   solapes), **When** creo una pausa en "Mi horario", **Then** se aplican sin cambios: no se puede
   pausar el pasado para salvar una racha.

---

### User Story 6 - Resumen de la semana (Priority: P3)

Como usuario, la primera vez que abro la app en una semana nueva veo un resumen breve de la semana
anterior.

**Why this priority**: refuerzo informativo y semanal; poco frecuente.

**Independent Test**: el lunes, tras "Ya desperté" o en Tendencias → tarjeta descartable "La semana
pasada: 5 de 7 días cumplidos · media 7 h 10 min"; descartarla → no reaparece esa semana; no llega
ninguna notificación.

**Acceptance Scenarios**:

1. **Given** la racha activada y una semana nueva (desde el lunes) sin descartar el resumen, **When**
   pulso "Ya desperté" o abro Tendencias, **Then** veo una tarjeta descartable con los días cumplidos
   de la semana anterior sobre los días no pausados y la media de horas registradas como dato
   informativo.
2. **Given** una semana anterior con menos de 3 noches cerradas, **When** veo el resumen, **Then** la
   media aparece como "sin datos", nunca como 0.
3. **Given** el resumen, **Then** no se envía por notificación ni fuera de la app.

---

### Edge Cases

- **Horario que cambia a mitad de racha**: cada noche se evalúa con la versión vigente en su fecha;
  las noches pasadas no cambian al crear una versión nueva.
- **Hora agendada después de medianoche** (acostarse a la 1:15 o levantarse a las 0:15): se compara
  por hora de reloj de pared desde la fecha de la noche, no por minutos del día; la ventana cruza el
  día sin error.
- **Acostarse después de medianoche sin horario que lo prevea** (horario a las 23:00 y acostarse a la
  0:15 del día siguiente): la noche es la del día anterior (glosario) y no cumple; el motivo dice "Te
  acostaste a las 0:15 (fuera de tu horario)", sin juicio.
- **Dos noches asignadas a la misma noche de constancia** (una noche partida registrada dos veces): se
  evalúa con la primera hora de acostarse y la última de levantarse; el día no se cuenta dos veces.
- **Siestas** (005): no cuentan ni cambian la racha.
- **Cambio de hora oficial (DST) o viaje**: las horas agendadas son de reloj de pared (010); "7:00"
  son las 7:00 locales de la hora registrada.
- **Activación a mitad de historial**: la racha se calcula desde la noche del día de la última
  activación; las noches anteriores no cuentan ni restan.
- **Hoy y ayer**: una noche sin cerrar de hoy o de ayer es "aún no"; nunca corta la racha por la
  mañana temprano.
- **Noche abierta más de un día**: pasa a no cumplido al terminar el día N + 1; si después la cierro,
  se recalcula con las horas guardadas y la marca "Anotado después".
- **Noche registrada a posteriori** (sin pulsar "Me voy a dormir" ni "Ya desperté"): su despertar
  queda "Anotado después"; cuenta si las horas cumplen, con la marca.
- **Borrar la cuenta**: borra ajustes, récord y logros; la exportación los incluye.
- **Dos usuarios**: la racha, los ajustes y los logros de uno nunca aparecen para el otro (404).

## Requirements *(mandatory)*

### Functional Requirements

**Cálculo de la racha (US1)**

- **FR-001**: Cada día de constancia N MUST evaluarse con la noche registrada asignada a N (glosario)
  y con el día del horario de la versión vigente en N (010).
- **FR-002**: Con horario activo para N, N MUST ser cumplido solo si la noche está cerrada, su hora de
  acostarse no pasa de la agendada + margen y su hora de levantarse no pasa de la agendada + margen
  (FR-004). Sin horario activo (sin horario, día desactivado o pausa: modo "Registro"), N MUST ser
  cumplido con solo cerrar la noche.
- **FR-003**: Una noche pasada sin registrar y fuera de pausa MUST contar como no cumplida. Saltarse
  el registro MUST NOT mejorar nunca la racha, el récord ni el total.
- **FR-004**: Una noche con horario activo cerrada confirmando la hora propuesta sin corregirla (010,
  "hora propuesta") MUST NOT cumplir la condición de levantarse. Un despertar "Anotado después"
  (registrado más de 60 min después de ocurrir) MUST evaluarse con la hora de levantarse guardada y,
  cumpla o no, el día MUST mostrar la marca "Anotado después".
- **FR-005**: Una noche abierta o sin registrar MUST mostrarse "aún no" hasta el final del día N + 1;
  después MUST contar como no cumplida (salvo pausa). Un día "aún no" MUST NOT contar ni cortar.
- **FR-006**: El margen MUST ser el mismo para las dos horas, y acostarse o levantarse antes de la
  hora agendada MUST NOT restar.
- **FR-007**: La tolerancia MUST ser de hasta 2 no cumplidos en cualquier periodo de 7 días seguidos
  no pausados de la racha en curso, explicada como "Puedes fallar hasta 2 días en cualquier periodo de
  7 días seguidos". La racha MUST cortarse en el no cumplido que deja 3 en el periodo de 7 días no
  pausados que termina en él, contando solo días de la racha en curso; la racha viva MUST empezar en el
  primer día cumplido posterior al último corte, y "Día N de constancia" MUST ser el número de días
  cumplidos desde entonces.
- **FR-008**: El margen MUST ser ajustable entre 15 y 60 min (30 por defecto) en Ajustes; la racha se
  recalcula con el margen vigente.
- **FR-009**: El récord MUST guardarse y solo crecer, actualizándose en la misma operación que cierra
  o edita una noche. El total de días cumplidos mostrado MUST NOT disminuir nunca.
- **FR-010**: Consultar la racha MUST NOT tener efectos secundarios (no guarda récord ni logros).
- **FR-011**: El cálculo MUST hacerse a partir de los datos existentes, sin guardar los días ni la
  racha, y procesar 10 años de historial (3.650 días) en menos de 20 ms.

**Recompensas (US2)**

- **FR-012**: La semana actual (noches de lunes a domingo) MUST mostrarse con 7 estrellas: encendida
  (cumplido), apagada (no cumplido, con motivo), en pausa y "aún no", distinguibles sin depender solo
  del color, y con la marca "Anotado después" cuando corresponda.
- **FR-013**: Al alcanzar N = 7, 21, 66, 100, 180 y 365 MUST desbloquearse una constelación
  permanente, guardada con su fecha en la misma operación que cierra o edita la noche que lo provoca.
  Un logro MUST NOT retirarse ni cambiar nunca.
- **FR-014**: Cada constelación MUST incluir un dato personal sobre conductas de esa racha (variación
  de la hora de levantarse, calculada sobre al menos 7 días cumplidos); MUST NOT basarse en horas
  dormidas ni en calidad. La de 66 MUST presentarse como media, no como regla para todos.
- **FR-015**: Un logro nuevo MUST presentarse una sola vez en una tarjeta descartable con
  `role="status"`, sin animación con `prefers-reduced-motion` y con un brillo ≤ 400 ms si no; al
  descartarlo MUST marcarse como visto.
- **FR-016**: La feature MUST NOT incluir puntos, monedas, niveles, premios canjeables, rankings ni
  comparación con otras personas.

**Opcional y en su sitio (US3)**

- **FR-017**: La racha MUST estar desactivada por defecto. MUST ofrecerse una sola vez, en la
  bienvenida o tras la tercera noche cerrada (al pulsar "Ya desperté" o al abrir Tendencias), con un
  ejemplo y qué se premia y por qué; "Ahora no" la deja activable en Ajustes.
- **FR-018**: Con la racha desactivada MUST NOT calcularse, mostrarse ni desbloquearse nada. Al
  desactivarla se conservan récord y logros.
- **FR-019**: La racha MUST NOT mostrarse en la pantalla de acostarse ni en el aviso de 010-US5. Tras
  "Ya desperté" MUST mostrarse una línea "Día N de constancia ★" (o un texto neutro), y en Tendencias
  la semana, el récord, el total y la colección MUST ir en un plegable fuera de los 3 indicadores
  principales.

**Sin culpa (US4)**

- **FR-020**: Con la racha cortada y sin días cumplidos después (N = 0, récord > 0) MUST mostrarse "Tu
  récord sigue siendo R. Mañana es un buen día para empezar otra", con la variante de inicio de semana
  si mañana es lunes.
- **FR-021**: Los días no cumplidos MUST mostrarse con su motivo y sin color de error.
- **FR-022**: Una prueba automática MUST prohibir en los textos de la interfaz "perdiste",
  "fallaste", "rompiste", "en peligro" y "castigo", además de la lista de 006.
- **FR-023**: Ningún aviso ni recordatorio, dentro o fuera de la app, MUST mencionar la racha ni su
  posible pérdida.

**Pausa (US5)**

- **FR-024**: Una noche dentro de una pausa de 010 sin noche cerrada MUST ser neutra: no cuenta como
  cumplida ni como no cumplida y se salta al formar los periodos de 7 días. Si se cierra, MUST contar
  como cumplida en modo "Registro". Las reglas de creación de pausas son las de 010, sin cambios.

**Resumen (US6)**

- **FR-025**: En una semana nueva (desde el lunes), mientras no se descarte, tras "Ya desperté" y en
  Tendencias MUST mostrarse una tarjeta descartable con los días cumplidos de la semana anterior sobre
  los días no pausados y la media de horas registradas, con su origen, como dato informativo, solo con 3 o más noches
  cerradas en esa semana (si no, "sin datos", nunca 0; principio VIII); MUST NOT enviarse por
  notificación.

**Datos y aislamiento**

- **FR-026**: Los ajustes de la racha (activada, margen, fecha de activación, récord, total) y los
  logros MUST incluirse en la exportación y borrarse con la cuenta.
- **FR-027**: Todas las rutas nuevas MUST filtrar por usuario (lo ajeno → 404) y entrar en la suite de
  aislamiento de dos usuarios; el esquema solo crece (migración aditiva).

### Key Entities *(include if feature involves data)*

- **Ajustes de racha** (por persona): activada o no, margen (15–60 min), fecha de la última
  activación, si ya se ofreció la tarjeta, récord guardado (solo crece), total guardado (solo crece)
  y la última semana cuyo resumen se descartó.
- **Logro** (por persona): clave de la constelación (7, 21, 66, 100, 180, 365), fecha en que se
  logró, dato personal congelado (variación de la hora de levantarse) y cuándo se vio; único por
  persona y clave.
- **Día de constancia** (derivado, no se guarda): fecha de la noche, estado (cumplido, no cumplido, en
  pausa, aún no), motivo y marca "Anotado después".
- **Reutilizadas de 010**: versiones y días del horario, pausas, y en cada noche cuándo se registró
  el despertar y si se cerró con la hora propuesta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Pruebas de propiedades sobre historiales generados al azar: la racha no crece sin días
  cumplidos; no registrar en pausa nunca corta la racha; el récord y el total nunca bajan; saltarse
  un registro nunca mejora la racha; acostarse o levantarse más tarde nunca la mejora; confirmar la
  hora propuesta sin corregirla nunca la mejora; una noche que nunca se cierra acaba como no
  cumplida; no se puede crear una pausa en el pasado.
- **SC-002**: El cálculo de 3.650 días tarda menos de 20 ms.
- **SC-003**: 0 apariciones de la racha en la pantalla de acostarse y en avisos (prueba automática de
  componentes y de textos de aviso).
- **SC-004**: 0 textos con palabras prohibidas de culpa o clínicas (prueba automática).
- **SC-005**: Un logro aparece exactamente una vez y sigue en la colección tras editar o borrar todas
  las noches que lo produjeron.
- **SC-006**: Con la racha desactivada, 0 cálculos, 0 logros nuevos y 0 elementos de la racha en
  pantalla.
- **SC-007**: Activar la racha desde la tarjeta cuesta 1 toque y rechazarla, otro.
- **SC-008**: La suite de aislamiento de dos usuarios cubre el 100 % de las rutas nuevas.

## Assumptions

- **Margen elegido**: un único margen de 30 min por defecto (ajustable 15–60) para la hora de
  acostarse y la de levantarse, solo hacia "más tarde". 30 min coincide con el aviso por defecto de
  010 y queda por debajo de los 60 min de "¿Ya despertaste?" y de "Anotado después", así que una
  noche a tu hora nunca depende de un aviso tardío; adelantarse no resta para no culpar a quien se
  despierta antes.
- **Pausa**: según la aclaración, una noche en pausa se evalúa en modo "Registro" si se cierra y es
  neutra si no se registra.
- La "semana" es de lunes a domingo, por fecha de la noche; "semana nueva" = desde el lunes.
- La racha se calcula desde la noche del día de la última activación; las anteriores ni suman ni
  restan. El récord y los logros sobreviven a desactivar y reactivar, y el total sigue sumando desde
  el valor que tenía.
- Cambiar el margen recalcula la racha viva con el nuevo valor; el récord y el total no bajan.
- El dato personal de cada constelación se calcula al desbloquearla y se guarda congelado, para que
  no cambie al editar noches.
- La media de horas del resumen semanal es informativa y se calcula como en el dashboard de 005
  (noches y siestas del día), pero exige al menos 3 noches cerradas en la semana (principio VIII,
  "estadística prudente"); no se premia ni se puntúa.
- **Límite conocido**: las horas registradas funcionan por confianza: quien corrige la hora propuesta
  por otra casi igual, o edita la hora de acostarse, sí puede contar "a tu hora". Es aceptable en una
  app personal y queda señalado con el origen de cada dato (006) y la marca "Anotado después".
- La definición del corte (FR-007) cuenta solo los días de la racha en curso: así, tras un corte, el
  primer día cumplido ya es "Día 1" (la definición literal de la entrada, "la última ventana con 3 no
  cumplidos", retrasaba la nueva racha hasta 6 días).
- Antes del plan se aplica la enmienda MINOR del principio VIII (v2.1.0 → v2.2.0).
- Fuera de alcance: premiar horas dormidas, calidad o fases; rankings y comparación social; puntos,
  monedas, niveles y premios canjeables; avisos de pérdida; pagar o esforzarse de más para recuperar
  una racha; un hábito extra ligado a una métrica (backlog); crear pausas desde la racha (se crean en
  "Mi horario").
