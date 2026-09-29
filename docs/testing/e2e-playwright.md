# Pruebas end-to-end con Playwright

Guía de la suite E2E de Descanso: qué prueba, cómo está montada, cómo ejecutarla y depurarla,
y cómo añadir tests nuevos.

## 1. Objetivo

Las pruebas E2E recorren la app como lo haría la persona usuaria: un navegador real (Chromium)
pulsa botones y rellena campos contra el **servidor real**, el mismo `node backend/src/server.js`
que corre en producción, sirviendo la API y el build de Angular. Cada test cita el escenario de
aceptación que cubre (p. ej. `US1-7`), de modo que la suite es la prueba ejecutable de las specs:

- `specs/001-linea-base/spec.md`: US1–US6, FR-001–FR-029 y casos borde.
- `specs/002-pipeline-ci-cd/spec.md`: versión en el pie (US5, FR-017/018) y respaldo protegido
  (US3-7, FR-021).

**Qué NO duplican.** La lógica de rutas y cálculos ya está cubierta por los tests unitarios del
backend (`node --test`, 66 tests) y las pruebas de componente del frontend (Karma, 37 tests). La
suite E2E comprueba lo que esos tests no ven: que las piezas funcionan juntas en un navegador, que
la interfaz muestra lo que la API devuelve, que la hora y la zona horaria del navegador se
traducen bien a la "fecha de la noche", que los datos sobreviven a un reinicio del proceso y que
la app es usable con teclado y en móvil.

## 2. Arquitectura

```
e2e/
├── package.json            dependencias y scripts (independiente de backend/ y frontend/)
├── playwright.config.ts    navegador, zona horaria, reportes y webServer
├── tsconfig.json           para `npm run typecheck` (tsc --noEmit)
├── scripts/
│   └── build-frontend.mjs  compila Angular solo si hace falta
├── support/
│   ├── env.ts              puerto compartido (3100) y zona horaria de los tests
│   ├── server.ts           AppServer: arranca/reinicia/para un `node backend/src/server.js`
│   ├── fixtures.ts         test/expect extendidos: server, api, setNow, openTab, answerNextDialog…
│   ├── api.ts              cliente mínimo de la API para preparar y verificar datos
│   └── global-teardown.ts  borra la carpeta temporal de la ejecución
└── tests/                  un spec por área
    ├── noche.spec.ts           US1 + regla de fecha de noche
    ├── noches-pasadas.spec.ts  US2
    ├── siestas.spec.ts         US3
    ├── resumen.spec.ts         US4
    ├── metricas.spec.ts        US5
    ├── persistencia.spec.ts    US6
    ├── navegacion.spec.ts      pestañas, pie de versión, servidor caído
    ├── accesibilidad.spec.ts   lang, nombres accesibles, teclado, movimiento reducido, 375 px
    └── operacion.spec.ts       /api/health y /api/admin/backup del proceso real
```

### Cómo arranca una ejecución

1. **webServer (una vez por ejecución).** Playwright lanza
   `node scripts/build-frontend.mjs && node ../backend/src/server.js` con `PORT=3100` y
   `DB_PATH` en una carpeta temporal nueva (`%TEMP%` o `/tmp`, `descanso-e2e-run-*`), y espera a
   que `http://127.0.0.1:3100/api/health` responda. `build-frontend.mjs` compila Angular solo si
   no existe `frontend/dist/frontend/browser` o si algún archivo de `frontend/src`, `public/` o la
   configuración es más nuevo que el build: así nunca se prueba un build viejo.
2. **Servidor aislado (uno por test).** El fixture `server` arranca, para cada test, otro proceso
   `node backend/src/server.js` en un puerto libre y con su propia base SQLite vacía, espera a
   `/api/health`, apunta `baseURL` (y por tanto `page.goto('/')` y `request`) a ese proceso, y al
   terminar lo para y borra su base. Si el test falla, adjunta la salida del proceso al reporte
   (`servidor.log`).
