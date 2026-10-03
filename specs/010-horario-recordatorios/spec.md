# Feature Specification: Mi horario de sueño y recordatorios (sin servidor)

**Feature Branch**: `010-horario-recordatorios`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: `docs/sdd/features/010-horario-recordatorios.md`. Agendar a qué hora me
acuesto y me levanto, y que el móvil me avise sin pagar más ni instalar nada. Es el **único horario**
de la app; lo usan el recordatorio de noche abierta (006) y, más adelante, las rachas (011). Cada
usuario ve solo lo suyo (constitución v2.0.0) y rige el principio VIII (v2.1.0): ningún aviso fuera
de la app lleva datos de salud.

## Clarifications

### Session 2026-10-03

- Q: ¿Qué dispositivos hay para el spike del calendario? → A: **Android e iPhone**: el spike se hace en
  el Android de la persona (Google Calendar web y calendario del fabricante) y en un iPhone (Apple
  Calendar); las dos guías quedan verificadas.
- Q: ¿Qué noches son "fin de semana"? → A: **Sábado y domingo**: las noches en que te acuestas el
  sábado y el domingo (te levantas el domingo y el lunes). Cada día del horario es una **noche**,
  identificada por el día en que te acuestas (principio III).
- Q: ¿Aviso por defecto? → A: **30 min** antes de la hora de acostarse (configurable 15–60).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agendar mi horario (Priority: P1)

Como usuario, en una sola pantalla digo a qué hora quiero levantarme, acepto o cambio la hora de
acostarme que me propone la app y elijo si es igual todos los días, distinta el fin de semana o
distinta cada día.

**Why this priority**: sin horario no hay calendario, ni recordatorio con horario, ni rachas (011).

**Independent Test**: con objetivo de 7 h 30, en la bienvenida (o en "Mi horario") escribir 7:00 →
la app propone acostarse a las 23:15 (7:00 − 7 h 30 − 15 min); marcar "Distinto el fin de semana",
poner 9:00 → propone 1:15; guardar → "Mi horario" muestra las noches de lunes a viernes 23:15 → 7:00
y las de sábado y domingo 1:15 → 9:00.
Cambiarlo mañana crea una versión nueva y el horario de hoy no cambia.

**Acceptance Scenarios**:

1. **Given** la bienvenida de 005, **When** elijo mi objetivo, **Then** en la misma pantalla me
   pregunta "¿A qué hora quieres levantarte?" y puedo saltar todo con "Saltar".
2. **Given** una hora de levantarme, **When** la escribo, **Then** la hora de acostarme se propone
   como levantarme − objetivo − 15 min y puedo editarla antes de guardar.
3. **Given** el horario, **When** lo veo, **Then** "Igual todos los días" está marcado por defecto;
   puedo elegir "Distinto el fin de semana" (dos pares de horas) o "Cada día distinto" (siete), y
   desactivar días.
4. **Given** un horario guardado, **When** lo cambio, **Then** se crea una versión que vale desde
   hoy; los días anteriores siguen con la versión que tenían.
5. **Given** que viajo a otra zona horaria, **When** abro la app, **Then** "7:00" sigue siendo las
   7:00 de mi hora local (horas de reloj de pared).
6. **Given** la bienvenida de 005 ya vista, **When** abro "Mi horario" desde Cuenta, **Then** puedo
   crear o cambiar el horario igual que en la bienvenida.

---

### User Story 2 - Añadir a mi calendario, con alarma (Priority: P1)

Como usuario, descargo un archivo de calendario con mi horario y una alarma antes de la hora de
acostarme, para que el móvil me avise sin que la app tenga que estar abierta.

**Why this priority**: es el único aviso con la app cerrada que cuesta 0 $ (sin feature 013).

**Independent Test**: con L–V 23:15 y S–D 1:15 y aviso de 30 min, "Añadir a mi calendario" descarga
un archivo que pasa un validador iCalendar, contiene 7 eventos semanales (uno por día activo) a la
hora de acostarse con alarma de 30 min y el texto "Descanso: en 30 min es tu hora de dormir", sin
datos de salud; importarlo en el calendario del móvil hace sonar la alarma.

**Acceptance Scenarios**:

