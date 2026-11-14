# Runbook: consolidar Descanso en Fly.io

**Destino:** la app Fly `descanso-sleep`, en la región `gru`, con una máquina shared-cpu-1x de 256 MB siempre encendida y el volumen `descanso_data` de 1 GB con SQLite. La URL es `https://descanso-sleep.fly.dev` y el costo, unos 3,3 USD por mes.

**Estado al 2026-11-13:** la app ya está desplegada y verificada. El despliegue inicial (fases 1 a 4 de un runbook nuevo) se hizo en la feature 002 y se cuenta como hecho. El 2026-11-13, producción servía la versión `afa3af6`, con Angular 21, y `/api/health` respondía ok; la versión vigente se lee en `curl -s $BASE/api/health`. **Riesgo abierto:** no hay ninguna copia fuera de Fly desde el inicio; la fecha límite de la fase 1 es el 2026-11-30. Ramas: trunk. Cada merge a `master` despliega solo, y el proyecto no usa tags ni changelog. Este runbook cubre lo que falta para cerrar las condiciones de la [decisión](DECISION-DESPLIEGUE.md) y cómo operar de acá en adelante.

| Símbolo | Quién lo hace |
|---|---|
| **Vos** | El owner: cuentas, inicios de sesión, medios de pago, secretos y consolas web |
| **Claude** | Un agente, cuando se lo pidas, con tu confirmación antes de cada despliegue |

## Reglas de corte

Parate y no sigas si pasa alguna de estas cosas:

1. **Cloudflare R2 pide un medio de pago** y no querés cargarlo. En ese caso el respaldo externo se hace con otro almacenamiento S3 compatible (Backblaze B2, por ejemplo), que también sirve para `backup.yml`.
2. **Una verificación de la fase 3 da otro resultado.** Por ejemplo, una ruta protegida responde 200 sin sesión, o falta HSTS.
3. **La factura real de Fly supera los 5 USD por mes.** En ese caso se pasa a evaluar el plan B (VPS).
4. **Aparece un dato real o un secreto** en un archivo versionado o en un comando guardado en el historial. Esto es más grave que en otros proyectos, porque el repositorio es público.

## Valores que vas a necesitar

| Valor | Forma | Dónde vive |
|---|---|---|
| URL | `https://descanso-sleep.fly.dev` | Fly |
| `OWNER_SETUP_TOKEN`, `BACKUP_TOKEN`, `VAPID_PRIVATE_KEY` | Texto aleatorio o clave base64url | Secretos de Fly |
| `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` | Clave pública o `mailto:` | Secretos de Fly (no son secretos de verdad) |
| `FLY_API_TOKEN` | Token de deploy, limitado a la app | Secreto de GitHub |
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

## Fase 0: estado actual (hecha)

- La app, el volumen, los secretos de Fly y `FLY_API_TOKEN` existen (T026 de la 002).
- Cada push a `master` despliega con rollback automático (`.github/workflows/deploy.yml`).
- Las verificaciones sin login de la fase 3 pasaron el 2026-11-13.

## Fase 1: respaldo externo (Vos, después Claude)

Es la condición principal de la decisión: hasta terminarla, todos los datos viven en un solo volumen.

0. **Vos, provisorio hasta cerrar la fase:** una vez por semana, bajá una copia con `/api/admin/backup` (con `BACKUP_TOKEN`) y guardala cifrada en tu equipo.
1. **Vos:** seguí [configurar-bucket-respaldos.md](../runbooks/configurar-bucket-respaldos.md) y cargá en GitHub los 5 secretos del respaldo. Comprobá que el bucket de R2 no tenga acceso público ni dominio público.
2. **Claude:** lanza `Backup` a mano con `gh workflow run backup.yml` y comprueba que termine en verde y que suba un `.db.age` a R2.
3. **Vos:** bajá ese `.db.age`, descifralo con tu clave privada y seguí [restaurar-respaldo.md](../runbooks/restaurar-respaldo.md), variante local, para abrirlo.
4. **Claude:** con la copia restaurada en local, corre `PRAGMA integrity_check` y compara la cantidad de filas por tabla con `/api/health` y con lo que muestra la app.