3. **Servidor compartido (solo lectura).** Los tests que no escriben datos (pestañas, pie "dev",
   accesibilidad, 404 del respaldo) usan `test.use({ isolate: false })` y corren contra el
   servidor del webServer.

```
                    ┌──────────────── playwright test ─────────────────┐
                    │                                                  │
 webServer ─────────┤  test (isolate: false) ──► :3100  (base temporal │
 build + :3100      │                                   de la ejecución)
                    │  test (por defecto) ──► AppServer :puerto libre  │
                    │                          base vacía propia       │
                    └──────────────────────────────────────────────────┘
```

## 3. Requisitos

- Node.js 22 (el mismo que el proyecto).
- Dependencias de `backend/` y `frontend/` instaladas (`npm ci` en cada carpeta).
  - **Windows:** si `npm ci` del backend falla al compilar `better-sqlite3` (node-gyp no encuentra
    Visual Studio), usa `npm ci --ignore-scripts`: el paquete trae un binario precompilado.
- Un navegador Chromium:
  - **Local:** por defecto se usa el **Google Chrome instalado** (`channel: 'chrome'`), sin
    descargar nada.
  - **CI o sin Chrome:** `npx playwright install --with-deps chromium` y `E2E_CHANNEL=''` (en CI
    se hace solo porque `CI` está definida).

### Dependencias nuevas (principios I y VI)

`e2e/` tiene su propio `package.json` para no mezclar herramientas de prueba con las
dependencias de la app. Solo añade tres dependencias de desarrollo, ninguna en producción:

| Dependencia        | Por qué                                                                     |
|--------------------|-----------------------------------------------------------------------------|
| `@playwright/test` | runner y navegador automatizado; reloj falso (`page.clock`), zona horaria, trazas y `webServer` integrados. No hay alternativa ya presente en el repo que maneje un navegador real contra el servidor. |
| `typescript`       | `tsc --noEmit` como lint mínimo de los specs (misma versión ~5.9 que el frontend). |
| `@types/node`      | tipos de `child_process`, `fs`, etc. usados por `support/server.ts`.        |

No se añaden ORMs, frameworks ni librerías de UI (principio I). La complejidad extra —un proceso
por test— está justificada en §9.

## 4. Ejecutar en local

### Windows (PowerShell)

```powershell
cd backend;  npm ci --ignore-scripts; cd ..
cd frontend; npm ci; cd ..
cd e2e;      npm ci
npm test                 # headless, con Chrome instalado
npm run report           # abre el reporte HTML de la última ejecución
```

### Linux / macOS

```bash
(cd backend && npm ci) && (cd frontend && npm ci)
cd e2e && npm ci
npm test                                   # con Google Chrome instalado
# Sin Chrome: usar el Chromium de Playwright
npx playwright install --with-deps chromium
E2E_CHANNEL= npm test
npm run report
```

La primera ejecución compila el frontend (~15–30 s). Las siguientes reutilizan el build si no
cambió nada. La suite completa tarda unos 30 s.

### Scripts

| Script                     | Qué hace                                                    |
|----------------------------|-------------------------------------------------------------|
| `npm test`                 | toda la suite, sin ventana (headless)                       |
| `npm run test:headed`      | con el navegador visible, un worker                         |
| `npm run test:ui`          | modo UI de Playwright (ver, filtrar y re-ejecutar tests)    |
| `npm run report`           | abre el reporte HTML (`playwright-report/`)                 |
| `npm run typecheck`        | `tsc --noEmit` sobre config, support y tests                |
| `npm run install:browsers` | `playwright install --with-deps chromium`                   |

Filtrar: `npx playwright test tests/siestas.spec.ts`, `npx playwright test -g "US5-6"`.

### Variables de entorno

