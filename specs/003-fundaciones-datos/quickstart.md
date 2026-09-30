# Quickstart: validar la feature 003

Guía de validación de punta a punta. Los detalles de contrato están en
[contracts/](contracts/) y los del esquema en [data-model.md](data-model.md).

## Requisitos

- Node 22, dependencias instaladas (`npm ci --ignore-scripts` en `backend/` si node-gyp falla en
  Windows; better-sqlite3 trae binarios precompilados).
- Docker (para el escenario 5).

## 1. Puertas automáticas (principio IV)

```bash
cd backend && npm run lint && npm test
cd frontend && npm run lint && npm test -- --watch=false && npm run build
```

Esperado: todo en verde, incluidos `migrate.test.js`, `migrations-legacy.test.js`,
`compat-previous.test.js`, `validation-dt.test.js` y `storage.test.js`.

## 2. Base existente → línea base sin tocar datos (US1-1, SC-001)

```bash
cd backend
node test/fixtures/make-legacy-db.js ../tmp/legacy.db     # base con datos, creada con el db.js anterior
DB_PATH=../tmp/legacy.db node -e "require('./src/db')"     # aplica las migraciones
```

Esperado:
- log `[migraciones] aplicadas: 1, 2`;
- existe `../tmp/backups/pre-001.db`;
- `sqlite3 ../tmp/legacy.db "select version, name from schema_migrations"` → 1 y 2;
- un segundo `node -e "require('./src/db')"` no registra nada (US1-3).

## 3. Base nueva (US1-2)

```bash
DB_PATH=../tmp/nueva.db npm start
curl -s localhost:3000/api/metrics
```

Esperado: las 3 métricas iniciales; sin carpeta `backups/`.

## 4. Casos de error (US1-4, US1-5, US3-8)

Cubiertos por pruebas automáticas; para verlos a mano:
- modificar un espacio de `001_esquema_inicial.sql` sobre una base ya migrada → el arranque se
  detiene con `…cambió después de aplicarse…`; se deshace con `git checkout`;
- con una base con dos noches abiertas (`make-legacy-db.js --dos-abiertas`) → el arranque se
  detiene nombrando ambas noches; la base queda igual.

## 5. Rollback a la imagen anterior (US2-1, SC-006)

```bash
docker run --rm -e DB_PATH=/data/sleep.db -v "$PWD/../tmp:/data" -p 3001:3000 ghcr.io/manuxd270516/descanso:<sha-anterior>
curl -s localhost:3001/api/health
```

Con la base migrada del escenario 2: la imagen anterior arranca, abre y cierra una noche y lista
datos sin errores.

## 6. Runbook de restauración (US2-3, SC-007)

Seguir `docs/runbooks/rollback-migracion.md` en su sección "Ensayo en local" y cronometrarlo
(< 15 min). Esperado: la base restaurada tiene la misma huella que antes de migrar.

## 7. Validaciones de datos (US3)

```bash
curl -s -o /dev/null -w "%{http_code}\n" "localhost:3000/api/stats"                             # 400
curl -s -o /dev/null -w "%{http_code}\n" "localhost:3000/api/sleep?from=2026-02-30"              # 400
curl -s -X POST localhost:3000/api/sleep -H 'content-type: application/json' \
  -d '{"date":"2026-09-06","bedtime":"2026-09-05T23:00:00-04:00"}'                               # 400 con la fecha esperada
```

En la app: registrar dos noches pasadas con la misma fecha → la cinta muestra dos barras en esa
fila (US3-5). Editar una noche y cambiar "Me dormí" a otro día → "Fecha de la noche" se actualiza
sola y el guardado funciona (FR-025).

## 8. Aviso de volumen (US4)

`storage.test.js` simula 71 % y 69 %. En producción, tras el despliegue:

```bash
curl -s https://descanso-sleep.fly.dev/api/health
```

Esperado: `"storage":{"status":"ok","used_pct":N}` con N ≤ 70.

## 9. Despliegue

Tras fusionar, el pipeline despliega. En `flyctl logs` debe aparecer
`[migraciones] aplicadas: 1, 2` en el primer arranque, y `/data/backups/pre-001.db` debe existir
(`flyctl ssh console -C "ls -la /data/backups"`).
