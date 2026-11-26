# Tasks: Re-look moderno, sobrio y nocturno

**Input**: Design documents from `specs/014-relook-moderno/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: obligatorios (principio IV). Se escriben antes de implementar y deben fallar primero.
Pruebas de la constitución: no hay migración (II: expand/contract no aplica, data-model) ni cálculos de
fechas nuevos (III), pero las suites existentes de fecha de la noche, aislamiento de dos usuarios y
términos prohibidos (VIII, que ya recorre `frontend/src` y cubre los textos nuevos) MUST seguir en verde
(T044).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede ir en paralelo (archivos distintos, sin dependencias pendientes).
- **[Story]**: historia de la spec (US1…US6).

---

## Phase 1: Setup

- [X] T001 [P] Añadir `"@axe-core/playwright": "4.14.1"` (versión **exacta**) a `devDependencies` de `e2e/package.json` con `npm install --save-exact` y actualizar `e2e/package-lock.json`.
- [X] T002 [P] Obtener Bricolage Grotesque variable (eje `wght` 400–700, `opsz` fijado), subconjunto latino, como `frontend/public/fonts/bricolage-grotesque-latin-wght.woff2` junto con `frontend/public/fonts/OFL.txt`. Medir el archivo: si supera 60 kB, no añadirlo, usar la pila del sistema y anotarlo en research R5 (Q2).
- [X] T003 [P] Crear `scripts/check-styles.mjs` (Node 22, sin dependencias): (a) mide `frontend/dist/frontend/browser/styles-*.css` crudo y gzip (`node:zlib`) y falla si supera 10 kB / 3 kB; (b) falla si encuentra colores literales (`#hex`, `rgb(`, `hsl(`) en `frontend/src/**/*.css` o en `styles:` de `frontend/src/**/*.ts` (sin `.spec.ts`) fuera de la capa `tokens` de `frontend/src/styles.css`. Añadir el paso "Frontend — estilos y presupuesto" tras el build en `.github/workflows/ci.yml` y bajar `anyComponentStyle` a 6 kB / 8 kB en `frontend/angular.json`. En esta fase (b) se ejecuta en modo informe (`--report`) y pasa a bloquear en T016.
  - _Nota (PR 1)_: el script y el límite `anyComponentStyle` 6/8 kB están hechos; el paso en `.github/workflows/ci.yml` queda pendiente porque el encargo prohíbe tocar workflows. (b) ya bloquea desde este PR.

---

## Phase 2: Foundational (bloquea las historias)

- [X] T004 Reestructurar `frontend/src/styles.css` según `contracts/design-tokens.md`: `@layer reset, tokens, base, components, utilities;` al inicio; capa `tokens` con todos los tokens nuevos (`light-dark()` precedido del valor oscuro de respaldo; `color-scheme: light dark` en `:root`); **alias temporales** de los nombres viejos (`--night` → `var(--surface)`, `--night-2` → `--surface-raised`, `--night-3` → `--surface-hover`, `--line`, `--ink`, `--ink-dim` → `--ink-muted`, `--ink-faint`, `--moon` → `--accent`, `--dawn` → `--accent-2-fill`, `--danger`, `--ok` → `--success`, `--radius`, `--radius-sm`, `--font`) para que los componentes sigan funcionando mientras se migran; reglas globales existentes movidas a `base`/`components`/`utilities` sin cambiar su aspecto en oscuro. Lint y e2e en verde.
  - _Nota (PR 1)_: no se crearon alias temporales; los componentes se migraron a los tokens nuevos en el mismo PR.

**Checkpoint**: la app se ve igual en oscuro; los tokens nuevos existen.

---

## Phase 3: User Story 1 - Tema claro y oscuro con tokens (Priority: P1) 🎯 MVP

**Goal**: la app sigue el tema del sistema, todo color sale de tokens y no se pide nada a terceros.

**Independent Test**: spec US1 (ambos temas, `theme-color`, red sin terceros).

### Tests de US1

