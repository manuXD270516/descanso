# Research: Fundaciones de datos (003)

Cada decisión sigue el formato Decisión / Razón / Alternativas. Los DT-xx remiten a
`specs/001-linea-base/research.md`.

## R1. Runner propio, síncrono, dentro de `db.js`

- **Decisión**: `backend/src/migrate.js` exporta `migrate(db, { dir, backupDir, log })`, que es
  síncrono. `db.js` abre la conexión, aplica los pragmas y llama a `migrate()` antes de exportar
  `db`. Como `app.js` requiere `db.js` antes de crear rutas y `server.js` llama a `listen()` después
  de requerir `app.js`, **ninguna petición (ni `/api/health`) se atiende hasta que terminan las
  migraciones** (FR-001, US1-7). Si `migrate()` lanza, el proceso termina con código 1 y el
  healthcheck de Fly falla: el pipeline de 002 hace rollback automático.
- **Razón**: better-sqlite3 es síncrono; así los tests (que usan `DB_PATH=:memory:` y requieren
  `app`) obtienen el esquema igual que hoy, sin cambiar `helpers.js`.
- **Alternativas**: librerías (umzug, knex, node-pg-migrate) → violan el principio I o añaden
  dependencias para ~80 líneas de código. Runner asíncrono en `server.js` → obligaría a cambiar los
  tests y abre una ventana en la que `app` existe sin esquema.

## R2. Formato de las migraciones

- **Decisión**: archivos en `backend/src/migrations/NNN_nombre.sql` o `NNN_nombre.js`.
  - `.sql`: se ejecuta con `db.exec()`.
  - `.js`: exporta `up(db)`; se usa cuando hace falta lógica (p. ej. comprobar datos antes de un
    índice).
  - La versión es el prefijo numérico; se ordenan numéricamente; un hueco o un duplicado de
    versión aborta el arranque.
- **Razón**: al vivir bajo `backend/src/`, el `Dockerfile` ya los copia (`COPY backend/src ./src`);
  no hay que tocar la imagen. El archivo de la feature proponía `backend/migrations/`: se cambia por
  esta razón.
- **Alternativas**: solo SQL → la comprobación de noches abiertas (FR-020) necesita lógica y un
  mensaje propio. Solo JS → peor legibilidad para cambios triviales.

## R3. Checksum estable entre Windows y Linux

- **Decisión**: SHA-256 (`node:crypto`) del contenido del archivo **con los finales de línea
  normalizados a `\n`** y sin BOM. Se guarda en hexadecimal.
- **Razón**: el repositorio se edita en Windows (`core.autocrlf` convierte a CRLF en la copia de
  trabajo) y se despliega en Linux; sin normalizar, la misma migración tendría dos huellas y el
  arranque abortaría (FR-004) en el primer despliegue.
- **Alternativas**: `.gitattributes` con `eol=lf` → ayuda, pero no protege frente a editores que
  añaden BOM; se añade igualmente `backend/src/migrations/* text eol=lf` como defensa extra.

## R4. Atomicidad y concurrencia

- **Decisión**: cada migración corre en `db.transaction(fn).immediate()`. Dentro de la transacción
  se vuelve a comprobar si la versión ya está en `schema_migrations`; si está, no hace nada
  (FR-009). El registro de la versión se inserta en la misma transacción que el cambio (FR-002).
- **Razón**: `BEGIN IMMEDIATE` toma el bloqueo de escritura de SQLite; un segundo proceso espera
  (`busy_timeout` de 5 s) y, al entrar, ve la versión ya registrada. En SQLite el DDL es
  transaccional, así que un fallo deshace también los `CREATE`.
- **Alternativas**: archivo de bloqueo → frágil si el proceso muere. Una sola transacción para
  todas las migraciones → un fallo en la N deshace las anteriores ya validadas; se prefiere
  atomicidad por migración, como pide la spec.
