# Research: Línea base del tracker de descanso

**Feature**: `001-linea-base` | **Fecha**: 2026-09-29

El Technical Context del plan no tiene incógnitas abiertas: el stack está fijado por la
constitución y el código actual es la implementación de referencia. Este documento registra
las decisiones de pruebas y de ajustes mínimos, y el inventario de deuda técnica.

## Decisiones

### D1. Tests de backend: `node:test` + `supertest`

- **Decision**: `node:test` (runner nativo de Node 22) con `node:assert/strict`, y `supertest`
  para las rutas HTTP. Script `npm test` → `node --test`.
- **Rationale**: pedido explícito en el contexto técnico; cero frameworks adicionales salvo
  `supertest` (dependencia de desarrollo). Cada archivo de test corre en su propio proceso, así
  que cada uno obtiene su propia base.
- **Alternatives considered**: Jest/Vitest (más dependencias y configuración, sin ventaja aquí).

### D2. Aislamiento de la base en tests: `DB_PATH=:memory:`

- **Decision**: los tests fijan `process.env.DB_PATH = ':memory:'` antes de requerir la app.
  `db.js` ya lee `DB_PATH`, y `mkdirSync('.')` es inocuo.
- **Rationale**: no hace falta tocar `db.js`; cada proceso de test arranca con el esquema y las
  3 métricas iniciales, igual que una instalación nueva (US5-1, FR-025).
- **Alternatives considered**: archivo temporal por test (más lento, necesita limpieza).
  Para US6 (persistencia entre reinicios) sí se usa un archivo temporal, abriendo la app dos
  veces en procesos distintos.

### D3. Separar la app de `listen()`: `backend/src/app.js`

- **Decision**: mover la construcción de la app Express de `server.js` a `app.js`, que la
  exporta; `server.js` queda como `require('./app').listen(PORT)`.
- **Rationale**: `supertest` necesita la app sin puerto abierto. Es el cambio mínimo, sin
  cambiar el comportamiento.
- **Alternatives considered**: arrancar el servidor real en un puerto en los tests (frágil y
  lento).

### D4. Tests de frontend: Angular TestBed sobre Karma/Jasmine ya configurados

- **Decision**: usar el builder `@angular/build:karma` que ya está en `angular.json`, con
  `TestBed`, `provideHttpClient()` y `provideHttpClientTesting()` (`HttpTestingController`)
  para simular la API. Funciones puras de `core/time.ts` con specs Jasmine simples.
- **Rationale**: ya viene instalado; no añade dependencias. En CI se ejecuta con
  `ng test --watch=false --browsers=ChromeHeadless`.
- **Alternatives considered**: migrar a Vitest/Jest (reescritura de configuración, fuera de
  alcance).

### D5. Regla de fecha de noche: función pura `nightDate(iso)` en `core/time.ts`

- **Decision**: extraer el cálculo que hoy está en línea (`iso.slice(0, 10)`) a `nightDate()` y
  usarla en NightComponent y NapsComponent. Mismo resultado, ahora con test explícito.
- **Rationale**: principio III (la regla se prueba explícitamente) y SC-003. El ISO lleva el
  offset local, así que sus 10 primeros caracteres son el día local en que la persona se acuesta.
- **Alternatives considered**: probarlo solo a través del componente (tests más frágiles).

### D6. Una sola noche abierta en el servicio (clarificación FR-003)

- **Decision**: `POST /api/sleep` sin `wake_time` y `PUT /api/sleep/:id` que deja `wake_time`
  en null responden **409** `{ error: "Ya hay una noche abierta. Ciérrala antes de abrir otra." }`
  si existe otra noche abierta (id distinto).
- **Rationale**: 409 Conflict describe un conflicto con el estado actual; el formato de error
  es el que ya usa la app.
- **Alternatives considered**: 400 (el cuerpo es válido; el problema es el estado); índice
  único parcial en SQLite (sería un cambio de esquema y exigiría una migración, principio II;
  desproporcionado).

