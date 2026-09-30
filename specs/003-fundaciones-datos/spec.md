# Feature Specification: Fundaciones de datos: migraciones y endurecimiento

**Feature Branch**: `003-fundaciones-datos`

**Created**: 2026-09-29

**Status**: Draft

**Input**: User description: `docs/sdd/features/003-fundaciones-datos.md`. Como mantenedor, poder
cambiar el esquema de la base sin arriesgar los datos del usuario y corregir la deuda técnica que
hoy distorsiona los datos, sin añadir funcionalidades nuevas:

- migraciones versionadas que se aplican al arrancar, con respaldo previo;
- regla expand/contract para que el rollback automático siga siendo seguro;
- correcciones DT-02, DT-03, DT-04, DT-08, DT-11 y DT-21, más una sola noche abierta garantizada
  por la base;
- aviso cuando el volumen de datos se acerca a su capacidad.

## Clarifications

### Session 2026-09-29

- Q: Cuando se crea o edita una noche o siesta cuya fecha no coincide con el día local de su hora
  de inicio (DT-04), ¿el servicio debe rechazarla o calcular la fecha él mismo? → A: Rechazar con
  400 indicando la fecha esperada; la fecha sigue siendo obligatoria (FR-015).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cambiar el esquema sin arriesgar los datos (Priority: P1)

Como mantenedor, quiero que los cambios de esquema se apliquen solos al arrancar el servicio,
de forma ordenada, registrada y reversible, para que las próximas features (acceso protegido,
multiusuario, horario…) puedan evolucionar la base sin tocar a mano los datos de producción.

**Why this priority**: todas las features posteriores necesitan cambiar el esquema; hoy no hay
forma segura de hacerlo (DT-01) y los datos de sueño son irrecuperables (principio II).

**Independent Test**: arrancar el servicio sobre una copia de la base actual y sobre una base
vacía; comprobar que ambas quedan en la última versión, que la base existente conserva todos sus
datos intactos y que arrancar de nuevo no cambia nada.

**Acceptance Scenarios**:

1. **Given** una base creada por la versión actual de la app, con datos, **When** el servicio
   arranca por primera vez con esta feature, **Then** la versión inicial del esquema queda
   registrada como aplicada y la huella de todas las filas de todas las tablas es idéntica antes
   y después.
2. **Given** que no existe base de datos, **When** el servicio arranca, **Then** se crea el esquema
   completo, con las métricas iniciales, y queda registrado en la última versión.
3. **Given** una base ya en la última versión, **When** el servicio arranca otra vez, **Then** no
   se aplica ni se registra ninguna migración y el contenido no cambia.
4. **Given** una migración pendiente que falla a mitad, **When** el servicio arranca, **Then** la
   base queda exactamente como antes de esa migración, la migración no queda registrada y el
   servicio no empieza a atender peticiones.
5. **Given** una migración ya aplicada cuyo contenido fue modificado después, **When** el servicio
   arranca, **Then** el arranque se detiene con un mensaje que nombra la migración alterada y no
   se toca la base.
6. **Given** migraciones pendientes sobre una base con datos, **When** el servicio arranca,
   **Then** antes de aplicarlas se guarda un respaldo local completo, y solo se conservan los 3
   respaldos más recientes.
7. **Given** el servicio arrancando, **When** hay migraciones pendientes, **Then** no se atiende
   ninguna petición (ni siquiera la verificación de salud) hasta que todas terminan.

---

### User Story 2 - Rollback del despliegue sin romper la base (Priority: P1)

Como mantenedor, quiero una regla escrita y un procedimiento probado para que, si un despliegue
falla y el pipeline vuelve a la versión anterior, esa versión anterior siga funcionando con el
esquema ya migrado; y, si no basta, poder restaurar el respaldo previo a la migración.

**Why this priority**: el pipeline de 002 hace rollback automático a la imagen anterior; sin esta
regla, una migración podría dejar la versión anterior sin funcionar y con datos en riesgo.

**Independent Test**: aplicar las migraciones de esta feature sobre una copia de la base y
ejecutar la batería de pruebas de la versión anterior del servicio contra el esquema migrado;
seguir el runbook de restauración sobre una copia.

