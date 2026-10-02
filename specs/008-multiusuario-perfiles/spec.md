# Feature Specification: Multiusuario con perfiles

**Feature Branch**: `008-multiusuario-perfiles`

**Created**: 2026-10-01

**Status**: Draft

**Input**: User description: `docs/sdd/features/008-multiusuario-perfiles.md`. Otras personas usan
Descanso, cada una con su cuenta y su perfil, y nadie ve ni toca los datos de otra. El propietario
decide quién entra (por invitación). Constitución v2.0.0: alcance multiusuario con aislamiento
estricto; el borrado a petición del propio dueño no es DROP.

## Clarifications

### Session 2026-10-01

- Q: El perfil incluye "objetivo de sueño" y "preferencias de racha y recordatorios", pero esas
  funciones llegan con 005, 010 y 011. ¿Qué entra ahora? → A: Lo básico (nombre visible, email,
  zona horaria, cambio de contraseña) **más el objetivo de sueño**. Las preferencias de racha y
  recordatorios las añaden 010 y 011.
- Q: Los respaldos contendrán datos de salud de todos los usuarios. ¿Cifrado en el cliente dentro
  de 008 o aparte? → A: Dentro de 008: el respaldo diario se cifra antes de salir hacia el
  almacenamiento externo.
- Q: ¿Qué pasa si el propietario intenta borrar su propia cuenta mientras hay otros usuarios?
  → A: No se permite mientras existan otros usuarios; sí puede exportar sus datos.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Invitar a alguien (Priority: P1)

Como propietario, genero un enlace de invitación de un solo uso y se lo envío a la persona por el
medio que yo elija; con él, esa persona crea su cuenta tras leer y aceptar la política de
privacidad.

**Why this priority**: es la única puerta de entrada de nuevos usuarios; sin ella no hay
multiusuario.

**Independent Test**: el propietario genera una invitación; en otro navegador, abrir el enlace,
aceptar la política y registrarse → la nueva persona entra a una app vacía con sus 3 métricas
iniciales. Reusar el enlace o usarlo tras 72 h falla.

**Acceptance Scenarios**:

1. **Given** el propietario con sesión, **When** pulsa "Invitar a alguien", **Then** obtiene un
   enlace que puede copiar, válido 72 horas y para un solo uso.
2. **Given** un enlace de invitación válido, **When** la persona lo abre, **Then** ve el texto
   honesto: "Nadie ve tus datos desde la app. Quien administra el servidor tiene acceso técnico a
   la base y a los respaldos, y se compromete a no usarlo", y la política de privacidad.
3. **Given** ese formulario, **When** la persona escribe nombre, email y contraseña y **acepta
   explícitamente** la política, **Then** se crea su cuenta, entra y ve la app vacía con sus 3
   métricas iniciales.
4. **Given** que no marca la aceptación, **When** intenta registrarse, **Then** no puede.
5. **Given** un enlace ya usado, caducado o inventado, **When** se intenta registrar, **Then** la
   respuesta es 403 y no se crea nada.
6. **Given** un email ya registrado, **When** se usa en el registro, **Then** se rechaza sin
   gastar la invitación.
7. **Given** una invitación pendiente, **When** el propietario la revoca, **Then** deja de servir.
8. **Given** una persona que no es propietaria, **When** intenta generar invitaciones, **Then** se
   le deniega (403).

---

### User Story 2 - Mis datos solo los veo yo (Priority: P1)

Como usuario, todo lo que registro (noches, siestas, métricas y sus valores) es solo mío: nadie
más lo ve, lo modifica ni lo borra desde la app, tampoco el propietario.

**Why this priority**: es la garantía central del multiusuario (constitución v2.0.0); un fallo
aquí expone datos de salud de otra persona.

**Independent Test**: con dos usuarios A y B con datos, recorrer todos los endpoints como B
usando identificadores de A → todos responden como si no existieran y los datos de A no cambian.

**Acceptance Scenarios**:

1. **Given** dos usuarios con datos, **When** cada uno consulta listados, resumen o exportación,
   **Then** solo aparecen sus filas.
2. **Given** un recurso (noche, siesta, métrica o valor) de A, **When** B intenta leerlo,
   editarlo o borrarlo, **Then** la respuesta es 404 y el recurso de A no cambia.
3. **Given** que A tiene una noche abierta, **When** B abre la suya, **Then** puede: la regla de
   "una sola noche abierta" es por usuario, y "la noche abierta actual" de cada uno es la suya.
4. **Given** el propietario, **When** usa la app, **Then** tampoco ve los datos de los demás
   usuarios.
5. **Given** un usuario recién registrado, **When** entra por primera vez, **Then** tiene sus
   propias 3 métricas iniciales y ninguna noche ni siesta.

---

### User Story 3 - Mi perfil (Priority: P1)