**Terminada cuando:** el job `Backup` sale en verde dos noches seguidas, una copia restaurada da `ok` en `integrity_check` y el aviso ante fallo (punto 3 de la fase 2, que se adelanta) ya está activo. Con eso se cierran T014 y T022 de la 002.

## Fase 2: endurecer el pipeline (Claude, con tu confirmación)

Un PR por punto. Cada uno pasa por el CI y se fusiona con la protección de `master`.

1. Fijar `superfly/flyctl-actions/setup-flyctl` a un SHA en `deploy.yml`.
2. El job ya declara `environment: production` (`deploy.yml:68`). **Vos** movés `FLY_API_TOKEN` del secreto del repositorio al del environment y agregás reglas de protección a ese environment.
3. Agregar al job `Backup` un paso que, si falla, abra un issue (`if: failure()`).
4. Limitar los intentos y registrar los accesos a `/api/admin/backup`, con test.
5. **Vos:** activar *secret scanning* y *push protection* en GitHub (Settings → Code security), porque el repositorio es público.

**Terminada cuando:** los PRs de los puntos 1, 3 y 4 están fusionados, los puntos 2 y 5 están hechos, y el siguiente `Deploy` termina en verde.

## Fase 3: verificación sin login (Claude)

| # | Comprobación | Resultado esperado |
|---|---|---|
| 1 | `curl -s -o /dev/null -w "%{http_code}\n" $BASE/` | `200` |
| 2 | `curl -s $BASE/api/health` | `"ok":true` con la versión de `master` |
| 3 | `/api/sleep`, `/api/push` y `/api/admin/backup` sin sesión | `401` |
| 4 | `/api/admin/backup` con `Authorization: Bearer x` | `401` |
| 5 | `curl -sI $BASE/` | Están `strict-transport-security`, `content-security-policy`, `x-frame-options: DENY`, `x-content-type-options: nosniff` y `referrer-policy` |

| 6 | `POST $BASE/api/auth/setup` sin token válido | Rechazado; el alta del propietario no se reabre después de usarse (`backend/src/routes/auth.js:63`) |
| 7 | `fly ips list --app descanso-sleep` y `fly status --app descanso-sleep` (Vos) | Solo 80 y 443, una máquina, sin IPv4 dedicada |

Atajos de desarrollo: no hay bypass de autenticación en el código. `NODE_ENV=production` viene fijado en el `Dockerfile`, y el origen de prueba de push (`PUSH_TEST_ORIGIN`) solo se admite con `NODE_ENV=test` y se ignora en cualquier otro entorno (`backend/src/reminders/push.js:22-24`).

**Regla de corte:** si 3, 4, 5 o 6 no coinciden, parate.

## Fase 4: alta del propietario y avisos (Vos)

Primero con datos ficticios, después con los reales:

1. Abrí `$BASE` en el móvil y creá la cuenta del propietario con el código de alta (`OWNER_SETUP_TOKEN`). Todavía no cargues noches reales.
2. Creá una segunda cuenta de prueba, cargale una noche inventada y comprobá que desde la tuya no se ve, y al revés.
3. Activá los avisos y mandá un aviso de prueba. Esto valida web-push 4 en producción.
4. Borrá la cuenta de prueba y recién entonces empezá a cargar tus datos reales.

**Terminada cuando:** el aviso de prueba llega con la app cerrada y ninguna cuenta ve los datos de la otra. Con eso se cierra T042 de la 013.

## Publicar una actualización

1. Abrí un PR a `master`. El CI corre lint, los tests de backend y frontend, el build de Docker y la e2e.
2. Las migraciones van en el mismo PR y se aplican al arrancar, antes de servir. Solo pueden agregar: la versión anterior tiene que tolerar el esquema nuevo para que el rollback funcione.
3. Antes de fusionar, anotá la versión estable con `curl -s $BASE/api/health` (campo `version`). Te sirve para volver atrás. Fusioná fuera del horario de los avisos, porque el deploy reinicia la máquina.
4. `Deploy` publica la imagen `ghcr.io/manuxd270516/descanso:<sha>`, despliega y espera el health check. Después repetí la fase 3.