- [X] T005 [P] [US1] En `e2e/support/fixtures.ts`, quitar el `route.abort()` de Google Fonts y registrar todas las peticiones del contexto; exponer un fixture `externalRequests` y añadir a `e2e/tests/accesibilidad-axe.spec.ts` (nuevo) el test "SC-007 · ninguna petición sale del servicio" que recorre las cuatro pestañas y Mi perfil. Falla hasta T008.
- [X] T006 [P] [US1] En `e2e/tests/accesibilidad-axe.spec.ts`: para `colorScheme` `light` y `dark` (`page.emulateMedia`), resolver en el navegador los colores de cada token (elemento de prueba con `color: var(--x)` y `getComputedStyle`) y comprobar el ratio WCAG de **todos** los pares de `contracts/design-tokens.md` (SC-003); comprobar que el fondo de `body` cambia al cambiar el esquema sin recargar (US1-3) y que `index.html` tiene dos `theme-color` con `media` (US1-1/2).
- [ ] T007 [P] [US1] Ampliar `backend/test/security.test.js` (`node --test` + supertest): la CSP de cualquier respuesta tiene `font-src 'self'`, `style-src 'self' 'unsafe-inline'` y no contiene `googleapis` ni `gstatic` (FR-005).
  - _Pendiente (PR 1)_: sin hacer porque el encargo prohíbe tocar el backend (T009 incluida).

### Implementación de US1

- [X] T008 [US1] `frontend/src/index.html`: quitar los tres `<link>` de Google Fonts; añadir `<link rel="preload" href="fonts/bricolage-grotesque-latin-wght.woff2" as="font" type="font/woff2" crossorigin>`, `<meta name="color-scheme" content="light dark">` y dos `<meta name="theme-color">` con `media="(prefers-color-scheme: light|dark)"` y los valores de `--surface`. En `styles.css`, `@font-face` de la fuente (`font-display: swap`, `font-weight: 400 700`) y `@font-face` "Bricolage Fallback" sobre `local('Roboto'), local('Segoe UI'), local('Arial')` con `size-adjust` medido (`visual-design/visually-stable-font-fallbacks.md`). Si T002 cayó a la pila del sistema, solo se quitan los `<link>`.
- [ ] T009 [US1] `backend/src/auth/middleware.js`: CSP sin `https://fonts.googleapis.com` ni `https://fonts.gstatic.com` (T007 en verde). Comprobar que `frontend/public/fonts/` se sirve con `Content-Type: font/woff2` por el estático de Express.
  - _Pendiente (PR 1)_: la CSP sigue listando `fonts.googleapis.com` y `fonts.gstatic.com` (inocuo: la app ya no los pide). Falta quitarlos en una tarea de backend autorizada.
- [X] T010 [US1] Estilos globales a tokens nuevos en `frontend/src/styles.css` y `frontend/src/app/app.css` (envuelto en `@layer components`): `.btn` y variantes (hovers con `color-mix(in oklab, …)`, nueva `.btn-danger-solid` con `--danger`/`--on-danger`), `.panel`, campos con borde `--line-strong`, `.error` con `--danger-bg`, `.empty`, cabecera, pestañas, menú Cuenta, aviso de restablecimiento, versión; `accent-color: var(--accent)`; `scrollbar-color` por tema.
- [X] T011 [P] [US1] Migrar a tokens y `@layer components` los estilos de Noche: `features/night/night.component.css`, `night-card.component.ts`, `cycle-calculator.component.ts`, `cycle-settings.component.ts`.
- [X] T012 [P] [US1] Migrar Siestas: `features/naps/naps.component.css`.
- [X] T013 [P] [US1] Migrar Métricas: `features/metrics/metrics.component.css`; los colores de categoría pasan a `--cat-1…--cat-n` en la capa `tokens` con `light-dark()` y ≥ 3:1 sobre `--surface-raised` en ambos temas (añadir esos pares a `contracts/design-tokens.md` y a T006).
- [X] T014 [P] [US1] Migrar Tendencias y gráficos: `features/trends/trends.component.css`, `goal-editor.component.ts`, `shared/charts/daily-bars.component.ts`, `shared/charts/chart-table.component.ts`, `shared/origin/origin-badge.component.ts`.
- [X] T015 [P] [US1] Migrar el resto de estilos en línea: `features/account/*`, `features/auth/auth.css`, `features/onboarding/welcome.component.ts`, `features/schedule/*`, `features/push/push-settings.component.ts`, `features/streak/*`, `shared/bedtime-notice.component.ts`.
- [X] T016 [US1] Quitar los alias temporales de T004 y pasar `scripts/check-styles.mjs` (b) a modo bloqueante; 0 colores literales fuera de la capa `tokens`. T005 y T006 en verde.
- [X] T017 [P] [US1] Documentación: en `specs/001-linea-base/research.md` marcar DT-20 como resuelta por 014; en `docs/testing/e2e-playwright.md` sustituir el párrafo "Fuentes externas bloqueadas" por la fuente local y el fixture `externalRequests`.