1. **Given** un horario, **When** pulso "Añadir a mi calendario", **Then** descargo un archivo con
   un evento semanal por cada día activo, a la hora de acostarme, y una alarma X minutos antes.
2. **Given** el ajuste "Avisarme antes", **When** elijo entre 15 y 60 min, **Then** se guarda y el
   archivo y el texto del aviso usan ese valor ("en 45 min es tu hora de dormir").
3. **Given** el archivo, **When** lo paso por un validador iCalendar (RFC 5545), **Then** es válido.
4. **Given** el archivo, **When** lo reviso, **Then** no contiene horas dormidas, notas, métricas ni
   ningún otro dato de salud; solo el horario y el texto del aviso.
5. **Given** que cambio el horario y descargo de nuevo, **When** lo importo, **Then** los eventos se
   actualizan en lugar de duplicarse, y un día que deja de tener evento aparece cancelado.
6. **Given** la guía, **When** la abro desde Android, **Then** me muestra primero las instrucciones de
   Android: Google Calendar web (subir el archivo) o el calendario del fabricante; las de iPhone
   ("Añadir todo") quedan disponibles debajo.
7. **Given** una plataforma en la que el spike mostró que la alarma importada no suena o que
   reimportar duplica, **When** abro su guía, **Then** lo dice claramente y propone la alternativa
   (crear una alarma recurrente en el reloj del móvil con las horas del horario, o borrar los eventos
   anteriores antes de importar).
8. **Given** el evento o su alarma, **When** lo toco, **Then** se abre la app en Noche con "Me voy a
   dormir" visible sin desplazarse.

---

### User Story 3 - "¿Ya despertaste?" con horario (Priority: P2)

Como usuario con horario, si sigo con la noche abierta una hora después de mi hora de levantarme
agendada, al abrir la app me lo pregunta proponiendo la hora agendada, que debo confirmar o corregir.

**Why this priority**: con horario, esperar 14 h (006) es demasiado; el registro tardío se marca para
no confundirlo con uno hecho al despertar.

**Independent Test**: horario con levantarse a 7:00; noche abierta desde las 23:00; abrir la app a
las 8:01 → "¿Ya despertaste?" con 7:00 propuesta; confirmarla cierra la noche con 7:00 y la noche
queda marcada "Anotado después"; a las 7:59 no hay aviso. Sin horario, sigue la regla de 14 h.

**Acceptance Scenarios**:

1. **Given** un horario con levantarse a H para el día de hoy y una noche abierta, **When** abro la
   app 60 min o más después de H, **Then** veo "¿Ya despertaste?" con H propuesta y editable.
2. **Given** el aviso, **When** confirmo o corrijo la hora, **Then** la noche se cierra con ella.
3. **Given** un despertar registrado más de 60 min después de la hora de despertar que se guarda,
   **When** veo esa noche, **Then** lleva el origen "Anotado después".
4. **Given** que confirmo la hora propuesta sin cambiarla, **Then** la noche queda marcada como
   "hora propuesta, no anotada en el momento" (dato que usará 011 para no mejorar una racha).
5. **Given** que no tengo horario, o que hoy es un día sin horario activo, o que estoy en pausa,
   **When** abro la app, **Then** se aplica la regla de 006: aviso solo con 14 h o más.

---

### User Story 4 - Modo pausa (Priority: P2)

Como usuario, activo un único "Modo pausa (viaje, enfermedad, turnos) hasta…" para que la app deje
de avisarme durante unos días.

**Why this priority**: evita avisos inútiles cuando el horario no aplica; 011 la usará para la racha.

**Independent Test**: activar una pausa de hoy a dentro de 5 días → no hay "¿Ya despertaste?" ni
aviso en la app hasta que termine; intentar una de 15 días, una en el pasado, una tercera en 30 días
o una que se solape → se rechaza con un mensaje claro.

**Acceptance Scenarios**:

1. **Given** "Modo pausa", **When** elijo empezar hoy o en una fecha futura y una fecha de fin,
   **Then** se guarda si dura como máximo 14 días.
2. **Given** una pausa que empieza en el pasado, dura más de 14 días, sería la tercera en 30 días o
   se solapa con otra, **When** la guardo, **Then** se rechaza explicando qué regla incumple.
