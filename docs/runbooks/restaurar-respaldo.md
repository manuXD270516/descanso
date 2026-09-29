# Runbook: restaurar un respaldo

Los respaldos los genera cada día el workflow **Backup** (`.github/workflows/backup.yml`, 03:17
UTC). Se guardan en `s3://$S3_BUCKET/descanso/<YYYY-MM-DDTHHMMSSZ>.db` y se conservan 14 días.
Cada archivo es una base SQLite completa, verificada con `PRAGMA integrity_check`.

## Requisitos

- `aws` CLI con credenciales del bucket (las mismas que los secretos `AWS_ACCESS_KEY_ID` /
  `AWS_SECRET_ACCESS_KEY` de GitHub).
- Para la variante local: Docker con Compose.

En los comandos, sustituye `$S3_ENDPOINT` y `$S3_BUCKET` por los valores de tu bucket.

## 1. Elegir y descargar el respaldo

```bash
aws s3 ls "s3://$S3_BUCKET/descanso/" --endpoint-url "$S3_ENDPOINT"
aws s3 cp "s3://$S3_BUCKET/descanso/<archivo>.db" ./restore.db --endpoint-url "$S3_ENDPOINT"
sqlite3 restore.db 'PRAGMA integrity_check'   # debe decir: ok (opcional si no tienes sqlite3)
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

## 2b. Restaurar en producción (Render)

0. **Primero, un respaldo del estado actual.** En GitHub, ve a Actions → **Backup** → *Run
   workflow* y espera a que termine en verde. Así, restaurar nunca pierde los cambios hechos
   después del respaldo elegido (principio II de la constitución).
1. Genera una URL de descarga temporal (15 min):
   ```bash
   aws s3 presign "s3://$S3_BUCKET/descanso/<archivo>.db" --expires-in 900 --endpoint-url "$S3_ENDPOINT"
   ```
2. En el dashboard de Render, abre el servicio **descanso** → **Shell** y ejecuta:
   ```sh
   wget -O /data/restore.db "<URL firmada>"
   cd /app/backend && node -e "new (require('better-sqlite3'))('/data/restore.db').backup('/data/sleep.db').then(() => console.log('ok'))"
   rm /data/restore.db
   ```
   La API de backup de SQLite copia el contenido respetando los bloqueos de la base abierta. No
   sobrescribas el archivo con `cp` mientras el servicio está corriendo.
3. En el dashboard: **Manual Deploy → Restart service**.
4. Comprueba `https://<app>/api/health` y los datos en la app.

## Lanzar un respaldo manual

GitHub → Actions → **Backup** → *Run workflow*. Hace lo mismo que la ejecución programada.

## Avisos

- **Los workflows programados se desactivan tras 60 días sin actividad en el repositorio.**
  Si el repositorio pasa meses sin commits, revisa en Actions → Backup que siga activo. Si no
  lo está, pulsa *Enable workflow*.
- Si el workflow **Backup** falla, GitHub envía un correo. Un fallo nunca borra respaldos
  anteriores, porque la poda solo se ejecuta tras subir con éxito la copia del día.
- El endpoint `/api/admin/backup` exige `Authorization: Bearer <BACKUP_TOKEN>`. Si rotas el
  token, actualízalo **a la vez** en Render (variable de entorno) y en GitHub (secreto).
