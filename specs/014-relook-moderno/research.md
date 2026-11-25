# Research: Re-look moderno, sobrio y nocturno (014)

Fuente externa: `GoogleChrome/modern-web-guidance` (Apache 2.0), commit `2b4aa13` (2026-11-23), carpeta
`skills/modern-web-guidance/guides/` y su `SKILL.md`. Se leyó en una carpeta temporal fuera del
repositorio; aquí solo se cita cada guía por su ruta (relativa a `guides/`) y se resume la idea. La
auditoría visual la hizo el agente `ui-ux` y la viabilidad el agente `frontend` (con `npx ng build`).

## R0. Auditoría del frontend actual

| Área | Estado actual (master `c43594b`) | Hallazgo |
|------|----------------------------------|----------|
| Estilos globales y tokens | `frontend/src/styles.css` (3.492 B): tokens por tono (`--night-2`, `--moon-deep`), sin capas. Hex sueltos en hovers (`#2d376a`, `#bcc6ff`, `#ffc98a`), `rgba(234,122,112,…)` en `.error` y ~8 colores de categoría en Métricas. | No reaccionan al tema; hay que tokenizarlos por rol. |
| Tipografía | `html, body { font-size: 16px }`, h2 1,35 rem, sin escala fluida. Bricolage Grotesque desde Google Fonts (`index.html` l. 10–12). | El `px` en la raíz anula la preferencia de letra (`accessibility/respect-os-text-scale.md` §5). Dependencia externa DT-20 (`specs/001-linea-base/research.md`). |
| Modo oscuro | Solo oscuro: `color-scheme: dark`, `theme-color #131a33`. | No hay tema claro ni lectura de la preferencia. |
| Layout y responsive | Columnas de 720 px; 8 `@media (max-width: …px)` en `app.css` y features. | Umbrales en `px` y por viewport; no siguen la escala de texto ni el ancho del contenedor. |
| Foco | `outline: 2px solid var(--dawn)` en botones y campos; el menú Cuenta usa `--moon`. | Funciona, pero con dos colores; no hay token de foco. |
| Contraste | Medido: texto y acentos pasan AA; **`--line` (borde de campos) 1,58:1 y 1,40:1**. | Bordes de campos por debajo de 3:1 (WCAG 1.4.11). |
| Objetivos táctiles | `.tab` móvil ≈ 34 px; `.btn-sm` y `.btn-ghost` < 44 px. | Por debajo de 44 px. |
| Movimiento reducido | Anulación global con `!important` en `styles.css`; animaciones de `streak-card` y `bedtime-notice` con su propia regla. | Cumple, pero conviene declarar el movimiento solo con `no-preference` (`ui-behaviors/motion.md`). |
| Formularios y errores | `role="alert"` en ~19 plantillas para mensajes; ningún `aria-invalid` ni `aria-describedby`. | Errores por campo no expuestos (`accessibility/accessible-error-announcement.md`). |
| Diálogos | `confirm()` en `metrics.component.ts:139`, `naps.component.ts:89`, `night.component.ts:322`. | Sin estilo, textos secos, foco no controlado (`ui-components/dialog.md`). |
| Transiciones de vista | Ninguna; cambio instantáneo de pestaña por signal. | Mejora opcional (P3). |
| Peso | CSS global inicial 2.789 B (1.132 B gzip); estilos de componentes ≈ 21,3 kB dentro del JS; `main` 391,56 kB (95,44 kB transferidos). Budgets: `initial` 600 kB/1 MB, `anyComponentStyle` 12/20 kB. | Los budgets de Angular no aíslan el CSS global. |
| Aviso médico y "sin dato" | Aviso en `app.html` con `--ink-dim` y borde `--line`. "—" en horas medias. | Se mantiene; mejora de contraste. Se detecta el "0 min" de promedio sin noches (pregunta aparte, fuera de alcance). |

## R1. Guías: cuáles aplican y por qué

