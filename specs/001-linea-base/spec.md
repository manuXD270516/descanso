# Feature Specification: Línea base del tracker de descanso

**Feature Branch**: `001-linea-base`

**Created**: 2026-09-29

**Status**: Draft

**Input**: User description: `docs/sdd/features/001-linea-base.md`. Documentar como especificación
el producto existente ("Descanso"), sin cambiar su comportamiento: registro de noches, noches
pasadas, siestas, resumen de 14 días con cinta visual, métricas personalizables y persistencia.

## Clarifications

### Session 2026-09-29

- Q: ¿El servicio debe rechazar una segunda noche abierta, o la línea base solo documenta que hoy
  la garantiza la interfaz? → A: Exigir en el servicio: rechaza tanto crear como reabrir por
  edición una segunda noche abierta.
- Q: ¿La línea base corrige los textos "Ya despertí" y "Despertí" o los conserva? → A: Se
  corrigen a "Ya desperté" y "Desperté".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar la noche en curso (Priority: P1)

Al acostarse, la persona pulsa un único botón ("Me voy a dormir") con la hora actual ya
propuesta; la noche queda "abierta". Al despertar, la app muestra la hora a la que se acostó y
un botón ("Ya desperté") con la hora actual propuesta que cierra la noche y calcula la duración.

**Why this priority**: es el uso diario principal; sin él no hay datos para nada más.

**Independent Test**: sin otros datos, registrar dormir y despertar y comprobar que aparece un
registro cerrado con su duración.

**Acceptance Scenarios**:

1. **Given** no hay noche abierta, **When** la persona pulsa "Me voy a dormir" sin tocar la hora,
   **Then** se crea una noche abierta con la hora actual y su fecha de noche es el día local en
   que se acuesta, en 1 solo gesto.
2. **Given** hay una noche abierta, **When** la persona abre la app, **Then** ve "Te acostaste a
   las HH:MM" y no ve el botón "Me voy a dormir".
3. **Given** hay una noche abierta, **When** pulsa "Ya desperté" con una hora posterior a la de
   dormir, **Then** la noche se cierra y muestra su duración en horas y minutos.
4. **Given** hay una noche abierta, **When** intenta cerrarla con una hora igual o anterior a la
   de dormir, **Then** se rechaza con el mensaje "La hora de despertar debe ser posterior a la de
   dormir" y la noche sigue abierta.
5. **Given** no hay noche abierta, **When** se intenta cerrar una noche, **Then** se informa "No
   hay una noche abierta para cerrar".
6. **Given** la persona se acuesta a las 23:40 del lunes y despierta a las 07:10 del martes,
   **When** se cierra la noche, **Then** la fecha de noche es el lunes y la duración es 7 h 30 min.
7. **Given** hay una noche abierta, **When** se intenta crear otra noche sin despertar o quitar el
   despertar de otra noche al editarla, **Then** se rechaza con un mensaje en español y sigue
   habiendo exactamente una noche abierta.

---

### User Story 2 - Registrar, editar y eliminar noches pasadas (Priority: P2)

La persona puede registrar una noche olvidada indicando hora de dormir, hora de despertar y
notas opcionales; y en la lista de registros puede editar fecha de noche, horas y notas, o
eliminar la noche tras confirmar.

**Why this priority**: corrige olvidos y errores; mantiene los promedios fiables.

**Independent Test**: registrar una noche pasada, editar su nota y hora, y eliminarla.

**Acceptance Scenarios**:

1. **Given** el formulario manual, **When** introduce dormir y despertar válidos y guarda,
   **Then** aparece una noche cerrada cuya fecha de noche es el día de la hora de dormir.
2. **Given** el formulario manual, **When** falta la hora de dormir o la de despertar, **Then**
   el botón "Guardar noche" está deshabilitado.
3. **Given** una noche registrada, **When** edita sus horas y notas y guarda, **Then** la lista
   y la duración reflejan los nuevos valores.
4. **Given** una noche registrada, **When** pulsa "Eliminar" y confirma, **Then** desaparece de
   la lista; si cancela la confirmación, no cambia nada.
5. **Given** una edición cuya hora de despertar no es posterior a la de dormir, **When** guarda,
   **Then** se rechaza con un mensaje de error y el registro no cambia.
6. **Given** una nota de más de 500 caracteres, **When** se guarda, **Then** se conservan los
   primeros 500.

---

### User Story 3 - Registrar siestas (Priority: P2)

