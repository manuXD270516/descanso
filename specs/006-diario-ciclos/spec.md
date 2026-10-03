# Feature Specification: Diario opcional, ciclos y honestidad de datos (REM sin sensores)

**Feature Branch**: `006-diario-ciclos`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: `docs/sdd/features/006-diario-ciclos.md`. Orientarme sobre mis ciclos de
sueño sin que la app prometa lo que no puede medir; registrar la noche sigue siendo un solo toque.
Cada usuario ve solo sus datos (constitución v2.0.0) y la feature se rige por el principio VIII,
"Datos de salud: privacidad y honestidad", que se añade antes del plan.

## Clarifications

### Session 2026-10-03

- Q: ¿Al pulsar "Ya desperté" aparece la tarjeta opcional "¿Cómo fue la noche?" o solo el toque
  (pregunta P3 de la propuesta)? → A: **Sí, tarjeta opcional**: la noche se cierra en 1 toque y
  después aparece la tarjeta, descartable con 1 toque (US5 confirmada).
- Q: ¿Cómo se muestra el origen de los datos? → A: **Por sección, y por fila solo si hay mezcla**:
  una insignia en la cabecera de cada bloque (lista, gráfico, tabla, calculadora) cuando todo su
  contenido tiene el mismo origen; si un bloque mezcla orígenes (cuando llegue 007), cada fila
  lleva la suya.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Saber de dónde sale cada dato y qué no es la app (Priority: P1)

Como usuario, veo en cada bloque de datos de sueño si lo anoté yo, si es una estimación o si viene de un
reloj, y siempre tengo a la vista que la app no es un dispositivo médico, para no confundir una
estimación con una medición.

**Why this priority**: es la base de honestidad que exige el principio VIII y la condición para
mostrar cualquier estimación (US2) sin engañar.

**Independent Test**: con noches registradas a mano, abrir Noche y Tendencias → la cabecera de la
lista de noches, de la cinta y del gráfico muestra "Anotado por ti" (una vez por bloque); las ventanas de la calculadora muestran "Estimado"; el
aviso "No es un dispositivo médico" está visible en todas las pantallas con datos de sueño; la
prueba automática de palabras prohibidas pasa sobre todos los textos de la interfaz.

**Acceptance Scenarios**:

1. **Given** una noche registrada con "Me voy a dormir" / "Ya desperté" o a mano, **When** la veo en
   la lista de Noche o en la tabla de Tendencias, **Then** el bloque que la contiene lleva la insignia "Anotado por ti" en su cabecera, una sola vez.
2. **Given** las ventanas de despertar de la calculadora, **When** se muestran, **Then** llevan la
   insignia "Estimado".
3. **Given** cualquier pantalla con datos de sueño (Noche, Tendencias, Siestas), **When** la abro,
   **Then** veo el aviso "No es un dispositivo médico" sin tener que desplegar nada.
4. **Given** el conjunto de textos de la interfaz, **When** se ejecuta la prueba de palabras
   prohibidas, **Then** ninguno nombra trastornos, umbrales clínicos ni alertas médicas; si alguien
   añade uno, la prueba falla y dice cuál y dónde.
5. **Given** que todavía no existe la importación de relojes, **When** reviso mis datos, **Then**
   ninguno lleva "Del reloj" (la insignia existe para cuando llegue la feature 007).
6. **Given** un bloque con datos de dos orígenes (caso preparado para 007), **When** lo veo, **Then**
   no hay insignia única en la cabecera y cada fila lleva la de su origen.

---

### User Story 2 - Calculadora de ciclos junto a "Me voy a dormir" (Priority: P1)

Como usuario, antes de acostarme veo a qué horas me convendría despertar para completar 4, 5 o 6
ciclos ("entre 6:45 y 7:15"), con mis propios ajustes de ciclo y de tiempo en dormirme, y con el
aviso de que es una estimación.

