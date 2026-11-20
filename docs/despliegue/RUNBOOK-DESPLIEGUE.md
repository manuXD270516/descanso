# Runbook: consolidar Descanso en Fly.io

**Destino:** la app Fly `descanso-sleep`, en la región `gru`, con una máquina shared-cpu-1x de 256 MB siempre encendida y el volumen `descanso_data` de 1 GB con SQLite. La URL es `https://descanso-sleep.fly.dev` y el costo, unos 3,3 USD por mes.

**Estado al 2026-11-18:** la [decisión](DECISION-DESPLIEGUE.md) del 2026-11-17 (quedarse en Fly, ratificada por un segundo panel, 3 de 3, sin árbitro) está aprobada por el owner. Hechos: puntos 1, 3 y 4 de la fase 2 (versión `c0c61f6`) y las filas 1 a 5 de la fase 3. Pendientes: la fase 1 (fecha límite 2026-11-30), la fase 1b, los puntos 2 y 5 a 10 de la fase 2, las filas 6 y 7 de la fase 3 y la fase 4. Todavía no hay cuenta del propietario ni datos reales. Los ids `O-…` y `A-…` remiten a la decisión.

**Estado al 2026-11-13:** la app ya estaba desplegada y verificada desde la feature 002, con la versión `afa3af6`. La versión vigente se lee en `curl -s $BASE/api/health`.

**Riesgo abierto:** no hay ninguna copia fuera de Fly. Ramas: trunk; cada merge a `master` despliega solo, salvo que cambie solo `docs/**` o `**/*.md`. El proyecto no usa tags ni changelog.

| Símbolo | Quién lo hace |
|---|---|
| **Vos** | El owner: cuentas, inicios de sesión, medios de pago, secretos y consolas web |
| **Claude** | Un agente, cuando se lo pidas, con tu confirmación antes de cada despliegue |

**Dónde corren los comandos:** todos los bloques de este runbook corren en **Git Bash, en la raíz del repo**, salvo que el bloque diga otra cosa. En PowerShell no funcionan (`BASE=…`, `/dev/null`, `read -s`).

## Reglas de corte

Parate y no sigas si pasa alguna de estas cosas:

1. **Cloudflare R2 pide un medio de pago** y no querés cargarlo. En ese caso el respaldo externo se hace con otro almacenamiento S3 compatible (Backblaze B2, por ejemplo), que también sirve para `backup.yml`.
2. **Una verificación de la fase 3 da otro resultado.** Por ejemplo, una ruta protegida responde 200 sin sesión, falta HSTS o aparece una IPv4 dedicada.
3. **La factura real de Fly supera los 5 USD por mes.** En ese caso se pasa a evaluar el plan B (VPS).
4. **Aparece un dato real o un secreto** en un archivo versionado o en un comando guardado en el historial. Esto es más grave que en otros proyectos, porque el repositorio es público.

## Valores que vas a necesitar

| Valor | Forma | Dónde vive |
|---|---|---|
| URL | `https://descanso-sleep.fly.dev` | Fly |
| `OWNER_SETUP_TOKEN`, `BACKUP_TOKEN`, `VAPID_PRIVATE_KEY` | Texto aleatorio o clave base64url | Secretos de Fly |
| `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` | Clave pública o `mailto:` | Secretos de Fly (no son secretos de verdad) |
| `FLY_API_TOKEN` | Token de deploy, limitado a la app | Secreto de GitHub: hoy del repositorio; después de la fase 2, punto 2, del environment `production` |
| `BACKUP_TOKEN` (copia para el job) | El mismo valor que en Fly | Secreto de GitHub del repositorio; después de la fase 2, punto 10, del environment `backup` |
| `BACKUP_AGE_RECIPIENT`, `S3_ENDPOINT`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Clave pública age y credenciales de R2 | Secretos de GitHub (pendientes, T014) |
| Clave privada age | Archivo `age` | **Solo en tu equipo y en tu gestor de contraseñas**. Nunca en GitHub ni en Fly |