**Acceptance Scenarios**:

1. **Given** el esquema migrado por esta feature, **When** se ejecuta la versión anterior del
   servicio (la de master antes de 003), **Then** todas sus operaciones de lectura y escritura
   siguen funcionando.
2. **Given** la regla expand/contract documentada, **When** alguien prepara una migración nueva,
   **Then** la guía le indica qué cambios están permitidos en un solo despliegue (añadir) y cuáles
   deben esperar a un despliegue posterior (quitar o renombrar).
3. **Given** una migración que dejó la base inutilizable, **When** el mantenedor sigue el runbook
   de "rollback con restauración del respaldo previo a la migración", **Then** recupera la base
   exactamente como estaba antes de esa migración, en menos de 15 minutos.

---

### User Story 3 - Datos que no se distorsionan (Priority: P1)

Como usuario, quiero que la app rechace datos incorrectos con mensajes claros en lugar de
guardarlos mal o fallar con un error interno, y que las pantallas muestren todo lo que registré.

**Why this priority**: la deuda técnica DT-02, DT-03, DT-04, DT-08, DT-11 y DT-21 hace que hoy se
guarden o muestren datos equivocados sin avisar.

**Independent Test**: enviar al servicio las peticiones mal formadas de cada DT y comprobar el
rechazo; registrar dos noches con la misma fecha y verlas ambas en la cinta.

**Acceptance Scenarios**:

1. **Given** una consulta de estadísticas sin rango o con fechas inválidas, **When** se pide,
   **Then** se responde "petición inválida" con un mensaje en español, nunca un error interno
   (DT-02).
2. **Given** consultas de noches, siestas o valores de métricas con `from`/`to` que no son fechas
   reales (formato erróneo o días imposibles como 2026-02-30), **When** se piden, **Then** se
   responde "petición inválida" (DT-03).
3. **Given** una noche o siesta cuya fecha no coincide con el día local de su hora de inicio
   (según el desfase registrado en esa hora), **When** se crea o se edita, **Then** se rechaza con
   un mensaje que indica la fecha correcta (DT-04).
4. **Given** una métrica sí/no, **When** se envía un valor que no es sí ni no, **Then** se rechaza
   en lugar de guardarse como "No" (DT-08).
5. **Given** dos noches registradas con la misma fecha, **When** se mira la cinta, **Then** se ven
   las dos barras (DT-11).
6. **Given** horas de acostarse a ambos lados de la medianoche (p. ej. 23:30 y 00:30), **When** se
   calcula la hora media, **Then** el resultado está siempre entre 00:00 y 23:59 y nunca vale 1440
   (DT-21).
7. **Given** una noche abierta, **When** se intenta abrir otra por cualquier camino (incluidas dos
   peticiones simultáneas), **Then** la base lo impide y el usuario ve el mensaje actual "Ya hay
   una noche abierta. Ciérrala antes de abrir otra."
8. **Given** una base que ya contiene dos noches abiertas, **When** se aplica la migración que
   garantiza una sola, **Then** el arranque se detiene sin tocar datos, con un mensaje que indica
   las noches afectadas (por id y fecha) y cómo cerrarlas o corregirlas.

---

### User Story 4 - Aviso antes de quedarse sin espacio (Priority: P2)

Como mantenedor, quiero enterarme antes de que el volumen de datos se llene, para ampliarlo sin
perder escrituras.

**Why this priority**: el volumen es pequeño y ahora también guardará respaldos locales; llenarse
bloquearía todas las escrituras, pero es un riesgo lento y previsible.

**Independent Test**: simular un volumen al 71 % y comprobar el aviso en el registro y en la
verificación de salud; al 69 %, que no aparece.

**Acceptance Scenarios**:

1. **Given** un volumen de datos con más del 70 % de uso, **When** se consulta la verificación de
   salud, **Then** incluye un indicador de almacenamiento en aviso con el porcentaje, sin ningún
   dato personal, y el servicio sigue respondiendo como sano.
2. **Given** ese mismo estado, **When** el servicio arranca y cada hora mientras dure, **Then**
   se escribe un aviso en el registro.