| Variable         | Por defecto        | Uso                                                            |
|------------------|--------------------|----------------------------------------------------------------|
| `E2E_PORT`       | `3100`             | puerto del servidor compartido                                 |
| `E2E_CHANNEL`    | `chrome` (local), vacío (CI) | canal del navegador; vacío = Chromium de Playwright  |
| `E2E_REBUILD`    | —                  | `1` fuerza la compilación del frontend                         |
| `E2E_SKIP_BUILD` | —                  | `1` usa el build existente sin comprobarlo (CI)                |
| `CI`             | —                  | activa `forbidOnly`, 1 reintento, 2 workers y el reporte `github` |

Las variables del backend (`APP_VERSION`, `BACKUP_TOKEN`, `DB_PATH`, `PORT`, `FRONTEND_DIST`) de
tu terminal **no** llegan a los servidores de prueba: se limpian para que la ejecución sea
reproducible. Un test que las necesite las pide con `test.use({ serverEnv: {...} })`.

## 5. Depurar

- **Modo UI:** `npm run test:ui`. Lista de tests, reloj de acciones, DOM de cada paso y
  re-ejecución al guardar.
- **Con ventana:** `npm run test:headed -- -g "US1-4"`.
- **Paso a paso:** `npx playwright test -g "US1-4" --debug` abre el inspector.
- **Trazas:** si un test falla, se guardan traza, captura y vídeo en `test-results/<test>/`:
  ```bash
  npx playwright show-trace test-results/<carpeta-del-test>/trace.zip
  ```
  La traza muestra cada acción, el DOM antes y después, la consola y las peticiones de red.
- **Reporte HTML:** `npm run report`. Cada fallo lleva adjuntos la traza y `servidor.log`, la
  salida del proceso del backend de ese test.
- **En CI:** si el job `e2e` falla, descarga el artefacto `playwright-report` desde la ejecución
  (contiene `playwright-report/` y `test-results/`) y abre la traza con `show-trace` o en
  https://trace.playwright.dev.

## 6. Cómo añadir un test nuevo (receta)

1. **Elige el escenario** en la spec y su ID (`US3-2`, `FR-021`, "Borde"). Si no hay uno, ¿es
   comportamiento especificado? Si no lo es, no es un test E2E: primero la spec.
2. **Elige el spec del área** en `e2e/tests/` (o crea `<area>.spec.ts` si es un área nueva).
3. **Importa desde los fixtures**, no desde `@playwright/test`:
   ```ts
   import { expect, openTab, setNow, test } from '../support/fixtures';
   ```
4. **Nombra el test con el ID** al principio y el resultado esperado en lenguaje de la spec:
   ```ts
   test('US3-2 · con fin igual o anterior al inicio avisa y deshabilita "Guardar siesta"', async ({ page }) => {
   ```
5. **Fija el reloj antes de navegar** si el test depende de "hoy" o "ahora":
   ```ts
   await setNow(page, '2026-09-08T15:00');   // hora local -04:00
   await page.goto('/');
   ```
   Para "pasar la noche", vuelve a llamar a `setNow` y recarga (`page.reload()`).
6. **Prepara con la API lo que no es objeto del test** (p. ej. noches previas para el resumen)
   con el fixture `api`, y **actúa con la interfaz** sobre lo que sí lo es:
   ```ts
   await api.createNight('2026-09-20T23:30', '2026-09-21T06:30');
   await api.createNap('2026-09-25T15:00', '2026-09-25T15:30');
   ```
7. **Usa selectores accesibles:** `getByRole`, `getByLabel`, `getByText`. Acota con
   `filter({ has | hasText })` (p. ej. la tarjeta `article` de una noche). Recurre a CSS solo si
   la interfaz no tiene semántica (resumen, cinta, grupos de siestas) y déjalo comentado.
