# Feature Specification: Rachas de constancia (gamificación del hábito)

**Feature Branch**: `011-rachas-constancia`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: `docs/sdd/features/011-rachas-constancia.md`. Sentirme recompensado cuando
mantengo el hábito de sueño muchos días. La app premia solo las **conductas que dependen de mí**
(levantarme a mi hora y registrar la noche); nunca puntúa cuántas horas dormí ni cómo dormí, y nunca
me hace sentir culpable. Reutiliza el horario versionado y la pausa de 010. Cada usuario ve solo lo
suyo (constitución v2.0.0) y rige el principio VIII, que se amplía antes del plan (enmienda MINOR
v2.2.0, borrador en [`constitution-amendment-draft.md`](constitution-amendment-draft.md)): la
motivación solo puede basarse en conductas controlables, sin puntuaciones de resultado, comparación
social, recompensas canjeables ni alertas de pérdida, y toda gamificación es opcional y ocultable.

## Clarifications

Pendientes para `/speckit-clarify` (ver los marcadores `[NEEDS CLARIFICATION]` en FR-002, FR-004 y
FR-006). Cada una lleva la opción recomendada, que es la que asume el resto de la spec.

## Glosario

- **Día de constancia D**: la mañana del día D. Le corresponde la noche que termina esa mañana, es
  decir, la noche con fecha D − 1 (principio III: la fecha de la noche es el día en que te acuestas).
- **Hora agendada de levantarse para D**: la de la versión del horario vigente el día D (010: mayor
  "desde" ≤ D; el mismo día, la última), tomada del día del horario de la noche D − 1, cuya hora de
  levantarse es la de la mañana D.
- **Ventana**: ± los minutos del ajuste "Margen" (30 por defecto, 15–60) alrededor de la hora
  agendada; los extremos cuentan como dentro.
- **Estados de un día**: **cumplido**, **no cumplido**, **en pausa** (neutro) y **aún no** (todavía
  no se puede decidir; neutro).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mi racha de constancia (Priority: P1)

Como usuario, veo cuántos días llevo manteniendo mi hábito ("Día 12 de constancia"), mi récord y el
total de mañanas a mi hora, calculados con reglas claras que no se pueden mejorar dejando de
registrar ni confirmando sin mirar la hora que propone la app.

**Why this priority**: es la base de toda la feature; sin un cálculo honesto, las estrellas y las
constelaciones no significan nada.

**Independent Test**: horario con levantarse a 7:00 y margen de 30 min. Registrar 10 mañanas
seguidas a las 7:10 → "Día 10 de constancia"; la mañana 11 levantarse a 9:10 y la 12 no registrar
nada → siguen 10 días cumplidos y la racha no se corta (2 fallos en 7 días); la mañana 13 levantarse a
las 8:00 → 3 fallos en 7 días: la racha se corta, el récord sigue en 10 y el total en 10; la mañana 14
a las 7:00 → "Día 1 de constancia · Tu récord: 10 · Mañanas a tu hora en total: 11".

**Acceptance Scenarios**:

1. **Given** un horario con levantarse a H para la mañana D y la noche D − 1 cerrada con hora de
   levantarse dentro de H ± margen, registrada en el momento, **When** veo la racha, **Then** D
   cuenta como cumplido.
2. **Given** la misma noche con hora de levantarse fuera de la ventana, **When** veo la racha,
   **Then** D cuenta como no cumplido, aunque la hora de acostarme fuese la agendada (la hora de
   acostarse **no** cuenta).
3. **Given** que no tengo horario para D (modo "Registro"), **When** cierro la noche D − 1, **Then**
   D cuenta como cumplido, sea cual sea la hora.
4. **Given** una mañana D sin noche registrada, una vez pasada, **When** veo la racha, **Then** D
   cuenta como no cumplido, igual que un día fuera de horario.
5. **Given** una noche cerrada confirmando la hora propuesta por "¿Ya despertaste?" sin corregirla
   (010-US3), **When** veo la racha, **Then** D cuenta como registrado (en modo "Registro" es
   cumplido) pero **no** como "a tu hora".
6. **Given** un despertar anotado más de 60 min después de ocurrir ("Anotado después"), **When** veo
   la racha, **Then** se aplica la regla de FR-004.
7. **Given** una noche abierta cuya mañana es hoy, **When** veo la racha, **Then** ese día aparece
   como "aún no", sin contar ni romper; si al terminar el día D la noche sigue abierta, D pasa a no
   cumplido.