Como usuario, veo y edito mi nombre visible, mi email, mi zona horaria (propuesta desde el
navegador) y mi objetivo de sueño, y puedo cambiar mi contraseña.

**Why this priority**: identifica a cada persona en la app y fija los datos por usuario (zona
horaria, objetivo) que usarán 005, 010 y 013.

**Independent Test**: editar cada campo y verlo persistido tras recargar; cambiar la contraseña
y comprobar que las otras sesiones se cierran.

**Acceptance Scenarios**:

1. **Given** mi perfil, **When** cambio el nombre visible (1 a 60 caracteres), **Then** se guarda
   y aparece en el menú de cuenta.
2. **Given** mi perfil, **When** cambio mi email, **Then** se me pide la contraseña actual; si el
   email ya lo usa otra persona, se rechaza sin revelar de quién es.
3. **Given** que no tengo zona horaria guardada, **When** abro el perfil, **Then** se propone la
   del navegador, que puedo aceptar o cambiar por otra zona horaria válida.
4. **Given** mi objetivo de sueño, **When** lo fijo entre 4 h y 12 h, **Then** se guarda; fuera de
   ese rango se rechaza. Sin fijar, vale 8 h.
5. **Given** que cambio mi contraseña, **When** doy la actual correcta y una nueva válida (12 a
   128 caracteres), **Then** se actualiza y se cierran mis otras sesiones; la actual sigue abierta.
6. **Given** una contraseña actual incorrecta, **When** intento cambiar email o contraseña,
   **Then** se rechaza y cuenta como intento fallido (límite de intentos de 004).

---

### User Story 4 - Recuperar mi contraseña (Priority: P2)

Como usuario que olvidó su contraseña, pido ayuda al propietario, que me genera un enlace de un
solo uso para elegir una nueva; al entrar, sé que mi contraseña fue restablecida y puedo ver
quién lo hizo y cuándo.

**Why this priority**: sin email, es la única vía de recuperación para usuarios que no son
propietarios.

**Independent Test**: el propietario genera un enlace de recuperación para un usuario; con él,
elegir una contraseña nueva → todas las sesiones anteriores de ese usuario se cierran, al entrar
ve el aviso y en su perfil aparece la entrada en el registro de auditoría.

**Acceptance Scenarios**:

1. **Given** la pantalla "Entrar", **When** alguien pulsa "¿Olvidaste tu contraseña?", **Then**
   ve el mismo mensaje exista o no la cuenta: pedir un enlace a quien administra Descanso.
2. **Given** el propietario, **When** genera un enlace de recuperación para un usuario, **Then**
   obtiene un enlace de un solo uso válido 30 minutos.
3. **Given** ese enlace, **When** la persona elige una contraseña nueva válida, **Then** se
   cierran todas sus sesiones, puede entrar con la nueva y el enlace deja de servir.
4. **Given** que su contraseña fue restablecida, **When** entra, **Then** ve "Tu contraseña fue
   restablecida el …" una vez.
5. **Given** su perfil, **When** consulta "Actividad de la cuenta", **Then** ve las acciones del
   propietario sobre su cuenta (generar enlace de recuperación, restablecimiento) con quién y
   cuándo.
6. **Given** un enlace caducado, usado o inventado, **When** se usa, **Then** se rechaza sin
   revelar si la cuenta existe.
7. **Given** el propietario que olvidó su propia contraseña, **When** necesita recuperarla,
   **Then** sigue usando la rotación del código de alta de 004, que **solo** afecta a su cuenta.

---

### User Story 5 - Exportar y borrar mi cuenta (Priority: P2)

Como usuario, exporto mis datos y puedo borrar mi cuenta y todo lo mío.

**Why this priority**: portabilidad y derecho de supresión; obligatorios para datos de salud de
terceros.

**Independent Test**: exportar como B → solo datos de B; borrar la cuenta de B → 0 filas de B en
la base y las de A intactas.

**Acceptance Scenarios**:

1. **Given** dos usuarios, **When** cada uno exporta (JSON o CSV), **Then** solo obtiene sus datos.
2. **Given** un usuario, **When** pide borrar su cuenta, **Then** se le exige la contraseña y se le
   informa de que sus datos desaparecen de inmediato de la app y de los respaldos en 14 días como
   máximo.
3. **Given** la confirmación con contraseña correcta, **When** se borra la cuenta, **Then** quedan
   0 filas suyas en la base (noches, siestas, métricas, valores, sesiones, perfil, invitaciones
   usadas y registro de auditoría) y los datos de los demás no cambian.
4. **Given** el propietario con otros usuarios, **When** intenta borrar su cuenta, **Then** se le
   explica que no es posible mientras existan otros usuarios.

---

### User Story 6 - Consentimiento y transparencia (Priority: P2)