8. **Diálogos `confirm()`:** crea la promesa antes del clic:
   ```ts
   const answered = answerNextDialog(page, false);   // false = Cancelar
   await card.getByRole('button', { name: 'Eliminar' }).click();
   expect(await answered).toBe('confirm: ¿Eliminar esta siesta?');
   ```
9. **Aislamiento:** por defecto el test tiene su propio servidor con base vacía. Solo si el test
   **no escribe nada** puede usar el compartido con `test.use({ isolate: false })`. Para
   variables del backend: `test.use({ serverEnv: { APP_VERSION: '…' } })`. Para reiniciar el
   proceso: `await server.restart()`.
10. **Comprueba que el test puede fallar:** rompe a propósito el comportamiento (o la
    expectativa), mira que falla por el motivo correcto y deshaz el cambio.
11. `npm run typecheck && npm test`, y añade la fila al mapa de §7.

**Si encuentras un bug de la app**, no lo arregles dentro del cambio del test: márcalo con
`test.fixme(...)`, un comentario `// BUG (<ID>): …` con cómo reproducirlo, y repórtalo.

## 7. Mapa escenario → test

Leyenda: ✅ cubierto · ⚠️ `test.fixme` (bug abierto) · — fuera del alcance E2E.

### 001 · Línea base

| Escenario | Test (archivo › título) | |
|-----------|--------------------------|---|
| US1-1 | noche › US1-1 · "Me voy a dormir" con la hora propuesta abre la noche en un solo gesto | ✅ |
| US1-2 | noche › US1-2 · con una noche abierta se ve "Te acostaste a las HH:MM"… también tras recargar | ✅ |
| US1-3, US1-6 | noche › US1-3 · US1-6 · dormir 23:40 del lunes y despertar 07:10 del martes… | ✅ |
| US1-4 | noche › US1-4 · despertar a una hora igual o anterior a la de dormir se rechaza… | ✅ |
| US1-5 | noche › US1-5 · cerrar cuando ya no hay noche abierta informa… | ✅ |
| US1-7 | noche › US1-7 · si otra noche se abrió por la API, "Me voy a dormir" muestra el 409 en un role=alert | ✅ |
| US1-7 | noche › US1-7 · quitar el despertar de otra noche al editarla se rechaza si ya hay una abierta | ✅ |
| SC-003 / principio III | noche › US1-1 (23:40 → lunes), US1-3·US1-6 (23:40 → lunes), Regla de fecha de noche (00:30 → martes), US2-1 (22:15 → ese día) | ✅ |
| Borde: reabrir al editar (FR-003) | noche › Borde · FR-003 · vaciar el despertar al editar reabre la noche si no hay otra abierta | ✅ |
| Borde: recarga con noche abierta | noche › US1-2 (recarga) | ✅ |
| US2-1 | noches-pasadas › US2-1 · una noche pasada válida queda cerrada con la fecha del día en que se acostó | ✅ |
| US2-2 | noches-pasadas › US2-2 · "Guardar noche" está deshabilitado mientras falte dormir o despertar | ✅ |
| US2-3 | noches-pasadas › US2-3 · editar horas y notas actualiza la lista y la duración | ✅ |
| US2-4 | noches-pasadas › US2-4 · "Eliminar" pide confirmación: cancelar no cambia nada, confirmar la quita | ✅ |
| US2-5 | noches-pasadas › US2-5 · una edición con despertar no posterior a dormir se rechaza… | ✅ |
| US2-6 (FR-009) | noches-pasadas › US2-6 · una nota de más de 500 caracteres se guarda recortada… | ✅ |
| US3-1 | siestas › US3-1 · el formulario propone los últimos 30 minutos y muestra "Duración: 30 min" | ✅ |
| US3-2 | siestas › US3-2 · con fin igual o anterior al inicio avisa y deshabilita "Guardar siesta" | ✅ |
| US3-3 (FR-011) | siestas › US3-3 · dos siestas del mismo día (20 y 45 min) se agrupan como "2 siestas · 1 h 05 min" | ✅ |
| US3-4 (FR-012) | siestas › US3-4 · lista 30 días con hoy incluido… una siesta de hace 31 días no aparece | ✅ |
| US3-5 | siestas › US3-5 · editar y eliminar (con confirmación) una siesta actualiza la lista | ✅ |
| US4-1, US4-2, US4-3 | resumen › US4-1 · US4-2 · US4-3 · promedio 7 h 30 min, hora media 00:00 (circular), la noche abierta no cuenta | ✅ |
| US4-4 | resumen › US4-4 · 3 siestas en el rango se muestran como "3 siestas en 14 días" | ✅ |
| US4-5 | resumen › US4-5 · sin datos: horas medias "—", duración media "0 min" y 0 siestas | ✅ |
| US4-6 (FR-015) | resumen › US4-6 · la cinta tiene 14 filas (hoy arriba)… ~46 %… un tercio… | ✅ |
| Borde: noche después de las 12:00 | resumen › Borde · una noche que termina después de las 12:00… se recorta | ✅ |
| US5-1 (FR-025) | metricas › US5-1 · una instalación nueva trae "Calidad del sueño", "Energía al despertar" y "Cafés" | ✅ |
| US5-2 (FR-017) | metricas › US5-2 · crear una escala sin nombre o con mínimo ≥ máximo se rechaza | ✅ |
| US5-3 | metricas › US5-3 · pulsar un valor de escala lo guarda para el día; pulsarlo otra vez lo borra | ✅ |
| US5-4 (FR-022) | metricas › US5-4 · una métrica numérica con mínimo 0 rechaza -1 con "Mínimo 0" | ✅ |
| US5-5 | metricas › US5-5 · una métrica sí/no empieza "Sin registrar" y alterna entre "Sí" y "No" | ✅ |
| FR-016, FR-022 | metricas › FR-016 · crear una métrica de texto y otra numérica con unidad… editar el nombre | ✅ |
| US5-6 (FR-020) | metricas › US5-6 · subir una métrica cambia el orden y se conserva al recargar | ✅ |
| US5-7 (FR-018) | metricas › US5-7 · archivar oculta la métrica… conserva sus valores y se puede restaurar | ✅ |
| US5-8 (FR-019) | metricas › US5-8 · eliminar una métrica archivada pide confirmación… | ✅ |
| US5-9, FR-023, FR-024 | metricas › US5-9 · FR-023 · FR-024 · hoy no se puede avanzar… historial de 7 días | ✅ |
| FR-023 (fecha tecleada) | metricas › FR-023 · escribir una fecha futura en el selector de día no permite seleccionarla | ⚠️ |
| FR-021 | metricas › FR-021 · vaciar el valor de una métrica numérica o de texto borra el registro | ✅ |
| Borde: escala de más de 11 valores | metricas › Borde · una escala con más de 11 valores… solo 11 botones | ✅ |
| US6-1, US6-3, SC-004 | persistencia › US6-1 · US6-3 · tras reiniciar el servicio el 100 % de los datos sigue igual… | ✅ |
| US6-2 | persistencia › US6-2 · los datos registrados en un navegador se ven en otro | ✅ |
| FR-027 (pestañas) | navegacion › FR-027 · la app abre en "Noche" y navega entre Noche, Siestas y Métricas | ✅ |
| Borde: servidor no disponible | navegacion › Borde · con el servidor caído la app muestra "No se pudo conectar con el servidor" | ✅ |
| FR-027 (español, foco, movimiento, responsive) | accesibilidad › 4 tests (lang/nombres, teclado y foco, reduced-motion, 375 px) | ✅ |
| FR-029 | operacion › FR-029 (001) · FR-018 · /api/health responde ok con la versión "dev" | ✅ |
| Borde: varias noches con la misma fecha | resumen › Borde · dos noches cerradas con la misma fecha se suman… y la cinta muestra solo una | ✅ |
| Borde: zona horaria distinta entre registros | tests unitarios (`frontend/src/app/core/time.spec.ts`, `backend/test/util.test.js`); la suite E2E usa una sola zona | — |