| Guía (`guides/…`) | ¿Se aplica? | Historia | Motivo |
|-------------------|-------------|----------|--------|
| `css/css.md` | Sí | US1 | Arquitectura con `@layer`, custom properties y nesting. |
| `css/design-token-reactivity.md` | Sí | US1 | Tokens que reaccionan al tema y al contexto. |
| `visual-design/dark-mode.md` | Sí | US1 | `color-scheme` en `:root` y `<meta>`, tokens claro/oscuro, `accent-color`. |
| `visual-design/color.md` | Sí | US1, US2 | Contraste 4,5:1 y 3:1 de componentes; forced colors; sin tintes ingenuos. |
| `visual-design/browser-ui-theming.md` | Sí | US1 | Controles nativos y scroll que siguen el tema. |
| `ui-atoms/component-specific-light-dark-theme.md` | Parcial | US1 | Solo para fijar el telón del diálogo igual en ambos temas. |
| `ui-components/dark-mode-toggle.md` | No (decisión) | — | Recomienda no añadir selector si no hace falta; Q1 elige solo el sistema. |
| `visual-design/typography.md` | Sí | US1, US2 | Sin `px` en tamaños de texto; sin alturas fijas en botones; 200 % y 320 px. |
| `css/fluid-scaling.md` | Sí | US1 | `clamp()` con `rem` + `vw` para títulos. |
| `visual-design/visually-stable-font-fallbacks.md` | Sí | US1 | `size-adjust`/`font-size-adjust` del respaldo para evitar saltos. |
| `performance/optimize-preload-priority.md` | Sí | US1 | Precarga de la fuente autoalojada. |
| `security/secure-external-subresources.md` | Sí | US1 | Quitar el recurso de terceros (fuente) y su permiso en la CSP. |
| `privacy/privacy.md` | Sí | US1 | Evitar filtrar visitas de una app de salud a un tercero. |
| `accessibility/accessibility.md` | Sí | US2 | Landmarks, encabezados, foco, nombres accesibles. |
| `accessibility/respect-os-text-scale.md` | Sí | US2 | `<meta name="text-scale">`, raíz sin tamaño fijo, umbrales en `rem`. |
| `ui-behaviors/motion.md` | Sí | US2, US6 | Movimiento solo con `no-preference`; estado final visible. |
| `user-experience/form-factor-adaptation.md` | Sí | US2, US5 | Objetivos táctiles, componentes que responden a su contenedor. |
| `ui-components/dialog.md` | Sí | US3 | `<dialog>` + `showModal()`, `autofocus` en la acción segura, `closedby`. |
| `ui-behaviors/platform-controls-dismiss-dialog.md` | Sí | US3 | Esc y gesto atrás cierran. |
| `ui-behaviors/light-dismiss-a-dialog.md` | No (decisión) | — | Q3: tocar fuera no cierra un diálogo destructivo. |
| `ui-behaviors/prevent-page-scroll-under-modal-dialog.md` | Sí | US3 | Bloqueo del scroll de fondo con `:has(dialog[open])`. |
| `ui-behaviors/animate-to-from-top-layer.md` | Parcial | US3, US6 | Entrada del diálogo con `@starting-style`, solo opacidad con `no-preference`. |
| `ui-behaviors/declarative-dialog-popover-control.md` | No | — | `command`/`commandfor` no encaja con un diálogo que devuelve una promesa a código Angular; se abre por `showModal()`. |
| `accessibility/accessible-error-announcement.md` | Sí | US4 | `:user-invalid` + `aria-invalid` + `aria-describedby` sincronizados. |
| `forms/validate-input-after-interaction.md` | Sí | US4 | Validar tras interactuar, no al entrar. |
| `forms/required-field-feedback.md` | Sí | US4 | Indicar obligatorios en texto. |
| `forms/forms.md` | Sí | US4 | Etiquetas, `autocomplete`, tipos de entrada. |
| `forms/autofill-sign-in-form.md`, `forms/autofill-sign-up-form.md` | Parcial | US4 | Revisar `autocomplete` en entrar, alta y restablecer; sin cambiar el flujo. |
| `forms/switch.md` | No | — | Los interruptores de 013 ya existen; `switch` nativo no es Baseline. |
| `css/size-aware-styling.md` | Sí | US5 | Container queries en los hosts de componente. |
| `css/responsive-design.md` | Sí | US5 | Umbrales en `rem`, sin `px`. |
| `css/style-parent-with-has.md` | Sí | US3, US4 | `:has()` para bloquear scroll y marcar el campo con error. |
| `ui-atoms/responsive-table.md` | Parcial | US5 | Solo para `chart-table` (tabla alternativa a los gráficos). |
| `ui-components/tabs.md` | No | — | Propone `tablist` con `focusgroup` (no Baseline); la navegación actual con `aria-current` y su orden de foco se mantienen (FR-026). |
| `ui-components/menu.md`, `ui-components/navbar.md` | No | — | El menú Cuenta con `<details>` ya es accesible por teclado; cambiarlo no lo pide la spec. |
| `ui-behaviors/same-document-transitions.md` | Sí | US6 | `document.startViewTransition` envolviendo el cambio de signal, con detección. |
| `performance/faster-spa-view-transitions.md` | No | — | Cachea vistas en memoria; Descanso tiene 4 pestañas ligeras. |
| `ui-components/card.md` | Parcial | US6 | Paneles como tarjetas sin sombras en oscuro. |
| `performance/performance.md` | Parcial | US1 | Presupuestos (SC-005); el resto ya está cubierto por el build. |
| `pwa/install-web-app.md`, `pwa/migrate-web-app-origin.md` | No | — | 012 (PWA) está descartada; el service worker solo hace push. |
| `html/*` (web components, shadow DOM) | No | — | Angular ya da componentes; no se crean custom elements. |
| `security/passkey-*`, `forms/sms-otp-form.md`, `forms/autofill-payment-form.md`, `forms/autofill-address-form.md` | No | — | Fuera del alcance visual; sin pagos ni direcciones. |
| `ui-behaviors/scroll-*`, `parallax-*`, `carousel-*`, `ui-components/carousel.md` | No | — | Efectos decorativos contrarios a una interfaz nocturna y sobria (principio VI). |
| `built-in-ai/*`, `wasm/*`, `webmcp/*`, `js/*` | No | — | No relacionados con la capa visual. |