- **Nota**: `PRAGMA foreign_keys` no se puede cambiar dentro de una transacción; ninguna migración
  de 003 lo necesita. La guía expand/contract lo documenta para el futuro.

## R5. Línea base sobre la base existente

- **Decisión**: `001_esquema_inicial.sql` contiene exactamente el DDL actual de `db.js` con
  `CREATE TABLE/INDEX IF NOT EXISTS`, más la siembra de métricas iniciales como
  `INSERT … SELECT … WHERE NOT EXISTS (SELECT 1 FROM metrics)`.
  - Base existente: todos los `IF NOT EXISTS` y el `WHERE NOT EXISTS` son no-ops → 0 filas
    cambiadas (FR-005, SC-001). Se registra la versión 1.
  - Base nueva: crea el esquema y siembra las 3 métricas.
- **Razón**: una única ruta de código para base nueva y existente; nada de detectar "legacy" con
  heurísticas.
- **Alternativas**: detectar la base antigua e insertar la fila de la versión 1 a mano → dos
  caminos distintos que probar y un riesgo de divergencia.
- **Siembra**: sale de `db.js` y pasa a la migración. Diferencia de comportamiento aceptada: hoy, si
  alguien borrara todas las métricas, se resembrarían en cada arranque; con 003 solo se siembran al
  aplicar la versión 1. Sí es observable (las métricas se pueden eliminar), y se considera
  una mejora: si eliminas las métricas de ejemplo, ya no reaparecen al reiniciar.

## R6. Respaldo previo con `VACUUM INTO`

- **Decisión**: antes de aplicar la primera migración pendiente, si la base es un archivo y ya
  contiene tablas de usuario (`sleep_records` existe), se ejecuta
  `VACUUM INTO '<dir>/backups/pre-NNN.db'` (NNN = primera versión pendiente, con ceros). Si el
  archivo ya existe (reintento tras un fallo: la base no cambió, así que la copia nueva es
  equivalente), se borra antes, porque `VACUUM INTO` no sobrescribe. Después se borran los `pre-*.db` salvo los 3 de versión más alta.
  Si `VACUUM INTO` falla (p. ej. disco lleno), se aborta sin migrar (FR-008).
- **Razón**: `VACUUM INTO` es **síncrono** y produce una copia consistente y compacta, compatible
  con el modo WAL; `db.backup()` de better-sqlite3 es asíncrono y obligaría a un runner asíncrono
  (ver R1). El archivo de la feature sugería `db.backup()`: se cambia por esta razón.
- **Alternativas**: copiar el archivo con `fs.copyFileSync` → en WAL puede quedar inconsistente
  sin checkpoint. Guardar respaldos en S3 → ya lo hace el workflow diario de 002; aquí se busca un
  punto de restauración inmediato, local.
- **Ubicación**: `path.join(path.dirname(DB_PATH), 'backups')` → en Fly, `/data/backups/`
  (mismo volumen). Con `:memory:` no hay respaldo.

## R7. Una sola noche abierta en la base (FR-019, FR-020)

- **Decisión**: `002_una_noche_abierta.js`:
  1. cuenta `SELECT id, date FROM sleep_records WHERE wake_time IS NULL`; si hay más de una, lanza
     un error con los ids y fechas y la instrucción "Cierra o borra las noches sobrantes desde la
     app anterior (o con `flyctl ssh console`) y vuelve a desplegar";
  2. si no, `CREATE UNIQUE INDEX ux_sleep_one_open ON sleep_records(wake_time IS NULL) WHERE
     wake_time IS NULL`.
  - **Revisado al implementar:** las rutas ya no usan `assertNoOtherOpen()`. El índice es la
    única garantía y `writeNight()` traduce su error `SQLITE_CONSTRAINT_UNIQUE` a 409 con el
    mismo mensaje. Con better-sqlite3 (síncrono, un proceso) la comprobación previa hacía
    inalcanzable esa traducción; así hay menos código y el camino queda probado por HTTP.
