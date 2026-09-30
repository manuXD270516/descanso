# Contrato: runner de migraciones (003)

Interfaz interna entre `db.js`, `migrate.js` y los archivos de migración. Es el contrato que
deberán respetar todas las features futuras que cambien el esquema.

## Archivos

- Ubicación: `backend/src/migrations/`.
- Nombre: `NNN_nombre_en_snake_case.sql` o `NNN_nombre_en_snake_case.js`, con `NNN` de 3 dígitos.
- Versiones consecutivas desde 001; hueco o duplicado → el arranque aborta.
- `.sql`: se ejecuta con `db.exec()`. No debe contener `BEGIN`/`COMMIT` (el runner abre la
  transacción).
- `.js`: `module.exports = { up(db) { … } }`. `up` es síncrona; lanza `Error` con un mensaje en
  español para abortar.
- **Una migración aplicada no se edita nunca.** Cualquier corrección es una migración nueva.
- Debe cumplir la regla expand/contract (`docs/sdd/guia-migraciones.md`).

## `migrate(db, options)`

```text
migrate(db, {
  dir: string,             // carpeta de migraciones (por defecto backend/src/migrations)
  backupDir: string|null,  // null → sin respaldo (bases :memory:)
  log: { info, warn }      // por defecto console
}) → { applied: number[], backup: string|null }
```

Orden de operaciones:

1. `CREATE TABLE IF NOT EXISTS schema_migrations (…)`.
2. Lee los archivos, calcula las huellas y valida la numeración.
3. Compara con `schema_migrations`:
   - huella distinta en una versión aplicada → lanza `MigrationError` (FR-004);
   - versiones registradas sin archivo → `log.warn` y continúa.
4. Si no hay pendientes → devuelve `{ applied: [], backup: null }` sin escribir nada (FR-006).
5. Si hay pendientes, `backupDir` no es null y la base tiene `sleep_records` →
   `VACUUM INTO backupDir/pre-NNN.db` (borrando antes una copia previa de la misma versión) y poda a los 3 más recientes. Si falla, lanza (FR-007,
   FR-008).
6. Por cada pendiente, en orden: `db.transaction(() => { recomprueba; ejecuta; INSERT en
   schema_migrations })().immediate()` (FR-002, FR-009). Si falla, lanza `MigrationError` con la
   versión y la causa; las anteriores ya aplicadas quedan aplicadas.
7. `log.info('[migraciones] aplicadas: 1, 2')`.

## Errores y salida del proceso

- `db.js` no captura el error: el `require` falla, `server.js` no llega a `listen()` y Node sale con
  código 1. El mensaje de `MigrationError` es la primera línea visible en `flyctl logs`.
- El healthcheck de Fly falla → el pipeline de 002 revierte a la imagen anterior (que arranca,
  porque las migraciones aplicadas son aditivas).