8. **Given** 2 días no cumplidos dentro de cualquier periodo de 7 días seguidos no pausados, **When**
   veo la racha, **Then** se mantiene; la explicación dice "Puedes fallar hasta 2 días en cualquier
   periodo de 7 días seguidos".
9. **Given** un periodo de 7 días seguidos no pausados con 3 o más no cumplidos, **When** veo la
   racha, **Then** la racha viva empieza en el primer día cumplido posterior a ese periodo y "Día N"
   cuenta solo los días cumplidos desde entonces.
10. **Given** un récord de 25 y un total de 60, **When** edito o borro noches antiguas que los harían
    bajar, **Then** el récord sigue en 25 y el total en 60.
11. **Given** que cambio el margen (entre 15 y 60 min) en Ajustes, **When** vuelvo a la racha,
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

1. **Given** la semana actual (lunes a domingo), **When** la veo, **Then** hay 7 estrellas: encendida
   si el día está cumplido, apagada si no lo está, en pausa o "aún no" con su propio estilo neutro.
2. **Given** que el número de días de constancia (N de la racha viva) llega a 7, 21, 66, 100, 180 o
   365, **When** se cierra o edita la noche que lo provoca, **Then** se desbloquea en ese mismo
   momento la constelación correspondiente, con la fecha en que se logró.
3. **Given** la constelación de 66 días, **When** la veo, **Then** dice que 66 es la **media** que
   tarda un hábito en volverse automático, no que sea igual para todos.
4. **Given** una constelación, **When** la veo, **Then** incluye un dato personal calculado sobre la
   racha que la desbloqueó y basado solo en conductas (por ejemplo, la variación de la hora de
   levantarse o las mañanas a tu hora), nunca en horas dormidas ni en calidad.
5. **Given** un logro desbloqueado, **When** edito o borro noches antiguas, **Then** el logro no se
   retira ni cambia de fecha.
6. **Given** un logro nuevo, **When** aparece, **Then** lo hace una sola vez, en una tarjeta que puedo
   descartar; con `prefers-reduced-motion` no hay animación y si no, un brillo de 400 ms como máximo;
   se anuncia con `role="status"`. Una vez descartada o vista, no vuelve a aparecer.
7. **Given** cualquier pantalla de la feature, **When** la reviso, **Then** no hay puntos, monedas,
   niveles, premios canjeables ni rankings.

---

### User Story 3 - La racha está donde la busco y nunca antes de dormir (Priority: P1)

Como usuario, decido si quiero llevar una racha; si la activo, la veo al despertar y en un plegable
del dashboard, nunca cuando voy a acostarme.

**Why this priority**: la gamificación es opcional (enmienda VIII) y verla antes de dormir puede
generar presión justo cuando hay que relajarse.

**Independent Test**: usuario nuevo con 3 noches registradas → aparece la tarjeta "¿Quieres llevar una
racha de constancia?" con un ejemplo; "Ahora no" la oculta y Ajustes ofrece activarla; con la racha
desactivada no aparece nada de la feature en ninguna pantalla; activada, tras "Ya desperté" se ve
"Día 1 de constancia ★" y en Noche, con la noche cerrada o sin noche abierta, no hay ningún rastro de
la racha antes de pulsar "Me voy a dormir".

**Acceptance Scenarios**:

1. **Given** la bienvenida de 005 o, si la salté, la tercera noche registrada, **When** abro la app,
   **Then** veo una sola vez la tarjeta "¿Quieres llevar una racha de constancia?", con un ejemplo y
   la explicación de qué se premia (levantarte a tu hora o registrar) y por qué (la regularidad de la
   hora de levantarse ayuda a fijar el hábito), y las opciones "Sí, activarla" y "Ahora no".
2. **Given** que elegí "Ahora no", **When** voy a Ajustes, **Then** puedo activarla; la tarjeta no
   vuelve a aparecer por sí sola.
3. **Given** la racha desactivada (estado por defecto), **When** uso la app, **Then** no se calcula,
   no se guarda ni se muestra nada de la racha, ni se desbloquean logros.
4. **Given** la racha activada, **When** pulso "Ya desperté", **Then** veo una línea "Día N de
   constancia ★" (si el día está cumplido) o un mensaje neutro (si no lo está).
5. **Given** la racha activada, **When** abro el dashboard, **Then** la semana de estrellas, el
   récord, el total y la colección están en un plegable aparte, fuera de los 3 indicadores
   principales de 005.
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

1. **Given** una racha que se acaba de cortar, **When** veo la racha, **Then** leo "Tu récord sigue
   siendo R. Mañana es un buen día para empezar otra"; si mañana es lunes, el mensaje invita a empezar
   la semana.
