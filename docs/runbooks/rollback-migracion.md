# Runbook: rollback con restauración del respaldo previo a la migración

Úsalo cuando un despliegue con migraciones deja la base mal. Hay dos casos:

- **La migración falló**: la migración se deshizo sola y la base quedó intacta. El pipeline ya
  volvió a la imagen anterior. **No hace falta restaurar**, solo corregir la migración (ver
  "Después").
- **La migración se aplicó pero dejó datos incorrectos**, o la app nueva los corrompió. En ese
  caso restaura el respaldo previo, siguiendo este runbook.

Cada vez que hay migraciones pendientes, el servicio guarda antes una copia completa de la base en
`/data/backups/pre-NNN.db` (NNN = primera migración que se iba a aplicar). Se conservan las 3 más
recientes. Ver [`docs/sdd/guia-migraciones.md`](../sdd/guia-migraciones.md).

> **Ojo:** restaurar el respaldo previo **pierde todo lo registrado después de la migración**.
> Si pasó tiempo desde el despliegue, compara primero con el respaldo diario de S3
> ([`restaurar-respaldo.md`](restaurar-respaldo.md)) y elige el más reciente que esté sano.

## 1. Síntomas y diagnóstico

```bash
flyctl logs --app descanso-sleep | grep -i "migraci"
```

- `[migraciones] aplicadas: …` → se aplicaron; anota qué versiones y qué respaldo se guardó.
- `La migración NNN_… falló y se deshizo: …` → caso "la migración falló": no restaures.
- `La migración NNN_… cambió después de aplicarse (checksum distinto)` → alguien editó una
  migración ya aplicada; restaura el archivo original en el repo (no toques la base).
- `Hay N noches abiertas (…)` → la migración 002 encontró datos que no cumplen su precondición;
  cierra o borra las noches indicadas con la versión anterior de la app y vuelve a desplegar.

## 2. Restaurar en producción (Fly.io)

1. **Respaldo del estado actual**, por si hay que volver atrás: GitHub → Actions → **Backup** →
   *Run workflow*, y espera a que termine en verde.
2. **Asegúrate de que corre la imagen anterior.** Si el pipeline ya hizo rollback, está hecho. Si
   no, redespliega la anterior. Así, al reiniciar, no se vuelve a aplicar la migración defectuosa:
   ```bash
   flyctl releases --app descanso-sleep                         # identifica la imagen anterior
   flyctl deploy --app descanso-sleep --image ghcr.io/manuxd270516/descanso:<sha-anterior>
   ```
3. **Consola en la máquina.** Si está apagada, abre la app en el navegador para despertarla:
   ```bash
   flyctl ssh console --app descanso-sleep
   ```
4. **Dentro de la máquina**: comprueba el respaldo y cópialo sobre la base con la API de backup
   de SQLite, que es segura aunque el servicio esté corriendo. No uses `cp` sobre la base abierta.
   ```sh
   ls -la /data/backups/
   cd /app/backend
   node -e "const D=require('better-sqlite3'); const s=new D('/data/backups/pre-NNN.db',{readonly:true}); console.log(s.pragma('integrity_check',{simple:true})); s.backup('/data/sleep.db').then(()=>console.log('restaurada'))"
   exit
   ```
   Debe imprimir `ok` y luego `restaurada`.
5. **Reinicia**: `flyctl apps restart descanso-sleep`.
6. **Verifica**: `curl -s https://descanso-sleep.fly.dev/api/health` y revisa los datos en la app.
   La imagen anterior ignora la tabla `schema_migrations` y los índices nuevos (expand/contract).

## 3. Después

- **No vuelvas a desplegar la versión defectuosa tal cual**: al arrancar, reaplicaría la migración.
- Si la migración **no llegó a registrarse**, puedes corregir su archivo.
- Si **llegó a registrarse** (se restauró un respaldo en el que no existía, pero el archivo ya
  circuló), no la edites. Cámbiale el número por uno nuevo o escribe una migración correctora, y
  añade una prueba con un fixture que reproduzca el problema.

## 4. Ensayo en local

Hazlo tras cada feature con migraciones. Objetivo: menos de 15 minutos (SC-007 de la feature 003).

**Con Docker Compose**, igual que en producción:

```bash
docker compose up -d --build            # la versión nueva migra y deja /data/backups/pre-NNN.db
docker compose exec app ls -la /data/backups
docker compose exec app node -e "const D=require('better-sqlite3'); new D('/data/backups/pre-NNN.db',{readonly:true}).backup('/data/sleep.db').then(()=>console.log('restaurada'))"
docker compose restart app
curl -s localhost:3000/api/health
```

**Sin Docker** (lo que usa el ensayo registrado abajo):

```bash
cd backend
node test/fixtures/make-legacy-db.js ../tmp/ensayo/sleep.db              # base "de producción"
DB_PATH=../tmp/ensayo/sleep.db node -e "require('./src/db')"             # migra y guarda backups/pre-001.db
node -e "const D=require('better-sqlite3'); new D('../tmp/ensayo/backups/pre-001.db',{readonly:true}).backup('../tmp/ensayo/sleep.db').then(()=>console.log('restaurada'))"
```

Comprueba que la base restaurada no tiene `schema_migrations` y conserva todas las filas.

## Registro de ensayos

| Fecha | Feature | Entorno | Duración | Resultado |
|-------|---------|---------|----------|-----------|
| 2026-09-29 | 003 | Local sin Docker (Windows, Node 22) | < 1 min de comandos (0,1 s de ejecución) | Huella de todas las tablas idéntica a la previa; `integrity_check` ok; sin `schema_migrations` tras restaurar. El ensayo detectó que el respaldo se tomaba después de crear `schema_migrations` y se corrigió el runner. |
