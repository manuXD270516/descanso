# Implementation Plan: Rachas de constancia (gamificación del hábito)

**Branch**: `011-rachas-constancia` | **Date**: 2026-10-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/011-rachas-constancia/spec.md`

## Summary

Una **racha de constancia opcional** (desactivada por defecto) que premia solo conductas
controlables:
- con horario activo esa noche (010), **acostarse y levantarse a tu hora**: ninguna de las dos horas
  registradas pasa de la agendada + margen (30 min por defecto, 15–60); adelantarse no resta;
- sin horario activo (sin horario, día desactivado o pausa), **registrar la noche** (modo "Registro").

El cálculo es **al vuelo** (research R1): una función pura `computeStreak()` en `backend/src/streak.js`
recorre las noches de constancia desde la activación con una ventana deslizante (O(n), 3.650 noches en
< 20 ms). Tolera 2 no cumplidos en 7 días no pausados; la noche de hoy y la de ayer sin cerrar son
"aún no"; una noche en pausa sin registrar es neutra.

Solo se guarda lo que no debe bajar nunca (R4):
- el récord y el total, en `user_settings`;
- las constelaciones (7, 21, 66, 100, 180, 365) con su dato personal congelado, en
  `streak_achievements`.

Se actualizan con un **trinquete** dentro de la misma transacción que cierra o edita una noche;
consultar la racha no escribe nada.

En la interfaz (R7), la racha aparece solo:
- tras "Ya desperté": la línea "Día N de constancia ★" y la tarjeta que toque (logro, resumen semanal,
  oferta o "nuevo comienzo");
- en un plegable "Constancia" de Tendencias;

y nunca en la pantalla de acostarse ni en los avisos.

Migración `010_rachas.js`, solo *expand*: 8 columnas en `user_settings` y la tabla
`streak_achievements`.

## Technical Context

**Language/Version**: Node.js 22 LTS; TypeScript con Angular 20 (standalone, signals, zoneless)

**Primary Dependencies**: Express 5, better-sqlite3. Ninguna nueva (propiedades con un generador con
semilla propio, R9).

**Storage**: SQLite; migración 010 (`ADD COLUMN` + `CREATE TABLE`).

**Testing**:
- `node --test`: migración y compatibilidad, motor puro (reglas, propiedades y rendimiento), rutas,
  trinquete, aislamiento, exportación, borrado y palabras prohibidas.
- Karma: textos puros, línea de la mañana, panel, tarjeta, oferta, ajustes y ausencia en la pantalla
  de acostarse.
- Playwright: `e2e/tests/rachas.spec.ts`.

**Target Platform**: Fly.io (256 MB), un único servicio.

**Project Type**: aplicación web, un único servicio.

**Performance Goals**: `computeStreak` con 3.650 noches < 20 ms (SC-002); `GET /api/streak` carga
solo desde `streak_since`.

**Constraints**:
- El código de 010 debe funcionar sobre el esquema de 011 (expand/contract).
- Con la racha desactivada: 0 cálculos, 0 escrituras, 0 elementos en pantalla (SC-006).
- Sin avisos ni notificaciones nuevos.

**Scale/Scope**:
- backend: 1 migración, 1 módulo puro, 1 repo, 1 router con 3 rutas (`/api/streak`,
  `/api/streak/settings`, `/api/streak/achievements/:key/seen`) y 3 rutas ampliadas (escrituras de
  `/api/sleep`) más la exportación;
- frontend: 5 componentes y 1 módulo de textos puros.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / sección | Cumplimiento | Estado |
|---------------------|--------------|--------|
| Alcance (v2.0.0) | `streak_achievements` con `user_id`; ajustes en `user_settings` (ya por usuario); acceso por `repo/streak.js` con `userId`; rutas nuevas en la suite de aislamiento; tabla en el meta-test. | ✅ |
| I. Stack fijo | Sin dependencias; propiedades con generador propio (R9). | ✅ |
| II. Persistencia segura | Migración 010 por el runner con respaldo, solo *expand*, idempotente. Nada se borra; los logros no se retiran. | ✅ |
| III. Reglas de tiempo | Las noches siguen guardando la fecha del día en que te acuestas. La asignación a la noche de constancia (antes de mediodía → noche anterior) y la comparación en hora de pared se derivan del ISO con su desfase, con pruebas explícitas: después de medianoche, mediodía, DST y viaje (R2, R3). | ✅ |
| IV. Calidad | Pruebas de backend (motor, rutas, propiedades, rendimiento), componentes y e2e; lint y build. | ✅ |
| V. Un solo servicio | Sin cambios; el servidor no programa nada. | ✅ |
| VI. Simplicidad | Cálculo al vuelo sin tabla de días; solo se guarda lo que no puede bajar; un único margen; el cliente no recalcula; pausas desde "Mi horario" (010). | ✅ |
| VII. UX accesible | Tarjetas con `role="status"`; brillo ≤ 400 ms y sin animación con `prefers-reduced-motion`; estrellas distinguibles por forma y texto, no solo por color; foco visible. | ✅ |
| VIII. Datos de salud (v2.2.0) | Solo conductas controlables (horas registradas frente a la agendada, registrar); nada de horas dormidas ni calidad; sin puntos, rankings ni canje; sin avisos de pérdida y palabras de culpa en la lista prohibida; logros permanentes; saltarse un registro nunca mejora (propiedades); desactivada por defecto y ocultable. Origen "Anotado después" visible en cada día. El dato de la constelación (σ de la hora de levantarse) solo con ≥ 7 días y la media del resumen solo con ≥ 3 noches cerradas (n mínimas fijadas en FR-014 y FR-025), en lenguaje no causal; "sin datos" nunca es 0. | ✅ |

**Re-check post-diseño**: sin violaciones. Complexity Tracking vacío.

## Project Structure

### Documentation (this feature)

```text
specs/011-rachas-constancia/  spec · plan · research · data-model · quickstart · contracts/ · checklists/ · tasks · constitution-amendment-draft (aplicado)
```

### Source Code (repository root)

```text
backend/src/
├── migrations/010_rachas.js            # NUEVO (data-model.md)
├── streak.js                           # NUEVO: computeStreak() puro (R1–R3)
├── repo/streak.js                      # NUEVO: ajustes, logros, load(userId, today) y ratchet(userId, today)
├── routes/streak.js                    # NUEVO: /api/streak, /settings, /achievements/:key/seen
├── routes/sleep.js                     # trinquete en POST /, POST /wake y PUT /:id (misma transacción)
├── routes/export.js                    # streak en el JSON
└── app.js                              # monta /api/streak
backend/test/
├── migrations-010.test.js · compat-previous-011.test.js · streak-engine.test.js · streak.test.js   # NUEVOS
└── isolation.test.js · schema-isolation.test.js · export.test.js · delete-account.test.js · forbidden-terms.test.js   # ampliados
docs/sdd/terminos-prohibidos.txt        # palabras de culpa (R8)

frontend/src/app/
├── core/streak.service.ts · core/streak.ts           # NUEVOS: API y textos puros
├── features/streak/streak-card.component.ts          # NUEVO: tarjeta descartable role="status"
├── features/streak/streak-offer.component.ts         # NUEVO: "¿Quieres llevar una racha…?"
├── features/streak/streak-morning.component.ts       # NUEVO: línea y tarjetas tras "Ya desperté"
├── features/streak/streak-panel.component.ts         # NUEVO: plegable "Constancia" de Tendencias
├── features/streak/streak-settings.component.ts      # NUEVO: activar y margen (en Mi horario)
├── features/night/night.component.*                  # streak-morning solo en el estado de noche cerrada
├── features/trends/trends.component.*                # streak-panel bajo los 3 indicadores
├── features/onboarding/welcome.component.ts          # streak-offer
└── features/schedule/my-schedule.component.ts        # streak-settings

e2e/tests/rachas.spec.ts                # NUEVO
```

**Structure Decision**: `features/streak/` agrupa toda la interfaz de la racha, para poder comprobar
que la pantalla de acostarse y `bedtime-notice` no la importan; el motor vive solo en el backend
(`streak.js`), que es quien guarda el récord y los logros.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