Guardá también en tu gestor de contraseñas `OWNER_SETUP_TOKEN`, `BACKUP_TOKEN` y `VAPID_PRIVATE_KEY` cada vez que los crees o los rotes. `fly secrets list` no muestra los valores, y sin esa copia no se puede salir de Fly ni rearmar un servidor.

```bash
BASE=https://descanso-sleep.fly.dev
```

Para listar qué secretos están cargados, sin ver los valores:

```bash
fly secrets list --app descanso-sleep
```

```bash
gh secret list
```

```bash
gh secret list --env production
```

## Fase 0: estado actual (hecha)

- La app, el volumen, los secretos de Fly y `FLY_API_TOKEN` existen (T026 de la 002).
- Cada push a `master` despliega con rollback automático (`.github/workflows/deploy.yml`).
- Las filas 1 a 5 de la fase 3 pasaron el 2026-11-13.

## Fase 1: respaldo externo (Vos, después Claude)

Es la condición principal de la decisión (O-fly-1, común a los tres candidatos): hasta terminarla, todos los datos viven en un solo volumen. Mientras no haya datos reales, el riesgo es bajo, pero la fase tiene que estar cerrada **antes** de la fase 4, paso 4.

1. **Vos:** seguí [configurar-bucket-respaldos.md](../runbooks/configurar-bucket-respaldos.md): generá el par de claves age, cargá en GitHub los 5 secretos del respaldo y comprobá que el bucket de R2 no tenga acceso público ni dominio público. Guardá la clave privada age en tu gestor de contraseñas, no solo en el equipo: sin ella, ningún `.db.age` se puede abrir (O-fly-8).
2. **Claude:** lanza `Backup` a mano y espera el resultado:

   ```bash
   gh workflow run backup.yml
   ```

   ```bash
   gh run list --workflow backup.yml -L 1 --json status,conclusion,createdAt
   ```

   Comprueba que termine con `"conclusion":"success"` y que el log del job muestre la subida de un `.db.age`.
3. **Vos:** bajá ese `.db.age`, descifralo con tu clave privada y seguí [restaurar-respaldo.md](../runbooks/restaurar-respaldo.md), variante local, para abrirlo.
4. **Claude:** bajá el mismo día una segunda copia directa, sin cifrar, para comparar. Pedí el token sin mostrarlo y borrá la copia al terminar:

   ```bash
   read -rs BT && curl -sf -H "Authorization: Bearer $BT" "$BASE/api/admin/backup" -o /tmp/control.db; unset BT
   ```

   En las dos copias, `PRAGMA integrity_check` y `SELECT COUNT(*)` por tabla (`sqlite3 <archivo> ".tables"` para listarlas).

**Terminada cuando:** el job `Backup` sale en verde dos noches seguidas; la copia restaurada da `ok` en `integrity_check`; y los conteos por tabla coinciden con los de la copia de control. Con eso se cierran T014 y T022 de la 002. Al terminar, cerrá el issue «Falló el respaldo diario» que quedó abierto mientras faltaban los secretos: desde ahí, un issue abierto es un fallo real (O-fly-2).

## Fase 1b: validar supuestos (Vos)

El panel no pudo verificar estos datos sin la cuenta abierta. Se validan en la consola de Fly o de Cloudflare antes del 2026-11-30. El id del volumen sale de `fly volumes list --app descanso-sleep`.