2. **Given** un día no cumplido por estar fuera de horario, **When** lo veo, **Then** es una estrella
   apagada con el motivo ("Te levantaste a las 9:10 (fuera de tu horario)"); si es por no registrar,
   "Sin registro"; nunca en rojo ni con iconos de error.
3. **Given** todos los textos de la feature, **When** se ejecuta la prueba automática, **Then**
   ninguno contiene "perdiste", "fallaste", "rompiste", "en peligro" ni "castigo".
4. **Given** cualquier momento, **When** reviso avisos y recordatorios (010 y futuros), **Then**
   ninguno menciona la racha ni avisa de que puede cortarse.

---

### User Story 5 - Pausa (Priority: P2)

Como usuario, cuando activo el "Modo pausa" de 010 (viaje, malestar, turnos), la racha queda en
pausa: esos días ni cuentan ni la cortan.

**Why this priority**: sin pausa, un viaje cortaría la racha por algo que no controlo.

**Independent Test**: racha de 10 días; pausa de 5 días sin registrar nada → al terminar, sigue
"Día 10 de constancia"; el día siguiente cumplido → "Día 11"; las estrellas de la pausa se ven
como "En pausa".

**Acceptance Scenarios**:

1. **Given** un día D dentro de una pausa de 010, **When** veo la racha, **Then** D es "en pausa": no
   suma días cumplidos ni no cumplidos y no entra en los periodos de 7 días de la tolerancia.
2. **Given** que registro una noche durante la pausa, **When** veo la racha, **Then** D sigue siendo
   "en pausa" (la pausa es neutra en los dos sentidos).
3. **Given** las reglas de pausa de 010 (empieza hoy o después, máximo 14 días, 2 cada 30 días, sin
   solapes), **When** creo una pausa desde la racha, **Then** se aplican las mismas reglas: no se
   puede pausar el pasado para salvar una racha.

---

### User Story 6 - Resumen de la semana (Priority: P3)

Como usuario, al abrir la app el primer día de la semana veo un resumen breve de la semana anterior.

**Why this priority**: refuerzo informativo y semanal; poco frecuente.

**Independent Test**: el lunes, primera apertura → tarjeta descartable "Esta semana: 5 de 7 mañanas a
tu hora · media 7 h 10 min"; descartarla → no reaparece esa semana; no llega ninguna notificación.

**Acceptance Scenarios**:

1. **Given** la racha activada y la primera apertura del lunes, **When** abro la app, **Then** veo una
   tarjeta descartable con las mañanas a tu hora (o registradas, en modo "Registro") de la semana
   anterior, sobre los días no pausados, y la media de horas registradas como dato informativo.
2. **Given** una semana con menos registros que el mínimo de 005 para la media, **When** veo el
   resumen, **Then** la media aparece como "sin datos", nunca como 0.
3. **Given** el resumen, **Then** no se envía por notificación ni fuera de la app.

---

### Edge Cases

- **Horario que cambia a mitad de racha**: cada mañana se evalúa con la versión vigente ese día; las
  mañanas pasadas no cambian al crear una versión nueva.
- **Día del horario desactivado** (por ejemplo, el fin de semana sin horario): ver FR-006.
- **Hora agendada cerca de medianoche** (levantarse a 0:15): la ventana cruza el día; se compara por
  instantes, no por minutos del día.
- **Despertar antes de la ventana** (5:30 con agenda a 7:00 ± 30): no cumplido; el motivo dice "Te
  levantaste a las 5:30 (fuera de tu horario)", sin juicio.
- **Dos noches que terminan la misma mañana** (por ejemplo, una noche partida registrada dos veces):
  cuenta la última que termina esa mañana; el día no se cuenta dos veces.
- **Siestas** (005): no cuentan ni cambian la racha.
- **Cambio de hora oficial (DST) o viaje**: la hora agendada es de reloj de pared (010); "7:00" son
  las 7:00 locales.
- **Activación a mitad de historial**: la racha se calcula desde el día de la última activación; los
  días anteriores no cuentan ni restan.
- **Hoy**: siempre "aún no" mientras no esté decidido; nunca rompe la racha por la mañana temprano.
- **Noche abierta más de un día**: el día de su mañana pasa a no cumplido al terminar ese día; si
  después la cierro, se recalcula con las reglas de "Anotado después".
- **Borrar la cuenta**: borra ajustes, récord y logros; la exportación los incluye.
- **Dos usuarios**: la racha, los ajustes y los logros de uno nunca aparecen para el otro (404).

## Requirements *(mandatory)*

### Functional Requirements

**Cálculo de la racha (US1)**