3. **Given** un volumen al 70 % o menos, **When** se consulta la verificación de salud, **Then** el
   indicador aparece como correcto.

---

### Edge Cases

- **Base existente con datos que ya incumplen DT-04** (fecha que no coincide con la hora de
  inicio): la migración no los modifica; la regla se aplica solo a creaciones y ediciones. Editar
  una de esas noches sin corregir su fecha se rechaza con el mensaje de la fecha correcta.
- **Métrica sí/no con valores antiguos distintos de sí/no**: se conservan; no se reescriben.
- **Base nueva o vacía**: no se guarda respaldo previo (no hay nada que respaldar).
- **Sin espacio para el respaldo previo**: el arranque se detiene antes de migrar, con un mensaje
  claro; no se migra nunca sin respaldo.
- **Migraciones desconocidas en la base** (registradas por una versión más nueva, p. ej. tras un
  rollback): la versión anterior arranca igual y no intenta deshacerlas (expand/contract).
- **Dos instancias arrancando a la vez** sobre la misma base: solo una aplica las migraciones; la
  otra espera o falla sin corromper nada.
- **Tiempo de migración**: con una base de tamaño realista, las migraciones y el respaldo previo
  terminan dentro del margen de arranque del despliegue (20 s).
- **Verificación del volumen en local o en CI** (sin volumen dedicado): se mide el disco donde vive
  la base; si no se puede medir, el indicador es "desconocido" y no es un error.

## Requirements *(mandatory)*

### Functional Requirements

**Migraciones (US1)**

- **FR-001**: El sistema MUST aplicar las migraciones pendientes al arrancar, en orden de versión,
  antes de atender cualquier petición.
- **FR-002**: Cada migración MUST ejecutarse de forma atómica: o se aplica entera y queda
  registrada, o no se aplica nada y no queda registrada.
- **FR-003**: El sistema MUST registrar, por cada migración aplicada, su versión, su nombre, una
  huella (checksum) de su contenido y el momento de aplicación.
- **FR-004**: Si la huella de una migración ya aplicada no coincide con la registrada, el arranque
  MUST detenerse sin modificar la base, nombrando la migración.
- **FR-005**: La primera migración MUST representar el esquema actual: sobre una base existente
  se registra como aplicada sin modificar ninguna fila; sobre una base nueva crea el esquema y las
  métricas iniciales.
- **FR-006**: Ejecutar el proceso de migración sobre una base ya al día MUST ser una operación sin
  efectos.
- **FR-007**: Antes de aplicar migraciones pendientes sobre una base con datos, el sistema MUST
  guardar un respaldo local completo y consistente, identificado por la versión que se va a
  aplicar, y conservar solo los 3 más recientes.
- **FR-008**: Si el respaldo previo no puede guardarse, el sistema MUST abortar el arranque sin
  migrar.
- **FR-009**: El proceso MUST impedir que dos arranques simultáneos apliquen la misma migración.

**Rollback (US2)**

- **FR-010**: El repositorio MUST documentar la regla expand/contract: en un mismo despliegue solo
  se añaden tablas, columnas opcionales o índices; quitar, renombrar o endurecer restricciones
  sobre datos existentes se hace en un despliegue posterior, cuando ninguna versión desplegable
  dependa de lo anterior.
- **FR-011**: El repositorio MUST incluir un runbook de "rollback con restauración del respaldo
  previo a la migración", probado sobre una copia.
- **FR-012**: Las migraciones de esta feature MUST cumplir la regla: la versión anterior del
  servicio sigue funcionando sobre el esquema migrado.

**Correcciones de datos (US3)**

- **FR-013**: Las estadísticas MUST exigir un rango `from`/`to` de fechas válidas y responder
  "petición inválida" (400) si falta o es inválido (DT-02).
- **FR-014**: Los filtros `from`/`to` de noches, siestas y valores de métricas MUST validarse como
  fechas reales del calendario; si son inválidos, se responde 400 (DT-03).