**Why this priority**: es el valor nuevo de la feature y responde al "adaptado a los ciclos REM"
pedido en 005 sin sensores.

**Independent Test**: con la hora de dormir fijada a las 23:00, latencia 15 min y ciclo 90 min →
se ven 3 ventanas: 5:15 (4 ciclos), 6:45 (5) y 8:15 (6), cada una como "entre H−15 y H+15"; al
cambiar el ciclo a 100 min y la latencia a 20 min, las ventanas se recalculan al momento y, tras
recargar, siguen con esos ajustes.

**Acceptance Scenarios**:

1. **Given** el panel "¿Hora de dormir?" con una hora elegida, **When** lo veo, **Then** debajo
   aparecen 3 ventanas para 4, 5 y 6 ciclos, calculadas como hora de dormir + tiempo en dormirse +
   n × ciclo, mostradas como un intervalo de ±15 min ("entre 6:30 y 7:00").
2. **Given** que cambio la hora de dormir del panel, **When** la cambio, **Then** las ventanas se
   recalculan sin pulsar nada más.
3. **Given** una hora de dormir que hace que una ventana caiga después de medianoche o en otro día,
   **When** se muestra, **Then** la hora es correcta en mi hora local (incluido un cambio de offset
   entre la noche y la mañana) y se indica "mañana" si la ventana es al día siguiente.
4. **Given** la calculadora, **When** la veo, **Then** siempre muestra el texto "estimación, no
   medición; no está demostrado que despertar al final de un ciclo mejore cómo te sientes".
5. **Given** mis ajustes, **When** pongo un ciclo de 70 a 110 min y un tiempo en dormirme de 0 a 60
   min y guardo, **Then** se guardan en mi cuenta y se usan en la calculadora y en los atajos de
   ciclos del objetivo de sueño (feature 005); un valor fuera de rango se rechaza con un mensaje que
   indica el rango.
6. **Given** una noche abierta, **When** abro Noche, **Then** veo las mismas 3 ventanas calculadas
   desde la hora real en que me acosté.
7. **Given** que pulso "Me voy a dormir", **When** registro la noche, **Then** sigue siendo un solo
   toque: la calculadora no añade pasos ni confirmaciones.

---

### User Story 3 - Sección "Fases" con un estado vacío honesto (Priority: P2)

Como usuario, si busco mis fases de sueño encuentro una sección "Fases" que me dice con claridad que
la app no las mide ni las inventa, y qué hará falta para verlas.

**Why this priority**: evita que se espere de la app algo que no puede medir; no aporta datos nuevos.

**Independent Test**: abrir Tendencias → la sección "Fases" dice "Descanso aún no importa datos de
relojes" y no muestra ningún gráfico ni porcentaje de fases.

**Acceptance Scenarios**:

1. **Given** que la importación de relojes no existe, **When** abro "Fases", **Then** leo "Descanso
   aún no importa datos de relojes" y una frase que explica que sin un dispositivo que mida no se
   pueden conocer las fases.
2. **Given** que la importación existe (feature 007), **When** abro "Fases" sin datos importados,
   **Then** veo el enlace "Importa tus datos →".
3. **Given** cualquier estado, **When** abro "Fases", **Then** no hay fases estimadas, porcentajes
   de REM ni gráficos de hipnograma calculados por la app.

---

### User Story 4 - Recordatorio de noche abierta (Priority: P2)

Como usuario, si olvidé marcar "Ya desperté", al abrir la app me lo recuerda y me propone una hora
razonable, para no dejar datos huecos o absurdos.

**Why this priority**: corrige el error de registro más común sin notificaciones.

**Independent Test**: con una noche abierta desde hace 15 h y objetivo de 7 h 30 → al abrir la app
aparece "¿Olvidaste marcar que despertaste?" con la hora propuesta = hora de dormir + 7 h 30;
aceptar cierra la noche con esa hora; con 13 h abierta, el aviso no aparece.

**Acceptance Scenarios**:

1. **Given** una noche abierta desde hace 14 h o más, **When** abro la app, **Then** veo "¿Olvidaste
   marcar que despertaste?" con una hora propuesta igual a mi hora de dormir + mi objetivo de sueño.
2. **Given** el aviso, **When** acepto la hora propuesta, **Then** la noche se cierra con esa hora.
3. **Given** el aviso, **When** cambio la hora antes de aceptar, **Then** la noche se cierra con la
   hora elegida (con las mismas validaciones que "Ya desperté": posterior a la hora de dormir y no
   en el futuro).
4. **Given** el aviso, **When** lo descarto, **Then** la noche sigue abierta, el aviso no vuelve
   a salir mientras siga en la app (aunque cambie de pestaña) y reaparece la próxima vez que la
   abra o recargue.
5. **Given** una noche abierta desde hace menos de 14 h, **When** abro la app, **Then** no hay aviso.
6. **Given** cualquier caso, **Then** no se envía ninguna notificación push ni correo.

---

### User Story 5 - Tarjeta opcional "¿Cómo fue la noche?" (Priority: P3)

Como usuario, después de "Ya desperté" puedo, si quiero, anotar en dos toques cuánto tardé en
dormirme y cuántas veces desperté, sin que cerrar la noche deje de ser un toque.

**Why this priority**: añade contexto subjetivo útil, pero es opcional (pregunta P3 de la propuesta,
confirmada en el clarify del 2026-10-03).

**Independent Test**: pulsar "Ya desperté" → la noche queda cerrada al instante y aparece la tarjeta;
elegir "15–30" y "1–2" lo guarda en esa noche (con insignia "Anotado por ti"); cerrar la tarjeta sin
elegir no guarda nada y no vuelve a aparecer para esa noche.

**Acceptance Scenarios**:

1. **Given** una noche abierta, **When** pulso "Ya desperté", **Then** la noche se cierra en ese
   toque y después aparece la tarjeta "¿Cómo fue la noche?".
2. **Given** la tarjeta, **When** elijo "Cuánto tardé en dormirme: <15 / 15–30 / >30 min" y/o
   "Cuántas veces desperté: 0 / 1–2 / 3+", **Then** cada elección se guarda en esa noche al tocarla.
3. **Given** la tarjeta, **When** la descarto, **Then** no se guarda nada y no vuelve a aparecer para
   esa noche.
4. **Given** una noche con respuestas, **When** la edito desde la lista, **Then** puedo cambiar o
   borrar cada respuesta.
5. **Given** mis respuestas, **When** exporto mis datos, **Then** aparecen en la exportación de
   noches.

---

### Edge Cases

- Una ventana de la calculadora que cae en un cambio de horario: la hora mostrada es la hora local
  real del despertar, no la suma ingenua en la hora de la noche.
- Hora de dormir elegida en el pasado (registro tardío): las ventanas se calculan igual desde esa hora.
- Ciclo de 110 min y 6 ciclos con latencia 60 min: la ventana es 12 h después; se muestra igual con
  "mañana".
- Noche abierta de varios días (≥ 48 h): el aviso aparece y la hora propuesta puede estar muy en el
  pasado; si fuera futura (objetivo mayor que el tiempo abierto, imposible con ≥ 14 h y objetivo ≤
  12 h), se propone la hora actual.
- El aviso de noche abierta y la tarjeta de la noche no aparecen a la vez: la tarjeta solo sigue a un
  cierre desde "Ya desperté" o desde el aviso.
- Una persona sin datos: la calculadora funciona igual (no depende de datos previos).
- Dos usuarios: los ajustes de ciclo y las respuestas de la tarjeta de uno no afectan ni son visibles
  para el otro (404 al intentar tocar los de otro).

## Requirements *(mandatory)*

### Functional Requirements

**Honestidad de datos (US1, principio VIII)**

