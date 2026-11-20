# Decisión de despliegue: Descanso (sleep-tracker)

**Fecha:** 2026-11-17. **Método:** 3 agentes defendieron una plataforma cada uno, un crítico atacó cada propuesta comprobando sus supuestos y 3 jueces con lentes distintas (costo, seguridad y operación) puntuaron y votaron. Profundidad: `normal`, 9 agentes, unos 846.000 tokens y 5 minutos. Es una **revisión de un despliegue existente**: Descanso corre en Fly.io desde la feature 002, y la pregunta fue si conviene quedarse o migrar.

Esta corrida repite la del 2026-11-13, con los mismos candidatos y parámetros, sobre el perfil actualizado (los cambios del 17 están en [perfil-despliegue.json](perfil-despliegue.json)). Llegó al mismo resultado, ahora **sin árbitro**: el 13, el conteo había vetado a Fly por la autodeclaración honesta de su proponente, y hubo que arbitrar. La skill ya no veta por autodeclaración, así que esta vez el conteo coincidió con los jueces.

## Resultado

**Estado:** aprobada por el owner el 2026-11-18.

Gana **Fly.io, quedarse como está**: es la única opción que cumple las restricciones sin migrar datos ni cambiar código, y los 3 jueces la pusieron primera. Costo: unos 3,3 USD por mes (máquina shared-cpu-1x de 256 MB siempre encendida en gru, más el volumen de 1 GB); el precio de gru todavía es un supuesto hasta ver la factura (A-fly-2). Plan B: **VPS propio con Docker Compose y Caddy**, si la factura de Fly supera los 5 USD por mes, si se pierde el volumen o si Fly cambia sus condiciones.

| Criterio | Peso | Por qué pesa | Fly | VPS + Docker | Cloudflare |
|---|---:|---|---:|---:|---:|
| Costo | 15 | Tope de 5 USD por mes, con tarjeta aceptada | 3,00 | 2,33 | 1,67 |
| Ajuste al stack | 20 | Proceso persistente, SQLite nativa, migraciones propias | 5,00 | 3,00 | 1,00 |
| Seguridad | 25 | Datos de salud, repo público | 3,00 | 2,00 | 2,00 |
| Operación | 20 | Una sola persona; Renovate fusiona seguido | 4,00 | 2,00 | 3,00 |
| Reversibilidad | 15 | Vuelta atrás de código y base, costo de irse | 3,00 | 4,00 | 2,00 |
| Esfuerzo | 5 | Ya está en producción | 5,00 | 2,00 | 1,00 |
| **Puntaje sobre 5** | | | **3,70** | 2,55 | 1,90 |
| **Votos (Borda)** | | | **6** | 3 | 0 |
| **Primeros puestos** | | | **3 de 3** | 0 | 0 |
| **Vetado** | | | no | no | no (1 veto de 3, en minoría) |
| **Veredicto del crítico** | | | viable con cambios | viable con cambios | inviable |

Consenso: 3 de 3 jueces pusieron primero a Fly. Regla ganadora: mayoría de primeros puestos. El script no pidió árbitro ni dejó avisos.

**Vetados y descartados.** Ningún candidato quedó vetado por mayoría. El juez de costo vetó a Cloudflare: Workers Paid cuesta exactamente 5 USD sin margen para impuestos, y el mes de convivencia con Fly (unos 8,3 USD) viola el tope; además, D1 no tiene región en Sudamérica. Los otros dos jueces lo pusieron último sin vetarlo.

## El proyecto, en lo que importa para desplegarlo

- Un solo proceso Node (Express) sirve la API y la SPA Angular compilada, en un contenedor (`Dockerfile`, `node:22-alpine`).
- La base es SQLite en archivo, con `better-sqlite3` (dependencia nativa) y migraciones propias versionadas, sobre un volumen persistente (`fly.toml`, `[[mounts]]` en `/data`).
- El proceso es persistente: un disparador en memoria cada 30 s envía avisos push con la app cerrada (`backend/src/reminders/waker.js:32`).
- Los datos son de salud (sueño y siestas), con varios usuarios aislados entre sí. El repositorio es público.
- Uso personal: 1 a 3 usuarios en Sudamérica. Memoria medida en local, con la base vacía: 18,55 MiB.
- Desde el 13: el CD ignora `docs/**` y `**/*.md`, `setup-flyctl` está fijado a un commit, `/api/admin` limita intentos y registra accesos, y un fallo del respaldo abre un issue.