| Id | Supuesto | Cómo se verifica | Si falla |
|---|---|---|---|
| A-fly-2 | El cómputo en gru cuesta unos 3,1 USD por mes | Primera factura de Fly (Billing → Invoices): la línea de la máquina de `descanso-sleep` | Si el total pasa de 5 USD, regla de corte 3 |
| A-fly-6 | La app está en la organización personal y le aplica la exención de facturas menores a 5 USD | Billing de Fly: organización de `descanso-sleep` y monto cobrado | Recalcular el costo sin exención; si pasa de 5 USD, regla de corte 3 |
| A-fly-10 | Activar R2 pide un medio de pago | Al activar R2 en la consola de Cloudflare | Regla de corte 1 (usar Backblaze B2) |
| A-fly-14 | Fly guarda un snapshot diario del volumen durante 5 días | `fly volumes snapshots list <id-del-volumen> --app descanso-sleep`: 5 snapshots, uno por día | Anotarlo como riesgo: el respaldo externo pasa a ser la única red |

**Terminada cuando:** los cuatro quedan confirmados, o el que falló aplicó su regla de corte.

## Fase 2: endurecer el pipeline (Claude, con tu confirmación)

Un PR por punto. Cada uno pasa por el CI y se fusiona con la protección de `master`. Los puntos que tocan `fly.toml` o `.github/` redespliegan al fusionarse, lo cual es esperado.

