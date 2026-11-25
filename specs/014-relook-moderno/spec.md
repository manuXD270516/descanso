# Feature Specification: Re-look moderno, sobrio y nocturno

**Feature Branch**: `014-relook-moderno`

**Created**: 2026-11-25

**Status**: Draft

**Input**: User description: `docs/sdd/features/014-relook-moderno.md`. Que Descanso se vea y se use
mejor de noche: tema claro u oscuro según el teléfono, colores y medidas con nombre de rol, contraste
AA en ambos temas, foco visible, respeto por el tamaño de letra del sistema y por "reducir movimiento",
un diálogo propio en lugar del `confirm()` del navegador, errores de formulario anunciados, un layout
que se adapta a su espacio y transiciones suaves entre vistas. Solo cambia la capa visual y la
accesibilidad; no cambian datos, API ni reglas de negocio. Rigen el principio VII (accesible en
español) y el VIII (aviso "No es un dispositivo médico" visible, "sin dato" no es 0, nada de
puntuaciones).

## Clarifications

### Session 2026-11-25 (auto-clarify, a revisar por el owner)

- Q: ¿Tema solo del sistema o también un selector dentro de la app? → A: **Solo el del sistema**. Es la
  opción más simple (sin estado ni script de arranque); un selector puede sumarse después en Cuenta sin
  tocar los tokens.
- Q: ¿La fuente de la marca se autoaloja o se pasa a la fuente del sistema? → A: **Se autoaloja
  Bricolage Grotesque** (licencia OFL, un solo archivo variable con subconjunto latino) y la app deja de
  pedir recursos a terceros. Si su peso supera el presupuesto de FR-005, se usa la fuente del sistema.
- Q: ¿El diálogo de borrado se cierra al tocar fuera? → A: **No**: se cierra con "Conservar", con Esc o
  con el gesto atrás; tocar fuera no hace nada (evita cierres accidentales a oscuras). El foco inicial
  va a "Conservar".
- Q: ¿Lighthouse corre en cada CI? → A: **No**: la puntuación de Lighthouse se mide a mano antes de
  cerrar la feature (quickstart); en CI corre axe dentro de los e2e, que es lo que frena regresiones.
- Q: Al cambiar de pestaña con transición, ¿a dónde va el foco? → A: **Se queda en la pestaña pulsada**
  (como hoy); la transición es solo un fundido y no mueve el foco.

## Glosario

- **Tema**: juego de colores claro u oscuro. Lo elige el sistema operativo del teléfono o del PC.
- **Token**: valor de diseño con nombre de rol (por ejemplo, "superficie elevada" o "texto tenue") que
  usan todos los componentes en lugar de un color o una medida sueltos.
- **Contraste AA**: mínimo de WCAG 2.2 nivel AA: 4,5:1 para texto normal, 3:1 para texto grande,
  bordes de controles, iconos y el anillo de foco.
- **Texto al 200 %**: el tamaño de letra base del navegador o del sistema duplicado.
- **Diálogo de confirmación**: ventana propia de la app, modal, que pide confirmar un borrado.
- **Transición de vista**: fundido breve entre el contenido de una pestaña o vista y el de la siguiente.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tema claro y oscuro con tokens (Priority: P1)

Como persona que abre Descanso de noche o de día, la app usa el tema de mi teléfono: oscuro y apagado
de noche si así lo tengo, claro y tibio si no; los colores y medidas son coherentes en todas las
pantallas y la app ya no pide la fuente a un servidor externo.

**Why this priority**: es la base de todo el re-look: sin tokens por rol no se pueden garantizar el
contraste ni el tema claro, y las demás historias se construyen sobre ellos.

**Independent Test**: con el sistema en oscuro y luego en claro, recorrer las cuatro pestañas y las
vistas de Cuenta: todo cambia de tema, ningún color queda "fijo" del otro tema, la barra del navegador
acompaña y la red no muestra peticiones a dominios de terceros.

**Acceptance Scenarios**:

1. **Given** el sistema en tema oscuro, **When** abro la app, **Then** veo el tema oscuro y la barra del
   navegador usa el color de fondo oscuro.
2. **Given** el sistema en tema claro, **When** abro la app, **Then** veo el tema claro, sin fondo blanco
   puro, y los controles nativos (fechas, selectores, barras de scroll) también en claro.
3. **Given** la app abierta, **When** cambio el tema del sistema, **Then** la app cambia sin recargar.
4. **Given** cualquier pantalla, **When** inspecciono su estilo, **Then** los colores salen de tokens con
   nombre de rol y no hay colores sueltos en los componentes (los de categorías de Métricas incluidos).
5. **Given** la app cargando, **When** miro las peticiones de red, **Then** ninguna va a un dominio que
   no sea el del propio servicio, y la fuente de la marca se ve igual que antes.

---

### User Story 2 - Accesibilidad base: contraste, foco, texto y movimiento (Priority: P1)

Como persona que usa la app con poca luz, con letra grande o con teclado, leo todo con contraste
suficiente, veo siempre dónde está el foco, la app respeta el tamaño de letra que elegí y no se mueve si
pedí reducir el movimiento.

**Why this priority**: es el mínimo del principio VII y lo que medirán los criterios de éxito; también
protege la visibilidad del aviso médico y de "sin dato" (principio VIII).

**Independent Test**: correr axe en cada pestaña en ambos temas (0 violaciones AA), navegar con Tab por
cada pestaña viendo un anillo de foco, abrir la app con la letra al 200 % y a 320 px de ancho (sin
scroll horizontal ni texto cortado) y con "reducir movimiento" (sin animaciones).

**Acceptance Scenarios**:

1. **Given** cualquiera de los dos temas, **When** se mide el contraste de cada par texto/fondo de la
   tabla de tokens, **Then** todos llegan a 4,5:1 (texto normal) y los bordes de campos, iconos y foco a
   3:1.
2. **Given** cualquier control interactivo, **When** recibe el foco del teclado, **Then** muestra el mismo
   anillo de 2 px con contraste ≥ 3:1 sobre el fondo, también el menú Cuenta y el diálogo.
3. **Given** el tamaño de letra del navegador o del sistema al 200 % y 320 px de ancho, **When** recorro
   las cuatro pestañas con sus formularios abiertos, **Then** no hay scroll horizontal, ningún texto
   queda cortado o superpuesto y todos los botones se pueden usar.
4. **Given** Chrome en Android con un tamaño de fuente del sistema mayor, **When** abro la app, **Then** el
   texto crece con esa preferencia.
5. **Given** "reducir movimiento" activo, **When** uso la app (pestañas, botones, diálogo, aviso de
   hora), **Then** no hay transiciones ni animaciones de desplazamiento, y todo termina en su estado
   final visible.
6. **Given** una pantalla táctil, **When** mido pestañas, botones (también los pequeños) y el menú
   Cuenta, **Then** su zona tocable mide al menos 44 × 44 px.
7. **Given** las pestañas Noche, Tendencias y Siestas, **When** se muestran, **Then** el aviso "No es un
   dispositivo médico" está visible, no se puede ocultar y tiene contraste AA; y donde falta un registro
   se muestra "Sin dato" o "—" con nombre accesible, nunca 0.

---

### User Story 3 - Confirmar un borrado con un diálogo propio (Priority: P2)

Como persona que borra una noche, una siesta o una métrica, veo un diálogo de la app que me dice qué
se borra y me deja conservar o borrar, sin la ventana gris del navegador.

**Why this priority**: mejora una acción destructiva (hoy con el `confirm()` nativo) pero no bloquea la
base visual.

**Independent Test**: borrar una noche, una siesta y una métrica, cancelando primero (con "Conservar" y
con Esc) y confirmando después; comprobar el foco inicial, el foco al cerrar y que el fondo no se
desplaza con el diálogo abierto.

**Acceptance Scenarios**:

1. **Given** una noche registrada, **When** pulso su botón de borrar, **Then** se abre un diálogo modal
   con el título "¿Borrar esta noche?", la fecha de la noche, el aviso de que no se puede recuperar y
   los botones "Conservar" y "Borrar", con el foco en "Conservar".
2. **Given** el diálogo abierto, **When** pulso "Conservar", Esc o el gesto atrás, **Then** se cierra, no
   se borra nada y el foco vuelve al botón que lo abrió.
3. **Given** el diálogo abierto, **When** toco fuera de él, **Then** sigue abierto.
4. **Given** el diálogo abierto, **When** pulso "Borrar", **Then** se borra el registro y el foco pasa al
   encabezado de la lista.
5. **Given** una métrica con registros, **When** la borro, **Then** el diálogo nombra la métrica y dice que
   se borran también sus registros.
6. **Given** el diálogo abierto, **When** intento desplazar la página de fondo, **Then** no se mueve y no
   se puede interactuar con ella.

---

### User Story 4 - Formularios con errores anunciados (Priority: P2)

Como persona que completa un formulario (entrar, registrar una noche o siesta, una métrica, el horario,
el perfil), si algo está mal lo veo junto al campo, sin depender solo del color, y mi lector de
pantalla me lo dice.

**Why this priority**: mejora la accesibilidad de todos los formularios, pero cada uno ya funciona hoy.

**Independent Test**: en cada formulario, dejar un campo obligatorio vacío o un valor fuera de rango,
salir del campo y enviar: el campo queda marcado (borde, icono y texto), el lector de pantalla lo
anuncia y, al enviar, el foco va al primer campo con error.

**Acceptance Scenarios**:

1. **Given** un campo obligatorio vacío, **When** entro y salgo de él sin escribir, **Then** se marca como
   inválido y muestra su mensaje; **When** solo entro en él, **Then** no se marca.
2. **Given** un campo marcado, **When** lo corrijo, **Then** el mensaje desaparece y deja de estar marcado.
3. **Given** un formulario con errores, **When** lo envío, **Then** no se envía, el foco va al primer
   campo con error y el error se anuncia.
4. **Given** un error que devuelve el servidor (por ejemplo, credenciales incorrectas), **When** llega,
   **Then** se anuncia una sola vez en el mensaje del formulario.
5. **Given** un campo obligatorio, **When** lo leo, **Then** su etiqueta indica "(obligatorio)" en texto.

---

### User Story 5 - Layout que se adapta a su espacio (Priority: P2)

Como persona que usa la app en el móvil, en una tablet o en el PC, los paneles, resúmenes y listas se
reacomodan según el espacio que tienen y siguen bien con la letra grande.

**Why this priority**: hoy el layout ya es responsive; esto lo hace robusto con texto grande y anchos
intermedios.

**Independent Test**: a 320, 375, 768 y 1280 px, y con la letra al 200 %, las rejillas de resumen,
formularios en dos o tres columnas y listas de registros pasan a una columna cuando su contenedor se
estrecha, sin scroll horizontal.

**Acceptance Scenarios**:

1. **Given** el resumen de Noche, **When** su contenedor mide menos que el umbral, **Then** pasa de cuatro a
   dos columnas, y luego a una.
2. **Given** la letra al 200 % en una pantalla ancha, **When** el contenido ya no cabe, **Then** las
   rejillas se reacomodan igual que en una pantalla estrecha (los umbrales están en `rem`).
3. **Given** cualquier vista, **When** cambio el ancho de la ventana, **Then** el contenido nunca supera
   el ancho de la ventana.

---

### User Story 6 - Transiciones entre vistas y pulido (Priority: P3)

Como persona que cambia de pestaña o abre una vista de Cuenta, el cambio es un fundido corto y la
interfaz se siente pulida (estados de los botones, cabecera compacta, bordes y sombras por tema).

**Why this priority**: es mejora de percepción; no cambia lo que se puede hacer.