## Restricciones

| Restricción | Vetó a |
|---|---|
| Costo ≤ 5 USD por mes (tarjeta aceptada) | Cloudflare, por un juez (en minoría) |
| Disparador de avisos con resolución ≤ 1 min | Nadie; es el motivo principal del puntaje 1 de Cloudflare en ajuste |
| Datos sensibles: sesión obligatoria, secretos fuera del repo, respaldo fuera de la plataforma | Nadie: los tres dependen del respaldo externo de T014 (condición común; objeción O-fly-1 y sus equivalentes en los otros candidatos) |
| No perder datos en una migración | Nadie (Fly no migra) |
| Latencia razonable desde Sudamérica | Riesgo para Cloudflare (D1 sin región cercana) |

## Por qué ganó

- **Ajuste total (5/5):** no cambia una línea de código. El proceso persistente, el volumen con SQLite y el binario nativo funcionan hoy en producción.
- **Operación probada (4/5):** cada merge a `master` despliega por SHA desde GHCR, con reintento ante «volume not found» y rollback automático si falla el health check (`.github/workflows/deploy.yml`).
- **Costo dentro del tope**, con unos 1,7 USD de margen; el precio de gru se confirma con la primera factura (A-fly-2).
- **Seguridad:** gana porque los otros son peores, no con holgura (ver «Disenso»).

## Por qué no los otros

- **VPS + Docker (2,55):** dos objeciones altas sin respuesta. O-vps-docker-1: el usuario `deploy` «sin sudo, en el grupo docker» equivale a root, y su clave SSH vive en GitHub. O-vps-docker-2: la VM de Oracle Always Free puede ser reclamada por inactividad, y que Pay As You Go la proteja es un supuesto. Gana en reversibilidad (4/5) y sigue siendo el plan B.
- **Cloudflare (1,90):** el crítico lo declaró inviable. Obliga a reescribir la capa de datos para D1 (asíncrona, sin transacciones interactivas), los avisos pasan a Cron Triggers, el costo llega al tope sin margen y la latencia con D1 lejos de Sudamérica es incierta.

## Hallazgos que condicionan el diseño

Lo nuevo de esta corrida respecto del 13 pasa al runbook (fase 2, puntos 6 a 9, y fase 1b):

1. **O-fly-3: `fly.toml` apunta a `:latest`**, y `deploy.yml` publica `latest` antes del health check. Un `fly deploy` manual durante un incidente volvería a publicar la imagen rota.
2. **O-fly-7: `FLY_API_TOKEN` permite `fly ssh console` y `sftp`**, es decir, leer `/data/sleep.db` en claro. Moverlo al environment no achica su alcance: hay que restringir el environment a `master`, mantener las acciones fijadas a un SHA y rotarlo.
3. **O-fly-2: el aviso de fallo del respaldo hoy no avisa nada.** Mientras falten los secretos de T014, `Backup` falla todas las noches y el issue queda abierto para siempre, lo que tapa los fallos reales.
4. **O-fly-8: la clave privada age tiene que estar en el gestor de contraseñas**, no solo en el equipo del owner, o el respaldo cifrado se vuelve irrecuperable.
5. **Juez de operación: falta un chequeo externo de salud.** La señal de salud de los avisos vive en el mismo proceso; si el host cae, nada avisa.
6. **O-fly-11: la memoria se midió con la base vacía.** Hay que medir en producción un `/api/admin/backup` con la base real y el disparador activo (runbook: después de la fase 4).
7. **Revisión de completitud: `BACKUP_TOKEN` tiene el mismo problema que O-fly-7.** Baja la base completa en claro y hoy es un secreto de repositorio que cualquier workflow puede leer. Pasa a un environment `backup` restringido a `master`.

