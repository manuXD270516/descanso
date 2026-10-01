# Runbook: configurar el bucket de respaldos (Cloudflare R2)

El workflow **Backup** (`.github/workflows/backup.yml`) descarga cada día una copia de la base
desde `/api/admin/backup`, la verifica y la sube a un bucket compatible con S3. Este runbook crea
ese bucket en Cloudflare R2 y carga sus credenciales en GitHub. Es la tarea **T014** de la
feature 002 (`specs/002-pipeline-ci-cd/tasks.md`).

**Resultado esperado:** el workflow Backup termina en verde con todos sus pasos, y en el bucket
aparece `descanso/<YYYY-MM-DDTHHMMSSZ>.db`.

**Tiempo:** 20–30 minutos la primera vez.

> Los nombres de los menús de Cloudflare cambian de vez en cuando. Si un botón no se llama
> exactamente igual, busca el equivalente; lo importante son los valores que se eligen.

## Por qué R2

- **Gratis a esta escala.** La capa gratuita incluye 10 GB-mes de almacenamiento, 1 millón de
  operaciones de escritura y 10 millones de lectura al mes, y la salida de datos no se cobra.
  La base pesa unos 76 KB: 14 copias son ~1 MB y 1 subida + 1 listado + unos pocos borrados al
  día son ~100 operaciones al mes. Coste esperado: **0 USD**.
- **Compatible con S3.** El workflow usa `aws` CLI sin cambios, con `AWS_DEFAULT_REGION=auto`, que
  es la región que R2 espera.
- **Credenciales limitadas a un bucket.** Un token de R2 puede tener permiso solo sobre
  `descanso-respaldos`; si se filtra, no da acceso a nada más de la cuenta.

## Qué se va a crear

| Elemento | Valor | Dónde termina |
|---|---|---|
| Bucket | `descanso-respaldos` (privado) | secreto `S3_BUCKET` |
| Endpoint S3 de la cuenta | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | secreto `S3_ENDPOINT` |
| Token de API de R2 | `descanso-backup-github`, *Object Read & Write* solo sobre el bucket | secretos `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` |

`BACKUP_TOKEN` es otro secreto, el que protege la descarga desde la app. Ya está configurado; si
hay que cambiarlo, usa `scripts/ops/rotar-backup-token.ps1` (o `.sh`).

## Requisitos

- Una cuenta de Cloudflare (se crea en el paso 1 si no la tienes).
- Una tarjeta para activar R2. Cloudflare la pide aunque no se supere la capa gratuita.
- `gh` con sesión iniciada en tu cuenta de GitHub (`gh auth status`).
- Opcional, para el paso 5 y para restaurar respaldos: `aws` CLI v2.

---

## 1. Crear la cuenta y activar R2

1. Entra en https://dash.cloudflare.com/sign-up y crea la cuenta con tu email. Confirma el correo
   de verificación. No hace falta añadir ningún dominio: si el asistente lo pide, sáltalo.
2. En el menú lateral abre **R2 Object Storage** (puede estar dentro de *Storage & Databases*).
3. Pulsa **Purchase R2 Plan** o **Add R2 subscription to my account** y añade la tarjeta. El plan
   es de pago por uso con la capa gratuita incluida; no hay cuota fija.
4. **Anota el Account ID.** Aparece en la portada de R2, en el panel lateral *Account Details*
   (32 caracteres hexadecimales). También está en la URL del panel:
   `dash.cloudflare.com/<ACCOUNT_ID>/r2/overview`.

**Comprobación:** la portada de R2 muestra *Create bucket* sin pedir la suscripción.

## 2. Crear el bucket

1. En R2, pulsa **Create bucket**.
2. Rellena:
   | Campo | Valor | Por qué |
   |---|---|---|
   | Bucket name | `descanso-respaldos` | Solo minúsculas, números y guiones. Si eliges otro nombre, úsalo igual en el paso 4. |
   | Location | **Automatic** | R2 no tiene región en Sudamérica; *Automatic* elige la más cercana. |
   | Jurisdiction | **Default** (sin jurisdicción) | Con *EU* o *FedRAMP* el endpoint cambia (`<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`) y el paso 4 debe usar ese. |
   | Default storage class | **Standard** | *Infrequent Access* cobra un mínimo de 30 días por objeto y cada lectura; con copias que se borran a los 14 días sale más caro. |
