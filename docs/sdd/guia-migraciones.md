# Guía de migraciones

Cómo cambiar el esquema de la base de Descanso sin arriesgar los datos (principio II de la
constitución). El contrato técnico del runner está en
[`specs/003-fundaciones-datos/contracts/migraciones.md`](../../specs/003-fundaciones-datos/contracts/migraciones.md).

## Cómo funciona

- Las migraciones viven en `backend/src/migrations/` y se aplican **solas al arrancar**, antes de
  atender peticiones (`backend/src/db.js` → `migrate()`).
- Cada una corre en su propia transacción. O se aplica entera y queda registrada en
  `schema_migrations`, o no se aplica nada.
- Antes de aplicar migraciones pendientes se guarda `backups/pre-NNN.db` junto a la base; se
  conservan los 3 más recientes. En Fly: `/data/backups/`.
- Si algo falla, el servicio no arranca, el healthcheck falla y el pipeline vuelve a la imagen
  anterior. Si hace falta restaurar datos, sigue
  [`docs/runbooks/rollback-migracion.md`](../runbooks/rollback-migracion.md).

## Regla expand/contract

**La versión anterior del código debe seguir funcionando con el esquema nuevo.** El pipeline hace
rollback automático a la imagen anterior, pero la base no vuelve atrás: el esquema migrado se queda.

Por eso, cada cambio incompatible se reparte en **dos despliegues**:

1. **Expand** (este despliegue): añadir lo nuevo sin romper lo viejo. El código nuevo escribe en
   lo nuevo (y, si hace falta, también en lo viejo).
2. **Contract** (un despliegue posterior, cuando ninguna imagen desplegable use lo viejo): quitar
   lo viejo.

| En un solo despliegue (expand) | Solo en un despliegue posterior (contract) |
|--------------------------------|--------------------------------------------|
| `CREATE TABLE` nueva | `DROP COLUMN` / eliminar una tabla que el código anterior usa |
| `ADD COLUMN` opcional (NULL o con `DEFAULT`) | Renombrar una columna o una tabla |
| `CREATE INDEX` (incluidos únicos, **si los datos ya los cumplen** y el código anterior ya respeta la regla) | `ADD COLUMN ... NOT NULL` sin `DEFAULT` |
| Rellenar una columna nueva a partir de datos existentes | Endurecer un `CHECK` o una restricción que el código anterior podría violar |
| Siembra de datos de catálogo idempotente (`WHERE NOT EXISTS`) | Cambiar el significado de una columna existente |

Ejemplo de renombrado de `notes` a `comment` en noches:

- Despliegue 1: `ADD COLUMN comment TEXT`, copiar `notes` → `comment`. El código nuevo lee
  `comment` y escribe en ambas.
- Despliegue 2 (días después): el código deja de escribir `notes`.
- Despliegue 3: eliminar `notes`. Como SQLite exige recrear la tabla, se hace copiando los datos
  a una tabla nueva **sin perder ninguna fila**; el principio II prohíbe borrar datos del usuario.

Ejemplo de *expand* puro: `008_ciclos_y_diario.js` (feature 006).
- Añade `cycle_min` y `latency_min` (con `DEFAULT`) a `user_settings`, y `sol_bucket` y
  `awakenings_bucket` (NULL) a `sleep_records`.
- Usa `ALTER TABLE … ADD COLUMN`, comprueba antes con `PRAGMA table_info` si la columna ya existe
  y no reconstruye nada.
- El código de 005 sigue funcionando porque nombra sus columnas; lo prueba
  `compat-previous-006.test.js`. No deja ningún paso *contract* pendiente.

### Multiusuario (desde la feature 008)

- **Toda tabla nueva con datos de una persona lleva `user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE`**,
  o es hija justificada de una que lo tenga. El meta-test `backend/test/schema-isolation.test.js`
  falla si añades una tabla sin clasificar.
- El código accede a esos datos solo por `backend/src/repo/`, con `userId` obligatorio.
- **Contracción hecha (005)**: la migración `006_contraer_user_id.js` quitó el `DEFAULT 1` de
  `user_id` en `sleep_records`, `naps` y `metrics` (expand de 004) con una reconstrucción verificada
  (`foreignKeys: false`, recuento y hash de todas las columnas). Toda inserción debe llevar `user_id`.
- **Rollback**: no se vuelve manualmente por debajo de 008 con otros usuarios registrados (ver
  `docs/runbooks/rollback-migracion.md`).

## Reglas para escribir una migración

- **Nombre:** `NNN_descripcion_corta.sql` o `.js`, con `NNN` = siguiente número (sin huecos).
- **`.sql`** para DDL simple. **`.js`** (`module.exports = { up(db) { … } }`) cuando haga falta
  comprobar datos antes. Por ejemplo, `002_una_noche_abierta.js` aborta con un mensaje claro si
  hay dos noches abiertas.
- **Nunca edites una migración ya aplicada.** Su huella (checksum) está registrada y el arranque
  se detendría. Para corregir algo, escribe una migración nueva.
- **Sin `BEGIN`/`COMMIT`:** el runner abre la transacción.
- **Reconstruir una tabla** (patrón de 12 pasos de SQLite, permitido por la constitución v1.0.1)
  se hace en una migración `.js` con `foreignKeys: false`:
  ```js
  module.exports = { foreignKeys: false, up(db) { /* crear x_new, copiar, VERIFICAR, DROP x, RENAME */ } };
  ```
  El runner desactiva las FK **antes** de la transacción (dentro no tiene efecto), ejecuta
  `PRAGMA foreign_key_check` antes del commit y las restaura después. **Sin esta opción,
  `DROP TABLE` de una tabla referenciada con `ON DELETE CASCADE` borra las filas hijas** (p. ej.
  `metrics` → `metric_entries`). Verifica recuento y contenido antes del `DROP`, y recrea los
  índices y el contador `sqlite_sequence`. Ejemplo: `004_user_id_en_datos.js`.
- **Índices únicos cuyo error lee el código**: SQLite nombra el índice en el mensaje solo si el
  índice contiene una expresión; sobre columnas simples nombra las columnas. Si el código (actual
  o anterior) reconoce el error por el nombre del índice, consérvalo con una expresión (ver
  `ux_sleep_one_open`).
- **Nunca borres ni modifiques datos del usuario** para que una migración "encaje". Si los datos
  no cumplen la precondición, aborta con un mensaje que explique cómo resolverlo.
- **Mensajes en español**, pensados para quien lee `flyctl logs`.
- Los finales de línea no importan (la huella los normaliza), pero `.gitattributes` fuerza LF.

## Cómo probar una migración

1. **Base nueva:** la suite del backend arranca con `DB_PATH=:memory:`, así que todas las
   migraciones se aplican en cada archivo de test.
2. **Base existente:** añade un caso en `backend/test/migrations-legacy.test.js` con el fixture
   `make-legacy-db.js`. La huella de las filas que no deben cambiar tiene que ser idéntica.
3. **Compatibilidad con la versión anterior:** amplía `backend/test/compat-previous.test.js` con
   las sentencias del código anterior que toquen lo que cambias.
4. **Tiempo:** con la base `--realista`, la migración debe caber holgadamente en el
   `grace_period` de 20 s de `fly.toml`.
5. **Fallo:** si la migración tiene precondiciones, prueba que aborta sin tocar datos.

## Checklist del PR

- [ ] La migración cumple expand/contract (tabla de arriba).
- [ ] Pruebas de base nueva, base existente y compatibilidad anterior.
- [ ] Ninguna migración ya fusionada fue editada.
- [ ] Si hay un paso "contract" pendiente, queda anotado en el `research.md` de la feature.