### D7. Lint mínimo

- **Decision**: ESLint con configuración plana y `@eslint/js` recommended en backend;
  `angular-eslint` (schematic `ng add @angular-eslint/schematics`) en frontend. Script
  `npm run lint` en ambos. Se corrigen solo los errores que aparezcan, sin reglas de estilo.
- **Rationale**: el principio IV exige lint sin errores para dar una tarea por terminada y hoy
  no hay linter. La feature 002 lo usará en CI.
- **Alternatives considered**: posponerlo a 002 (dejaría esta feature sin cumplir el principio
  IV).

### D7b. CI mínimo en esta feature

- **Decision**: `.github/workflows/ci.yml` con un solo job (Node 22) que ejecuta lint, tests y
  build de backend y frontend en cada PR y en cada push a `main`.
- **Rationale**: el principio IV exige que el build de producción pase en CI para cerrar una
  tarea. Sin CI, ninguna tarea de esta feature podría darse por terminada.
- **Alternatives considered**: esperar a la 002. Se descarta porque dejaría la 001 incumpliendo
  la constitución. La 002 amplía este workflow (caché, imagen en GHCR, despliegue, badge).

### D8. Contrato de la API: OpenAPI 3.1 extraído de las rutas

- **Decision**: `contracts/openapi.yaml` describe las 19 operaciones actuales más el 409 de D6.
  Es documentación y guía de los tests de contrato; no se genera código a partir de él.
- **Rationale**: pedido en el contexto técnico; hace explícitos los códigos y mensajes que los
  tests deben comprobar.

## Deuda técnica detectada (no se corrige en esta feature)