- **FR-001**: Todo dato de sueño mostrado (noches, siestas, totales diarios, respuestas de la tarjeta,
  ventanas de despertar) MUST tener un origen visible: "Anotado por ti" (registrado por la persona),
  "Estimado" (calculado por la app, nunca guardado como medido) o "Del reloj" (importado; reservado
  para 007). La insignia va **una vez en la cabecera de cada bloque** (lista, cinta, gráfico, tabla,
  calculadora) cuando todo el bloque tiene el mismo origen; si un bloque mezcla orígenes, **cada
  fila** lleva la suya y la cabecera no.
- **FR-002**: Toda pantalla con datos de sueño MUST mostrar sin interacción el aviso "No es un
  dispositivo médico".
- **FR-003**: Ningún texto de la interfaz MUST nombrar trastornos, umbrales clínicos ni alertas
  médicas. Una prueba automática MUST recorrer todos los textos de la interfaz contra una lista de
  palabras prohibidas versionada en el repositorio, y fallar indicando el texto y su ubicación.
- **FR-004**: Las estimaciones (ventanas de despertar) MUST NOT guardarse como datos de sueño; solo
  se calculan al mostrarse.

**Calculadora de ciclos (US2)**

- **FR-005**: El panel "¿Hora de dormir?" MUST mostrar 3 ventanas de despertar para 4, 5 y 6
  ciclos: centro = hora de dormir + tiempo en dormirse + n × duración del ciclo; ventana = centro
  ± 15 min, en hora local.
- **FR-006**: Las ventanas MUST recalcularse al cambiar la hora de dormir del panel o los ajustes,
  sin acciones extra, e indicar "mañana" cuando caen en el día siguiente.
- **FR-007**: Con una noche abierta, Noche MUST mostrar las mismas ventanas calculadas desde la hora
  real de acostarse.
- **FR-008**: La calculadora MUST mostrar siempre el texto "estimación, no medición; no está
  demostrado que despertar al final de un ciclo mejore cómo te sientes".
- **FR-009**: Cada persona MUST poder guardar su duración de ciclo (70–110 min, por defecto 90) y su
  tiempo en dormirse (0–60 min, por defecto 15). Los valores fuera de rango se rechazan con un
  mensaje que indica el rango.
- **FR-010**: La duración de ciclo guardada MUST usarse también en los atajos y la equivalencia en
  ciclos del objetivo de sueño (feature 005: Tendencias, perfil y bienvenida).
- **FR-011**: "Me voy a dormir" y "Ya desperté" MUST seguir siendo un solo toque.

**Fases (US3)**

- **FR-012**: Tendencias MUST tener una sección "Fases" que, mientras no exista la importación de
  relojes, diga "Descanso aún no importa datos de relojes", y cuando exista y no haya datos
  importados, ofrezca "Importa tus datos →".
- **FR-013**: La app MUST NOT calcular, guardar ni mostrar fases de sueño estimadas.

**Noche abierta (US4)**

- **FR-014**: Al abrir la app con una noche abierta desde hace 14 h o más, MUST aparecer "¿Olvidaste
  marcar que despertaste?" con una hora propuesta = hora de dormir + objetivo de sueño (o la hora
  actual si esa suma fuera futura).