**Independent Test**: cambiar entre las cuatro pestañas y Mi perfil: hay un fundido ≤ 200 ms donde el
navegador lo permite, el foco queda en la pestaña pulsada; con "reducir movimiento" o en un navegador
sin soporte, el cambio es instantáneo.

**Acceptance Scenarios**:

1. **Given** un navegador compatible, **When** cambio de pestaña, **Then** el contenido hace un fundido
   de ≤ 200 ms y la pestaña pulsada conserva el foco.
2. **Given** "reducir movimiento" activo o un navegador sin soporte, **When** cambio de pestaña, **Then**
   el cambio es inmediato, sin errores.
3. **Given** una transición en curso, **When** pulso otra pestaña, **Then** termina en la última pulsada.
4. **Given** un dispositivo con puntero, **When** paso el puntero por un botón, **Then** cambia su fondo;
   en táctil, el estado hover no se queda pegado.

---

### Edge Cases

- **Navegador sin `light-dark()`** (WebView antiguo): se ve el tema oscuro actual (valor de respaldo
  declarado antes).
- **Sistema en claro de noche**: se ve el claro tibio; no se fuerza el oscuro (supuesto revisable).
- **Navegador sin `<meta name="text-scale">`**: la app sigue la escala de zoom y de letra del navegador
  porque todo está en `rem`.
- **Fuente que no carga**: se ve la fuente del sistema con métricas ajustadas, sin saltos grandes de
  layout.
- **Navegador sin `closedby`**: el diálogo sigue cerrándose con Esc y atrás; tocar fuera no lo cierra
  (que es lo pedido).
- **Dos borrados seguidos**: no puede haber dos diálogos a la vez; el segundo pedido reemplaza al
  primero, que cuenta como "Conservar" (no borra nada).
- **Borrar falla en el servidor**: el diálogo se cierra, el error se muestra como hoy y nada se da por
  borrado.
- **Sesión caducada con el diálogo abierto**: al volver a la pantalla de entrar, el diálogo se cierra sin
  borrar.
- **Forced colors (alto contraste de Windows)**: bordes, foco y estado de error siguen visibles (no
  dependen de sombras ni de fondos).
- **Transición de vista interrumpida o con error**: el estado final (la pestaña elegida) se aplica igual.
- **Gráficos**: barras y leyendas usan los tokens de categoría con 3:1 contra la superficie; "sin dato"
  se distingue por forma (trazo discontinuo o "—"), no solo por color.

## Requirements *(mandatory)*

### Functional Requirements

**Tema y tokens (US1)**

- **FR-001**: La interfaz MUST seguir la preferencia de tema del sistema (claro u oscuro) y cambiar en
  vivo si la preferencia cambia; no hay selector propio.
- **FR-002**: Colores, tipografías, espacios, radios, elevación y duraciones MUST definirse como tokens
  con nombre de rol en un único lugar global; los componentes MUST usar solo tokens (también los colores
  de categorías y de gráficos).
- **FR-003**: El tema claro MUST NOT usar blanco puro de fondo y el oscuro MUST NOT usar negro puro; los
  controles nativos (fechas, selectores, scroll) MUST adoptar el tema.
- **FR-004**: El color de la barra del navegador MUST acompañar cada tema.
- **FR-005**: La fuente de la marca MUST servirse desde el propio servicio, en un único archivo de
  ≤ 60 kB, con la licencia junto a ella; la app MUST NOT pedir recursos a dominios de terceros y la
  política de seguridad de contenidos MUST dejar de permitirlos. Si la fuente no carga, MUST verse la
  del sistema con métricas ajustadas.

**Accesibilidad base (US2)**

- **FR-006**: Todo par texto/fondo MUST llegar a 4,5:1 y todo borde de control, icono informativo y
  anillo de foco a 3:1, en ambos temas.
- **FR-007**: Todo control interactivo MUST mostrar al recibir el foco de teclado un único anillo de 2 px
  sólido, separado del control, con el token de foco.