## R2. Tokens de color por rol con `light-dark()`

**Decisión**: un único bloque de tokens en `@layer tokens` de `styles.css`, con `color-scheme: light dark`
en `:root` y cada color como `light-dark(<claro>, <oscuro>)`, precedido por el valor oscuro actual como
respaldo para navegadores sin `light-dark()`. Valores (propuesta de `ui-ux`, medidos con la fórmula de
luminancia de WCAG 2.x):

| Token | Claro | Oscuro |
|-------|-------|--------|
| `--surface` | `#f4f2ee` | `#12172b` |
| `--surface-raised` | `#fbfaf7` | `#1a2140` |
| `--surface-sunken` | `#eae7e0` | `#0d1122` |
| `--surface-hover` | `#e6e3db` | `#232b52` |
| `--line` (decorativa) | `#d9d5cc` | `#2b3460` |
| `--line-strong` (bordes de controles) | `#767b95` | `#6b75a8` |
| `--ink` | `#1c2140` | `#e6e4f0` |
| `--ink-muted` | `#4a5070` | `#a9aecb` |
| `--ink-faint` (y `--no-data`) | `#5e6482` | `#8f95b8` |
| `--accent` (luna) / `--on-accent` | `#3f4fb8` / `#fbfaf7` | `#a9b5f5` / `#12172b` |
| `--accent-2` (amanecer, texto) | `#8a4f0c` | `#f0b46a` |
| `--accent-2-fill` / `--on-accent-2` | `#f0b46a` / `#2e1d02` | igual |
| `--danger` / `--danger-bg` | `#b3362b` / `#f8e9e5` | `#f08a80` / `#2a2238` |
| `--success` | `#1f6b45` | `#7fd3a8` |
| `--focus` | `#2a3aa0` | `#ffd08a` |

Contrastes medidos (mínimo; claro / oscuro): `--ink` sobre superficies 12,68 / 12,52; `--ink-muted` 6,13 /
6,24; `--ink-faint` 4,52 (sobre hover) / 4,65; `--line-strong` 3,38 / 3,55; `--accent` 5,63 / 7,95;
`--on-accent` 6,66 / 8,97; `--accent-2` 6,28 / 8,57; `--on-accent-2` 8,85; `--danger` 5,11 / 6,25; texto
sobre `--danger` relleno 5,78 / 7,31; `--success` 6,20 / 8,82; `--focus` 7,69 / 10,96. Todos AA. El foco
contra el relleno de un botón luna no llega a 3:1 (≈ 1,4), por eso va separado con `outline-offset: 2px`
sobre la superficie.