Como persona invitada, antes de registrarme leo una política de privacidad breve y la acepto de
forma explícita; después puedo volver a leerla.

**Why this priority**: son datos de salud de terceros (RGPD art. 9 si hay usuarios en la UE);
el consentimiento explícito y la transparencia son condición para el registro.

**Independent Test**: leer la política desde la invitación y desde el menú de cuenta; comprobar
que la cuenta registra cuándo y qué versión se aceptó.

**Acceptance Scenarios**:

1. **Given** la política, **When** se lee, **Then** explica en lenguaje claro: qué datos de salud
   se guardan, para qué, quién tiene acceso técnico, cómo exportarlos y borrarlos, y la retención
   de 14 días de los respaldos.
2. **Given** el registro, **When** se acepta, **Then** la cuenta guarda la fecha y la versión de la
   política aceptada.
3. **Given** cualquier usuario con sesión, **When** abre "Privacidad" desde el menú de cuenta,
   **Then** ve la misma política.

---

### User Story 7 - Respaldos cifrados (Priority: P2)

Como propietario, quiero que las copias diarias que salen del servidor estén cifradas, porque
contienen datos de salud de todos los usuarios.

**Why this priority**: con varios usuarios, un respaldo filtrado expondría a terceros.

**Independent Test**: lanzar el respaldo → el archivo subido no es una base SQLite legible sin la
clave; el runbook de restauración lo descifra y la base restaurada pasa la verificación de
integridad.

**Acceptance Scenarios**:

1. **Given** el respaldo diario, **When** se sube al almacenamiento externo, **Then** está cifrado
   con una clave que solo conoce el propietario (secreto del pipeline), y sin la clave no se puede
   leer.
2. **Given** la clave, **When** se sigue el runbook de restauración, **Then** se descifra y la base
   pasa la verificación de integridad antes de restaurarla.
3. **Given** que falta la clave de cifrado, **When** corre el respaldo, **Then** falla sin subir
   nada en claro.

---

### Edge Cases

- **Invitación abierta por alguien que ya tiene sesión**: se le pide cerrar sesión antes de
  registrar otra cuenta.
- **Dos personas usan el mismo enlace a la vez**: solo una cuenta se crea; la otra recibe 403.
- **Email con distinta capitalización** (`Ana@x.com` vs `ana@x.com`): es el mismo email.
- **Zona horaria desconocida** o inventada: se rechaza; el navegador sin zona propone UTC.
- **Usuario sin zona horaria** (el propietario existente): el perfil propone la del navegador; los
  datos anteriores no cambian (las horas guardan su propio desfase, principio III).
- **Sesiones del propietario al rotar el código de alta**: solo se cierran las suyas; las de los
  demás usuarios siguen abiertas.
- **Borrar la cuenta con una noche abierta**: se borra igual.
- **Restablecer la contraseña del propietario desde el panel**: no se ofrece (usa la rotación de
  004).
- **Rollback a la versión anterior (004)**: la versión anterior no filtra por usuario. El rollback
  **automático** solo vuelve a la imagen inmediatamente anterior: en el primer despliegue de 008
  solo existe el propietario (las invitaciones nacen con 008), así que es inocuo; los despliegues
  siguientes vuelven a 008 o superior, que sí filtra. Un rollback **manual** por debajo de 008
  con otros usuarios registrados expondría datos ajenos: el runbook de rollback MUST prohibirlo
  explícitamente (FR-024).
- **Filas antiguas sin usuario explícito**: ya pertenecen al propietario (004).

## Requirements *(mandatory)*

### Functional Requirements

**Invitaciones y registro (US1, US6)**

- **FR-001**: Solo el propietario MUST poder generar, listar y revocar invitaciones.
- **FR-002**: Una invitación MUST ser de un solo uso, caducar a las 72 horas y viajar en el enlace
  de forma que no llegue al servidor en la URL de la petición; el servidor MUST guardar solo su
  huella.
- **FR-003**: Registrarse sin una invitación válida MUST responder 403 sin crear nada.
- **FR-004**: El registro MUST exigir nombre visible, email único, contraseña de 12 a 128
  caracteres y la aceptación explícita de la política vigente, cuya fecha y versión se guardan.
- **FR-005**: Un usuario nuevo MUST empezar con sus propias 3 métricas iniciales.
- **FR-006**: La invitación y la política MUST incluir el texto honesto sobre el acceso técnico de
  quien administra el servidor.

**Aislamiento (US2)**

- **FR-007**: Toda lectura y escritura de datos de usuario MUST limitarse al usuario de la sesión;
  un recurso de otro usuario MUST responder 404, como si no existiera.
- **FR-008**: La regla de una sola noche abierta y la consulta de la noche abierta MUST ser por
  usuario.