## Volver atrás

**Código.** `Deploy` vuelve solo a la versión anterior si la nueva no queda sana. A mano, con la versión anterior en `<sha>` (la que anotaste al publicar, o la de `gh run list --workflow deploy.yml --status success -L 3`):

```bash
flyctl deploy --app descanso-sleep --image ghcr.io/manuxd270516/descanso:<sha>
```

Esto **no revierte la base**: la versión anterior ignora las migraciones que no conoce, con un aviso.

**Base de datos.** Seguí [rollback-migracion.md](../runbooks/rollback-migracion.md), que usa la copia previa a la migración en `/data/backups`. Si no, restaurá desde un snapshot de Fly o desde un `.db.age` de R2 con [restaurar-respaldo.md](../runbooks/restaurar-respaldo.md). Las dos cosas sobrescriben lo que se haya cargado después de la copia.

**Aplicación fuera de servicio.** No hay app ni avisos. Los datos siguen en el volumen y en las copias.

## Respaldos

| Respaldo | Cuándo | Cubre | Límite |
|---|---|---|---|
| Snapshot del volumen de Fly | Diario, automático | Toda la base | 5 días, dentro de Fly |
| Copia previa a cada migración | Antes de cada migración | Toda la base | En el mismo volumen |
| `.db.age` en R2 | Diario, 03:17 UTC | Toda la base, cifrada | 14 días. **Pendiente (fase 1)** |

Una vez por mes, restaurá un `.db.age` en local y comprobá que abre. Un respaldo que nunca se probó no cuenta.

## Límites del plan

Fly **cobra** al pasar un límite: no bloquea ni tiene tope de gasto.

| Recurso | Límite actual | Qué hacer |
|---|---|---|
| Memoria | 256 MB (se usan unos 19 MiB) | Revisar si aparece un OOM en `fly logs` |
| Volumen | 1 GB (se usa alrededor del 7 %) | `/api/health` → `storage.used_pct`; ampliar con `fly volumes extend` si pasa del 70 % |
| Costo | Unos 3,3 USD por mes | Revisar la factura mensual; si pasa de 5 USD, ir a la regla de corte 3 |

## Mantenimiento

| Tarea | Frecuencia |
|---|---|
| Probar la restauración de un `.db.age` | Mensual |
| Revisar los PRs de Renovate (los fusiona el agente revisor con auto-merge) | Semanal |
| Revisar la factura de Fly | Mensual |
| Comprobar que los snapshots siguen activos: `fly volumes snapshots list <id-del-volumen> --app descanso-sleep` | Mensual |
| Revisar que `Backup` sigue en verde (`gh run list --workflow backup.yml -L 7`) hasta que exista el aviso automático | Semanal |
| Rotar `BACKUP_TOKEN` y, si hace falta, VAPID ([rotar-vapid.md](../runbooks/rotar-vapid.md)) | Anual, o ante una sospecha |
| Revisar los límites de Node, npm, TypeScript y Angular en `renovate.json` | Al migrar a Angular 22 o subir Node |

## Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `Deploy` falla con «volume not found» | Fly movió la máquina y su volumen a otro host | El workflow reintenta solo. Si sigue fallando, relanzar `Deploy` |
| Un aviso llega tarde | Coincidió con un deploy o con el Doze de Android | Fusionar fuera de las horas de aviso |
| `Backup` falla | Faltan secretos, o se venció el token de R2 | Ver el log del job y revisar `gh secret list` |
| `Backup` falló y nadie se enteró | Todavía no hay aviso automático | Revisar `gh run list --workflow backup.yml` cada semana hasta tener el issue automático |
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
- [x] Verificación sin login, puntos 1 a 5 (2026-11-13).
- [x] Repo público: `docs/despliegue/` y `.despliegue.json` revisados antes del commit, sin secretos ni datos personales.
- [ ] Fase 1: respaldo externo guardado y restaurado.
- [ ] Fase 2: pipeline endurecido.
- [ ] Fase 4: alta del propietario, aviso de prueba y aislamiento entre cuentas.
- [ ] Factura de Fly revisada (≤ 5 USD).