- **FR-015**: La persona MUST poder aceptar la hora propuesta, cambiarla (validaciones de "Ya
  desperté") o descartar el aviso; descartarlo no cierra la noche y el aviso reaparece en la
  siguiente apertura.
- **FR-016**: Ningún aviso de esta feature MUST usar notificaciones push, correo ni otro canal fuera
  de la app.

**Tarjeta "¿Cómo fue la noche?" (US5)**

- **FR-017**: Tras cerrar una noche con "Ya desperté" o desde el aviso de noche abierta, MUST aparecer
  una tarjeta opcional y descartable con dos preguntas de respuesta única: tiempo en dormirse (<15,
  15–30, >30 min) y despertares (0, 1–2, 3+).
- **FR-018**: Cada respuesta MUST guardarse en esa noche al elegirla; ambas son opcionales y pueden
  cambiarse o borrarse al editar la noche. Descartar la tarjeta no guarda nada y no la vuelve a
  mostrar para esa noche.
- **FR-019**: Las respuestas MUST incluirse en las exportaciones de noches (JSON y CSV) y borrarse con
  la cuenta.

**Aislamiento y privacidad**

- **FR-020**: Los ajustes de ciclo y las respuestas de la tarjeta MUST pertenecer a su persona: las
  rutas nuevas o ampliadas filtran por usuario, lo ajeno responde 404 y la suite de aislamiento de
  dos usuarios las incluye.
- **FR-021**: Los datos nuevos MUST conservarse en los cambios de esquema (migración con respaldo
  previo, sin pérdida de las noches existentes, que quedan sin respuestas).

### Key Entities *(include if feature involves data)*

- **Ajustes de ciclo (de cada persona)**: duración del ciclo (70–110 min, 90 por defecto) y tiempo en
  dormirse (0–60 min, 15 por defecto); se suman a los ajustes existentes (objetivo de sueño).
- **Respuestas de la noche**: dos valores opcionales de una noche ya existente: tiempo en dormirse
  (<15 / 15–30 / >30) y despertares (0 / 1–2 / 3+). Sin respuesta = "sin dato", nunca 0.
- **Ventana de despertar (estimación, no persistida)**: número de ciclos, hora central, inicio y fin.
- **Origen del dato**: "Anotado por ti", "Estimado" o "Del reloj"; hoy se deduce del tipo de dato
  (todo lo guardado es anotado; todo lo calculado es estimado).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100 % de los bloques con datos de sueño visibles muestran su origen (en la cabecera,
  o en cada fila si mezclan orígenes), y el aviso "No es un
  dispositivo médico" está en el 100 % de las pantallas con datos de sueño (verificado por pruebas
  automáticas).
- **SC-002**: La prueba de palabras prohibidas recorre el 100 % de los textos de la interfaz y falla
  si se añade cualquier término de la lista.
- **SC-003**: Las ventanas de la calculadora coinciden al minuto con la fórmula en todos los casos de
  prueba, incluidos los que cruzan medianoche y un cambio de offset.
- **SC-004**: Registrar una noche sigue costando exactamente 1 toque al acostarse y 1 al despertar.
- **SC-005**: Responder la tarjeta completa cuesta como máximo 2 toques adicionales, y descartarla 1.
- **SC-006**: Con una noche abierta ≥ 14 h, el aviso aparece en el 100 % de las aperturas de la app
  hasta cerrarla; con < 14 h, en ninguna.
- **SC-007**: Ninguna pantalla muestra fases de sueño, porcentajes de REM ni puntuaciones calculadas
  por la app.

## Assumptions

- La sección "Fases" vive en Tendencias, plegable como "Regularidad".
- La anchura de la ventana es fija (± 15 min), como en el ejemplo "entre 6:45 y 7:15".
- Los ajustes de ciclo se editan en el perfil y con un acceso directo desde la calculadora; la
  bienvenida de 005 no los pregunta (se mantiene en una sola pregunta).
- "Pantalla con datos de sueño" = Noche, Tendencias y Siestas; Métricas, Cuenta y las pantallas de
  acceso no llevan el aviso.
- La lista de palabras prohibidas empieza con los términos clínicos más comunes en español
  (trastornos del sueño, diagnósticos, umbrales y alertas) y se amplía con el tiempo; no traduce ni
  interpreta lo que escribe la persona en sus notas.
- La importación de relojes (007) no existe: "Del reloj" e "Importa tus datos →" quedan preparados y
  probados con la disponibilidad desactivada y activada, pero hoy no se ven.
- Depende de: 004/008 (cuentas y ajustes por persona), 005 (objetivo de sueño, atajos de ciclos,
  Tendencias) y del principio VIII de la constitución, que se aprueba antes del plan.