- **FR-001**: Cada día de constancia D MUST evaluarse con la noche D − 1 y la versión del horario
  vigente el día D (010). La hora de acostarse MUST NOT influir.
- **FR-002**: Con horario para D, D MUST ser cumplido solo si la noche D − 1 está cerrada, su hora de
  levantarse cae dentro de la ventana y cuenta como "a tu hora" (FR-004). Sin horario (modo
  "Registro"), D MUST ser cumplido con solo cerrar la noche. [NEEDS CLARIFICATION: P6 — ¿qué
  conducta se premia? Recomendado: **levantarse a tu hora** (con horario) y **registrar** (sin
  horario), como dice la entrada.]
- **FR-003**: Un día pasado sin noche registrada MUST contar como no cumplido. Saltarse el registro
  MUST NOT mejorar nunca la racha, el récord ni el total.
- **FR-004**: Una noche cerrada confirmando la hora propuesta sin corregirla (010, "hora propuesta")
  MUST contar como registrada pero no "a tu hora". Un despertar "Anotado después" (registrado más de
  60 min después de ocurrir) MUST contar como registrado pero no "a tu hora".
  [NEEDS CLARIFICATION: ¿un despertar "Anotado después" en el que **corrijo** la hora propuesta cuenta
  "a tu hora"? Recomendado: **no**; solo cuenta si la corrección se registra a menos de 60 min del
  despertar, sin dato nuevo en la base.]
- **FR-005**: Una noche abierta MUST mostrar su día como "aún no" hasta el final del día de su mañana;
  después MUST contar como no cumplido. El día de hoy, mientras no esté decidido, MUST mostrarse "aún
  no" sin contar ni romper.
- **FR-006**: Un día cuyo día del horario vigente está desactivado MUST tratarse como un día sin
  horario (modo "Registro": cumple con cerrar la noche). [NEEDS CLARIFICATION: ¿cómo cuentan los días
  desactivados del horario? Recomendado: **como modo "Registro"**.]
- **FR-007**: La tolerancia MUST ser de hasta 2 días no cumplidos en cualquier periodo de 7 días
  seguidos no pausados, explicada como "Puedes fallar hasta 2 días en cualquier periodo de 7 días
  seguidos". La racha viva MUST empezar en el primer día cumplido posterior al último periodo de 7 días
  no pausados con 3 o más no cumplidos; "Día N de constancia" MUST ser el número de días cumplidos
  desde entonces.
- **FR-008**: El margen MUST ser ajustable entre 15 y 60 min (30 por defecto) en Ajustes; la racha se
  recalcula con el margen vigente.
- **FR-009**: El récord MUST guardarse y solo crecer, actualizándose en la misma operación que cierra
  o edita una noche. El total de "mañanas a tu hora" (o "días registrados" en modo "Registro")
  mostrado MUST NOT disminuir nunca.
- **FR-010**: Consultar la racha MUST NOT tener efectos secundarios (no guarda récord ni logros).
- **FR-011**: El cálculo MUST hacerse a partir de los datos existentes, sin guardar los días ni la
  racha, y procesar 10 años de historial (3.650 días) en menos de 20 ms.

**Recompensas (US2)**

- **FR-012**: La semana actual (lunes a domingo) MUST mostrarse con 7 estrellas: encendida
  (cumplido), apagada (no cumplido, con motivo), en pausa y "aún no", distinguibles sin depender solo
  del color.
- **FR-013**: Al alcanzar N = 7, 21, 66, 100, 180 y 365 MUST desbloquearse una constelación
  permanente, guardada con su fecha en la misma operación que cierra o edita la noche que lo provoca.
  Un logro MUST NOT retirarse ni cambiar nunca.
- **FR-014**: Cada constelación MUST incluir un dato personal sobre conductas de esa racha (variación
  de la hora de levantarse, mañanas a tu hora); MUST NOT basarse en horas dormidas ni en calidad. La
  de 66 MUST presentarse como media, no como regla para todos.
- **FR-015**: Un logro nuevo MUST presentarse una sola vez en una tarjeta descartable con
  `role="status"`, sin animación con `prefers-reduced-motion` y con un brillo ≤ 400 ms si no; al
  verlo o descartarlo MUST marcarse como visto.
- **FR-016**: La feature MUST NOT incluir puntos, monedas, niveles, premios canjeables, rankings ni
  comparación con otras personas.

**Opcional y en su sitio (US3)**

- **FR-017**: La racha MUST estar desactivada por defecto. MUST ofrecerse una sola vez, en la
  bienvenida o tras la tercera noche registrada, con un ejemplo y qué se premia y por qué; "Ahora no"
  la deja activable en Ajustes.