Se mantienen las condiciones del 13: respaldo externo (T014 y T022) antes del 2026-11-30, y los puntos 2 y 5 de la fase 2 (environment protegido, secret scanning y push protection).

## Supuestos que exigen una cuenta

Van a la fase 1b del runbook: A-fly-2 (precio real de gru), A-fly-6 (exención por factura menor a 5 USD en la organización personal), A-fly-10 (si R2 pide medio de pago) y A-fly-14 (snapshots diarios del volumen durante 5 días).

## Costos aceptados

- Un solo host y un solo volumen, sin réplica (O-fly-5). Se mitiga con los snapshots diarios de Fly, las copias previas a cada migración y el respaldo externo cifrado.
- Cada deploy corta el servicio unos segundos (rolling con una sola máquina). Un aviso que caiga en ese instante puede atrasarse hasta el siguiente tick, así que conviene fusionar fuera del horario de los avisos.
- Fly no tiene tope de gasto: un error de configuración (IPv4 dedicada, otra máquina) cobra sin frenar.
- Renovate fusiona con auto-merge a cualquier hora, así que un deploy puede coincidir con un aviso y atrasarlo hasta el siguiente tick.
- El rollback automático revierte la imagen, no la base (O-fly-4); la reversión del esquema es manual con [rollback-migracion.md](../runbooks/rollback-migracion.md).

## Disenso

Los tres jueces votaron el mismo orden, pero cada uno dejó una advertencia sobre Fly:

- **Costo:** Fly no tiene tope de gasto, y el precio de gru sale de un comentario de `fly.toml`. Pide confirmar la primera factura y convertir la regla de corte 3 en una alerta concreta. También corregir el `:latest`.
- **Seguridad:** gana porque los otros son peores. `FLY_API_TOKEN` en un repo público da acceso de lectura a los datos de salud; `/api/admin/backup` entrega la base completa detrás de un solo Bearer, con un límite de intentos en memoria. Mientras T014 no esté cerrado, perder el host o la cuenta de Fly es perderlo todo.
- **Operación:** depende de un único host. Si cae, el disparador se detiene y nada avisa. Pide fijar la imagen a un SHA y un chequeo externo programado de `/api/health`.

## Cambios de código que el despliegue necesita

- [ ] Sacar `:latest` de `fly.toml` (`[build] image`), o publicar `latest` recién después del health check en `deploy.yml` (O-fly-3).
- [ ] Workflow programado que consulte `/api/health` desde afuera y abra un issue si falla (disenso de operación).
- [ ] Solo si la fase 1 se atrasa: que `backup.yml` abra el issue de fallo con otra etiqueta mientras falten los secretos del bucket, sin dejar de avisar (O-fly-2).
- [ ] Declarar un environment `backup` en `backup.yml` para `BACKUP_TOKEN`.

Configuración que hace el owner (no es código):

- [ ] Restringir el environment `production` a la rama `master`, cargar ahí `FLY_API_TOKEN`, borrar el del repositorio y rotarlo revocando el viejo (O-fly-7).
- [ ] Crear el environment `backup`, restringido a `master`, con `BACKUP_TOKEN`.
- [ ] Activar secret scanning y push protection.

Ya hechos desde el 13: fijar `setup-flyctl` a un SHA (#75), aviso de fallo del respaldo (#76), límite de intentos y registro en `/api/admin` (#77).

## Qué reabriría esta decisión

- La factura de Fly supera los 5 USD por mes, o Fly cambia el plan de las máquinas o de los volúmenes.
- La audiencia deja de ser personal (más usuarios, o necesidad de alta disponibilidad).
- Se pierde un volumen y la restauración tarda más de lo tolerable.
- Se decide pasar de SQLite a Postgres.

## Antecedente: corrida del 2026-11-13

Mismo resultado (Fly, 3 de 3, puntaje 3,47 contra 2,42 y 1,73), pero el script de entonces dio como ganador al VPS, con consenso 0, porque vetó a Fly por la autodeclaración de su proponente sobre el respaldo externo pendiente, una condición común a los tres. El árbitro decidió por Fly con el respaldo como condición obligatoria. Esta corrida confirmó esa decisión sin intervención.