1. ✅ Fijar `superfly/flyctl-actions/setup-flyctl` a un SHA en `deploy.yml` (#75, 2026-11-17).
2. **Vos:** el job ya declara `environment: production` (`deploy.yml:72`). Cargá `FLY_API_TOKEN` en el environment y borrá el del repositorio. Lo más simple es hacerlo junto con la rotación del punto 9.

   ```bash
   gh secret delete FLY_API_TOKEN
   ```

   **Terminado cuando:** `gh secret list --env production` muestra `FLY_API_TOKEN`, `gh secret list` ya no lo muestra y el siguiente `Deploy` sale verde.
3. ✅ Agregar al job `Backup` un paso que, si falla, abra un issue (`if: failure()`): job `avisar-fallo` (#76, 2026-11-17).
4. ✅ Limitar los intentos y registrar los accesos a `/api/admin/backup`, con test: 5 fallos en 15 min por IP → 429 (#77, 2026-11-17).
5. **Vos:** activar *secret scanning* y *push protection* en GitHub (Settings → Code security), porque el repositorio es público. **Terminado cuando:** las dos opciones figuran como «Enabled».
6. Sacar `:latest` del `[build] image` de `fly.toml`, o publicar `latest` en `deploy.yml` recién después del health check, para que un `fly deploy` manual no vuelva a publicar una imagen rota (O-fly-3). **Terminado cuando:** `grep -n latest fly.toml` no devuelve nada, o el paso que etiqueta `latest` corre después del health check.
7. Workflow programado que consulte `$BASE/api/health` cada 30 minutos y abra un issue tras 2 fallos seguidos (disenso del juez de operación). **Terminado cuando:** una corrida manual contra una URL inválida abre el issue.
8. **Solo si la fase 1 se atrasa más allá del 2026-11-30:** que `backup.yml`, mientras falten los secretos del bucket, abra el issue con otra etiqueta («respaldo sin configurar»), sin dejar de avisar (O-fly-2). Si la fase 1 cierra a tiempo, este punto se descarta.
9. **Vos:** restringí el environment `production` a la rama `master` (Settings → Environments → production → Deployment branches → Selected branches → `master`) y rotá `FLY_API_TOKEN`, que es el token que da acceso a la base (O-fly-7). El valor nuevo nunca se muestra:

   ```bash
   fly tokens create deploy --app descanso-sleep | gh secret set FLY_API_TOKEN --env production
   ```

   ```bash
   fly tokens list --app descanso-sleep
   ```

   ```bash
   fly tokens revoke <id-del-token-viejo>
   ```

   **Terminado cuando:** el siguiente `Deploy` sale verde y `fly tokens list` ya no muestra el token viejo.
10. Pasar `BACKUP_TOKEN` a un environment `backup`, restringido a `master`, y declararlo en el job de `backup.yml`. Hoy es un secreto de repositorio que cualquier workflow puede leer, y baja la base completa en claro. **Terminado cuando:** `gh secret list --env backup` lo muestra, `gh secret list` no, y `Backup` sale verde.

**Terminada cuando:** los PRs de los puntos 1, 3, 4, 6, 7 y 10 están fusionados (y el 8, si aplicó), los puntos 2, 5 y 9 están hechos y el siguiente `Deploy` termina en verde.

## Fase 3: verificación sin login (Claude)

| # | Comprobación | Resultado esperado |
|---|---|---|
| 1 | `curl -s -o /dev/null -w "%{http_code} %{time_total}\n" $BASE/` | `200` en menos de 2 s |
| 2 | `curl -s $BASE/api/health` | `"ok":true` y `version` igual al último commit de `master` |
| 3 | `for p in /api/sleep /api/push /api/admin/backup; do curl -s -o /dev/null -w "$p %{http_code}\n" "$BASE$p"; done` | Las tres, `401` |
| 4 | `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer x" $BASE/api/admin/backup` | `401` (correlo una sola vez: a los 5 fallos en 15 min responde `429`) |
| 5 | `curl -sI $BASE/` | Están `strict-transport-security`, `content-security-policy`, `x-frame-options: DENY`, `x-content-type-options: nosniff` y `referrer-policy` |
| 6 | `curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -H "Origin: $BASE" -d '{"token":"x"}' $BASE/api/auth/setup` | `401` mientras el alta está abierta; `409` después de la fase 4 (`backend/src/routes/auth.js:70` y `:75`). Sin `Origin`, `403` por CSRF |
| 7 | **Vos:** `fly services list --app descanso-sleep`, `fly ips list --app descanso-sleep` y `fly status --app descanso-sleep` | Solo los puertos 80 y 443; ninguna IPv4 dedicada (solo la compartida); una máquina `started` |

Atajos de desarrollo: no hay bypass de autenticación en el código. `NODE_ENV=production` viene fijado en el `Dockerfile`, y el origen de prueba de push (`PUSH_TEST_ORIGIN`) solo se admite con `NODE_ENV=test` y se ignora en cualquier otro entorno (`backend/src/reminders/push.js:22-24`).

**Regla de corte:** si 3, 4, 5, 6 o 7 no coinciden, parate.

**Terminada cuando:** las siete filas dan el resultado esperado. Se repite después de cada cambio de la fase 2 y, completa, después de la fase 4.

## Fase 4: alta del propietario y avisos (Vos)

Primero con datos ficticios, después con los reales. El paso 4 requiere la fase 1 cerrada.

1. Abrí `$BASE` en el móvil y creá la cuenta del propietario con el código de alta (`OWNER_SETUP_TOKEN`). Todavía no cargues noches reales.
2. Creá una segunda cuenta de prueba, cargale una noche inventada y comprobá que desde la tuya no se ve, y al revés.
3. Activá los avisos, cerrá la app y mandá un aviso de prueba. Esto valida web-push 4 en producción.
4. Borrá la cuenta de prueba y recién entonces empezá a cargar tus datos reales.

**Terminada cuando:** el aviso de prueba llega en menos de 1 minuto con la app cerrada, ninguna cuenta ve los datos de la otra y la fila 6 de la fase 3 ya responde `409`. Con eso se cierra T042 de la 013.

## Publicar una actualización

1. Abrí un PR a `master`. El CI corre `quality` (lint y tests de backend y frontend), que es el único check requerido, y la e2e. **El CI no construye la imagen Docker**: la construye el job `publish` de `Deploy` después del merge. Si ese build falla, producción sigue en la versión anterior.
2. Las migraciones van en el mismo PR y se aplican al arrancar, antes de servir. Solo pueden agregar: la versión anterior tiene que tolerar el esquema nuevo para que el rollback funcione.
3. Antes de fusionar, anotá la versión estable con `curl -s $BASE/api/health` (campo `version`). Te sirve para volver atrás. Fusioná fuera del horario de los avisos, porque el deploy reinicia la máquina. Renovate fusiona con auto-merge a cualquier hora: es un costo aceptado (un aviso puede atrasarse hasta el siguiente tick).
4. `Deploy` publica la imagen `ghcr.io/manuxd270516/descanso:<sha>`, despliega y espera el health check. Después repetí la fase 3.

## Volver atrás

**Código.** `Deploy` vuelve solo a la versión anterior si la nueva no queda sana. A mano, con la versión anterior en `<sha>` (la que anotaste al publicar, o la de este comando):

```bash
gh run list --workflow deploy.yml --status success -L 3 --json headSha,createdAt
```

Desde la raíz del repo, para que `flyctl` tome el `fly.toml` con el montaje de `/data`:

```bash
flyctl deploy --config fly.toml --app descanso-sleep --image ghcr.io/manuxd270516/descanso:<sha>
```

Esto **no revierte la base**: la versión anterior ignora las migraciones que no conoce, con un aviso.

**Base de datos.** Seguí [rollback-migracion.md](../runbooks/rollback-migracion.md), que usa la copia previa a la migración en `/data/backups`. Si no alcanza, restaurá un `.db.age` de R2 con [restaurar-respaldo.md](../runbooks/restaurar-respaldo.md). Las dos cosas sobrescriben lo que se haya cargado después de la copia.

**Desde un snapshot de Fly** (último recurso, sin procedimiento probado todavía): se crea un volumen nuevo a partir del snapshot y la máquina tiene que pasar a montarlo.

```bash
fly volumes snapshots list <id-del-volumen> --app descanso-sleep
```

```bash
fly volumes create descanso_data --snapshot-id <id-del-snapshot> --region gru --size 1 --app descanso-sleep
```

Antes de usarlo en un incidente, probalo una vez y documentá cómo se cambia el montaje en un runbook propio (`docs/runbooks/restaurar-snapshot.md`).

**Aplicación fuera de servicio.** No hay app ni avisos. Los datos siguen en el volumen y en las copias.

## Respaldos

| Respaldo | Cuándo | Cubre | Límite |
|---|---|---|---|
| Snapshot del volumen de Fly | Diario, automático | Toda la base | 5 días, dentro de Fly (A-fly-14) |
| Copia previa a cada migración | Antes de cada migración | Toda la base | En el mismo volumen |
| `.db.age` en R2 | Diario, 03:17 UTC | Toda la base, cifrada | 14 días. **Pendiente (fase 1)** |

Una vez por mes, restaurá un `.db.age` en local y comprobá que abre. Un respaldo que nunca se probó no cuenta.

## Límites del plan

Fly **cobra** al pasar un límite: no bloquea ni tiene tope de gasto.

| Recurso | Límite actual | Qué hacer |
|---|---|---|
| Memoria | 256 MB (se usan unos 19 MiB, medidos en local con la base vacía) | Revisar si aparece un OOM en `fly logs`. Después de la fase 4, medir en producción durante un `/api/admin/backup` con la base real (O-fly-11): tiene que quedar por debajo de 180 MB |
| Volumen | 1 GB (se usa alrededor del 7 %) | `/api/health` → `storage.used_pct`; ampliar con `fly volumes extend` si pasa del 70 % |
| Costo | Unos 3,3 USD por mes | Revisar la factura mensual; si pasa de 5 USD, ir a la regla de corte 3 |
| R2, plan gratuito | 10 GB guardados, 1 millón de operaciones de escritura y 10 millones de lectura por mes | Las copias pesan pocos MB y son 14 por vez: lejos del límite. Revisar el uso en la consola de Cloudflare cada 3 meses |
| Workflows programados de GitHub | En un repo público, se desactivan solos después de 60 días sin actividad en el repo | Si `Backup` o el chequeo de salud dejan de correr, reactivarlos en la pestaña Actions |

## Mantenimiento

| Tarea | Frecuencia |
|---|---|
| Probar la restauración de un `.db.age` | Mensual |
| Revisar los PRs de Renovate (los fusiona el agente revisor con auto-merge) | Semanal |
| Revisar la factura de Fly | Mensual |
| Comprobar que los snapshots siguen activos: `fly volumes snapshots list <id-del-volumen> --app descanso-sleep` (id en `fly volumes list --app descanso-sleep`) | Mensual |
| Revisar que no haya un issue abierto «Falló el respaldo diario» (el job `avisar-fallo` lo abre solo) | Semanal |
| Rotar `BACKUP_TOKEN` y, si hace falta, VAPID ([rotar-vapid.md](../runbooks/rotar-vapid.md)) | Anual, o ante una sospecha |
| Rotar `FLY_API_TOKEN` (como en la fase 2, punto 9) | Anual, o ante una sospecha |
| Rotar las credenciales de R2, antes de su vencimiento (anotá la fecha al crearlas) | Anual, o en la fecha de vencimiento del token de R2 |
| Revisar los límites de Node, npm, TypeScript y Angular en `renovate.json` | Al migrar a Angular 22 o subir Node |

## Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `Deploy` falla con «volume not found» | Fly movió la máquina y su volumen a otro host | El workflow reintenta solo. Si sigue fallando, relanzar `Deploy` |
| Un aviso llega tarde | Coincidió con un deploy (incluidos los de Renovate) o con el Doze de Android | Fusionar fuera de las horas de aviso |
| `Backup` falla | Faltan secretos, o se venció el token de R2 | Ver el log del job y revisar `gh secret list` |
| Hay un issue «Falló el respaldo diario» | El job `Backup` falló (secretos faltantes, token de R2 vencido, app caída) | Abrir el run enlazado en el issue, corregir y cerrar el issue cuando `Backup` vuelva a salir en verde |
| `Backup` o el chequeo de salud dejaron de correr | GitHub los desactivó tras 60 días sin actividad | Reactivarlos en Actions |
| «Los avisos no están disponibles» | Faltan las claves VAPID en Fly | Revisar `fly secrets list` |

Para ver los errores de producción:

```bash
fly logs --app descanso-sleep
```

## Salir de Fly

1. Bajá una copia consistente (`/api/admin/backup` o el último `.db.age`).
2. El plan B es un VPS con Docker Compose y Caddy. Corre la misma imagen de GHCR con `DB_PATH=/data/sleep.db`. Los secretos salen de tu gestor de contraseñas (ver «Valores que vas a necesitar»). Si no los guardaste, recuperalos antes de cortar con `fly ssh console --app descanso-sleep`, sin copiarlos a ningún archivo ni chat.
3. Si cambia el origen (otro dominio), las suscripciones push existentes siguen siendo válidas mientras se mantengan las mismas claves VAPID, pero el navegador tiene que volver a registrar el service worker en el origen nuevo.
4. Lo irreversible es borrar el volumen o la app de Fly. Hacelo recién después de verificar el nuevo destino con datos reales.

## Cierre

- [x] Despliegue en Fly verificado (feature 002).
- [x] Fase 3, filas 1 a 5 (2026-11-13).
- [x] Repo público: `docs/despliegue/` (incluido `.despliegue.json`) revisado antes del commit, sin secretos ni datos personales.
- [x] Decisión ratificada por un segundo panel (2026-11-17) y aprobada por el owner (2026-11-18).
- [ ] Fase 1: respaldo externo guardado y restaurado, clave age en el gestor de contraseñas.
- [ ] Fase 1b: supuestos A-fly-2, A-fly-6, A-fly-10 y A-fly-14 validados.
- [ ] Fase 2: pipeline endurecido (puntos 1 a 10).
- [ ] Fase 3, filas 6 y 7.
- [ ] Fase 4: alta del propietario, aviso de prueba y aislamiento entre cuentas.
- [ ] Memoria medida en producción con la base real (O-fly-11).
- [ ] Factura de Fly revisada (≤ 5 USD).