**Razón**: `light-dark()` es Baseline 2024 (Chrome 123) y evita duplicar bloques por tema
(`visual-design/dark-mode.md`, `css/design-token-reactivity.md`). Nombres por rol permiten cambiar la
paleta sin tocar componentes.

**Alternativas**: `@media (prefers-color-scheme)` con dos bloques (más CSS y duplicación); `[data-theme]`
con JS (solo necesario con selector manual, descartado en Q1).

## R3. Tema solo del sistema

**Decisión**: sin selector; `<meta name="color-scheme" content="light dark">` y dos
`<meta name="theme-color" media="(prefers-color-scheme: …)">`.

**Razón**: sin estado, sin script anti-parpadeo, sin `localStorage` (principio VI;
`ui-components/dark-mode-toggle.md`).

**Alternativas**: selector de 3 estados en Cuenta (aplazado; los tokens ya lo admitirían).

## R4. Tipografía fluida y escala de texto del sistema

**Decisión**: raíz sin `font-size`; `<meta name="text-scale" content="scale">`; escala
`--fs-xs .8125rem`, `--fs-sm .875rem`, `--fs-base 1rem`, `--fs-md clamp(1.0625rem, 1rem + .25vw,
1.125rem)`, `--fs-lg clamp(1.25rem, 1.1rem + .6vw, 1.5rem)`, `--fs-xl clamp(1.5rem, 1.25rem + 1vw, 2rem)`,
`--fs-num clamp(1.75rem, 1.4rem + 1.5vw, 2.5rem)`; interlineado 1,5 (cuerpo) y 1,2 (títulos); pesos 400,
600 y 700 (solo marca). Sin alturas fijas en elementos con texto: `min-block-size: 2.75rem` en controles.

**Razón**: `accessibility/respect-os-text-scale.md`, `visual-design/typography.md`, `css/fluid-scaling.md`.

**Alternativas**: tamaños en `px` con `@media` (no siguen la preferencia); solo `vw` (no escala con zoom).

## R5. Fuente autoalojada

**Decisión**: Bricolage Grotesque variable (eje `wght` 400–700; `opsz` fijado), subconjunto latino, un
`woff2` en `frontend/public/fonts/` con `OFL.txt`; `@font-face` con `font-display: swap`, `<link
rel="preload" as="font" type="font/woff2" crossorigin>`; respaldo `system-ui, 'Segoe UI', Roboto,
sans-serif` con un `@font-face` local ajustado (`size-adjust`). CSP: se quitan
`https://fonts.googleapis.com` de `style-src` y `https://fonts.gstatic.com` de `font-src`. Presupuesto:
≤ 60 kB (si no se alcanza, se usa la pila del sistema; Q2). Se quita el bloqueo de Google Fonts en
`e2e/support/fixtures.ts` y se documenta en `docs/testing/e2e-playwright.md`.

**Razón**: elimina la dependencia externa DT-20, simplifica la CSP (principio V), no filtra visitas a un
tercero (`privacy/privacy.md`, `security/secure-external-subresources.md`) y conserva la marca.

**Alternativas**: pila del sistema (0 kB, pierde identidad); paquete npm `@fontsource-variable/*`
(dependencia innecesaria para un archivo estático).

## R6. Capas, nesting, `color-mix()` y encapsulación de Angular

**Decisión**: `@layer reset, tokens, base, components, utilities;` al inicio de `styles.css`. Los estilos
de componente se envuelven en `@layer components { … }` para que el orden de capas valga (sin capa
ganarían siempre). Nesting nativo permitido (el builder lo baja si el target lo pide). Estados derivados
con `color-mix(in oklab, …)` sobre tokens, no con hex nuevos.

**Razón**: `css/css.md`. Verificado por `frontend`: la encapsulación emulada añade `_ngcontent` dentro de
`@layer` sin problemas; esbuild conserva `light-dark()` y `color-mix()`.

**Alternativas**: sin capas (especificidad creciente); `ViewEncapsulation.None` (riesgo de fugas).

## R7. Foco, objetivos táctiles, hover y movimiento