### 002 · Pipeline

| Escenario | Test | |
|-----------|------|---|
| US5-2, FR-017, FR-018 | navegacion › 002 US5-2 · FR-017 · FR-018 · el pie muestra el SHA corto del commit… | ✅ |
| US5-3, FR-017 | navegacion › 002 US5-3 · FR-017 · sin versión inyectada el pie muestra "Versión dev" | ✅ |
| US3-7, FR-021 | operacion › 002 US3-7 · FR-021 · sin token o con uno inválido responde 401…; con el válido entrega la base | ✅ |
| FR-021 (deshabilitado) | operacion › FR-021 · sin BACKUP_TOKEN el endpoint de respaldo no existe (404) | ✅ |
| Arranque con puerto ocupado (relacionado con FR-007) | operacion › un puerto ocupado hace fallar el arranque con código distinto de 0… | ⚠️ |
| US1–US4 (pipeline, imagen, despliegue, respaldos, entorno local) | se verifican en GitHub Actions y en los runbooks, no en el navegador | — |

## 8. CI

`.github/workflows/ci.yml` tiene dos jobs que corren en paralelo:

- `quality` (sin cambios): lint, tests unitarios y build. Es el check **requerido** en `master`.
- `e2e`: instala el backend (solo producción) y el frontend, compila Angular, instala las
  dependencias de `e2e/` y Chromium (con caché de `~/.cache/ms-playwright`), ejecuta
  `tsc --noEmit` y la suite con `E2E_SKIP_BUILD=1`, y si algo falla sube el artefacto
  `playwright-report` (reporte HTML + trazas, 14 días).