La persona registra siestas con inicio y fin (propuestos por defecto: últimos 30 minutos), ve la
duración antes de guardar, y consulta las siestas de los últimos 30 días agrupadas por día con
número y total por día; puede editarlas y eliminarlas.

**Why this priority**: complementa el sueño nocturno en el resumen; independiente de las noches.

**Independent Test**: registrar dos siestas el mismo día y ver un grupo con "2 siestas" y la
suma de duraciones.

**Acceptance Scenarios**:

1. **Given** el formulario de siesta recién abierto, **When** no toca nada, **Then** inicio es
   hace 30 minutos, fin es ahora y se muestra "Duración: 30 min".
2. **Given** fin igual o anterior a inicio, **When** revisa el formulario, **Then** ve "El fin
   debe ser posterior al inicio" y "Guardar siesta" está deshabilitado.
3. **Given** dos siestas el mismo día (20 y 45 min), **When** ve la lista, **Then** ese día
   muestra "2 siestas · 1 h 05 min".
4. **Given** una siesta de hace 31 días, **When** ve la lista, **Then** no aparece.
5. **Given** una siesta, **When** la edita o la elimina (con confirmación), **Then** la lista se
   actualiza.

---

### User Story 4 - Ver resumen de 14 días y cinta de noches (Priority: P3)

En la pestaña Noche la persona ve: duración media por noche, hora media de dormir, hora media de
despertar y total de siestas de los últimos 14 días; y una cinta por día (14 filas, la más
reciente arriba) con barras de sueño y de siestas sobre un eje de 24 h de 12:00 a 12:00.

**Why this priority**: da valor sobre los datos, pero depende de que existan registros.

**Independent Test**: con noches y siestas conocidas, comprobar los cuatro valores y la
posición de las barras.

**Acceptance Scenarios**:

1. **Given** dos noches cerradas de 7 h y 8 h en los últimos 14 días, **When** ve el resumen,
   **Then** el promedio por noche es "7 h 30 min".
2. **Given** noches con hora de dormir 23:30 y 00:30, **When** ve el resumen, **Then** la hora
   media de dormir es 00:00 (promedio circular, no 12:00).
3. **Given** noches abiertas en el rango, **When** ve el resumen, **Then** no cuentan para
   ningún promedio.
4. **Given** 3 siestas en el rango, **When** ve el resumen, **Then** muestra "3 siestas en 14
   días".
5. **Given** sin datos, **When** ve el resumen, **Then** las horas medias se muestran como "—" y
   la duración media como "0 min".
6. **Given** una noche de 23:00 a 07:00, **When** ve la cinta, **Then** su barra empieza en torno al
   46 % del eje (11 de 24 h) y ocupa un tercio del ancho; una siesta se dibuja en la fila de su día.

---

### User Story 5 - Métricas personalizables (Priority: P3)

Desde un panel de configuración la persona crea, edita, archiva, restaura, elimina y reordena
métricas de tipo escala (mín–máx), número (mín/máx y unidad opcionales), sí/no o texto, cada una
con un color. Para el día seleccionado (hoy por defecto, navegable hacia atrás, nunca al futuro)
registra un valor por métrica, y ve un historial de 7 días que termina en el día seleccionado.

**Why this priority**: amplía el tracker a hábitos y sensaciones; no bloquea el uso de sueño.

**Independent Test**: crear una métrica de escala 1–5, registrar 4 hoy, verla en el historial,
archivarla y restaurarla.

**Acceptance Scenarios**:

1. **Given** una instalación nueva, **When** abre Métricas, **Then** existen "Calidad del sueño"
   (escala 1–5), "Energía al despertar" (escala 1–5) y "Cafés" (número, tazas, mínimo 0).
2. **Given** el formulario de métrica, **When** crea una escala con mínimo ≥ máximo o sin nombre,
   **Then** se rechaza con un mensaje de error.
3. **Given** una métrica de escala, **When** pulsa un valor, **Then** se guarda para el día; si
   pulsa el mismo valor otra vez, el registro del día se borra.
4. **Given** una métrica numérica con mínimo 0, **When** introduce -1, **Then** se rechaza con
   "Mínimo 0".
5. **Given** una métrica sí/no, **When** la pulsa sucesivamente, **Then** alterna entre "Sí" y
   "No" (el estado inicial es "Sin registrar").
6. **Given** varias métricas activas, **When** mueve una hacia arriba, **Then** el nuevo orden
   se conserva al recargar.