- **FR-018**: Con la racha desactivada MUST NOT calcularse, mostrarse ni desbloquearse nada. Al
  desactivarla se conservan récord y logros.
- **FR-019**: La racha MUST NOT mostrarse en la pantalla de acostarse ni en el aviso de 010-US5. Tras
  "Ya desperté" MUST mostrarse una línea "Día N de constancia ★" (o un texto neutro), y en el
  dashboard la semana, el récord, el total y la colección MUST ir en un plegable fuera de los 3
  indicadores principales.

**Sin culpa (US4)**

- **FR-020**: Al cortarse la racha MUST mostrarse "Tu récord sigue siendo R. Mañana es un buen día
  para empezar otra", con la variante de inicio de semana si mañana es lunes.
- **FR-021**: Los días no cumplidos MUST mostrarse con su motivo y sin color de error.
- **FR-022**: Una prueba automática MUST prohibir en los textos de la interfaz "perdiste",
  "fallaste", "rompiste", "en peligro" y "castigo", además de la lista de 006.
- **FR-023**: Ningún aviso ni recordatorio, dentro o fuera de la app, MUST mencionar la racha ni su
  posible pérdida.

**Pausa (US5)**

- **FR-024**: Los días dentro de una pausa de 010 MUST ser neutros: no cuentan como cumplidos ni como
  no cumplidos y se saltan al formar los periodos de 7 días. Las reglas de creación de pausas son las
  de 010, sin cambios.

**Resumen (US6)**

- **FR-025**: La primera apertura del lunes MUST mostrar una tarjeta descartable con las mañanas a tu
  hora (o registradas) de la semana anterior sobre los días no pausados y la media de horas registradas
  como dato informativo, con la regla "sin dato" de 005; MUST NOT enviarse por notificación.

**Datos y aislamiento**

- **FR-026**: Los ajustes de la racha (activada, margen, fecha de activación, récord) y los logros
  MUST incluirse en la exportación y borrarse con la cuenta.
- **FR-027**: Todas las rutas nuevas MUST filtrar por usuario (lo ajeno → 404) y entrar en la suite de
  aislamiento de dos usuarios; el esquema solo crece (migración aditiva).

### Key Entities *(include if feature involves data)*

- **Ajustes de racha** (por persona): activada o no, margen (15–60 min), fecha de la última
  activación, si ya se ofreció la tarjeta, récord guardado (solo crece) y total mostrado (solo
  crece).
- **Logro** (por persona): clave de la constelación (7, 21, 66, 100, 180, 365), fecha en que se
  logró, dato personal congelado y cuándo se vio; único por persona y clave.
- **Día de constancia** (derivado, no se guarda): fecha, estado (cumplido, no cumplido, en pausa,
  aún no) y motivo.
- **Reutilizadas de 010**: versiones y días del horario, pausas, y en cada noche cuándo se registró
  el despertar y si se cerró con la hora propuesta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Pruebas de propiedades sobre historiales generados al azar: la racha no crece sin días
  cumplidos; las pausas son neutras; el récord y el total nunca bajan; saltarse un registro nunca
  mejora la racha; confirmar la hora propuesta sin corregirla nunca la mejora; una noche que nunca se
  cierra acaba como no cumplida; no se puede crear una pausa en el pasado.
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

- La hora de levantarse de la noche D − 1 es la de la mañana D (010).
- La "semana" es de lunes a domingo; "primer día de la semana" = lunes.
- La racha se calcula desde la fecha de la última activación; los días anteriores ni suman ni
  restan. El récord y los logros sobreviven a desactivar y reactivar.
- Cambiar el margen recalcula la racha viva con el nuevo valor; el récord y el total no bajan.
- El dato personal de cada constelación se calcula al desbloquearla y se guarda congelado, para que
  no cambie al editar noches.
- La media de horas del resumen semanal es informativa, como en el dashboard de 005; no se premia ni
  se puntúa.
- **Límite conocido**: la regla de "Anotado después" funciona por confianza; quien corrige la hora
  propuesta por otra casi igual sí cuenta "a tu hora". Es aceptable en una app personal y queda
  señalado con el origen de cada dato (006).
- Antes del plan se aplica la enmienda MINOR del principio VIII (v2.1.0 → v2.2.0).
- Fuera de alcance: premiar horas dormidas, calidad o fases; rankings y comparación social; puntos,
  monedas, niveles y premios canjeables; avisos de pérdida; pagar o esforzarse de más para recuperar
  una racha; un hábito extra ligado a una métrica (backlog).
