# Implementation Plan: Mi horario de sueño y recordatorios (sin servidor)

**Branch**: `010-horario-recordatorios` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-horario-recordatorios/spec.md`

## Summary

Un **único horario** por persona, versionado y en horas de reloj de pared:
- se agenda desde la bienvenida de 005, que se amplía, o desde Cuenta → "Mi horario";
- el modo puede ser igual todos los días, distinto el fin de semana (noches de sábado y domingo) o
  cada día distinto.

El servidor **no programa nada** (0 $). Los avisos llegan por tres vías:
- **Archivo de calendario** (`GET /api/schedule.ics`, generador propio sin librería):
  - hora flotante, UID estable por día, `SEQUENCE` = versión y `STATUS:CANCELLED` para los días
    quitados;
  - enlace en `DESCRIPTION` y en `URL`;
  - alarma de "Avisarme antes" (15–60, 30 por defecto).
- **Guía por plataforma** basada en el spike:
  - en Google Calendar el aviso usa la notificación por defecto del calendario de destino;
  - los calendarios de fabricante duplican al reimportar;
  - advertencia de No molestar.
- **Avisos dentro de la app**:
  - "¿Ya despertaste?" 60 min después de la hora agendada (amplía 006-US4), con el origen
    "Anotado después" y el registro de "hora propuesta confirmada" para 011;
  - aviso con la app abierta a la hora de prepararse;
  - modo pausa con 4 reglas validadas en el servidor.

Migración `009_horario.js`, solo *expand*:
- tablas nuevas `schedule_versions`, `schedule_days` y `pauses`;
- `user_settings.lead_min`;
- `sleep_records.wake_logged_at` y `sleep_records.wake_from_proposal`.

## Technical Context

**Language/Version**: Node.js 22 LTS; TypeScript con Angular 20

**Primary Dependencies**: Express 5, better-sqlite3 13. Ninguna nueva (iCalendar generado a mano).

**Storage**: SQLite; migración 009 (`CREATE TABLE` + `ADD COLUMN`).

**Testing**:
- `node --test`:
  - migración y compatibilidad;
  - generador iCalendar contra archivos golden, con las reglas de `spike/validate-ics.py`;
  - horario, pausas, despertar y aislamiento.
- Karma: editor, bienvenida, guía, regla del aviso, origen y aviso con la app abierta.
- Playwright: horario, descarga del `.ics`, "¿Ya despertaste?", pausa y aviso.

**Target Platform**: Fly.io (256 MB). Avisos con la app cerrada: el calendario del móvil.

**Project Type**: aplicación web, un único servicio.

**Performance Goals**: el `.ics` se genera en < 50 ms (7 eventos).

**Constraints**:
- El código de 006 debe funcionar sobre el esquema de 010.
- 0 datos de salud en el archivo.
- Sin push, SMS ni correo.

**Scale/Scope**:
- backend: 1 migración, 2 rutas nuevas (`/api/schedule`, `/api/pauses`) y 2 ampliadas
  (`/api/me`, `/api/sleep/wake`);
- frontend: 5 componentes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / sección | Cumplimiento | Estado |
|---------------------|--------------|--------|
| Alcance (v2.0.0) | Tablas nuevas con `user_id` (o hija de una versión), acceso por `repo/` con `userId`; rutas nuevas en la suite de aislamiento; `.ics` solo propio; tablas en el meta-test. | ✅ |
| I. Stack fijo | Sin dependencias; iCalendar a mano (R3). | ✅ |
| II. Persistencia segura | Migración 009 por el runner con respaldo, solo *expand*, idempotente. Sustituir la versión del mismo día y cancelar una pausa futura son ediciones de la propia persona sobre sus datos (aclaración del principio II). | ✅ |
| III. Reglas de tiempo | Los **instantes** siguen en ISO con offset (`wake_time`, `wake_logged_at` en UTC). El horario es una **regla recurrente de reloj de pared**, no un instante: guarda minutos del día por noche, nombrada por el día en que te acuestas, igual que la "fecha de la noche". Pruebas explícitas: después de medianoche, cambio de horario (hora flotante) y fin de semana = noches de sábado y domingo. | ✅ |
| IV. Calidad | Pruebas de backend, componentes y e2e; golden del `.ics`. | ✅ |
| V. Un solo servicio | Sin cambios; el servidor no programa avisos. | ✅ |
| VI. Simplicidad | Sin planificador ni webcal; "hoy" lo da el cliente; origen "Anotado después" derivado; sin CSV nuevo. | ✅ |
| VII. UX accesible | Avisos con `role="status"`, sin sonido, respetan `prefers-reduced-motion`; formularios con etiquetas. | ✅ |
| VIII. Datos de salud | El archivo y los avisos no llevan datos de salud (prueba automática); origen "Anotado después" declarado; la guía es honesta sobre lo que no funciona (spike). | ✅ |

**Re-check post-diseño**: sin violaciones. Complexity Tracking vacío.

## Project Structure

### Documentation (this feature)

```text
specs/010-horario-recordatorios/  plan · research · data-model · quickstart · contracts/ · checklists/ · spike/ · tasks
```

### Source Code (repository root)

```text
backend/src/
├── migrations/009_horario.js           # NUEVO (data-model.md)
├── ics.js                              # NUEVO: generador iCalendar puro (R3)
├── repo/schedule.js · repo/pauses.js   # NUEVOS: por usuario
├── routes/schedule.js                  # NUEVO: /api/schedule, /api/schedule.ics, /api/pauses
├── routes/sleep.js · repo/sleep.js     # wake_logged_at, from_proposal
├── routes/me.js · repo/users.js        # lead_min
└── repo/export.js · routes/export.js   # horario y pausas en el JSON
backend/test/
├── migrations-009.test.js · compat-previous-010.test.js · ics.test.js · schedule.test.js · pauses.test.js   # NUEVOS
├── fixtures/schedule-v1.ics · schedule-v2.ics · legacy-006-statements.js                                    # NUEVOS
└── isolation.test.js · export.test.js · me.test.js · diary.test.js · schema-isolation.test.js               # ampliados

frontend/src/app/
├── core/schedule.service.ts · core/schedule.ts       # NUEVOS: API y reglas puras (vigente, instantes, proponer acostarse)
├── features/schedule/schedule-editor.component.ts    # NUEVO (bienvenida y Mi horario)
├── features/schedule/my-schedule.component.ts        # NUEVO: editor + calendario + pausa
├── features/schedule/calendar-guide.component.ts     # NUEVO: guía por plataforma (R4)
├── shared/bedtime-notice.component.ts                # NUEVO: aviso con la app abierta (R7)
├── features/onboarding/welcome.component.ts          # ampliada con el editor
├── features/night/night.component.*                  # "¿Ya despertaste?" con horario; origen "Anotado después"
├── shared/origin/origin-badge.component.ts           # origen 'late'
└── app.ts / app.html                                 # Cuenta → Mi horario; bedtime-notice

e2e/tests/horario.spec.ts               # NUEVO
scripts/smoke-local.mjs                 # comprobaciones de 010
```

**Structure Decision**: `features/schedule/` agrupa lo del horario; las reglas puras de fechas viven
en `core/schedule.ts`, para probarlas sin componentes.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