7. **Given** una métrica activa, **When** la archiva, **Then** deja de aparecer en el registro y
   el historial, conserva sus valores y puede restaurarse.
8. **Given** una métrica archivada, **When** la elimina y confirma, **Then** desaparecen la
   métrica y todos sus valores.
9. **Given** el día seleccionado es hoy, **When** intenta avanzar al día siguiente, **Then** el
   control está deshabilitado.

---

### User Story 6 - Persistencia de los datos (Priority: P1)

Todos los registros (noches, siestas, métricas y valores) se conservan entre reinicios del
servicio y entre sesiones del navegador o dispositivos distintos.

**Why this priority**: sin persistencia el producto no tiene valor.

**Independent Test**: registrar datos, reiniciar el servicio, recargar la app y comprobar que
siguen igual.

**Acceptance Scenarios**:

1. **Given** datos registrados, **When** se reinicia el servicio, **Then** el 100 % de los
   registros sigue disponible sin cambios.
2. **Given** datos registrados desde un navegador, **When** se abre la app en otro, **Then** se
   ven los mismos datos.
3. **Given** una base ya existente con métricas, **When** el servicio arranca, **Then** no se
   vuelven a crear las métricas iniciales.

### Edge Cases

- Acostarse después de medianoche (p. ej. 00:30 del martes): la fecha de noche es el martes,
  el día local en que se acuesta.
- Varias noches cerradas con la misma fecha de noche: se suman en el resumen de ese día y la
  cinta muestra solo una de ellas.
- Una noche que termina después de las 12:00 del día siguiente: su barra se recorta al final del
  eje de la cinta.
- Cambio de zona horaria entre registros: las horas guardadas conservan su offset original.
- Recarga de la página a mitad de una noche abierta: la noche sigue abierta.
- Servidor no disponible: la app muestra "No se pudo conectar con el servidor".
- Escala con más de 11 valores posibles: solo se muestran los 11 primeros botones.
- Editar una noche dejando vacío el despertar la reabre solo si no hay otra noche abierta; si la
  hay, se rechaza (FR-003).

## Requirements *(mandatory)*

### Functional Requirements

**Noches**

- **FR-001**: El sistema MUST permitir iniciar una noche con un solo gesto, proponiendo la hora
  actual como hora de dormir.
- **FR-002**: El sistema MUST cerrar la noche abierta más reciente con una hora de despertar
  posterior a la de dormir, y rechazar horas iguales o anteriores.
- **FR-003**: El sistema MUST garantizar que solo exista una noche abierta a la vez, también en
  el servicio y no solo en la interfaz: MUST rechazar crear una noche sin despertar y MUST
  rechazar quitar el despertar de una noche al editarla, cuando ya exista otra noche abierta,
  con un mensaje en español que lo explique.
- **FR-004**: La fecha de noche MUST ser el día local, según el offset registrado, en que la
  persona se acuesta.
- **FR-005**: Las horas MUST guardarse en ISO 8601 con el offset de la zona horaria de quien
  registra.
- **FR-006**: Las personas MUST poder registrar noches pasadas con dormir, despertar y notas
  opcionales, y editar fecha de noche, horas y notas de cualquier noche.
- **FR-007**: Las personas MUST poder eliminar una noche tras confirmar la acción.
- **FR-008**: El sistema MUST mostrar la duración de cada noche cerrada en horas y minutos, e
  indicar "noche abierta" en las que no tienen despertar.
- **FR-009**: Las notas MUST limitarse a 500 caracteres.

**Siestas**

- **FR-010**: Las personas MUST poder crear, editar y eliminar (con confirmación) siestas con
  inicio, fin y notas opcionales; el fin MUST ser posterior al inicio.
- **FR-011**: La fecha de una siesta MUST ser el día local de su inicio.
- **FR-012**: El sistema MUST listar las siestas de los últimos 30 días (hoy incluido),
  agrupadas por día, de la más reciente a la más antigua, con número de siestas y duración
  total por día.

**Resumen y cinta**

- **FR-013**: El sistema MUST mostrar para los últimos 14 días (hoy incluido): duración media
  por noche cerrada, hora media de dormir, hora media de despertar y número total de siestas.
- **FR-014**: Las horas medias MUST calcularse como promedio circular sobre las 24 h, usando la
  hora local registrada.
- **FR-015**: El sistema MUST mostrar una fila por cada uno de los 14 días con la barra de sueño
  de esa noche y las barras de sus siestas, sobre un eje de 12:00 a 12:00.