3. **Given** una pausa activa, **When** abro la app, **Then** no veo "¿Ya despertaste?" con horario
   ni el aviso de la US5, y una indicación "En pausa hasta el …" con la opción de terminarla hoy.
4. **Given** una pausa, **Then** el calendario del móvil no cambia: la guía explica cómo silenciar
   los eventos desde el propio calendario.

---

### User Story 5 - Aviso con la app abierta (Priority: P3)

Como usuario, si tengo la app abierta a la hora de prepararme (hora de acostarme − aviso), veo un
aviso accesible y silencioso.

**Why this priority**: complementa al calendario; poco frecuente.

**Independent Test**: con acostarse a 23:15 y aviso de 30 min, con la app abierta a las 22:45 aparece
"En 30 min es tu hora de dormir" con `role="status"`, sin sonido; con movimiento reducido, sin
animación.

**Acceptance Scenarios**:

1. **Given** la app abierta, **When** llega la hora de acostarme − aviso (± 1 min), **Then** aparece
   el aviso con `role="status"`, sin sonido.
2. **Given** `prefers-reduced-motion`, **When** aparece, **Then** no tiene animación.
3. **Given** una pausa activa, un día sin horario o una noche ya abierta, **Then** no aparece.

---

### Edge Cases

- Hora de acostarme propuesta que cae el día anterior (levantarse a 5:00 con objetivo de 9 h →
  19:45 del día anterior): se acepta; la noche es la del día en que me acuesto (principio III).
- Hora de acostarme después de medianoche (1:15) en la noche del sábado: la noche sigue siendo la
  del sábado, pero el evento del calendario cae el domingo a la 1:15.
- Cambio de horario oficial (DST): el evento de las 23:15 sigue a las 23:15 (hora flotante).
- Dos versiones el mismo día: la segunda sustituye a la primera desde hoy (una sola versión por día).
- Un día desactivado en la versión nueva que estaba activo antes: el archivo lo emite cancelado.
- Pausa que termina hoy: los avisos vuelven mañana.
- Borrar la cuenta borra horario, versiones y pausas; la exportación los incluye.
- Dos usuarios: el horario, las pausas y el archivo de uno nunca aparecen para el otro (404).

## Requirements *(mandatory)*

### Functional Requirements

**Horario (US1)**

- **FR-001**: La bienvenida de 005 MUST ampliarse (sigue siendo una sola y se puede saltar): objetivo
  → hora de levantarme → hora de acostarme propuesta y editable → tipo de horario.
- **FR-002**: La hora de acostarme propuesta MUST ser levantarme − objetivo − 15 min, en horas de
  reloj de pared.
- **FR-003**: El horario MUST admitir "Igual todos los días" (por defecto), "Distinto el fin de
  semana" (noches del sábado y del domingo) y "Cada día distinto", con días activables y
  desactivables. Cada día del horario es una noche, nombrada por el día en que te acuestas.
- **FR-004**: Cada guardado MUST crear una versión vigente desde ese día; las versiones no se
  editan ni se borran (salvo con la cuenta), y como máximo hay una por día.
- **FR-005**: Las horas MUST guardarse como minutos del día de reloj de pared, sin zona horaria.
- **FR-006**: "Mi horario" MUST estar accesible desde Cuenta para crear o cambiar el horario después
  de la bienvenida.

**Calendario (US2)**

- **FR-007**: "Añadir a mi calendario" MUST descargar un archivo iCalendar (RFC 5545) con un evento
  semanal por día activo a la hora de acostarse y una alarma de "Avisarme antes" minutos (15–60,
  30 por defecto).
- **FR-008**: El archivo MUST usar hora flotante, identificadores estables por día y un número de
  secuencia creciente con la versión, para que reimportarlo actualice en vez de duplicar; los días
  que dejan de tener evento MUST emitirse cancelados.
- **FR-009**: El archivo y sus avisos MUST NOT contener datos de salud; el texto es "Descanso: en
  X min es tu hora de dormir".
- **FR-010**: El evento MUST enlazar a la app, que abre Noche con "Me voy a dormir" visible.
- **FR-011**: La guía MUST mostrar primero las instrucciones de la plataforma detectada (Android:
  Google Calendar web o calendario del fabricante; iPhone: "Añadir todo") e incluir lo que el spike
  haya demostrado que no funciona y su alternativa.