Como `deploy.yml` reutiliza `ci.yml`, un fallo de `e2e` también impide publicar y desplegar.

**Recomendación (no aplicada):** tras unas semanas sin fallos intermitentes, añadir `e2e` como
check requerido en la protección de `master` (Settings → Branches → master → *Require status
checks* → `e2e`). Hasta entonces, un PR podría fusionarse con `e2e` en rojo, aunque el
despliegue de ese merge no se publicaría.

## 9. Decisiones y trade-offs

**Aislamiento de datos: un servidor por test.** La app no tiene endpoint de reinicio y hay estado
global (solo puede haber una noche abierta; las métricas iniciales se crean en una base vacía).
Se valoraron tres opciones:

| Opción | Pros | Contras |
|--------|------|---------|
| workers=1 + limpieza por la API | un solo proceso | serie (lento), la limpieza es código que puede fallar y no puede recrear una "instalación nueva" de verdad (US5-1) |
| tests independientes del estado | paralelo | imposible para US1 (noche abierta global), US4 (cifras exactas) o US5-1 |
| **un proceso por test con base propia** (elegida) | aislamiento total, paralelo, permite reiniciar el proceso (US6-1) y variar el entorno (`APP_VERSION`, `BACKUP_TOKEN`) | ~0,3–0,5 s de arranque por test y ~100 líneas de soporte (`support/server.ts`) |

El coste es bajo (la suite completa tarda ~30 s) y elimina toda una clase de fallos intermitentes
por orden de ejecución. El `webServer` se mantiene como servidor compartido de solo lectura y como
comprobación temprana de que la app arranca con el build actual.

**Puertos.** Cada worker usa un rango propio de 20 puertos (`20000 + 20 × parallelIndex`), por
debajo de los rangos efímeros de Windows y Linux, y elige el primero libre. La primera versión
pedía el puerto 0 al sistema, y en ~1 de cada 200 tests dos workers recibían el mismo puerto
recién liberado. Como `server.js` no detecta el puerto ocupado (ver §10), el segundo proceso
terminaba con código 0 y el test podía hablar con el servidor de otro worker. Con rangos
disjuntos, además de comprobar que el proceso sigue vivo cuando responde `/api/health`, la suite
pasó 5 repeticiones seguidas (255 ejecuciones) sin fallos.

