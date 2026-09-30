# Feature Specification: Acceso protegido y portabilidad (multiusuario, paso 1)

**Feature Branch**: `004-acceso-protegido`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: `docs/sdd/features/004-acceso-protegido.md`. Hoy cualquiera con la URL
puede leer y modificar los datos de sueño (DT-17). Como propietario quiero que solo yo pueda
entrar, sin perder la comodidad del gesto único al dormir y al despertar, y poder llevarme mis
datos:

- entrar con email y contraseña, con una sesión larga que no estorba al dormir y despertar;
- crear y recuperar la contraseña del propietario sin usar una terminal;
- defensas básicas (CSRF, CORS, límite de intentos, cabeceras);
- exportar todos mis datos;
- dejar los datos asociados a un usuario sin romper el rollback (paso 1 del multiusuario).

## Clarifications

### Session 2026-09-30

- Q: ¿Qué longitud mínima se exige a la contraseña del propietario? → A: 12 caracteres, sin
  reglas de composición (NIST 800-63B); máximo 128 (FR-011).
- Q: ¿Cómo se entrega la exportación en CSV? → A: Un CSV por tipo de dato: noches, siestas,
  métricas y valores (FR-023).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Entrar con mi cuenta (Priority: P1)

Como propietario, entro con mi email y mi contraseña y la app me recuerda durante 30 días desde
mi último uso, de modo que "Me voy a dormir" y "Ya desperté" siguen siendo un solo toque.

**Why this priority**: sin esto, los datos de salud siguen expuestos a cualquiera que tenga la URL
(DT-17); es la razón de ser de la feature.

**Independent Test**: con un propietario ya creado, abrir la app sin sesión → pantalla de entrada;
entrar → se ve la pestaña Noche; registrar dormir y despertar sin volver a pedir contraseña;
cerrar sesión → la sesión deja de servir también desde otra pestaña.

**Acceptance Scenarios**:

1. **Given** un propietario con contraseña y sin sesión, **When** abre la app, **Then** ve la
   pantalla "Entrar" y ningún dato.
2. **Given** credenciales correctas, **When** entra, **Then** accede a la app y la sesión dura 30
   días desde su último uso.
3. **Given** una sesión vigente, **When** pulsa "Me voy a dormir" o "Ya desperté", **Then** la
   acción se registra sin pedir contraseña.
4. **Given** una sesión que caducó mientras había una noche abierta, **When** vuelve a entrar,
   **Then** aterriza en Noche con esa noche abierta visible y "Ya desperté" disponible.
5. **Given** credenciales incorrectas, **When** intenta entrar, **Then** ve "Email o contraseña
   incorrectos" sin revelar cuál de los dos falló.
6. **Given** una sesión abierta, **When** pulsa "Cerrar sesión", **Then** esa sesión deja de ser
   válida en el servidor y la app vuelve a "Entrar".
7. **Given** cualquier petición a la API sin sesión válida, **When** llega, **Then** la respuesta es
   401, salvo el chequeo de salud, las rutas de autenticación y el respaldo protegido por token.

---

### User Story 2 - Alta y recuperación del propietario, sin terminal (Priority: P1)

Como propietario, la primera vez que abro la app tras el despliegue creo mi cuenta pegando un
código de alta que yo mismo configuré en el panel del proveedor de hosting; si olvido la
contraseña, cambiar ese código en el panel vuelve a abrir el alta.

**Why this priority**: sin un alta segura, la primera persona que abra la app tras el despliegue
podría quedarse con los datos; y sin recuperación, olvidar la contraseña los dejaría inaccesibles.

**Independent Test**: desplegar con un código de alta configurado → "Crea tu contraseña" con el
recuento de noches; crear la cuenta con el código → entrar; cambiar el código y reiniciar →
vuelve "Crea tu contraseña" y las sesiones anteriores ya no sirven.

**Acceptance Scenarios**:

1. **Given** una instalación sin contraseña de propietario y con código de alta configurado,
   **When** se abre la app, **Then** se ve "Crea tu contraseña" con el mensaje "Tus N noches están
   a salvo" (N = noches registradas).
2. **Given** esa pantalla, **When** se envía el código correcto, un email y una contraseña válida,
   **Then** se crea la cuenta del propietario, se inicia sesión y el código queda gastado.
3. **Given** un código incorrecto o ya gastado, **When** se envía, **Then** se rechaza sin crear
   nada y cuenta como intento fallido.
