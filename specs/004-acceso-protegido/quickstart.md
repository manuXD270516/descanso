# Quickstart: validar la feature 004

Contratos en [contracts/openapi-delta.yaml](contracts/openapi-delta.yaml); esquema en
[data-model.md](data-model.md).

## 1. Puertas automáticas

```bash
cd backend && npm test && npm run lint
cd frontend && npx ng lint && npx ng test --watch=false --browsers=ChromeHeadless && npx ng build
cd e2e && npm test
```

## 2. Migración sobre datos reales (US4, SC-003, SC-004)

`backend/test/migrations-004.test.js` usa el fixture legacy (003) con valores de métricas:
recuentos y huellas idénticos, `metric_entries` intacta y `foreign_key_check` vacío.
`compat-previous-004.test.js` ejecuta las sentencias del código de 003 sobre el esquema nuevo.

Verificación real, como en 003: la imagen publicada de master (003) sobre una base migrada por 004.

```bash
docker run --rm -e DB_PATH=/data/sleep.db -v "$PWD/tmp/compat:/data" -p 3998:3000 ghcr.io/manuxd270516/descanso:<sha-master>
```

Abrir y cerrar noche, siesta y métrica sin errores; las filas nuevas tienen `user_id = 1`.

## 3. Alta y entrada en local (US1, US2)

```bash
cd backend
OWNER_SETUP_TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))") DB_PATH=../tmp/local.db npm start
```

En http://localhost:3000:
1. "Crea tu contraseña" muestra "Tus N noches están a salvo".
2. Pega el código, pon email y una contraseña de al menos 12 caracteres → entras.
3. "Me voy a dormir" / "Ya desperté" no piden contraseña.
4. Cuenta → "Cerrar sesión" → vuelve "Entrar".
5. Reinicia con **otro** `OWNER_SETUP_TOKEN` → vuelve "Crea tu contraseña" y la sesión anterior ya
   no sirve (US2-5).

## 4. Defensas (US3)

```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/sleep                               # 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'Origin: https://evil.example' localhost:3000/api/auth/logout   # 403
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " -X POST -H 'Sec-Fetch-Site: same-origin' \
  -H 'content-type: application/json' -d '{"email":"x@y.z","password":"incorrecta123"}' localhost:3000/api/auth/login; done   # 401×5 429
curl -sI localhost:3000/ | grep -iE 'content-security|x-frame|nosniff|referrer'
```

Memoria (SC-005):

```bash
node scripts/smoke-login-mem.mjs    # docker --memory=256m, 10 logins concurrentes, pico < 200 MB
```

## 5. Exportación (US5)

Cuenta → "Exportar (JSON)" y los 4 CSV. Los CSV se abren con acentos correctos en una hoja de
cálculo. `export.test.js` reconstruye una base vacía desde el JSON (SC-007).

## 6. Producción (tras fusionar)

Antes de fusionar, configura el código de alta (queda preparado para el próximo despliegue):

```bash
flyctl secrets set OWNER_SETUP_TOKEN=<código largo aleatorio> --stage --app descanso-sleep
```

Tras el despliegue: https://descanso-sleep.fly.dev → "Crea tu contraseña" → alta. Comprueba en
`flyctl logs` las migraciones `3, 4` y que el respaldo diario (workflow Backup) sigue en verde.