**Checkpoint**: US1 completa; la app funciona en claro y oscuro sin terceros.

---

## Phase 4: User Story 2 - Accesibilidad base (Priority: P1)

**Goal**: contraste, foco, texto al 200 %, 44 px y movimiento reducido.

**Independent Test**: spec US2.

### Tests de US2

- [X] T018 [P] [US2] En `e2e/tests/accesibilidad-axe.spec.ts`: `AxeBuilder` con `['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']`, `violations` vacío, en ambos temas, para: las cuatro pestañas con sus plegables abiertos (reutilizar `expandTab`/`waitForTab` moviéndolos a `e2e/support/`), Mi perfil, Mi horario y la pantalla de entrar (sin sesión) (SC-002). Adjuntar los `incomplete` al reporte.
- [X] T019 [P] [US2] En `e2e/tests/accesibilidad.spec.ts` (servidor con datos, como el test de 375 px):
  - **200 %**: viewport 320 × 640, `page.addStyleTag({ content: 'html { font-size: 200% }' })`, cuatro pestañas con plegables abiertos y Mi perfil: `scrollWidth - clientWidth <= 0` del documento y, para cada `.btn`, `.tab` y `h2`, `scrollWidth <= clientWidth` (sin texto cortado) (SC-006);
  - **44 px**: a 375 px, cada botón visible, pestaña y el `summary` de Cuenta mide ≥ 44 px de alto y de ancho (SC-010);
  - **foco**: el `summary` de Cuenta muestra el mismo `outline` (estilo, ancho y color) que las pestañas;
  - **movimiento**: con `reduce`, duración de transición y animación 0 s en botones, pestañas y `.bedtime-notice` (SC-009);
  - **aviso médico**: visible en Noche, Tendencias y Siestas, sin botón para cerrarlo.

### Implementación de US2

- [X] T020 [US2] Escala de texto: quitar `font-size: 16px` de `html, body` en `styles.css`; `<meta name="text-scale" content="scale">` en `index.html`; tamaños de texto de toda la app a los tokens `--fs-*` (`rem`/`clamp`) e interlineados sin unidad; ningún `font-size` en `px` (añadir esa regla a `scripts/check-styles.mjs`).
- [X] T021 [US2] Foco único: `:focus-visible { outline: var(--focus-ring); outline-offset: 2px }` en `base`; quitar el `outline` propio de `.account > summary` en `app.css` y cualquier `outline: none` sin sustituto.
- [X] T022 [US2] Objetivos táctiles: `min-block-size: var(--target)` (y `min-inline-size` en botones de icono) en `.btn`, `.btn-sm`, `.btn-ghost`, `.tab`, `.account > summary`; sin alturas fijas en elementos con texto. Revisar que las cuatro pestañas siguen cabiendo a 320 px (si no, permitir dos líneas, nunca recortar).
  - _Excepción deliberada a FR-026 (PR 1)_: las regiones desplazables (`chart-table` y el historial de Métricas) llevan `tabindex="0"`, `role="region"` y nombre accesible para que se puedan recorrer con teclado (regla axe `scrollable-region-focusable`); añaden una parada de foco que antes no existía.