4. **Given** una instalación sin contraseña, **When** se llama a cualquier otra ruta de la API,
   **Then** la respuesta es 401.
5. **Given** un propietario que olvidó la contraseña, **When** cambia el código de alta en el panel
   del proveedor y la app se reinicia, **Then** todas las sesiones abiertas y la contraseña
   anterior quedan invalidadas y la app vuelve a "Crea tu contraseña" conservando todos los datos.
6. **Given** la migración de esta feature sobre una base con datos, **When** termina, **Then** todas
   las noches, siestas y métricas existentes pertenecen al propietario y el recuento de filas de
   cada tabla es idéntico antes y después.
7. **Given** una instalación sin código de alta configurado y sin contraseña, **When** se abre la
   app, **Then** se explica que falta configurar el código de alta (sin revelar datos) y la API
   sigue respondiendo 401.
8. **Given** que el código nunca debe viajar en la URL, **When** se usa el formulario de alta,
   **Then** el código se envía solo en el cuerpo de la petición.

---

### User Story 3 - Defensas (Priority: P1)

Como propietario, quiero que la app resista los ataques habituales de la web: peticiones
falsificadas desde otras webs, adivinar la contraseña a fuerza de intentos y agotar la memoria de
la máquina.

**Why this priority**: la autenticación sin estas defensas sigue dejando los datos expuestos.

**Independent Test**: peticiones de escritura con origen ajeno → rechazadas; 6 intentos fallidos
seguidos → 429; 10 intentos de entrada simultáneos en una máquina de 256 MB → el servicio sigue
respondiendo.

**Acceptance Scenarios**:

1. **Given** una sesión válida, **When** llega una petición que modifica datos desde otro origen
   (otra web), **Then** se rechaza con 403 sin modificar nada.
2. **Given** una web de otro origen, **When** intenta leer la API desde el navegador, **Then** el
   navegador no recibe permiso (CORS solo del mismo origen).
3. **Given** 5 intentos fallidos de entrada en 15 minutos desde la misma IP de cliente o para el
   mismo email, **When** llega el sexto, **Then** la respuesta es 429 con un mensaje que indica
   cuándo reintentar, aunque la contraseña sea correcta.
4. **Given** 10 intentos de entrada simultáneos, **When** el servicio corre con 256 MB, **Then** no
   se queda sin memoria y todas las respuestas llegan.
5. **Given** un email que no existe, **When** se intenta entrar, **Then** la respuesta tarda lo
   mismo que con un email existente (no revela qué emails existen).
6. **Given** cualquier respuesta de la app, **When** llega al navegador, **Then** incluye cabeceras
   de seguridad (política de contenido, anti-encuadre, no-sniff, referrer y transporte seguro).

---

### User Story 4 - Mis datos asociados a mí sin romper el rollback (Priority: P1)

Como propietario, quiero que todos mis registros queden asociados a mi cuenta, preparando el
multiusuario, de forma que si el despliegue falla y se vuelve a la versión anterior, esta siga
funcionando.

**Why this priority**: el pipeline hace rollback automático; si el esquema nuevo rompiera la
versión anterior, un despliegue fallido dejaría la app caída (regla expand/contract de 003).

**Independent Test**: aplicar la migración a una copia de la base de producción y ejecutar la
versión anterior del servicio contra ella.

**Acceptance Scenarios**:

1. **Given** el esquema de esta feature, **When** corre la versión anterior del servicio (003),
   **Then** puede crear, editar, listar y borrar noches, siestas y métricas, y lo que crea queda
   asociado al propietario.
2. **Given** la garantía de "una sola noche abierta", **When** se aplica esta feature, **Then**
   pasa a ser por usuario, sin cambiar el comportamiento para el propietario.
3. **Given** una migración que reconstruye tablas, **When** se aplica, **Then** no se pierde ni
   cambia ninguna fila (recuento y contenido idénticos, incluidos los valores de métricas).

---

### User Story 5 - Exportar mis datos (Priority: P2)

Como propietario, quiero descargar todos mis datos para tener una copia propia o llevármelos a
otra herramienta.

**Why this priority**: portabilidad y tranquilidad; no bloquea el uso diario.

**Independent Test**: con datos cargados, descargar la exportación JSON y reconstruir con ella una
base vacía → los recuentos coinciden; abrir los CSV en una hoja de cálculo.

