# Feature 003 – Fundaciones de datos: migraciones y endurecimiento

Como mantenedor necesito poder cambiar el esquema de la base sin arriesgar los datos del usuario. Además, quiero corregir la deuda técnica que hoy distorsiona los datos. Esta feature no añade funcionalidades nuevas.

## Runner de migraciones

- **(P1)** Un runner de migraciones versionadas se ejecuta al arrancar, antes de aceptar peticiones.
- Cada migración:
  - corre en una transacción;
  - registra su versión y su checksum.
- Si el checksum de una migración ya aplicada cambia, el arranque aborta.
- Antes de aplicar migraciones pendientes se guarda un respaldo local automático; se conservan los 3 últimos.
- La primera migración es el esquema actual:
  - en una base existente se marca como aplicada sin tocar un solo dato (el hash de todas las filas es idéntico antes y después);
  - en una base nueva crea el esquema.
- Ejecutar el runner dos veces no cambia nada.
- Si una migración falla, se deshace por completo y no queda registrada.

## Regla expand/contract

**(P1)** La versión anterior del código debe seguir funcionando con el esquema nuevo. Así, el rollback automático del pipeline sigue siendo seguro.

- La regla queda documentada.
- Hay un runbook de "rollback con restauración del respaldo previo a la migración".

## Correcciones de deuda técnica

- **(P1)** Parámetros de fecha inválidos en consultas devuelven 400 en lugar de 500: DT-02 y DT-03.
- La fecha de la noche debe coincidir con el día local de la hora de dormir: DT-04.
- En métricas sí/no, los valores no booleanos se rechazan: DT-08.
- La cinta muestra todas las noches de una misma fecha: DT-11.
- La media circular nunca devuelve 1440: DT-21.
- La base de datos garantiza que solo hay una noche abierta, con un índice único parcial.
  - Si ya existen dos noches abiertas, la migración aborta limpia con un mensaje que indica cómo resolverlo, sin tocar datos.

## Aviso de volumen

- **(P2)** Cuando el volumen supera el 70 % de uso, se avisa en el log y en `/api/health`, sin datos personales.

Criterios de aceptación medibles por cada historia. Marca [NEEDS CLARIFICATION] lo ambiguo.

## Contexto técnico

Diseño de referencia en `docs/sdd/propuestas/2026-09-29-set-de-features.md` (feature 003 y esquema unificado) y la deuda técnica DT-xx en `specs/001-linea-base/research.md`.

- Implementación:
  - runner en `backend/src/migrate.js`;
  - migraciones en `backend/migrations/NNN_*.sql|js`;
  - respaldo con `db.backup()` de better-sqlite3 en `/data/backups/pre-NNN.db`.
- Pruebas obligatorias:
  - un fixture `legacy.db` generado con el `db.js` actual;
  - base nueva;
  - idempotencia;
  - rollback ante fallo;
  - checksum alterado;
  - fixture con dos noches abiertas.
- Medir el tiempo de migración con un tamaño realista. Debe quedar por debajo del `grace_period` de 20 s de `fly.toml`.