**Métricas**

- **FR-016**: Las personas MUST poder crear y editar métricas con nombre (obligatorio, máx. 60
  caracteres), tipo (escala, número, sí/no, texto), mínimo y máximo, unidad (máx. 20
  caracteres) y un color.
- **FR-017**: Las escalas MUST tener mínimo y máximo, con mínimo < máximo.
- **FR-018**: Las personas MUST poder archivar y restaurar métricas; las archivadas no aparecen
  en el registro diario ni en el historial y conservan sus valores.
- **FR-019**: Las personas MUST poder eliminar una métrica archivada tras confirmar; se eliminan
  también todos sus valores.
- **FR-020**: Las personas MUST poder reordenar las métricas activas y el orden MUST persistir.
- **FR-021**: El sistema MUST guardar como máximo un valor por métrica y día; registrar de nuevo
  reemplaza el anterior y vaciar el valor lo elimina.
- **FR-022**: Los valores numéricos y de escala MUST respetar el mínimo y el máximo definidos;
  los textos se limitan a 500 caracteres.
- **FR-023**: Las personas MUST poder navegar entre días para registrar valores, sin poder
  seleccionar días futuros.
- **FR-024**: El sistema MUST mostrar un historial de 7 días de todas las métricas activas que
  termina en el día seleccionado.
- **FR-025**: Una instalación nueva MUST incluir las tres métricas iniciales de US5-1, y solo si
  no existe ninguna métrica.

**Generales**

- **FR-026**: Todos los datos MUST persistir entre reinicios y sesiones.
- **FR-027**: La interfaz MUST estar en español, organizada en tres pestañas (Noche, Siestas,
  Métricas), ser responsive, mostrar foco visible y respetar la preferencia de movimiento
  reducido. Los botones y etiquetas de despertar MUST decir "Ya desperté" y "Desperté".
- **FR-028**: Los errores de validación MUST mostrarse a la persona con un mensaje en español.
- **FR-029**: El servicio MUST exponer un chequeo de salud que indique que está operativo.

### Key Entities

- **Noche**: un periodo de sueño nocturno. Fecha de noche, hora de dormir, hora de despertar
  (vacía mientras está abierta), notas. La duración se deriva.
- **Siesta**: un periodo de sueño diurno. Fecha, inicio, fin, notas. La duración se deriva.
- **Métrica**: algo que la persona quiere seguir a diario. Nombre, tipo, mínimo, máximo, unidad,
  color, orden y estado archivado.
- **Valor de métrica**: el valor de una métrica en un día concreto; único por métrica y día. Se
  elimina junto con su métrica.
- **Resumen diario**: agregación derivada por día (minutos de sueño, minutos y número de
  siestas, horas de dormir/despertar); no se almacena.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Iniciar o cerrar la noche actual requiere 1 gesto y menos de 5 segundos desde que
  se abre la app.
- **SC-002**: El 100 % de los escenarios de aceptación de las historias 1–6 están cubiertos por
  pruebas automatizadas que pasan.
- **SC-003**: La regla de fecha de noche (incluidos los casos antes y después de medianoche)
  tiene al menos 3 casos de prueba explícitos.
- **SC-004**: Tras reiniciar el servicio, el 100 % de los registros previos se recupera sin
  cambios.
- **SC-005**: Las cifras del resumen coinciden al minuto con un cálculo manual sobre los mismos
  datos.
- **SC-006**: Registrar los valores del día de 3 métricas lleva menos de 30 segundos.
- **SC-007**: Ningún comportamiento visible de la app cambia respecto al MVP actual, salvo el
  rechazo de una segunda noche abierta por parte del servicio (FR-003) y la corrección de los
  textos "Ya desperté" y "Desperté" (FR-027).

## Assumptions

- Hay una sola persona usuaria; no hay cuentas, inicio de sesión ni permisos.
- La persona usa la app mayoritariamente en una sola zona horaria; las horas se muestran en la
  zona horaria del dispositivo que consulta.
- No se valida el solapamiento entre noches ni entre noches y siestas, igual que hoy.
- Se aceptan horas de dormir futuras en el registro de noches, igual que hoy.
- Los "últimos N días" incluyen el día de hoy.
- Esta feature no añade funcionalidad nueva: su objetivo es especificar y cubrir con pruebas el
  comportamiento existente. La deuda técnica detectada se registra, no se corrige aquí.