**Acceptance Scenarios**:

1. **Given** un propietario con datos, **When** pulsa "Exportar (JSON)", **Then** descarga un
   archivo con todas sus noches, siestas, métricas y valores, y la fecha de exportación.
2. **Given** ese JSON, **When** se importa en una base vacía con la herramienta de pruebas,
   **Then** los recuentos de cada entidad coinciden con los del origen.
3. **Given** un propietario con datos, **When** elige exportar en CSV, **Then** puede descargar un
   archivo por tipo de dato (noches, siestas, métricas y valores), legible por una hoja de
   cálculo, con cabeceras en español y fechas ISO 8601.
4. **Given** la exportación, **When** se revisa, **Then** no contiene la contraseña, las sesiones
   ni el código de alta.

---

### Edge Cases

- **Sesión caducada a mitad de uso**: la siguiente acción recibe 401 y la app muestra "Entrar"; al
  entrar, vuelve a la pestaña en la que estaba (Noche por defecto).
- **Varios dispositivos**: cada dispositivo tiene su propia sesión; cerrar sesión en uno no cierra
  los demás. Rotar el código de alta sí los cierra todos.
- **Reloj del cliente desajustado**: la caducidad de la sesión la decide el servidor.
- **Máquina apagada por inactividad** (auto-stop): los contadores de intentos fallidos se
  reinician al arrancar; se acepta, porque cada arranque tarda segundos y el límite sigue
  aplicando dentro de cada ventana.
- **Email con mayúsculas o espacios**: se normaliza (sin espacios alrededor, sin distinguir
  mayúsculas) al crear la cuenta y al entrar.
- **Respaldo diario (workflow de 002)**: sigue funcionando con su token, sin sesión.
- **Rollback del primer despliegue de esta feature**: si falla y el pipeline vuelve a la versión
  anterior, la app queda como hoy (sin contraseña) hasta el siguiente despliegue; no empeora la
  situación actual. Los rollbacks de features posteriores vuelven a una versión que ya protege
  el acceso.
- **Exportación grande** (10 años de datos): se genera en menos de 5 s.
- **Código de alta con espacios al copiarlo**: se recortan los espacios de los extremos.

## Requirements *(mandatory)*

### Functional Requirements

**Entrada y sesión (US1)**

- **FR-001**: El sistema MUST autenticar al propietario con email y contraseña.
- **FR-002**: Una sesión válida MUST durar 30 días desde su último uso (deslizante); el servidor
  decide la caducidad.
- **FR-003**: Toda la API MUST responder 401 sin sesión válida, excepto el chequeo de salud, las
  rutas de autenticación (estado, alta, entrada, salida) y el respaldo protegido por token.
- **FR-004**: Cerrar sesión MUST invalidar la sesión en el servidor.
- **FR-005**: Las credenciales incorrectas MUST responder con un mensaje único que no revele si
  falló el email o la contraseña.
- **FR-006**: Registrar dormir y despertar MUST NOT pedir credenciales mientras la sesión sea
  válida.
- **FR-007**: La sesión MUST viajar en una cookie inaccesible desde JavaScript, solo por HTTPS,
  limitada al propio sitio; el servidor MUST guardar solo una huella del identificador de sesión.

**Alta y recuperación (US2)**

- **FR-008**: Sin contraseña de propietario, la app MUST mostrar "Crea tu contraseña" con el número
  de noches registradas, y la API (salvo las excepciones de FR-003) MUST responder 401.
- **FR-009**: El alta MUST exigir el código de alta configurado en el proveedor de hosting, enviado
  en el cuerpo de la petición; el servidor MUST guardar solo su huella y marcarlo como gastado al
  usarlo.
- **FR-010**: Si al arrancar el código de alta configurado es distinto del último registrado, el
  sistema MUST invalidar todas las sesiones y la contraseña del propietario y reabrir el alta, sin
  tocar ningún otro dato.
- **FR-011**: La contraseña MUST tener al menos 12 y como máximo 128 caracteres, sin reglas de
  composición (mayúsculas, símbolos); se admiten espacios y cualquier carácter Unicode. Si es
  demasiado corta, el mensaje lo dice y sugiere usar una frase.
- **FR-012**: Todos los datos existentes MUST quedar asociados al propietario, con recuentos
  idénticos antes y después de la migración.