- **FR-015**: Al crear o editar una noche o una siesta, su fecha MUST coincidir con el día local
  de su hora de inicio (según el desfase de esa hora); si no, se rechaza con 400 indicando la fecha
  esperada (DT-04, principio III). La fecha sigue siendo obligatoria: el servicio nunca la deriva
  ni la corrige.
- **FR-016**: En métricas sí/no MUST rechazarse cualquier valor que no represente sí o no (DT-08).
- **FR-017**: La cinta MUST mostrar todas las noches de una misma fecha (DT-11).
- **FR-018**: El cálculo de la hora media MUST devolver siempre un valor entre 0 y 1439 minutos
  (DT-21).
- **FR-019**: La base de datos MUST garantizar que como máximo exista una noche abierta; el
  servicio mantiene la respuesta 409 y el mensaje actual cuando se intenta abrir otra.
- **FR-020**: Si al migrar ya existen varias noches abiertas, la migración MUST abortar sin tocar
  datos, indicando las noches afectadas y cómo resolverlo.
- **FR-021**: Los datos existentes que incumplen FR-015 o FR-016 MUST conservarse sin cambios.
- **FR-025**: Al editar una noche en la interfaz, la fecha de la noche MUST calcularse a partir de
  "Me dormí" y mostrarse sin poder editarse por separado, de modo que la interfaz nunca envíe una
  fecha que el servicio vaya a rechazar por FR-015.

**Almacenamiento (US4)**

- **FR-022**: Cuando el uso del volumen de datos supere el 70 %, el sistema MUST escribir un aviso
  en el registro al arrancar y como máximo una vez por hora mientras dure.
- **FR-023**: La verificación de salud MUST incluir el estado del almacenamiento (correcto, aviso
  o desconocido) y el porcentaje de uso, sin datos personales ni rutas internas.
- **FR-024**: El estado de aviso del almacenamiento MUST NOT hacer que la verificación de salud
  falle.

### Key Entities *(include if feature involves data)*

- **Migración**: cambio de esquema versionado; atributos: versión (número creciente), nombre,
  huella del contenido. Es inmutable una vez aplicada.
- **Registro de migraciones**: historial en la propia base de qué migraciones se aplicaron,
  cuándo y con qué huella.
- **Respaldo previo a la migración**: copia completa de la base tomada justo antes de aplicar una
  versión; se conservan las 3 más recientes junto a la base.
- **Noche** (existente): gana la garantía de que como máximo una está abierta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Sobre una copia de la base actual, la huella de todas las filas es idéntica antes y
  después de la primera migración (0 filas alteradas).
- **SC-002**: Arrancar dos veces seguidas no aplica ninguna migración en el segundo arranque.
- **SC-003**: Una migración que falla deja la base idéntica a su estado previo en el 100 % de las
  pruebas de fallo.
- **SC-004**: Migraciones y respaldo previo terminan en menos de 20 s con una base de tamaño
  realista (al menos 10 años de noches, siestas y métricas diarias).
- **SC-005**: Ninguna petición mal formada de DT-02 y DT-03 produce un error interno (0 respuestas
  500 en la batería de pruebas).
- **SC-006**: La batería de pruebas de la versión anterior pasa al 100 % contra el esquema migrado.
- **SC-007**: El runbook de restauración se completa sobre una copia en menos de 15 minutos.
- **SC-008**: Dos intentos simultáneos de abrir noche producen exactamente una noche abierta.

## Assumptions

- La versión "anterior" para la regla expand/contract es la imagen desplegada inmediatamente
  antes; no se garantiza compatibilidad con versiones más antiguas.
- Los respaldos locales viven en el mismo volumen que la base (junto a ella); los respaldos
  diarios externos de 002 siguen siendo la protección ante la pérdida del volumen.
- Los datos existentes no se corrigen automáticamente: las nuevas reglas de validación solo se
  aplican a creaciones y ediciones.
- La interfaz ya envía fechas coherentes con la hora de inicio (usa `nightDate()`), así que FR-015
  no cambia la experiencia habitual.
- Las migraciones se escriben a mano (SQL o código) sin librerías de migración ni ORM
  (principio I).
- Esta feature no cambia la constitución; la enmienda PATCH del principio II se aplica antes de
  004.