- [X] T023 [US2] Movimiento: declarar las transiciones de `styles.css`, `app.css`, `streak-card.component.ts` y `bedtime-notice.component.ts` dentro de `@media (prefers-reduced-motion: no-preference)` con `--dur-*`/`--ease-*`; mantener la anulación global con `reduce` como red de seguridad.
- [X] T024 [US2] Principio VIII: `.medical-notice` con `--surface-sunken`, borde `--line-strong`, texto `--ink-muted` e icono informativo; "Sin dato"/"—" con `--no-data` y nombre accesible (`aria-label="Sin dato"` donde solo hay "—"); en gráficos, ausencia con trazo discontinuo (forma, no solo color). Sin colores de "bien/mal".
  - _Nota (PR 1)_: completa con icono informativo `ⓘ` en el aviso médico, `--no-data` aplicado a "Sin dato"/"—" y a los trazos de ausencia, y nombre accesible "Sin dato" para cada "—" (resúmenes y tabla alternativa de los gráficos).
- [X] T025 [US2] Corregir las violaciones que reporten T018 y T019 (orden de encabezados, nombres, contraste residual) hasta dejarlos en verde, sin cambiar textos de negocio ni el orden de foco (FR-026).

**Checkpoint**: P1 completo (MVP del re-look).

---

## Phase 5: User Story 3 - Diálogo de confirmación propio (Priority: P2)

**Goal**: los tres borrados usan `ConfirmService` + `<dialog>`.

**Independent Test**: spec US3.

### Tests de US3

- [X] T026 [P] [US3] Karma `frontend/src/app/shared/confirm/confirm.service.spec.ts` y `confirm-dialog.component.spec.ts` (`contracts/confirm-dialog.md`): `ask()` resuelve `true` solo con "Borrar"; "Conservar" y el evento `cancel` (Esc) → `false`; un segundo `ask()` resuelve el primero en `false`; cerrar sesión con el diálogo abierto → `false`; foco inicial en "Conservar"; `aria-labelledby`/`aria-describedby`; `closedby="closerequest"`.
- [X] T027 [P] [US3] E2E: en `e2e/support/fixtures.ts`, reemplazar `answerNextDialog` por `confirmDialog(page, 'Borrar' | 'Conservar')` (espera `getByRole('dialog')`, devuelve su texto y pulsa el botón). Ajustar `e2e/tests/metricas.spec.ts`, `noches-pasadas.spec.ts` y `siestas.spec.ts` a los textos del contrato; añadir en `noches-pasadas.spec.ts`: "Conservar" no borra y devuelve el foco al botón; Esc no borra; tocar fuera no cierra; con el diálogo abierto el fondo no hace scroll; tras "Borrar" el foco está en el encabezado de la lista. En `accesibilidad-axe.spec.ts`, axe con el diálogo abierto en ambos temas.

### Implementación de US3

- [X] T028 [US3] Crear `frontend/src/app/shared/confirm/confirm.service.ts` y `confirm-dialog.component.ts` según el contrato; montar `<app-confirm-dialog />` una vez en `frontend/src/app/app.html`; estilos del diálogo y `html:has(dialog[open]) { overflow: hidden }` en la capa `components` de `styles.css` (entrada con `@starting-style` solo con `no-preference`).
- [X] T029 [US3] Sustituir `confirm()` en `features/night/night.component.ts`, `features/naps/naps.component.ts` y `features/metrics/metrics.component.ts` por `await confirm.ask(...)` con los textos del contrato; tras borrar, foco al encabezado de la lista (`tabindex="-1"`). Actualizar `night.component.spec.ts`, `naps.component.spec.ts` y `metrics.component.spec.ts` (`spyOn(window, 'confirm')` → `ConfirmService` falso).
- [X] T030 [US3] Activar `no-alert` (`error`) en `frontend/eslint.config.js` para impedir `confirm()`, `alert()` y `prompt()` (SC-008, FR-018); lint en verde.
- [X] T031 [P] [US3] Actualizar el punto 8 de `docs/testing/e2e-playwright.md` (diálogos propios y `confirmDialog`).

**Checkpoint**: US3 independiente y probada.

---

## Phase 6: User Story 4 - Formularios con errores anunciados (Priority: P2)

**Goal**: errores por campo visibles y anunciados, tras interactuar.

**Independent Test**: spec US4.