**Defensas (US3)**

- **FR-013**: Las peticiones que modifican datos MUST rechazarse con 403 si no proceden del mismo
  origen, excepto el respaldo protegido por token.
- **FR-014**: CORS MUST permitir solo el mismo origen.
- **FR-015**: Tras 5 intentos fallidos (de entrada o de alta) en 15 minutos por IP real del cliente
  o por email, los siguientes intentos MUST responder 429 hasta que pase la ventana.
- **FR-016**: El servidor MUST calcular como máximo un hash de contraseña a la vez y MUST tardar lo
  mismo cuando el email no existe.
- **FR-017**: Todas las respuestas MUST incluir cabeceras de seguridad: política de seguridad de
  contenido, prohibición de encuadre, no-sniff, política de referrer y transporte estricto.

**Esquema y rollback (US4)**

- **FR-018**: Noches, siestas y métricas MUST pertenecer a un usuario; las filas creadas por la
  versión anterior del servicio MUST asignarse automáticamente al propietario.
- **FR-019**: La garantía de una sola noche abierta MUST pasar a ser por usuario.
- **FR-020**: La versión anterior del servicio MUST seguir funcionando sobre el esquema de esta
  feature (regla expand/contract).
- **FR-021**: Las reconstrucciones de tablas MUST verificar que no se pierde ni cambia ninguna fila
  antes de sustituir la tabla antigua, dentro de la misma migración (constitución v1.0.1,
  principio II).

**Exportación (US5)**

- **FR-022**: El propietario MUST poder descargar todos sus datos en JSON, con un formato
  versionado que permita reconstruir una base vacía con los mismos recuentos.
- **FR-023**: El propietario MUST poder descargar sus datos en CSV, **un archivo por tipo de
  dato** (noches, siestas, métricas y valores), con cabeceras en español, fechas ISO 8601 y
  codificación UTF-8 legible por hojas de cálculo.
- **FR-024**: La exportación MUST NOT incluir contraseñas, sesiones ni el código de alta.

### Key Entities *(include if feature involves data)*

- **Usuario**: persona con acceso; en esta feature solo existe el propietario. Atributos: email
  (único, sin distinguir mayúsculas), huella de la contraseña, rol (propietario), fecha de alta.
- **Sesión**: acceso vigente desde un dispositivo; huella del identificador, usuario, caducidad y
  último uso.
- **Estado del alta**: huella del último código de alta registrado y si ya se gastó.
- **Noche, siesta, métrica** (existentes): pasan a pertenecer a un usuario. Los valores de métricas
  pertenecen al usuario a través de su métrica.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100 % de las rutas de datos responde 401 sin sesión (verificado por una prueba
  que recorre todas las rutas registradas).
- **SC-002**: Registrar dormir o despertar con sesión vigente requiere 1 toque, igual que antes.
- **SC-003**: Tras la migración, el recuento y el contenido de cada tabla existente son idénticos
  (0 filas perdidas o alteradas, incluidos los valores de métricas).
- **SC-004**: La batería de la versión anterior del servicio pasa al 100 % sobre el esquema nuevo.
- **SC-005**: Con 256 MB y 10 intentos de entrada simultáneos, el servicio no se reinicia y el pico
  de memoria queda por debajo de 200 MB.
- **SC-006**: Una entrada con credenciales correctas responde en menos de 1 s en la máquina de
  producción.
- **SC-007**: La reconstrucción desde el JSON exportado reproduce los recuentos exactos de todas
  las entidades.
- **SC-008**: Recuperar el acceso tras olvidar la contraseña (cambiar el código, reiniciar, crear
  contraseña) lleva menos de 5 minutos sin usar una terminal.

## Assumptions

- Hay un único usuario (el propietario); invitar o registrar a más es la feature 008.
- El código de alta lo elige y guarda el propietario al configurarlo en el proveedor de hosting;
  es el mismo valor que pega en el formulario.
- El contador de intentos fallidos vive en memoria y se reinicia al arrancar la máquina (ver casos
  límite).
- La exportación se ofrece desde un menú de cuenta en la cabecera de la app, junto a "Cerrar
  sesión".
- El respaldo diario de 002 no cambia: sigue usando su token.
- Recuperar la contraseña por email, passkeys, OAuth y 2FA quedan fuera de alcance.
- La suite E2E de Playwright se adapta para iniciar sesión antes de cada prueba.