- **FR-009**: El propietario MUST NOT acceder a los datos de otros usuarios desde la app.
- **FR-010**: El aislamiento MUST verificarse con una suite automática de dos usuarios que recorra
  todos los endpoints de datos, y con una comprobación automática de que toda tabla con datos de
  usuario pertenece a un usuario (constitución v2.0.0).

**Perfil (US3)**

- **FR-011**: El usuario MUST poder ver y editar su nombre visible (1–60 caracteres), su zona
  horaria (identificador IANA válido, propuesta desde el navegador) y su objetivo de sueño (4–12 h,
  8 h por defecto).
- **FR-012**: Cambiar el email o la contraseña MUST exigir la contraseña actual; cambiar la
  contraseña MUST cerrar las demás sesiones del usuario.
- **FR-013**: Los intentos con contraseña actual incorrecta MUST contar para el límite de intentos.

**Recuperación (US4)**

- **FR-014**: El propietario MUST poder generar para otro usuario un enlace de recuperación de un
  solo uso, válido 30 minutos, del que el servidor guarda solo la huella.
- **FR-015**: Usar el enlace MUST permitir fijar una contraseña nueva, cerrar todas las sesiones de
  esa persona y mostrarle una vez el aviso de restablecimiento al entrar.
- **FR-016**: Las acciones del propietario sobre la cuenta de otra persona MUST quedar en un
  registro de auditoría (acción, quién, cuándo) que esa persona puede consultar en su perfil.
- **FR-017**: "¿Olvidaste tu contraseña?" MUST mostrar el mismo mensaje exista o no la cuenta.
- **FR-018**: La rotación del código de alta (004) MUST afectar solo a la cuenta del propietario.

**Exportación y borrado (US5)**

- **FR-019**: La exportación MUST incluir solo los datos del usuario de la sesión.
- **FR-020**: Borrar la cuenta MUST exigir la contraseña, eliminar todas las filas del usuario de
  la base viva y no tocar las de otros; la pantalla MUST informar de la purga de los respaldos en
  14 días como máximo.
- **FR-021**: El propietario MUST NOT poder borrar su cuenta mientras existan otros usuarios.

**Respaldos (US7)**

- **FR-022**: El respaldo diario MUST cifrarse antes de salir del entorno del pipeline, con una
  clave guardada como secreto; sin clave MUST fallar sin subir nada en claro.
- **FR-023**: El procedimiento de restauración MUST explicar cómo descifrar y verificar la copia.

**Operación**

- **FR-024**: Los runbooks de rollback MUST prohibir volver manualmente a una versión anterior a
  008 cuando existan usuarios además del propietario, y explicar la alternativa (corregir hacia
  delante o restaurar un respaldo).

### Key Entities *(include if feature involves data)*

- **Usuario**: propietario o usuario; nombre visible, email único, huella de contraseña, zona
  horaria, objetivo de sueño, fecha y versión de la política aceptada.
- **Invitación**: huella del enlace, quién la creó, caducidad, quién la usó y cuándo, o si fue
  revocada.
- **Recuperación de contraseña**: huella del enlace, usuario, caducidad y uso.
- **Registro de auditoría**: usuario afectado, actor, acción y fecha.
- **Noche, siesta, métrica, valor** (existentes): pertenecen siempre a un usuario.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: La suite de aislamiento recorre el 100 % de los endpoints de datos con dos usuarios y
  0 respuestas exponen o modifican datos ajenos.
- **SC-002**: El 100 % de las tablas con datos de usuario pertenecen a un usuario o están en la
  lista de tablas hijas justificadas.
- **SC-003**: Una persona invitada crea su cuenta y registra su primera noche en menos de 3
  minutos.
- **SC-004**: Tras borrar una cuenta, quedan 0 filas de esa persona y los recuentos del resto no
  cambian.
- **SC-005**: El 100 % de los respaldos subidos están cifrados (no son legibles como SQLite sin la
  clave).
- **SC-006**: El propietario recupera el acceso de un usuario (enlace generado y contraseña nueva
  fijada) en menos de 5 minutos.

## Assumptions

- El propietario envía las invitaciones y los enlaces de recuperación por su cuenta (mensajería,
  en persona); la app no envía emails.
- La recuperación por enlace del propietario se considera adecuada mientras haya pocos usuarios
  (≤ 5, UX-12); la recuperación por email queda para una feature futura.
- Roles: solo propietario y usuario; no hay compartición de datos entre usuarios.
- La quitada del valor por defecto "propietario" en `user_id` (contracción de 004) se hace en un
  despliegue posterior, no en esta feature.
- El cifrado de respaldos depende de que exista el almacenamiento externo (tarea T014 de 002, en
  curso por el usuario); 008 deja el workflow y el runbook listos.
- La política de privacidad es la misma para todos y está versionada; un cambio de versión no
  obliga a reaceptar en esta feature.