- **FR-008**: La app MUST respetar el tamaño de letra del navegador y del sistema: sin tamaño fijo en la
  raíz, tamaños de texto y umbrales de layout en unidades relativas, y aceptación explícita de la escala
  de texto del sistema operativo donde el navegador lo admita.
- **FR-009**: Con el texto al 200 % y 320 px de ancho, MUST NOT haber scroll horizontal ni pérdida de
  contenido o funcionalidad en ninguna vista.
- **FR-010**: Pestañas, botones (también los pequeños), el menú Cuenta y los botones del diálogo MUST
  tener una zona tocable ≥ 44 × 44 px.
- **FR-011**: Con "reducir movimiento", MUST NOT haber transiciones, animaciones ni transiciones de vista
  con desplazamiento; el estado final MUST quedar visible.
- **FR-012**: El aviso "No es un dispositivo médico" MUST seguir visible y no descartable donde se
  muestran datos de sueño, con contraste AA en ambos temas.
- **FR-013**: La ausencia de dato MUST seguir mostrándose como ausencia ("Sin dato" o "—" con nombre
  accesible), distinguible por forma y no solo por color; ningún color MUST sugerir que un resultado de
  sueño es "bueno" o "malo".
- **FR-014**: La estructura de la página MUST mantener un único `main`, la navegación con nombre y
  encabezados en orden.

**Diálogo de confirmación (US3)**

- **FR-015**: Borrar una noche, una siesta o una métrica MUST pedir confirmación con un diálogo modal de
  la app, con título, descripción de lo que se borra (fecha de la noche o de la siesta; nombre de la
  métrica y "y sus registros") y la indicación de que no se puede recuperar.
- **FR-016**: El diálogo MUST ofrecer "Conservar" (foco inicial) y "Borrar" (estilo de peligro);
  MUST cerrarse sin borrar con "Conservar", Esc o el gesto atrás, y MUST NOT cerrarse al tocar fuera.
- **FR-017**: Con el diálogo abierto, el resto de la página MUST quedar inerte y sin desplazamiento; al
  cerrarse sin borrar, el foco MUST volver al control que lo abrió; tras borrar, al encabezado de la
  lista.
- **FR-018**: La app MUST NOT usar `confirm()`, `alert()` ni `prompt()` del navegador.

**Formularios (US4)**

- **FR-019**: Cada campo con error MUST marcarse con borde, icono y texto (no solo color), con el estado
  inválido y el mensaje expuestos a la tecnología de asistencia.
- **FR-020**: Los errores de un campo MUST aparecer al salir del campo o al enviar, no al entrar ni
  mientras se escribe, y desaparecer al corregirse.
- **FR-021**: Al enviar con errores, el formulario MUST NOT enviarse y el foco MUST ir al primer campo con
  error; los errores del servidor MUST anunciarse una vez en el mensaje del formulario.
- **FR-022**: Los campos obligatorios MUST indicarlo en el texto de su etiqueta.

**Layout (US5)**

- **FR-023**: Las rejillas de resumen, de formularios en varias columnas y de listas MUST reacomodarse
  según el ancho de su contenedor, con umbrales en unidades relativas al texto.

**Transiciones y pulido (US6)**

- **FR-024**: El cambio de pestaña y de vista de Cuenta MUST hacer un fundido ≤ 200 ms donde el navegador
  lo admita, sin mover el foco; sin soporte o con "reducir movimiento", el cambio MUST ser inmediato.
- **FR-025**: Los estados hover MUST aplicarse solo en dispositivos con puntero; activo, deshabilitado y
  error MUST ser coherentes en todos los botones y campos.

**Transversales**

- **FR-026**: La feature MUST NOT cambiar datos, API, esquema, textos de negocio ni el orden de foco de la
  navegación actual (pestañas → menú Cuenta → contenido).
- **FR-027**: Los textos nuevos (diálogo, errores, etiquetas) MUST estar en español y pasar la prueba de
  términos prohibidos (principio VIII).
- **FR-028**: La interfaz MUST NOT incorporar librerías ni frameworks de UI.

### Key Entities *(include if feature involves data)*

