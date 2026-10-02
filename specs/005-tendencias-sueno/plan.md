# Implementation Plan: Tendencias y sueño pendiente (dashboard)

**Branch**: `005-tendencias-sueno` | **Date**: 2026-10-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-tendencias-sueno/spec.md`

## Summary

La feature añade una pestaña **Tendencias** con lo siguiente:
- **Arriba, 3 indicadores**: media diaria, días con el objetivo y sueño pendiente neto de 14 días.
- **Gráfico SVG propio** de 7, 30 o 90 días con la banda del objetivo; los días sin registro se
  muestran como "sin dato" y la noche abierta como "en curso".
- **Regularidad plegable**, con estadística circular.

**Cálculos**: funciones puras en `backend/src/analytics.js`, servidas por `GET /api/dashboard`.

**Objetivo**: 7 h por defecto, editable desde el gráfico y el perfil, con **sugerencias de ciclos
completos**. Cada usuario ve una **bienvenida** la primera vez.

**Accesibilidad**: todo gráfico tiene descripción y tabla alternativa (también la cinta de Noche),
y el texto tenue pasa a cumplir 4,5:1.

**Migraciones**:
- `006`: contrae `user_id` (quita `DEFAULT 1`), el paso pendiente de expand/contract.
- `007`: objetivo de 7 h, `goal_customized` y `onboarded_at`.

## Technical Context

**Language/Version**: Node.js 22 LTS; TypeScript con Angular 20

**Primary Dependencies**: Express 5, better-sqlite3 13. SVG propio, sin librerías de gráficos.

**Storage**: SQLite; migraciones 006 (`foreignKeys: false`) y 007.

**Testing**: `node --test` (funciones puras con fixtures, contrato y aislamiento); Karma; Playwright
(dashboard con datos sembrados, tablas y contraste).

**Target Platform**: Fly.io (256 MB).

**Project Type**: aplicación web, un único servicio.

**Performance Goals**: dashboard de 90 días < 300 ms en el servidor (SC-001).

**Constraints**:
- La versión 008 debe funcionar sobre el esquema de 005.
- El cliente envía la fecha de hoy.
- Sin rojo ni verde para juzgar.

**Scale/Scope**: 1 endpoint nuevo + 1 de bienvenida, 4 componentes y 2 migraciones.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / sección | Cumplimiento | Estado |
|---------------------|--------------|--------|
| Alcance (v2.0.0) | El dashboard lee por `repo/` con `userId`; se añade a la suite de aislamiento de dos usuarios; la contracción de `user_id` refuerza el aislamiento en el esquema. | ✅ |
| I. Stack fijo | Gráficos en SVG propio; ninguna dependencia nueva. | ✅ |
| II. Persistencia segura | La 006 reconstruye con copia verificada y `foreignKeys: false`. La 007 solo cambia el valor por defecto en filas no personalizadas, verificado. | ✅ |
| III. Reglas de tiempo | Días por fecha de la noche; el cliente envía `to`; duraciones desde horas con desfase; estadística circular `% 1440`, con pruebas explícitas (23:30 y 00:30 → 00:00). | ✅ |
| IV. Calidad | Funciones puras con fixtures, contrato, migraciones, compatibilidad, componentes y e2e. | ✅ |
| V. Un solo servicio | Sin cambios. | ✅ |
| VI. Simplicidad | Se reutiliza `PUT /api/me` para el objetivo (sin `/api/settings` nuevo); ciclo fijo de 90 min hasta 006. | ✅ |
| VII. UX accesible | Descripción y tabla en cada gráfico, contraste 4,5:1 y sin siglas. | ✅ |

**Re-check post-diseño**: sin violaciones. Complexity Tracking vacío.

## Project Structure

```text
specs/005-tendencias-sueno/  plan · research · data-model · quickstart · contracts/ · checklists/ · tasks

backend/src/
├── analytics.js                         # NUEVO: funciones puras (R1)
├── repo/dashboard.js                    # NUEVO: noches (también abiertas) y siestas del rango, por usuario
├── repo/users.js                        # goal_customized y onboarding
├── routes/dashboard.js                  # NUEVO: GET /api/dashboard (R2)
├── routes/me.js                         # POST /me/onboarding; objetivo personalizado
├── routes/auth.js                       # onboarded en status/login
└── migrations/006_contraer_user_id.js · 007_objetivo_y_bienvenida.sql
backend/test/
├── analytics.test.js · dashboard.test.js · migrations-006-007.test.js · compat-previous-005.test.js
└── isolation.test.js                    # + /api/dashboard

frontend/src/app/
├── core/dashboard.service.ts            # NUEVO
├── shared/charts/daily-bars.component.ts · chart-table.component.ts   # NUEVOS
├── features/trends/trends.component.*  · goal-editor.component.ts      # NUEVOS
├── features/onboarding/welcome.component.ts                            # NUEVO
├── features/night/night.component.*     # cinta: descripción + tabla
├── app.ts / app.html                    # pestaña Tendencias y bienvenida
└── styles.css                           # --ink-faint: #9297b7 (R6)

e2e/tests/tendencias.spec.ts             # NUEVO
```

**Structure Decision**: se añade `shared/charts/` para los gráficos reutilizables.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