**Noche abierta con horario (US3)**

- **FR-012**: Con horario activo para hoy y sin pausa, si la noche sigue abierta 60 min o más
  después de la hora de levantarme agendada, al abrir la app MUST aparecer "¿Ya despertaste?" con
  esa hora propuesta; sin horario se mantiene la regla de 14 h de 006.
- **FR-013**: Cada noche MUST guardar cuándo se registró el despertar; si se registró más de 60 min
  después de la hora de despertar, su origen MUST mostrarse como "Anotado después".
- **FR-014**: Cerrar la noche con la hora propuesta sin cambiarla MUST quedar registrado en la noche.

**Pausa (US4)**

- **FR-015**: Una pausa MUST empezar hoy o en el futuro, durar como máximo 14 días, no solaparse con
  otra y no ser la tercera en 30 días; si no, se rechaza con el motivo.
- **FR-016**: Durante una pausa MUST NOT mostrarse avisos de horario dentro de la app; el calendario
  no se toca.
- **FR-017**: La persona MUST poder terminar una pausa activa hoy.

**Aviso en la app (US5)**

- **FR-018**: Con la app abierta, a la hora de acostarse − aviso (± 1 min), MUST aparecer un aviso
  silencioso con `role="status"`, salvo pausa, día sin horario o noche ya abierta, respetando
  `prefers-reduced-motion`.

**Datos y aislamiento**

- **FR-019**: Horario, versiones, aviso y pausas MUST incluirse en la exportación y borrarse con la
  cuenta.
- **FR-020**: Todas las rutas nuevas MUST filtrar por usuario (lo ajeno → 404) y entrar en la suite
  de aislamiento de dos usuarios; el esquema solo crece (migración aditiva).

### Key Entities *(include if feature involves data)*

- **Versión de horario**: de una persona, con la fecha desde la que vale; solo se añaden.
- **Día del horario**: de una versión; día de la semana, hora de acostarse, hora de levantarse
  (minutos de reloj de pared) y si está activo.
- **Ajuste "Avisarme antes"**: minutos (15–60) por persona.
- **Pausa**: de una persona; fecha de inicio y de fin.
- **Noche (ampliada)**: cuándo se registró el despertar y si se cerró con la hora propuesta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Agendar el horario desde la bienvenida cuesta como máximo 3 decisiones (hora de
  levantarse, aceptar la de acostarse, tipo de horario) y se puede saltar en 1 toque.
- **SC-002**: El archivo de calendario pasa un validador RFC 5545 y coincide con un archivo de
  referencia.
- **SC-003**: Al pasar de la versión 1 a la 2 del horario, reimportar no aumenta el número de
  eventos en los calendarios donde el spike lo confirme.
- **SC-004**: El spike cubre Apple Calendar (iPhone), Google Calendar web y el calendario del
  fabricante (Android). En cada uno se anota si la alarma importada suena a la hora prevista y si
  reimportar actualiza; donde no, la guía lo dice y ofrece la alternativa.
- **SC-005**: 0 datos de salud en el archivo y en los textos de aviso (prueba automática).
- **SC-006**: Con horario, "¿Ya despertaste?" aparece en el 100 % de las aperturas a partir de 60
  min después de la hora de levantarse con la noche abierta, y en ninguna antes.
- **SC-007**: Las 4 reglas de la pausa se validan en el servidor; 0 pausas inválidas guardadas.
- **SC-008**: Coste de operación adicional: 0 $ (el servidor no programa nada).

## Assumptions

- La hora de levantarse de una noche es la de la mañana siguiente.
- El spike lo hace la persona usuaria con sus dispositivos (Android e iPhone) antes del plan, con
  archivos de prueba que prepara la app; sus resultados se anotan en `research.md` y ajustan la guía.
- 011 (rachas) aún no existe: esta feature solo guarda los datos que necesitará (pausas, despertar
  tardío y hora propuesta confirmada).
- El enlace del evento abre la app pública (`https://descanso-sleep.fly.dev`); si no hay sesión,
  pide entrar y luego muestra Noche.
- Fuera de alcance: push con la app cerrada (013), app instalable, SMS o email, alarmas con sonido,
  alarma inteligente y suscripción webcal.