**Decisión**: un único `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }` en
`base` (cumple el `solid 2px` que ya asierta `accesibilidad.spec.ts`). `min-block-size` y
`min-inline-size: 2.75rem` en `.btn`, `.tab` y `summary`; `.btn-sm` reduce el texto, no el área. Hover
dentro de `@media (hover: hover)`. Transiciones declaradas solo dentro de
`@media (prefers-reduced-motion: no-preference)`; se conserva la anulación global como red de seguridad.
Tokens de movimiento: `--dur-fast 120ms`, `--dur-base 200ms`, `--ease-out cubic-bezier(.2,.7,.3,1)`.

**Razón**: `ui-behaviors/motion.md`, `user-experience/form-factor-adaptation.md`, `visual-design/color.md`
(forced colors: el foco es `outline`, no `box-shadow`).

**Alternativas**: anillo con `box-shadow` (desaparece en forced colors).

## R8. Diálogo de confirmación

**Decisión**: `ConfirmService` en `frontend/src/app/shared/confirm/` con
`ask({ title, body, confirmLabel }): Promise<boolean>` y un `ConfirmDialogComponent` montado una vez en
`app.html` con `<dialog closedby="closerequest">` abierto por `showModal()`. Botones dentro de
`<form method="dialog">`: "Conservar" (`value="keep"`, `autofocus`) y "Borrar" (`value="confirm"`,
`.btn-danger-solid`). Resultado leído de `returnValue` en `close`; Esc/atrás → `false`. Un pedido nuevo
con otro abierto resuelve el anterior en `false`. Scroll de fondo bloqueado con
`html:has(dialog[open]) { overflow: hidden }`. Foco: el navegador lo devuelve al invocador al cerrar; tras
borrar, el componente lo lleva al encabezado de la lista (`tabindex="-1"`). Textos sin culpa ("¿Borrar
esta noche?", "No se puede recuperar"). Contrato en `contracts/confirm-dialog.md`.

Impacto en pruebas: `spyOn(window, 'confirm')` en `night.component.spec.ts`, `metrics.component.spec.ts`
y `naps.component.spec.ts` pasa a un `ConfirmService` falso; `answerNextDialog` de
`e2e/support/fixtures.ts` (usado en `metricas`, `noches-pasadas` y `siestas`) pasa a pulsar el botón
del diálogo por rol y devolver su texto.

**Razón**: `ui-components/dialog.md`, `ui-behaviors/platform-controls-dismiss-dialog.md`,
`ui-behaviors/prevent-page-scroll-under-modal-dialog.md`. `<dialog>` modal da capa superior, `inert` del
fondo y Esc sin JS propio.

**Alternativas**: Angular CDK `Dialog` (dependencia nueva sin necesidad); un diálogo por componente
(triplica código); `command="show-modal"` declarativo (no devuelve el resultado a código).

## R9. Errores de formulario

**Decisión**: estilos visuales con `:user-invalid` y `:has(:user-invalid)` en el `.field`; una directiva
pequeña `appFieldError` (`shared/forms/field-error.directive.ts`) que sincroniza `aria-invalid` (`false`
hasta que coincida `:user-invalid`) y `aria-describedby` con el id del mensaje, escuchando `blur`,
`change`, `input` e `invalid`. Al enviar con errores, foco al primer `:invalid`. Mensaje de envío o de
servidor en un único `<p role="alert">` por formulario (ya existe en la mayoría). Etiquetas con
"(obligatorio)". Formularios: entrar, alta inicial, registro, restablecer y olvido de contraseña,
personas, perfil, noche manual, siesta, métrica y valor, objetivo, horario, ajustes de ciclos y racha,
avisos y bienvenida (~13 archivos).

**Razón**: `accessibility/accessible-error-announcement.md`, `forms/validate-input-after-interaction.md`,
`forms/required-field-feedback.md`, `css/style-parent-with-has.md`.

**Alternativas**: `aria-live` por campo (ruido); validar al escribir (interrumpe).

## R10. Layout con container queries

**Decisión**: `:host { display: block; container-type: inline-size }` en los componentes con rejillas
(night, naps, metrics, trends, my-schedule, profile) y `@container (width < 30rem)` / `(width < 22rem)`
en lugar de los `@media (max-width: …px)`. Los `@media` restantes, en `rem`. Ancho máximo del contenido en
`min(45rem, 100%)`.

**Razón**: `css/size-aware-styling.md`, `css/responsive-design.md`,
`user-experience/form-factor-adaptation.md`. Con umbrales en `rem` el layout reacciona a la letra al
200 %.

**Alternativas**: solo `@media` en `rem` (no reacciona al espacio real del componente).

## R11. Transiciones de vista sin router

**Decisión**: método `navigate(fn)` en `App` que, si existe `document.startViewTransition` y no hay
`prefers-reduced-motion: reduce`, llama `document.startViewTransition(async () => { fn();
await appRef.whenStable(); })`; si no, `fn()`. Animación por defecto (fundido) acortada a
`--dur-base` en `::view-transition-old/new(root)`; `animation: none` con movimiento reducido. El foco no se
mueve (Q5). En Karma, `startViewTransition` queda sin definir (camino directo). En Playwright se fija
`reducedMotion: 'reduce'` por defecto en el config, salvo en el test que comprueba la transición.

**Razón**: `ui-behaviors/same-document-transitions.md`, `ui-behaviors/motion.md`.

**Alternativas**: animaciones de Angular (`@angular/animations`, más peso y deprecado en favor de CSS);
`withViewTransitions()` del router (no hay router).

## R12. Estrategia de pruebas de accesibilidad y visuales

**Decisión**:
- `@axe-core/playwright` **4.14.1** (versión exacta) como devDependency de `e2e/`. Nuevo
  `e2e/tests/accesibilidad-axe.spec.ts`: por cada pestaña (con sus plegables abiertos, reutilizando
  `expandTab`), la pantalla de entrar, Mi perfil y el diálogo abierto, en `colorScheme` `light` y
  `dark`, `AxeBuilder.withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'])` y
  `violations` vacío. Los "incomplete" (p. ej. contraste con `color-mix()`) se registran en el reporte.
- **Texto al 200 %**: en `accesibilidad.spec.ts`, viewport 320 × 640 y `page.addStyleTag({ content:
  'html { font-size: 200% }' })`; asertos: `scrollWidth <= clientWidth` del documento, botones clave
  visibles y sin texto recortado (`scrollWidth <= clientWidth` en `.btn`, `.tab`, encabezados).
- **Contraste de tokens**: en el mismo spec de Playwright, para cada tema, se resuelven los colores de los
  tokens en el navegador (un elemento de prueba con `color: var(--token)` y `getComputedStyle`) y se
  recalcula el ratio WCAG de cada par de `contracts/design-tokens.md`; así se mide el CSS real, sin
  duplicar la paleta en TypeScript.
- **Objetivos táctiles y movimiento**: asertos de estilo computado (≥ 44 px; duración 0 s con `reduce`).
- **Sin terceros**: el e2e registra las peticiones y falla si alguna no es al host local.
- **Presupuesto**: `scripts/check-styles.mjs` tras `ng build` en CI (crudo y gzip de
  `dist/frontend/browser/styles-*.css`); `anyComponentStyle` baja a 6/8 kB en `angular.json`.
- **Lighthouse**: manual (Lighthouse 13 en Chrome DevTools, modo móvil), en ambos temas, antes de cerrar;
  resultado anotado en el PR.
- **Visual**: sin `toHaveScreenshot` en CI (diferencias de fuente y antialiasing entre Windows y Linux);
  revisión manual con capturas de las cuatro pestañas en ambos temas en el quickstart.

**Razón**: axe cubre automáticamente contraste, nombres y roles; las capturas serían frágiles y caras
de mantener (principio VI).

**Alternativas**: Lighthouse CI en cada PR (+1–3 min y ruido); `pa11y` (otra herramienta más);
capturas en Docker (infraestructura nueva).

## R13. Framework de UI

**Decisión**: ninguno. CSS nativo con tokens, `@layer` y `<dialog>`.

**Razón**: principio I; el CSS global son 2,8 kB; Angular Material añadiría estilos y JS propios, estilos
en línea dinámicos que obligarían a revisar la CSP y reescribir selectores de pruebas; Spartan exige
Tailwind (cambio de pila). Ninguno se justifica para cinco vistas y un diálogo.

**Alternativas**: Angular Material + CDK; Spartan/Tailwind; Angular CDK `a11y` solo (innecesario con
`<dialog>`).