- **Token de diseño**: nombre de rol, valor claro, valor oscuro (para colores) o valor único (medidas,
  duraciones). Vive en el estilo global; no se persiste.
- **Pedido de confirmación**: título, descripción, texto del botón destructivo y resultado (conservar o
  borrar). Vive solo mientras el diálogo está abierto.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Lighthouse Accesibilidad ≥ 95 en Noche, Tendencias, Siestas, Métricas y Mi perfil, en tema
  claro y oscuro (medido a mano antes de cerrar la feature).
- **SC-002**: 0 violaciones de axe con las reglas WCAG 2.0/2.1/2.2 A y AA en cada pestaña (con sus
  formularios abiertos), en el diálogo abierto y en la pantalla de entrar, en ambos temas, dentro de los
  e2e de CI.
- **SC-003**: 100 % de los pares de la tabla de contraste de tokens cumplen AA en ambos temas (prueba
  automática que recalcula los ratios desde los valores de los tokens).
- **SC-004**: 0 regresiones: todos los e2e existentes pasan (con el ajuste mecánico del diálogo propio).
- **SC-005**: CSS global inicial ≤ 10 kB crudo y ≤ 3 kB gzip; ningún estilo de componente > 8 kB; la
  fuente ≤ 60 kB; el JS inicial no crece más de 5 kB transferidos. Un check de CI falla si se superan.
- **SC-006**: Con el texto al 200 % y 320 px de ancho, 0 px de scroll horizontal en las cuatro pestañas y
  en Mi perfil, con formularios abiertos y datos.
- **SC-007**: 0 peticiones a dominios de terceros al cargar la app (e2e sin bloquear dominios externos).
- **SC-008**: 0 usos de `confirm()`, `alert()` y `prompt()` en el código del frontend.
- **SC-009**: Con "reducir movimiento", la duración de transición y animación computada es 0 s en
  botones, pestañas, diálogo y aviso de hora.
- **SC-010**: 100 % de los controles interactivos de las cuatro pestañas tienen zona tocable ≥ 44 px de
  alto a 375 px de ancho.

## Assumptions

- Los usuarios usan Chrome en Android reciente (Baseline 2024: `light-dark()`, `@layer`, `:has()`,
  container queries, `<dialog>`, view transitions de un mismo documento). Para lo que no es Baseline
  amplio (`closedby`, `<meta name="text-scale">`) se acepta la degradación descrita en Edge Cases.
- La identidad (luna y amanecer, Bricolage Grotesque) se conserva; cambia la ejecución, no la marca.
- Los gráficos actuales se mantienen; solo se tokenizan sus colores.
- La 012 (PWA instalable) sigue descartada; el service worker de push no cambia.

## Assumptions (auto-clarify)

Respuestas elegidas en modo `--auto` con la opción más simple compatible con la constitución. El owner
debería revisarlas:

1. **Tema solo del sistema**, sin selector (Clarifications Q1). Riesgo: con el sistema en claro, de noche
   se ve el claro tibio.
2. **Fuente autoalojada** (Q2) en vez de la del sistema; si supera 60 kB, se cae a la del sistema.
3. **Diálogo sin cierre al tocar fuera**, foco en "Conservar", botones "Conservar" y "Borrar" (Q3).
4. **Lighthouse manual** en el quickstart; axe automático en CI (Q4).
5. **El foco no se mueve** al cambiar de pestaña con transición (Q5), para no romper la navegación por
   teclado actual.
6. **Sin pruebas visuales por captura en CI**: las capturas dependen del sistema y la fuente; se verifica
   con axe, estilos computados y una revisión manual con capturas en el quickstart.
7. **Presupuesto de CSS** fijado en 10 kB crudo / 3 kB gzip (hoy 2,79 kB / 1,13 kB), con margen para dos
   temas, capas, diálogo y estados.
8. **Paleta de tokens** propuesta por el agente `ui-ux` (research R2); los colores de categorías de
   Métricas se eligen en la implementación con el mismo umbral de 3:1.