3. Pulsa **Create bucket**.
4. Abre el bucket → **Settings** y confirma:
   - **Public access → R2.dev subdomain:** *Disabled*. No lo actives.
   - **Custom Domains:** ninguno.
   - **Object lifecycle rules:** deja solo la regla por defecto, si la hay, que aborta subidas
     multiparte incompletas. **No añadas una regla que borre objetos.** La poda de 14 días ya la
     hace el workflow, y solo después de subir con éxito la copia del día. Una regla del bucket
     borraría copias aunque el respaldo llevara días fallando, y podrías quedarte sin ninguna.

**Comprobación:** el bucket aparece en la lista con 0 objetos y su página dice que el acceso
público está deshabilitado.

## 3. Crear el token de API con permiso solo sobre el bucket

1. Vuelve a la portada de R2 y, en *Account Details*, pulsa **Manage** junto a *API Tokens* (o
   **Manage R2 API Tokens**).
2. Pulsa **Create Account API token**. Un token de cuenta no depende de tu usuario y es el tipo
   indicado para sistemas como GitHub Actions. Si solo ves *Create User API token*, sirve igual.
3. Rellena:
   | Campo | Valor | Por qué |
   |---|---|---|
   | Token name | `descanso-backup-github` | Para reconocerlo al rotarlo o revocarlo. |
   | Permissions | **Object Read & Write** | El workflow sube (`PutObject`), lista (`ListObjectsV2`) y borra (`DeleteObject`) copias, y la restauración las descarga. *Object Read only* hace fallar la subida; *Admin Read & Write* da permisos sobre toda la cuenta y no hace falta. |
   | Specify bucket(s) | **Apply to specific buckets only** → `descanso-respaldos` | Mínimo privilegio. |
   | TTL | **Forever** | Si pones caducidad, el respaldo dejará de funcionar ese día; apúntalo y rótalo antes (sección "Rotar las credenciales"). |
   | Client IP Address Filtering | vacío | Los runners de GitHub cambian de IP en cada ejecución. |
