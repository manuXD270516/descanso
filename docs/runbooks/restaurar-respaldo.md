# Runbook: restaurar un respaldo

Los respaldos los genera cada día el workflow **Backup** (`.github/workflows/backup.yml`, 03:17
UTC). Se guardan en `s3://$S3_BUCKET/descanso/<YYYY-MM-DDTHHMMSSZ>.db.age` y se conservan 14 días.
Cada archivo es una base SQLite completa, verificada con `PRAGMA integrity_check` y **cifrada con
[age](https://age-encryption.org)** antes de salir del pipeline (feature 008: contiene datos de
salud de todos los usuarios). Los respaldos anteriores a 008 son `.db` sin cifrar y desaparecen
solos por la retención de 14 días.

## 0. Una sola vez: la clave de cifrado

El pipeline solo tiene la clave **pública**; la **privada** solo la guardas tú. Así, aunque alguien
comprometa GitHub Actions, no puede leer los respaldos.

1. Instala age: `winget install FiloSottile.age` (Windows), `brew install age` (macOS) o
   `sudo apt install age` (Linux).
2. Genera el par de claves y **guarda `descanso-backup.key` en tu gestor de contraseñas** (sin ella,
   los respaldos son irrecuperables):
   ```bash
   age-keygen -o descanso-backup.key
   ```
3. Configura la clave pública en GitHub (empieza por `age1…`; no es secreta, pero va como secreto
   para tenerla junto al resto):
   ```bash
   gh secret set BACKUP_AGE_RECIPIENT --body "$(grep -o 'age1[0-9a-z]*' descanso-backup.key)"
   ```
4. Lanza Actions → **Backup** → *Run workflow*: el objeto subido termina en `.db.age`.

Si falta `BACKUP_AGE_RECIPIENT`, el workflow falla **antes** de descargar nada: nunca sube una
copia en claro.

## Requisitos

- `aws` CLI con credenciales del bucket (las mismas que los secretos `AWS_ACCESS_KEY_ID` /
  `AWS_SECRET_ACCESS_KEY` de GitHub).
- `age` y tu clave privada `descanso-backup.key` (paso 0).
- Para la variante local: Docker con Compose.

En los comandos, sustituye `$S3_ENDPOINT` y `$S3_BUCKET` por los valores de tu bucket.

## 1. Elegir y descargar el respaldo

```bash
aws s3 ls "s3://$S3_BUCKET/descanso/" --endpoint-url "$S3_ENDPOINT"
aws s3 cp "s3://$S3_BUCKET/descanso/<archivo>.db.age" ./restore.db.age --endpoint-url "$S3_ENDPOINT"
age -d -i descanso-backup.key -o restore.db restore.db.age
sqlite3 restore.db 'PRAGMA integrity_check'   # debe decir: ok (opcional si no tienes sqlite3)
rm restore.db.age
```

## 2a. Restaurar en local (Docker Compose)

```bash
docker compose down                                   # sin -v: el volumen se conserva
docker run --rm -v descanso-data:/data -v "$PWD":/in alpine \
  sh -c 'cp /in/restore.db /data/sleep.db && rm -f /data/sleep.db-wal /data/sleep.db-shm'
docker compose up -d
curl -s localhost:3000/api/health                     # {"ok":true,...}
```

Abre http://localhost:3000 y comprueba que los datos coinciden con los del respaldo.

> El volumen se llama siempre `descanso-data`, porque tiene un nombre fijo en `compose.yaml`.

## 2b. Restaurar en producción (Fly.io)

0. **Primero, un respaldo del estado actual.** En GitHub, ve a Actions → **Backup** → *Run
   workflow* y espera a que termine en verde. Así, restaurar nunca pierde los cambios hechos
   después del respaldo elegido (principio II de la constitución).
1. **En tu equipo**, descarga y descifra el respaldo elegido (paso 1 de este runbook). La clave
   privada nunca sale de tu equipo: a la máquina solo llega la base ya descifrada.
2. Súbela a la máquina por SFTP. Si está apagada por falta de tráfico, abre antes la app para
   despertarla:
   ```bash
   flyctl ssh sftp shell --app descanso-sleep
   put restore.db /data/restore.db
   ```
   (sal con Ctrl+D). Después, borra tu copia local descifrada: `rm restore.db`.
3. Abre una consola en la máquina y restaura con la API de backup de SQLite:
   ```bash
   flyctl ssh console --app descanso-sleep
   ```
   Dentro de la máquina:
   ```sh
   cd /app/backend && node -e "new (require('better-sqlite3'))('/data/restore.db').backup('/data/sleep.db').then(() => console.log('ok'))"
   rm /data/restore.db
   exit
   ```
   La API de backup de SQLite copia el contenido respetando los bloqueos de la base abierta. No
   sobrescribas el archivo con `cp` mientras el servicio está corriendo.
4. Reinicia la app: `flyctl apps restart descanso-sleep`.
5. Comprueba https://descanso-sleep.fly.dev/api/health y los datos en la app.

## Lanzar un respaldo manual

GitHub → Actions → **Backup** → *Run workflow*. Hace lo mismo que la ejecución programada.

## Avisos

- **Los workflows programados se desactivan tras 60 días sin actividad en el repositorio.**
  Si el repositorio pasa meses sin commits, revisa en Actions → Backup que siga activo. Si no
  lo está, pulsa *Enable workflow*.
- Si el workflow **Backup** falla, GitHub envía un correo. Un fallo nunca borra respaldos
  anteriores, porque la poda solo se ejecuta tras subir con éxito la copia del día.
- El endpoint `/api/admin/backup` exige `Authorization: Bearer <BACKUP_TOKEN>`. Si rotas el
  token, actualízalo **a la vez** en Fly (`flyctl secrets set BACKUP_TOKEN=… --app descanso-sleep`)
  y en GitHub (secreto `BACKUP_TOKEN`).

## Registro de ensayos

| Fecha | Qué | Entorno | Resultado |
|-------|-----|---------|-----------|
| 2026-10-02 | Cifrado y descifrado con age (feature 008) | Contenedor ubuntu:24.04 con el paquete apt `age`, los mismos comandos del workflow y del paso 1 | La clave pública cumple la validación del workflow; el `.db.age` no se abre como SQLite ni contiene texto en claro; descifrado idéntico al original (sha256) con `integrity_check` ok; otra clave no descifra. 18 s. |