- **Razón**: índice parcial sobre una expresión constante para las filas abiertas: SQLite lo
  admite desde 3.9. Es un cambio **aditivo** (expand): la versión anterior ya respeta la regla en
  código, así que no la rompe.
- **Alternativas**: trigger `BEFORE INSERT` → más código y mensaje menos claro. Cerrar
  automáticamente la noche sobrante → toca datos del usuario (prohibido por la spec y el
  principio II).

## R8. Fecha de la noche = día local de la hora de inicio (DT-04, FR-015)

- **Decisión**: `localDateOf(iso)` devuelve los 10 primeros caracteres del ISO cuando cumple
  `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}`; si no, `null`. En noches (`bedtime`) y siestas (`start_time`),
  al crear y al editar, si `date !== localDateOf(inicio)` → 400
  `La fecha de la noche debe ser AAAA-MM-DD (el día en que te acostaste)` (siestas: "el día en que
  empezó la siesta"). La hora de pared del ISO **ya es la hora local** del usuario porque el
  cliente envía el desfase (principio III); no hace falta convertir zonas.
- **Razón**: coherente con `minutesOfDay()` de `stats.js`, que ya lee la hora de pared del ISO.
  Aclaración de la sesión 2026-09-29: rechazar, nunca derivar.
- **Frontend (FR-025)**: en la edición de noches, "Fecha de la noche" pasa a `readonly` y muestra
  `nightDate(edit.bedtime)`; `saveEdit` envía ese valor. Las siestas ya envían `nightDate(start)`.
  La prueba e2e US2-3 sigue siendo válida (lee el valor del campo).

## R9. Fechas de calendario reales (DT-02, DT-03)

- **Decisión**: `isDate(v)` exige `^\d{4}-\d{2}-\d{2}$` **y** que
  `new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v` (V8 acepta `2026-02-30` y lo
  desborda a marzo). Nueva función `parseRange(query, { required })` en `util.js`:
  - `from`/`to` opcionales en `/sleep`, `/naps` y `/metrics/entries`; si vienen, deben ser fechas
    válidas; `from > to` → 400.
  - obligatorios en `/stats` (DT-02).
- **Razón**: una única validación reutilizada; el frontend ya envía siempre el rango a `/stats`.
- **Alternativas**: validar con una librería de esquemas (zod, ajv) → dependencia nueva sin
  justificación (principio I).

## R10. Sí/no estricto (DT-08, FR-016)

- **Decisión**: `true`, `'true'`, `1`, `'1'` → `'1'`; `false`, `'false'`, `0`, `'0'` → `'0'`;
  cualquier otro valor → 400 `El valor debe ser sí o no`. El frontend ya envía `'1'`/`'0'`.

## R11. Cinta con varias noches por fecha (DT-11, FR-017)

- **Decisión**: cambio solo en el frontend. En `night.component.ts`, `Ribbon.sleep` pasa a
  `Ribbon.sleeps: Bar[]` y la plantilla itera todas las barras, igual que ya hace con las siestas.
- **Hallazgo relacionado (no se corrige aquí, DT-23)**: `/api/stats` agrega por fecha y se queda con
  la última `bedtime`/`wake_time` del día; con dos noches en una fecha, la hora media ignora una. El
  caso es raro (siesta larga registrada como noche) y cambiarlo altera un contrato; se registra.

## R12. Media circular (DT-21, FR-018)

- **Decisión**: `circularAvg` devuelve `Math.round(...) % 1440`. Se extrae a `util.js` como función
  pura para poder probarla (hoy vive dentro del handler de `/stats`).

## R13. Aviso de volumen (FR-022…FR-024)

- **Decisión**: `backend/src/storage.js` con `storageStatus()`:
  - `fs.statfsSync(path.dirname(DB_PATH))` (Node ≥ 18.15) → `used_pct = round(100 × (1 − bavail /
    blocks))`; `status = used_pct > 70 ? 'warn' : 'ok'`; si falla o `DB_PATH` es `:memory:` →
    `{ status: 'unknown', used_pct: null }`.
  - Si `status === 'warn'` y el último aviso en el log tiene más de 1 h (o nunca se avisó), escribe
    `console.warn('[almacenamiento] volumen de datos al NN % …')`. Se llama al arrancar (desde
    `server.js`) y en cada `/api/health`; no hay temporizadores.
  - `/api/health` añade `storage: { status, used_pct }`; siempre responde 200 (FR-024).
- **Razón**: sin temporizadores la máquina puede seguir apagándose por inactividad (auto-stop);
  cuando está encendida, el healthcheck de Fly la consulta cada 15 s, lo que basta para "una vez por
  hora". Umbral fijo en código (70), sin variable de entorno (YAGNI).
- **Alternativas**: métrica de Fly/alerta externa → otro servicio y otra configuración. `df` por
  `child_process` → dependiente del sistema.
- **Privacidad**: el porcentaje de ocupación del disco no es un dato personal; no se exponen rutas.

## R14. Compatibilidad con la versión anterior (FR-012, SC-006)

- **Decisión**: prueba `test/compat-previous.test.js`:
  1. crea una base en archivo temporal con el **inicializador anterior congelado**
     (`test/fixtures/legacy-db.js`, copia literal del `db.js` de master antes de 003) y datos;
  2. aplica `migrate()`;
  3. vuelve a abrirla con el inicializador anterior (como haría la imagen anterior tras un
     rollback) y ejecuta sus sentencias de lectura/escritura: abrir y cerrar noche, crear siesta,
     guardar valor de métrica, consultar rangos.
  - Además, `quickstart.md` incluye la verificación manual: arrancar la imagen anterior de GHCR
    contra una copia de la base migrada.
- **Razón**: ejecutar literalmente la suite anterior exigiría otra copia del código; las
  migraciones de 003 son aditivas (una tabla y un índice), así que basta con cubrir cada sentencia
  del código anterior que toca el esquema.

## R15. Fixture `legacy.db` y medición de tiempo (SC-001, SC-004)

- **Decisión**: `test/fixtures/make-legacy-db.js` genera, en un directorio temporal y con
  `legacy-db.js`, una base determinista. Hay dos tamaños: pequeño (pruebas de huella) y realista (10
  años: 3.650 noches, ~1.500 siestas, 3 métricas × 3.650 días ≈ 16.000 filas). No se sube ningún
  `.db` al repositorio (`.gitignore` ya ignora `*.db`).
  - Huella: por cada tabla, `SELECT * ORDER BY rowid` serializado y SHA-256; se compara antes y
    después.
  - Tiempo: `migrate()` + respaldo sobre la base realista < 20 s (en la práctica, < 1 s); el test
    falla si supera 20 s.

## R16. Runbook y guía

- **Decisión**:
  - `docs/runbooks/rollback-migracion.md`: detectar el fallo (log de arranque, rollback automático
    del pipeline), `flyctl ssh console`, parar el servicio, copiar `/data/backups/pre-NNN.db` sobre
    `/data/sleep.db`, borrar `-wal`/`-shm`, redeplegar la imagen anterior; ensayo sobre una copia en
    local con `compose.yaml`.
  - `docs/sdd/guia-migraciones.md`: regla expand/contract con ejemplos (permitido en un despliegue /
    en dos despliegues), cómo nombrar y probar una migración, y "nunca editar una migración aplicada".

## Deuda técnica registrada (no se corrige aquí)

| ID | Área | Descripción |
|----|------|-------------|
| DT-23 | Estadísticas | `/api/stats` agrega por fecha y conserva solo la última `bedtime`/`wake_time` del día (ver R11). |
| DT-24 | Validación | `isIso` acepta cualquier cadena que `Date.parse` entienda (p. ej. `Sep 7 2026`); con R8 esas horas se rechazan de hecho en noches y siestas, pero `wake_time`/`end_time` siguen aceptándolas. Exigir ISO con desfase es un endurecimiento para una feature futura. |