4. Pulsa **Create API Token**.
5. La página siguiente muestra los valores **una sola vez**. Copia estos tres a un lugar seguro
   temporal (por ejemplo, tu gestor de contraseñas) antes de cerrarla:
   | En la página de Cloudflare | Secreto de GitHub |
   |---|---|
   | **Access Key ID** (32 caracteres) | `AWS_ACCESS_KEY_ID` |
   | **Secret Access Key** (64 caracteres) | `AWS_SECRET_ACCESS_KEY` |
   | **Use jurisdiction-specific endpoints for S3 clients → Default** (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`) | `S3_ENDPOINT` |

   El campo **Token value** (el que empieza por letras y se usa como `Bearer`) es para la API de
   Cloudflare. **No lo necesitas**: el workflow solo usa el par Access Key ID / Secret Access Key.

Si cierras la página sin copiar el Secret Access Key, no se puede recuperar: borra el token y
crea otro.

## 4. Cargar los secretos en GitHub

Desde PowerShell o bash, en cualquier carpeta. Cada comando pide el valor sin mostrarlo en
pantalla; pégalo y pulsa Enter.

```powershell
gh secret set S3_ENDPOINT --repo manuXD270516/descanso
```

```powershell
gh secret set S3_BUCKET --repo manuXD270516/descanso
```

```powershell
gh secret set AWS_ACCESS_KEY_ID --repo manuXD270516/descanso
```

```powershell
gh secret set AWS_SECRET_ACCESS_KEY --repo manuXD270516/descanso
```

Formato exacto de cada valor:

| Secreto | Ejemplo de forma | Errores típicos |
|---|---|---|
| `S3_ENDPOINT` | `https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com` | Incluir el nombre del bucket al final, dejar una `/` final u omitir `https://`. |
| `S3_BUCKET` | `descanso-respaldos` | Escribir `s3://descanso-respaldos`. |
| `AWS_ACCESS_KEY_ID` | 32 caracteres hex | Pegar el *Token value* en su lugar. |
| `AWS_SECRET_ACCESS_KEY` | 64 caracteres hex | Intercambiarlo con el Access Key ID. |

**Comprobación:**

```powershell
gh secret list --repo manuXD270516/descanso
```

Deben aparecer `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BACKUP_TOKEN`, `FLY_API_TOKEN`,
`S3_BUCKET` y `S3_ENDPOINT`, los cuatro nuevos con la hora de hoy.

## 5. (Opcional) Probar las credenciales desde tu equipo

Este paso confirma los permisos antes de depender del workflow y deja configurado el perfil que
usa el runbook [restaurar-respaldo.md](restaurar-respaldo.md). Puedes saltarlo e ir al paso 6.

1. Instala `aws` CLI v2 si no lo tienes y abre una terminal nueva:
   ```powershell
   winget install --id Amazon.AWSCLI -e
   ```
2. Crea un perfil solo para R2. Pide los valores uno a uno; en *region* escribe `auto` y en
   *output format* `json`:
   ```powershell
   aws configure --profile descanso-r2
   ```
   Las credenciales quedan en `%USERPROFILE%\.aws\credentials`, solo en tu equipo.
3. Prueba los cuatro permisos que usa el workflow (sustituye `<ACCOUNT_ID>`):
   ```powershell
   $ep = 'https://<ACCOUNT_ID>.r2.cloudflarestorage.com'; $b = 'descanso-respaldos'
   'prueba' | Set-Content "$env:TEMP\r2-prueba.txt"
   aws s3 cp "$env:TEMP\r2-prueba.txt" "s3://$b/descanso/prueba.txt" --endpoint-url $ep --profile descanso-r2
   aws s3 ls "s3://$b/descanso/" --endpoint-url $ep --profile descanso-r2
   aws s3 cp "s3://$b/descanso/prueba.txt" - --endpoint-url $ep --profile descanso-r2
   aws s3 rm "s3://$b/descanso/prueba.txt" --endpoint-url $ep --profile descanso-r2
   Remove-Item "$env:TEMP\r2-prueba.txt"
   ```
   Resultado esperado, en orden: `upload: …`, una línea con `prueba.txt`, el texto `prueba` y
   `delete: …`. Cualquier error se explica en "Problemas frecuentes".

## 6. Lanzar el respaldo y comprobarlo

1. Lanza el workflow a mano y espera a que termine:
   ```powershell
   gh workflow run Backup --repo manuXD270516/descanso
   ```
   ```powershell
   gh run watch --repo manuXD270516/descanso --exit-status $(gh run list --workflow Backup --repo manuXD270516/descanso --limit 1 --json databaseId --jq '.[0].databaseId')
   ```
   También se puede hacer desde GitHub → Actions → **Backup** → *Run workflow*.
2. Los cuatro pasos del job deben quedar en verde:
   | Paso | Qué prueba |
   |---|---|
   | Descargar copia consistente | `BACKUP_TOKEN` coincide en Fly y GitHub |
   | Verificar integridad | `PRAGMA integrity_check` = `ok` |
   | Subir al bucket | `S3_ENDPOINT`, `S3_BUCKET` y el permiso de escritura |
   | Podar respaldos de más de 14 días | permisos de listado y borrado (el primer día no borra nada) |
3. En Cloudflare → R2 → `descanso-respaldos` debe aparecer la carpeta `descanso/` con un archivo
   `<fecha>.db` de unos 76 KB. Con el perfil del paso 5:
   ```powershell
   aws s3 ls "s3://descanso-respaldos/descanso/" --endpoint-url $ep --profile descanso-r2
   ```
4. Al día siguiente, revisa que la ejecución programada de las 03:17 UTC (23:17 en Bolivia)
   también terminó en verde.

## 7. Ensayar una restauración

Un respaldo que nunca se restauró no está probado. Sigue
[restaurar-respaldo.md](restaurar-respaldo.md) §1 (descargar y verificar) y §2a (restaurar en
local con Docker Compose) con el archivo del paso 6, y comprueba que ves tus datos en
http://localhost:3000. Forma parte de la validación final **T022**.

## 8. Cerrar la tarea

- Borra los valores del lugar temporal donde los copiaste en el paso 3, salvo que los quieras
  guardar en tu gestor de contraseñas.
- Marca **T014** como hecha en `specs/002-pipeline-ci-cd/tasks.md` en un PR (`master` está
  protegida), o pide a Claude que lo haga junto con la validación T022.

---

## Problemas frecuentes

| Síntoma en el log del workflow (o del paso 5) | Causa probable | Solución |
|---|---|---|
| *Descargar copia consistente* → `curl: (22) … 401` | `BACKUP_TOKEN` distinto en Fly y GitHub | `pwsh scripts/ops/rotar-backup-token.ps1` |
| *Subir al bucket* → `Parameter validation failed: Invalid bucket name ""` | `S3_BUCKET` sin cargar | Paso 4. |
| `Could not connect to the endpoint URL` / `Invalid endpoint` | `S3_ENDPOINT` vacío, sin `https://` o con el bucket al final | Vuelve a cargarlo con el formato del paso 4. |
| `InvalidAccessKeyId` o `SignatureDoesNotMatch` | Claves intercambiadas, con espacios, o se usó el *Token value* | Vuelve a cargar `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY`. Si no tienes el secreto, crea otro token (paso 3). |
| `AccessDenied` al subir, listar o borrar | Token con *Object Read only* o sin el bucket en su alcance | Edita el token en R2 → API Tokens: *Object Read & Write* sobre `descanso-respaldos`. |
| `NoSuchBucket` | Nombre distinto, o bucket creado con jurisdicción EU | Revisa `S3_BUCKET`; con jurisdicción EU usa el endpoint `.eu.r2.cloudflarestorage.com`. |
| `NotImplemented` o un error que menciona `x-amz-checksum` | Cambios de checksums en versiones nuevas de `aws` CLI que R2 no admite | Pide a Claude añadir `AWS_REQUEST_CHECKSUM_CALCULATION: when_required` y `AWS_RESPONSE_CHECKSUM_VALIDATION: when_required` al `env` de `backup.yml`. |
| El workflow no corre de noche | GitHub desactiva los workflows programados tras 60 días sin actividad en el repo | Actions → Backup → *Enable workflow*. |

Para ver el log de la última ejecución fallida:

```powershell
gh run view --repo manuXD270516/descanso --log-failed $(gh run list --workflow Backup --repo manuXD270516/descanso --limit 1 --json databaseId --jq '.[0].databaseId')
```

## Rotar las credenciales de R2

Hazlo si sospechas que se filtraron o antes de que caduque el token, si le pusiste TTL. El orden
evita que el respaldo se quede sin credenciales válidas:

1. Crea un token nuevo (paso 3) con el nombre `descanso-backup-github-<fecha>`.
2. Carga sus valores en `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` (paso 4).
3. Lanza Backup a mano (paso 6) y confirma que termina en verde.
4. Solo entonces borra el token anterior en R2 → API Tokens.
5. Si usas el perfil local, actualízalo con `aws configure --profile descanso-r2`.

## Seguridad

- Las credenciales del bucket viven solo en los secretos de GitHub y, si hiciste el paso 5, en
  tu perfil local de `aws`. Nunca en el repositorio, en `fly secrets` ni en un issue o PR.
- La app no tiene acceso al bucket: solo el workflow sube y borra copias (research R8 de 002).
- El bucket no tiene acceso público. Una copia contiene todos tus datos de sueño: no actives el
  subdominio `r2.dev` ni compartas URLs firmadas más allá de los 15 minutos que usa la
  restauración.
