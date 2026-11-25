# Feature 014 – Re-look moderno, sobrio y nocturno

> **Estado: en diseño (2026-11-25).** Solo cambia la capa visual y la accesibilidad del frontend; no
> toca datos, API ni reglas de negocio. Referencia externa: el repositorio público
> `GoogleChrome/modern-web-guidance` (Apache 2.0, commit `2b4aa13`), carpeta
> `skills/modern-web-guidance/guides/`. Se citan las guías por su ruta; no se copia su texto.

Quiero que Descanso se vea y se use mejor de noche, con el móvil en la mano y poca atención: un aspecto
sobrio y nocturno que siga el tema claro u oscuro del teléfono, que respete el tamaño de letra que elegí
en Android, que se lea bien en los dos temas y que no me interrumpa con ventanas del navegador al
borrar algo. Todo con CSS y HTML nativos, sin sumar una librería de UI.

## Historias

### (P1) Tema claro y oscuro con tokens

- La app sigue la preferencia de tema del sistema (claro u oscuro), sin selector propio.
- El oscuro es el actual afinado; el claro es tibio y apagado (nunca blanco puro) para no deslumbrar.
- Los colores, tipografías, espacios, radios y duraciones salen de tokens con nombre de rol
  (superficie, texto, acento, peligro, foco, "sin dato"), no de valores sueltos en cada componente.
- La barra del navegador (`theme-color`) acompaña el tema.
- La fuente de la marca se sirve desde el propio servicio: la app deja de pedir recursos a terceros.

### (P1) Accesibilidad base

- Todo texto y todo borde de control llegan a contraste AA en los dos temas (4,5:1 texto; 3:1 bordes,
  iconos y anillo de foco).
- El foco del teclado se ve siempre, con un único anillo de 2 px.
- La app respeta el tamaño de letra del sistema y funciona con el texto al 200 %, sin scroll horizontal
  ni texto cortado.
- Los objetivos táctiles miden al menos 44 × 44 px (pestañas, botones, menú Cuenta).
- Con "reducir movimiento" no hay desplazamientos ni animaciones; el estado final siempre se ve.
- El aviso "No es un dispositivo médico" sigue visible donde hay datos de sueño, con mejor contraste;
  "sin dato" se sigue mostrando como ausencia, nunca como 0.

### (P2) Diálogo de confirmación propio

- Borrar una noche, una siesta o una métrica abre un diálogo de la app (no el `confirm()` del navegador)
  con título, qué se borra, y dos botones: "Conservar" (con el foco) y "Borrar".
- Esc o el gesto atrás de Android cierran sin borrar; al cerrar, el foco vuelve a un lugar lógico.

### (P2) Formularios con errores anunciados

- Cada campo con error lo marca (borde y texto, no solo color) y el lector de pantalla lo anuncia.
- Los errores aparecen al salir del campo o al enviar, no mientras escribo.
- Si el envío falla, el foco va al primer campo con error.

### (P2) Layout que se adapta al espacio

- Paneles, resúmenes y listas se reacomodan según el ancho de su contenedor (no solo de la pantalla) y
  los cortes se expresan en `rem`, para que sigan la escala de texto.

### (P3) Transiciones de vista y pulido

- Cambiar de pestaña o de vista de Cuenta hace un fundido corto; con "reducir movimiento", ninguno.
- Pulido final: estados hover y activo coherentes, sombras y bordes por tema, cabecera compacta.

## Criterios medibles

- Lighthouse Accesibilidad ≥ 95 en cada pestaña, en ambos temas.
- 0 violaciones de axe (WCAG 2.0/2.1/2.2 A y AA) en los e2e, en ambos temas.
- Contraste AA en ambos temas (tabla de pares medida en la spec).
- Sin regresiones en los e2e existentes.
- CSS global inicial ≤ 10 kB crudo y ≤ 3 kB gzip (hoy 2,79 kB y 1,13 kB); ningún estilo de componente
  > 8 kB.
- Todo funciona con texto al 200 % y a 320 px de ancho.

## Fuera de alcance

- Selector manual de tema (claro/oscuro/sistema) dentro de la app.
- Librerías o frameworks de UI (Angular Material, Spartan, Tailwind…).
- Router de Angular, URLs por pestaña o cambios de navegación.
- PWA instalable, manifiesto o caché offline (la 012 quedó descartada).
- Pruebas visuales por captura (`toHaveScreenshot`) en CI.
- Rediseño de gráficos o nuevas visualizaciones; solo se tokenizan sus colores.
- Cambios de textos de negocio, de datos, de API o de esquema.
- Corregir el "0 min" de promedio sin noches del resumen de Noche (se registra como pregunta aparte).

## Contexto técnico

- **Stack:** Angular 21 standalone + signals, sin router (las pestañas cambian con el signal `tab` de
  `App`; las vistas de Cuenta con `accountView`); Express 5 sirve el build con CSP en
  `backend/src/auth/middleware.js`; service worker propio `/push-sw.js` (solo push); Fly; usuarios en
  Android + Chrome.
- **Auditoría y viabilidad:** hechas con los agentes `ui-ux` y `frontend` (ver research de la spec).
  Medición actual: CSS global 2.789 B (1.132 B gzip); estilos de componentes ≈ 21 kB en el JS.
- **CSS moderno nativo:** custom properties, `light-dark()` + `color-scheme`, `@layer`, nesting,
  `color-mix()`, container queries, `:has()`, `:user-invalid`, `<dialog>` + `showModal()`,
  `document.startViewTransition`, `<meta name="text-scale">`.
- **Fuente:** Bricolage Grotesque (OFL) autoalojada en `frontend/public/fonts/` (woff2 variable,
  subconjunto latino); se quitan `fonts.googleapis.com` y `fonts.gstatic.com` de la CSP (deuda DT-20 de
  `specs/001-linea-base/research.md`).
- **`confirm()` nativo:** `features/metrics/metrics.component.ts`, `features/naps/naps.component.ts` y
  `features/night/night.component.ts`; e2e con `answerNextDialog` en `e2e/support/fixtures.ts`.
- **Pruebas:** `@axe-core/playwright` (versión exacta) en `e2e/tests/accesibilidad.spec.ts`, ambos temas
  con `emulateMedia({ colorScheme })`; texto al 200 % con la fuente raíz al 200 % y 320 px; check de
  presupuesto de CSS en CI tras `ng build`; Lighthouse manual en el quickstart.
- **Constitución:** I (sin librería de UI; una devDependency de pruebas en `e2e/`), V (CSP del único
  servicio), VI (sin selector de tema, sin capturas en CI), VII (foco, responsive, movimiento reducido),
  VIII (aviso médico visible, "sin dato" ≠ 0, nada de puntuaciones ni rojo/verde de "bien/mal").