| # | Área | Hallazgo | Impacto | Sugerencia |
|---|------|----------|---------|------------|
| DT-01 | Persistencia | El esquema se crea con `CREATE TABLE IF NOT EXISTS`, sin tabla de versiones ni migraciones. | Incumple el principio II en cuanto haya un cambio de esquema. | Introducir `schema_version` + migraciones idempotentes en la primera feature que cambie el esquema. |
| DT-02 | API | `GET /api/stats` sin `from`/`to` responde 500 (se pasan `undefined` a la consulta). | Error interno ante una petición mal formada. | Validar parámetros y responder 400. |
| DT-03 | API | `from`/`to` no se validan en `/sleep`, `/naps` ni `/metrics/entries`. | Filtros silenciosamente incorrectos. | Validar con `isDate`. |
| DT-04 | Datos | El servicio confía en la `date` que envía el cliente; no comprueba que coincida con el día local de `bedtime`/`start_time`. | La regla de fecha de noche solo la garantiza el frontend. | Validar o derivar `date` en el servicio. |
| DT-05 | Datos | No se valida el solapamiento de noches ni de siestas, y se aceptan horas futuras. | Puede haber datos incoherentes. | Decidirlo en una feature propia. |
| DT-06 | Métricas | El reordenado envía N `PUT` independientes, sin transacción. | Orden inconsistente si falla uno. | Endpoint de reordenado en lote y transaccional. |
| DT-07 | Métricas | Al cambiar el tipo de una métrica con valores, los valores antiguos no se revalidan. | Valores incoherentes con el tipo nuevo. | Impedir el cambio de tipo con valores o migrarlos. |
| DT-08 | Métricas | `validateValue` guarda `'0'` para cualquier valor no reconocido en sí/no. | Entradas erróneas se guardan como "No". | Rechazar valores no booleanos. |
| DT-09 | Métricas | Escalas de más de 11 valores se truncan en la UI sin aviso. | Valores no seleccionables. | Limitar el rango al crearla o usar otro control. |
| DT-10 | Tiempo | La lista muestra horas en la zona del dispositivo; el resumen usa la hora local registrada (offset del ISO). | Discrepancias si se cambia de zona horaria. | Documentar o unificar el criterio. |
| DT-11 | Cinta | Si hay varias noches con la misma fecha, la cinta muestra solo la última procesada. | Información oculta. | Dibujar todas las barras. |
| DT-12 | UI | Textos "Ya despertí" y "Despertí". | Errata visible. | **Se corrige en esta feature** (clarificación de la spec). |
| DT-13 | UI | Confirmaciones con `window.confirm`. | Poco accesible, difícil de probar. | Diálogo propio accesible. |
| DT-14 | Plataforma | `backend/package.json` declara `node >=20` y el README dice Node 20+; la constitución fija Node 22 LTS. | Desalineado con el principio I. | **Se corrige en esta feature** (T001, T029). |
| DT-15 | Despliegue | El Dockerfile no tiene `HEALTHCHECK`, y `render.yaml` no define `healthCheckPath`. | Incumple parcialmente el principio V. | Feature 002. |
| DT-16 | Despliegue | La imagen final conserva `python3 make g++` y no hay `.dockerignore`. | Imagen grande; posible copia de `node_modules`/`data` locales. | Build de dependencias nativas en una etapa aparte y `.dockerignore`. |
| DT-17 | Seguridad | `cors()` abierto a cualquier origen y sin autenticación. | Cualquiera con la URL puede leer y modificar los datos. | Decidirlo en una feature de acceso. |
| DT-18 | Calidad | No hay tests, lint ni CI. | Incumple el principio IV. | Tests, lint y CI mínimo: **esta feature**. Pipeline completo: feature 002. |
| DT-19 | Frontend | `run(obs: { subscribe: Function })` y `any` en los handlers de error. | Tipado débil. | Tipar como `Observable<unknown>` y `HttpErrorResponse`. |
| DT-21 | Resumen | La media circular puede devolver `1440` en lugar de `0` (p. ej. 23:30 y 00:30), por un residuo de coma flotante en `atan2`. Detectado al implementar. | Ninguno visible: `fmtMinutesOfDay` muestra 00:00. Sí rompe el rango 0–1439 del contrato. | Aplicar `% 1440` al resultado de `circularAvg`. |
| DT-22 | Siestas | `formDuration` era un `computed()` sobre `form`, que es un objeto plano y no un signal: se calculaba una vez y no se actualizaba al editar. Detectado por el test de US3-2. | La validación de fin > inicio no funcionaba en la UI. | **Corregido en esta feature**: ahora es un método. |
| DT-20 | Frontend | La fuente se carga desde Google Fonts. | Dependencia externa; sin fuente si no hay red. | Alojar la fuente localmente (opcional). |
| DT-23 | Resumen | `/api/stats` agrega por fecha y conserva solo la última `bedtime`/`wake_time` del día. Detectado en 003. | Con dos noches en una fecha, la hora media ignora una. | Agregar por noche, no por día, en una feature de métricas (005). |
| DT-24 | Validación | `isIso` acepta cualquier cadena que `Date.parse` entienda (p. ej. `Sep 7 2026`). Detectado en 003. | Desde 003 esas horas se rechazan de hecho en `bedtime`/`start_time`, pero no en `wake_time`/`end_time`. | Exigir ISO 8601 con desfase en todas las horas. |

**Resueltas por la feature 003** (`specs/003-fundaciones-datos/`): DT-01 (migraciones versionadas),
DT-02 y DT-03 (validación de rangos), DT-04 (fecha de la noche validada en el servicio), DT-08
(sí/no estricto), DT-11 (la cinta dibuja todas las noches) y DT-21 (`% 1440`). DT-05 sigue abierta;
003 solo garantiza en la base que hay como máximo una noche abierta.

**Resuelta por la feature 004** (`specs/004-acceso-protegido/`): DT-17 (la API exige sesión; CORS
eliminado; CSRF por origen; límite de intentos y cabeceras de seguridad).
