# Implementation Plan: Fundaciones de datos: migraciones y endurecimiento

**Branch**: `003-fundaciones-datos` | **Date**: 2026-09-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-fundaciones-datos/spec.md`

## Summary

La feature introduce un runner de migraciones propio y síncrono (`backend/src/migrate.js`) que
`db.js` ejecuta antes de exportar la conexión. Así ninguna petición se atiende hasta que el
esquema está al día.

- La primera migración reproduce el esquema actual con `IF NOT EXISTS`, así que sobre la base de
  producción no cambia ni una fila.
- La segunda añade un índice único parcial que garantiza una sola noche abierta. Si ya existen
  dos, aborta sin tocar datos.
- Antes de migrar se guarda un respaldo local con `VACUUM INTO`; se conservan los 3 más recientes.
- La regla expand/contract y un runbook de restauración protegen el rollback automático de 002.

Además se corrige la deuda que distorsiona datos:

- validación de rangos (DT-02, DT-03);
- fecha de la noche igual al día local del inicio, rechazando si no coincide (DT-04);
- métricas sí/no estrictas (DT-08);
- cinta con varias noches por fecha (DT-11);
- media circular en 0..1439 (DT-21).

También se añade un indicador de ocupación del volumen en `/api/health`.

## Technical Context

**Language/Version**: Node.js 22 LTS (backend), TypeScript con Angular 20 (frontend)

**Primary Dependencies**: Express 5, better-sqlite3 13 (incluye `VACUUM INTO`, índices parciales
y de expresión), `node:crypto`, `node:fs` (`statfsSync`). **Sin dependencias nuevas.**

**Storage**: SQLite en `DB_PATH` (Fly: `/data/sleep.db` en el volumen `descanso_data`). Respaldos
previos a la migración en `/data/backups/`.

**Testing**: `node --test` + supertest (backend); Karma/Jasmine con TestBed (frontend); la suite
Playwright existente (`e2e/`) debe seguir pasando.

**Target Platform**: contenedor Linux en Fly.io (shared-cpu-1x, 256 MB), desarrollo en Windows.

**Project Type**: aplicación web (backend Express + frontend Angular servido por el mismo proceso).

**Performance Goals**: migraciones + respaldo < 20 s (`grace_period` de `fly.toml`) con 10 años de
datos; en la práctica, < 1 s.

**Constraints**: la versión anterior del servicio debe funcionar sobre el esquema migrado; no se
modifican datos existentes; los checksums deben coincidir entre Windows (CRLF) y Linux (LF).

**Scale/Scope**: 1 usuario, ~16.000 filas en 10 años; 2 migraciones iniciales.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Cumplimiento | Estado |
|-----------|--------------|--------|
| I. Stack fijo | Runner propio de ~100 líneas con better-sqlite3; sin ORM ni librería de migraciones; sin dependencias nuevas. | ✅ |
| II. Persistencia segura | Es la feature que materializa "migraciones versionadas e idempotentes". Sin DROP; la línea base no toca filas; respaldo previo obligatorio; una migración fallida se deshace entera. | ✅ |
| III. Reglas de tiempo | DT-04 hace que el servicio (no solo el frontend) garantice que la fecha de la noche es el día local de acostarse, con pruebas explícitas en noches y siestas, incluido el cruce de medianoche. `applied_at` en ISO 8601 con desfase. | ✅ |
| IV. Calidad | Pruebas unitarias del runner, de la línea base con fixture, de compatibilidad, de cada DT y del almacenamiento; pruebas de componente para la cinta y la edición; lint y build en CI. | ✅ |
| V. Un solo servicio | Sin procesos ni servicios nuevos; las migraciones corren en el arranque del mismo proceso. Healthcheck ampliado sin romper su contrato. Sin secretos. | ✅ |
| VI. Simplicidad | Sin temporizadores (el aviso de volumen se evalúa al arrancar y en `/api/health`); umbral fijo; sin CLI de migraciones (se aplican al arrancar). | ✅ |
| VII. UX en español | Todos los mensajes de error nuevos en español; el campo "Fecha de la noche" de solo lectura conserva su etiqueta y foco visible. | ✅ |

**Re-check post-diseño**: sin violaciones. Complexity Tracking vacío.

## Project Structure

### Documentation (this feature)

```text
specs/003-fundaciones-datos/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi-delta.yaml   # cambios de API (health, rangos, fechas, sí/no)
│   └── migraciones.md       # contrato del runner para features futuras
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── db.js                     # abre conexión, pragmas (+busy_timeout), llama a migrate()
│   ├── migrate.js                # NUEVO: runner (R1–R6)
│   ├── migrations/
│   │   ├── 001_esquema_inicial.sql   # NUEVO: DDL actual + siembra de métricas (R5)
│   │   └── 002_una_noche_abierta.js  # NUEVO: precondición + índice único parcial (R7)
│   ├── storage.js                # NUEVO: estado del volumen y aviso en log (R13)
│   ├── util.js                   # isDate estricto, parseRange, localDateOf, circularAvg (R8, R9, R12)
│   ├── app.js                    # /api/health con storage
│   ├── server.js                 # aviso de almacenamiento al arrancar
│   └── routes/
│       ├── sleep.js              # rango, DT-04, 409 desde el índice
│       ├── naps.js               # rango, DT-04
│       ├── metrics.js            # rango, DT-08
│       └── stats.js              # rango obligatorio, circularAvg de util
└── test/
    ├── fixtures/
    │   ├── legacy-db.js          # NUEVO: inicializador anterior congelado (copia del db.js de master)
    │   └── make-legacy-db.js     # NUEVO: genera bases deterministas (pequeña, realista, dos abiertas)
    ├── migrate.test.js           # NUEVO: base nueva, idempotencia, fallo, checksum, CRLF, numeración, respaldo y poda, concurrencia
    ├── migrations-legacy.test.js # NUEVO: huella intacta, dos abiertas, tiempo < 20 s
    ├── compat-previous.test.js   # NUEVO: la versión anterior opera sobre el esquema migrado
    ├── validation-dt.test.js     # NUEVO: DT-02, DT-03, DT-04, DT-08, 409 por índice
    ├── storage.test.js           # NUEVO: ok / warn / unknown y límite de 1 aviso por hora
    └── util.test.js              # + isDate estricto, localDateOf, circularAvg

frontend/src/app/features/night/
├── night.component.ts            # Ribbon.sleeps[] (DT-11); fecha derivada en la edición (FR-025)
├── night.component.html          # itera barras; "Fecha de la noche" readonly
└── night.component.spec.ts       # + dos noches misma fecha; fecha derivada al editar

docs/
├── sdd/guia-migraciones.md       # NUEVO: regla expand/contract (FR-010)
└── runbooks/rollback-migracion.md # NUEVO: restauración del respaldo previo (FR-011)

.gitattributes                    # backend/src/migrations/* text eol=lf (R3)
```

**Structure Decision**: se mantiene la estructura web existente (`backend/` + `frontend/`). Las
migraciones viven bajo `backend/src/` para que el `Dockerfile` no cambie (research R2). No se
crean carpetas de capas nuevas: 003 no introduce `repo/` (eso es de 008).

## Complexity Tracking

Sin violaciones de la constitución que justificar.