**Fechas deterministas.** La app calcula "hoy" y la fecha de la noche con el reloj y la zona
horaria del navegador. Por eso:

- `timezoneId: 'America/La_Paz'` en el config: -04:00 todo el año, sin horario de verano, el
  mismo offset que usan los tests del backend.
- `page.clock.setFixedTime(...)` vía `setNow()`: fija `Date` pero deja correr los temporizadores,
  así Angular funciona normal. Se descartó `clock.install()` porque congela también los timers y
  obliga a avanzarlos a mano. Se fija antes de `goto`; para "pasar la noche" se vuelve a fijar y
  se recarga.
- Los datos preparados usan fechas absolutas (2026-09-…) coherentes con el reloj fijado, nunca
  la fecha real de la máquina.
- Los textos de fecha ("lun, 7 sept") se calculan en el propio navegador (`fmtDateShort`) para
  no depender de diferencias de ICU entre Node y Chrome.

**Selectores.** Roles, etiquetas y textos visibles, que además validan la accesibilidad. Donde
la interfaz no tiene semántica (resumen, cinta, grupos de siestas) se usa la clase CSS mínima y
se comenta. No hay page objects: los helpers pequeños por spec (`card`, `record`, `stat`)
bastan y no hay duplicación entre áreas que justifique una capa más.

**Fuentes externas bloqueadas.** `index.html` carga una fuente de Google Fonts. Los tests abortan
esas peticiones para no depender de la red.

**CI.** Job separado para no alargar ni arriesgar `quality`. Un reintento en CI para absorber
ruido de infraestructura; los reintentos aparecen como *flaky* en el reporte y no deben
ignorarse. En local, sin reintentos.

## 10. Limitaciones conocidas

- **Solo Chromium.** La app es personal y se usa en Chrome/Android; añadir Firefox o WebKit es
  un proyecto más en `playwright.config.ts`.
- **Reinicio abrupto.** `server.restart()` mata el proceso (sin cierre ordenado) y arranca otro
  sobre la misma base: prueba el caso más exigente, pero no un apagado ordenado.
- **Accesibilidad básica, no auditoría.** Se comprueban `lang`, nombres accesibles, foco visible,
  teclado, movimiento reducido y ausencia de scroll horizontal a 375 px; no contraste ni
  lectores de pantalla (se podría añadir `@axe-core/playwright`, justificándolo).
- **Selectores CSS en resumen, cinta y grupos de siestas**, porque no tienen roles. Dar a esas
  zonas semántica (p. ej. `<dl>` para el resumen, `aria-label` por día) haría los tests más
  robustos y mejoraría la accesibilidad.
- **Windows:** el servidor compartido aún tiene abierta su base cuando corre el teardown, así que
  `%TEMP%\descanso-e2e-run-*` no se puede borrar en esa ejecución. El teardown borra las carpetas
  `descanso-e2e-*` de más de una hora en la siguiente.
- **Bug abierto (FR-023):** escribir con el teclado una fecha futura en el selector de día de
  Métricas la selecciona y permite registrar valores en el futuro: el `max` del
  `<input type="date">` solo limita el calendario desplegable y `setDate()` no lo valida (la API
  tampoco). El test está como `test.fixme` en `metricas.spec.ts`; al corregirlo, cambiar
  `test.fixme` por `test`.
- **Bug abierto (operación):** si el puerto está ocupado, `node backend/src/server.js` imprime
  "escuchando en …" y termina con código 0. Con Express 5, `app.listen()` pasa el error
  (`EADDRINUSE`) al callback, y `server.js` no lo comprueba. El test está como `test.fixme` en
  `operacion.spec.ts`.
