# Implementation Plan: Diario opcional, ciclos y honestidad de datos (REM sin sensores)

**Branch**: `006-diario-ciclos` | **Date**: 2026-10-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-diario-ciclos/spec.md`

## Summary

La feature aplica el principio VIII (constitución v2.1.0) a lo que ya existe y añade orientación
sobre los ciclos sin medir nada:
- **Honestidad**:
  - insignias de origen por bloque ("Anotado por ti" / "Estimado" / "Del reloj"; por fila solo
    si hay mezcla);
  - aviso "No es un dispositivo médico" en Noche, Tendencias y Siestas;
  - prueba automática de términos clínicos prohibidos sobre todos los textos de la interfaz.
- **Calculadora de ciclos** bajo "¿Hora de dormir?":
  - 3 ventanas (4, 5 y 6 ciclos, ± 15 min), con una función pura en el cliente que nunca se
    guarda;
  - usa la duración de ciclo y el tiempo en dormirse de cada persona, que también alimentan los
    atajos del objetivo de 005.
- **Fases**: estado vacío honesto en Tendencias, preparado para 007.
- **Noche abierta ≥ 14 h**: aviso con la hora propuesta = dormir + objetivo, sin notificaciones.
- **Tarjeta "¿Cómo fue la noche?"**: tras cerrar la noche, 2 preguntas por rangos, opcional y
  descartable; se guarda en la noche.

**Migración** `008_ciclos_y_diario.js`, solo *expand*:
- `user_settings.cycle_min` y `user_settings.latency_min`;
- `sleep_records.sol_bucket` y `sleep_records.awakenings_bucket`.

## Technical Context

**Language/Version**: Node.js 22 LTS; TypeScript con Angular 20

**Primary Dependencies**: Express 5, better-sqlite3 13. Ninguna nueva.

**Storage**: SQLite; migración 008 (`ADD COLUMN`, sin reconstrucción).

**Testing**:
- `node --test`: migración, compatibilidad, rutas, aislamiento, exportación y términos prohibidos;
- Karma: `wakeWindows` con zona fija, insignias, aviso, tarjeta y "Fases";
- Playwright: calculadora, ajustes, tarjeta, noche abierta, aviso médico e insignias.

**Target Platform**: Fly.io (256 MB).

**Project Type**: aplicación web, un único servicio.

**Performance Goals**: recalcular las ventanas al cambiar la hora es instantáneo (cálculo local,
sin red).

**Constraints**:
- El código de 005 debe funcionar sobre el esquema de 006.
- Registrar la noche sigue siendo 1 toque al acostarse y 1 al despertar.
- Sin fases, porcentajes de REM ni puntuaciones.

**Scale/Scope**: 1 migración, 2 rutas ampliadas (`PUT /api/me`, `PUT /api/sleep/:id`), 5 componentes
o utilidades de frontend y 1 prueba de términos.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / sección | Cumplimiento | Estado |
|---------------------|--------------|--------|
| Alcance (v2.0.0) | Ajustes y respuestas por `repo/` con `userId`. `PUT /api/sleep/:id` ya devuelve 404 a lo ajeno, y la suite de dos usuarios se amplía con las respuestas. Columnas nuevas en tablas ya clasificadas. | ✅ |
| I. Stack fijo | Sin dependencias: `Intl` para las horas y un recorrido de archivos con `node:fs` para los términos. | ✅ |
| II. Persistencia segura | Migración 008 por el runner, con respaldo `pre-008.db`. Solo `ADD COLUMN` con `DEFAULT` o `NULL`, idempotente y sin borrar ni reconstruir. | ✅ |
| III. Reglas de tiempo | Ventanas como instantes absolutos formateados en hora local, con pruebas de medianoche y de cambio de offset (zona fija en el test). El aviso de noche abierta mide horas reales y no fechas. Las respuestas se guardan en la noche (fecha = día de acostarse). | ✅ |
| IV. Calidad | Pruebas de backend (migración, rutas, compatibilidad, términos), de componentes y e2e. | ✅ |
| V. Un solo servicio | Sin cambios. | ✅ |
| VI. Simplicidad | Sin endpoints nuevos (`PUT /api/me` y `PUT /api/sleep/:id`), sin tabla de diario, sin estado de "tarjeta descartada" y sin endpoint de capacidades (constante). | ✅ |
| VII. UX accesible | Chips con `aria-pressed`, aviso con `role="status"`, foco visible y textos en español sin siglas clínicas. | ✅ |
| **VIII. Datos de salud** | Origen declarado (insignias); estimaciones no persistidas; aviso de no dispositivo médico; prueba de términos prohibidos; "sin respuesta" = `NULL`; sin push ni correo; sin fases ni puntuaciones. No hay estadísticos nuevos (la n mínima no aplica). | ✅ |

**Re-check post-diseño**: sin violaciones. Complexity Tracking vacío.

## Project Structure

### Documentation (this feature)

```text
specs/006-diario-ciclos/  plan · research · data-model · quickstart · contracts/ · checklists/ · tasks
docs/sdd/terminos-prohibidos.txt          # NUEVO: lista versionada (R7)
```

### Source Code (repository root)

```text
backend/src/
├── migrations/008_ciclos_y_diario.js     # NUEVO (R2, R4)
├── repo/users.js                         # perfil + cycle_min/latency_min; setCycleSettings; cycleOf
├── repo/sleep.js                         # columnas sol_bucket/awakenings_bucket en lectura y update
├── repo/export.js · routes/export.js     # JSON y CSV de noches con las respuestas (R10)
├── routes/me.js                          # PUT /api/me: cycle_min, latency_min
├── routes/sleep.js                       # validación de las respuestas en PUT
└── routes/dashboard.js                   # cycle_min del usuario (R3)
backend/test/
├── migrations-008.test.js · compat-previous-006.test.js · diary.test.js · forbidden-terms.test.js   # NUEVOS
├── me.test.js · export.test.js · isolation.test.js · dashboard.test.js                              # ampliados
└── fixtures/migrations-up-to.js          # (existente) fija la compatibilidad a la era de 005

frontend/src/app/
├── core/cycles.ts                        # wakeWindows, fmtWindow; CYCLE_MIN solo como defecto (R1, R3)
├── core/features.ts                      # NUEVO: WATCH_IMPORT_AVAILABLE = false (R9)
├── core/account.service.ts · api.service.ts   # tipos: cycle_min, latency_min, respuestas
├── shared/origin/origin-badge.component.ts    # NUEVO + blockOrigin (R6)
├── features/night/cycle-calculator.component.ts   # NUEVO: ventanas + "Ajustar" (cycle-settings)
├── features/night/cycle-settings.component.ts     # NUEVO: ciclo y latencia (también en el perfil)
├── features/night/night-card.component.ts         # NUEVO: tarjeta "¿Cómo fue la noche?"
├── features/night/night.component.*      # calculadora, aviso de noche abierta, tarjeta, respuestas al editar, insignias
├── features/trends/trends.component.*    # sección "Fases", insignias; goal-editor con cycle_min
├── features/naps/naps.component.*        # insignia de bloque
├── features/account/profile.*            # sección "Ciclos de sueño" (cycle-settings); goal-editor con cycle_min
└── app.html                              # aviso "No es un dispositivo médico" en Noche/Tendencias/Siestas

e2e/tests/diario-ciclos.spec.ts           # NUEVO
scripts/smoke-local.mjs                   # comprobaciones de 006 en `run`
```

**Structure Decision**: se añade `shared/origin/` para la insignia reutilizable. Los componentes de
la calculadora y la tarjeta viven junto a Noche, que es donde se usan.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