### Tests de US4

- [X] T032 [P] [US4] Karma `frontend/src/app/shared/forms/field-error.directive.spec.ts`: `aria-invalid="false"` al cargar y al solo enfocar; `true` y `aria-describedby` al mensaje tras `blur` con valor inválido; vuelve a `false` al corregir; al enviar un formulario inválido, foco en el primer campo inválido y sin `submit`.
- [X] T033 [P] [US4] E2E en `e2e/tests/acceso.spec.ts` y `noche.spec.ts`: entrar con credenciales erróneas → un único `role="alert"` con el error; registro manual de noche con un campo obligatorio vacío → no se envía, foco en el campo, `aria-invalid="true"` y mensaje visible; la etiqueta de ese campo contiene "(obligatorio)" (FR-022).

### Implementación de US4

- [X] T034 [US4] Crear `frontend/src/app/shared/forms/field-error.directive.ts` (`appFieldError`, sincroniza `aria-invalid`/`aria-describedby` con `:user-invalid` en `blur`, `change`, `input` e `invalid`; en `submit` inválido enfoca el primer `:invalid`) y estilos en `styles.css`: `.field:has(:user-invalid)` con borde `--danger` de 2 px, icono y mensaje `.field-error`.
- [X] T035 [P] [US4] Aplicar a los formularios de cuenta y acceso: `features/auth/login.component.html`, `setup.component.html`, `features/account/register.component.ts`, `reset-password.component.ts`, `forgot.component.ts`, `people.component.ts`, `profile.component.html`. Etiquetas con "(obligatorio)"; revisar `autocomplete` (`username`, `current-password`, `new-password`, `email`) según `forms/autofill-sign-in-form.md` y `forms/autofill-sign-up-form.md`.
  - _Nota (PR 2)_: `appFieldError` aplicado a entrar, alta inicial, registro, restablecer contraseña y perfil (4 formularios). Pendiente de revisar `autocomplete` y los formularios de olvido de contraseña y personas.
- [ ] T036 [P] [US4] Aplicar a los formularios de datos y ajustes: `features/night/night.component.html`, `features/naps/naps.component.html`, `features/metrics/metrics.component.html`, `features/trends/goal-editor.component.ts`, `features/schedule/schedule-editor.component.ts`, `my-schedule.component.ts`, `features/night/cycle-settings.component.ts`, `features/streak/streak-settings.component.ts`, `features/push/push-settings.component.ts`, `features/onboarding/welcome.component.ts`. Ajustar sus specs si cambian selectores.
  - _Pendiente (PR 2)_: **la feature 014 no se cierra hasta completar esta tarea.** Solo se aplicó al registro manual de noche (`night.component.html`). Siesta, métrica, objetivo, horario, ajustes de ciclos y racha, avisos y bienvenida siguen con su botón deshabilitado por regla de negocio y sin errores por campo.

**Checkpoint**: US4 independiente y probada.

---

## Phase 7: User Story 5 - Layout que se adapta a su espacio (Priority: P2)

**Goal**: rejillas por contenedor con umbrales en `rem`.

**Independent Test**: spec US5.

- [X] T037 [P] [US5] E2E en `e2e/tests/accesibilidad.spec.ts`: a 1280 px con `html { font-size: 200% }` el resumen de Noche tiene menos columnas que sin el 200 % (lee `grid-template-columns` computado); a 320, 375, 768 y 1280 px no hay scroll horizontal en las cuatro pestañas.
- [X] T038 [US5] `:host { display: block; container-type: inline-size }` en `night`, `naps`, `metrics`, `trends`, `my-schedule` y `profile`; sustituir los `@media (max-width: …px)` de `app.css`, `night.component.css`, `metrics.component.css`, `trends.component.css` y `styles.css` (`.grid-2`) por `@container (width < 30rem|22rem)` o `@media` en `rem`; contenido con `max-inline-size: min(45rem, 100%)`. `chart-table` desplazable en horizontal dentro de su contenedor con foco (`ui-atoms/responsive-table.md`).

**Checkpoint**: P2 completo.

---

