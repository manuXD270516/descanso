# Implementation Plan: Re-look moderno, sobrio y nocturno

**Branch**: `014-relook-moderno` | **Date**: 2026-11-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/014-relook-moderno/spec.md`, más la sección "Contexto
técnico" de `docs/sdd/features/014-relook-moderno.md`, la auditoría del agente `ui-ux`, la viabilidad
del agente `frontend` y las guías de `GoogleChrome/modern-web-guidance` (commit `2b4aa13`, ver
[research.md](research.md) R0–R1).

## Summary

Re-look solo de frontend, con CSS y HTML nativos y sin librería de UI:

- **Tokens y tema** (R2–R6): tokens por rol con `light-dark()` y `color-scheme: light dark`, siguiendo
  el tema del sistema; `@layer reset, tokens, base, components, utilities`; tipografía fluida en `rem`;
  Bricolage Grotesque autoalojada (≤ 60 kB) y CSP sin Google Fonts.
- **Accesibilidad base** (R4, R7): raíz sin `font-size` y `<meta name="text-scale">`; contraste AA en
  ambos temas (bordes de campos a 3:1, hoy 1,58:1); anillo de foco único; objetivos de 44 px; movimiento
  solo con `no-preference`; aviso médico y "sin dato" con más contraste.
- **Diálogo** (R8): `ConfirmService` + `<dialog>` modal en lugar de los tres `confirm()`.
- **Formularios** (R9): `:user-invalid` + directiva que sincroniza `aria-invalid`/`aria-describedby`;
  foco al primer error.
- **Layout** (R10): container queries en los hosts y umbrales en `rem`.
- **Transiciones** (R11): `document.startViewTransition` alrededor del cambio de pestaña o vista, con
  detección y movimiento reducido.
- **Pruebas** (R12): axe en los e2e en ambos temas, contraste de tokens medido en el navegador, texto al
  200 % a 320 px, sin peticiones a terceros, check de presupuesto de CSS en CI y Lighthouse manual.

Sin cambios de backend salvo la CSP; sin migraciones ni rutas.

## Technical Context

**Language/Version**: TypeScript ~5.9 con Angular 21 (standalone, signals, zone.js); CSS nativo;
Node.js 22 para scripts de CI.

**Primary Dependencies**: sin dependencias de producción nuevas. **Nueva devDependency** en `e2e/`:
`@axe-core/playwright` **4.14.1** (versión exacta). Asset nuevo: `frontend/public/fonts/` (woff2 + OFL).

**Storage**: N/A (sin cambios de esquema).

**Testing**:
- Karma: `ConfirmService` y `ConfirmDialogComponent`, directiva de errores, `App.navigate()`, y los
  specs de night, naps y metrics adaptados al servicio.
- Playwright: `accesibilidad.spec.ts` ampliado (200 %, 44 px, movimiento reducido) y nuevo
  `accesibilidad-axe.spec.ts` (axe y contraste de tokens en ambos temas, sin terceros); specs de
  borrado con el helper del diálogo.
- `node --test` de backend: cabecera CSP sin dominios de Google.
- CI: `scripts/check-styles.mjs` tras `ng build`; regla `no-alert` en ESLint.

**Target Platform**: Chrome en Android (Baseline 2024); escritorio Chrome/Edge/Firefox/Safari recientes.

**Project Type**: aplicación web, un único servicio.

**Performance Goals**: CSS global ≤ 10 kB crudo / 3 kB gzip; fuente ≤ 60 kB; JS inicial ≤ +5 kB
transferidos; transición de vista ≤ 200 ms.

**Constraints**:
- Lighthouse Accesibilidad ≥ 95 y 0 violaciones axe AA en ambos temas.
- Sin regresiones de e2e; se mantiene el orden de foco y el `solid 2px` del foco.
- Sin peticiones a terceros; sin librerías de UI.

**Scale/Scope**:
- frontend: `styles.css`, `index.html`, `app.*`, ~26 archivos de estilos de componente (capa y tokens),
  ~13 formularios, 3 componentes con borrado, 1 servicio + 1 componente + 1 directiva nuevos;
- backend: CSP en `backend/src/auth/middleware.js` y su test;
- e2e: 1 spec nuevo, 4 ajustados, `fixtures.ts` y `playwright.config.ts`;
- CI: 1 script y 1 paso; `angular.json` (budgets); `docs/testing/e2e-playwright.md` y DT-20 cerrada.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / sección | Cumplimiento | Estado |
|---------------------|--------------|--------|
| Alcance (v2.0.0) | Sin datos, rutas ni consultas nuevas; la suite de aislamiento de dos usuarios y el meta-test del esquema siguen pasando sin cambios (se corren como parte de las puertas). | ✅ |
| I. Stack fijo | Sin librerías de UI (R13). Una devDependency de pruebas en `e2e/` (`@axe-core/playwright` 4.14.1), no forma parte de la app. La fuente es un asset estático. | ✅ (justificada) |
| II. Persistencia segura | Sin migraciones ni cambios de datos; expand/contract no aplica (data-model). | ✅ |
| III. Reglas de tiempo | Sin cambios de cálculo; las fechas del diálogo usan los formateadores existentes. Las pruebas de fecha de la noche existentes se mantienen y deben seguir pasando. | ✅ |
| IV. Calidad | Specs de componente para lo nuevo, e2e, lint, build y check de presupuesto en CI. | ✅ |
| V. Un solo servicio | La fuente la sirve el mismo Express; la CSP se endurece (sin dominios externos). Sin secretos. | ✅ |
| VI. Simplicidad | Sin selector de tema, sin capturas en CI, Lighthouse manual, un solo diálogo compartido, sin router. Lo que excede el mínimo va abajo. | ✅ (ver Complexity Tracking) |
| VII. UX accesible | Es el objetivo: foco único visible, contraste AA, 200 %, 44 px, movimiento reducido, responsive por contenedor, textos en español. | ✅ |
| VIII. Datos de salud | Aviso "No es un dispositivo médico" visible y no descartable en Noche, Tendencias y Siestas; "sin dato" por forma y texto, nunca 0; sin colores de "bien/mal"; textos nuevos con la prueba de términos prohibidos. | ✅ |

**Re-check post-diseño**: sin violaciones. Pendiente fuera de alcance: el "0 min" de promedio sin noches
en el resumen de Noche (posible choque con VIII "sin dato" ≠ 0); se pregunta al owner aparte.

## Project Structure

### Documentation (this feature)

```text
specs/014-relook-moderno/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── design-tokens.md
│   └── confirm-dialog.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
frontend/
├── public/fonts/                         # nuevo: bricolage-grotesque-latin-wght.woff2 + OFL.txt
├── src/index.html                        # sin Google Fonts; preload; color-scheme, theme-color x2, text-scale
├── src/styles.css                        # capas, tokens, base, componentes globales (.btn, .panel, .field, diálogo)
├── src/app/app.{html,css,ts}             # diálogo montado, navigate() con view transitions, cabecera
├── src/app/shared/confirm/               # nuevo: confirm.service.ts, confirm-dialog.component.ts (+ specs)
├── src/app/shared/forms/                 # nuevo: field-error.directive.ts (+ spec)
├── src/app/features/**                   # @layer components, tokens, container queries, formularios
└── angular.json                          # anyComponentStyle 6/8 kB
backend/src/auth/middleware.js            # CSP sin fonts.googleapis.com / fonts.gstatic.com
backend/test/security.test.js             # aserción de la CSP
scripts/check-styles.mjs                  # nuevo: presupuesto de CSS, colores literales y px en font-size
.github/workflows/ci.yml                  # paso del presupuesto tras ng build
e2e/
├── package.json                          # @axe-core/playwright 4.14.1
├── playwright.config.ts                  # reducedMotion por defecto
├── support/fixtures.ts                   # sin bloqueo de Google Fonts; confirmDialog(); registro de hosts
└── tests/{accesibilidad,accesibilidad-axe,metricas,noches-pasadas,siestas}.spec.ts
docs/testing/e2e-playwright.md            # diálogo propio, fuentes locales, axe
specs/001-linea-base/research.md          # DT-20 marcada como resuelta por 014
```

**Structure Decision**: misma estructura; lo compartido nuevo va en `frontend/src/app/shared/`.

## Complexity Tracking

| Adición | Por qué se necesita | Alternativa más simple descartada porque |
|---------|---------------------|------------------------------------------|
| `@axe-core/playwright` 4.14.1 (devDependency de `e2e/`) | SC-002: verificar AA automáticamente en CI y en ambos temas. | Revisar a mano no evita regresiones; Lighthouse en CI es más lento y ruidoso. |
| Fuente autoalojada (asset + `@font-face` + preload) | FR-005 y SC-007: sin terceros y CSP más estricta, conservando la marca. | Pila del sistema: pierde identidad; queda como respaldo si supera 60 kB. |
| `@layer components` en ~26 archivos de estilo | Sin capa, los estilos de componente ganan a cualquier capa global y el orden deja de valer. | Sin capas: especificidad creciente y overrides con `!important`. |
| Directiva de errores de campo | FR-019–FR-021: `:user-invalid` no sincroniza ARIA por sí solo. | Código en cada formulario: 13 copias. |
| `navigate()` con view transitions | US6 / FR-024. | Ninguna: es P3 y puede omitirse sin afectar el resto. |
| Script de presupuesto de CSS en CI | SC-005: el budget `initial` de Angular mezcla JS y CSS. | Solo budgets de Angular: no aíslan el CSS global. |