## Phase 8: User Story 6 - Transiciones entre vistas y pulido (Priority: P3)

**Goal**: fundido ≤ 200 ms al cambiar de pestaña o vista; pulido de estados.

**Independent Test**: spec US6.

- [ ] T039 [P] [US6] Karma en `frontend/src/app/app.spec.ts`: `navigate()` llama a `document.startViewTransition` si existe y `matchMedia('(prefers-reduced-motion: reduce)')` es falso; sin soporte o con `reduce` aplica el cambio directo; dos cambios seguidos terminan en el último; el foco no se mueve.
- [ ] T040 [US6] Implementar `navigate(fn)` en `frontend/src/app/app.ts` (con `ApplicationRef.whenStable()` dentro del callback) y usarlo en `selectTab`, `openAccount`, `openNightLink` y el cierre de vistas de Cuenta; en `app.css`, `::view-transition-old(root)`/`::view-transition-new(root)` con `animation-duration: var(--dur-base)` y `animation: none` con `reduce`. En `e2e/playwright.config.ts`, `reducedMotion: 'reduce'` por defecto en `use`; un test en `navegacion.spec.ts` con `no-preference` comprueba que el cambio de pestaña funciona y el foco sigue en la pestaña.
- [ ] T041 [US6] Pulido (FR-025): hover solo dentro de `@media (hover: hover)` (aserción en `accesibilidad.spec.ts` con `hasTouch`: tras tocar un `.btn` su fondo vuelve al de reposo); `--shadow-dialog` solo en claro; paneles como tarjetas sin sombra en oscuro; cabecera compacta a 320 px. Sin animaciones decorativas.

---

## Phase 9: Polish & Cross-Cutting

- [ ] T042 [P] Comprobar en forced colors (`page.emulateMedia({ forcedColors: 'active' })` en `accesibilidad.spec.ts`) que el foco y el borde de error siguen visibles (`outline-style` y `border-style` no `none`).
- [ ] T043 [P] Medir y anotar en el PR: `styles-*.css` crudo y gzip, fuente, JS inicial transferido frente a master (SC-005).
- [ ] T044 Puertas completas: backend `npm run lint` y `npm test` (incluye fecha de la noche, aislamiento de dos usuarios, meta-test del esquema y términos prohibidos); frontend `npm run lint`, `npx ng test --watch=false --browsers=ChromeHeadless`, `npx ng build` y `node scripts/check-styles.mjs`; `e2e` `npm run typecheck` y `npx playwright test` (0 regresiones, SC-004).
- [ ] T045 Validación manual del [quickstart.md](quickstart.md): Lighthouse Accesibilidad ≥ 95 en cinco vistas × dos temas (SC-001), capturas de las cuatro pestañas en ambos temas, Android real con letra grande del sistema; resultados en la descripción del PR.

---

## Dependencies & Execution Order

- **Setup (T001–T003)**: en paralelo.
- **Foundational (T004)**: después de Setup; bloquea todas las historias.
- **US1 (T005–T017)**: tests T005–T007 primero; T008–T010 secuenciales (mismos archivos globales); T011–T015 en paralelo entre sí tras T010; T016 tras T011–T015.
- **US2 (T018–T025)**: tras US1 (necesita los tokens finales); T018–T019 en paralelo; T020–T024 secuenciales en `styles.css`/`app.css`; T025 al final.
- **US3, US4 y US5**: tras US2; independientes entre sí (comparten `styles.css`: coordinar los bloques de la capa `components`).
- **US6**: tras US2; independiente de US3–US5.
- **Polish**: al final.

### Parallel Opportunities

Tareas `[P]`: T001, T002, T003, T005, T006, T007, T011, T012, T013, T014, T015, T017, T018, T019, T026,
T027, T031, T032, T033, T035, T036, T037, T039, T042, T043 (**25 de 45**).

## Implementation Strategy

1. **MVP**: Setup + Foundational + US1 + US2 → validar (axe, 200 %, contraste) y desplegar si se quiere.
2. **P2**: US3 → US4 → US5, cada una con su checkpoint.
3. **P3**: US6 y pulido; puede quedar para otro PR sin afectar a lo anterior.
