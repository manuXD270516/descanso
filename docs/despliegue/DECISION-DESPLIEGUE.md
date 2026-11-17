# Decisión de despliegue: Descanso (sleep-tracker)

**Fecha:** 2026-11-13. **Método:** 3 agentes defendieron una plataforma cada uno, un crítico atacó cada propuesta comprobando sus supuestos, 3 jueces con lentes distintas (costo, seguridad y operación) puntuaron y votaron, y un árbitro (la sesión principal) revisó el resultado. Profundidad: `normal`, 9 agentes. Es una **revisión de un despliegue existente**: Descanso ya corre en Fly.io desde la feature 002, así que la pregunta fue si conviene quedarse o migrar.

## Resultado

Gana **Fly.io, quedarse como está**: es la única opción que cumple las restricciones sin migrar datos ni cambiar código, y la eligieron primera los 3 jueces. Costo: unos 3,3 USD por mes (cómputo shared-cpu-1x de 256 MB siempre encendido en gru, más el volumen de 1 GB). Plan B: **VPS propio con Docker Compose y Caddy**, si Fly sube el costo por encima de 5 USD por mes, pierde el volumen o cambia sus condiciones.

| Criterio | Peso | Por qué pesa | Fly | VPS + Docker | Cloudflare |
|---|---:|---|---:|---:|---:|
| Costo | 15 | Tope de 5 USD por mes, con tarjeta aceptada | 3,00 | 2,00 | 1,00 |
| Ajuste al stack | 20 | Proceso persistente, SQLite nativa, migraciones propias | 5,00 | 3,33 | 1,00 |
| Seguridad | 25 | Datos de salud (principio VIII), repo público | 2,33 | 2,00 | 2,00 |
| Operación | 20 | Una sola persona; Renovate fusiona seguido | 4,00 | 2,00 | 2,67 |
| Reversibilidad | 15 | Vuelta atrás de código y base, costo de irse | 2,67 | 3,00 | 2,00 |
| Esfuerzo | 5 | Ya está en producción | 4,67 | 2,00 | 1,00 |
| **Puntaje sobre 5** | | | **3,47** | 2,42 | 1,73 (vetado) |
| **Votos (Borda)** | | | **6** | 3 | 0 |
| **Primeros puestos** | | | **3 de 3** | 0 | 0 |

Consenso: 3 de 3 jueces pusieron primero a Fly.

**Arbitraje.** El script del panel declaró ganador al VPS con consenso 0 y pidió árbitro, porque marcó a Fly como «vetado». Ese veto no vino de ningún juez: salió de la regla «el propio proponente declaró que incumple una restricción». El proponente de Fly declaró honestamente que hoy no hay respaldo fuera de la plataforma (T014 pendiente). Esa condición la comparten los tres candidatos, porque los otros dos también usan el mismo bucket que falta configurar, y se cierra sin tocar código. Decido por Fly, con el respaldo externo como **condición obligatoria** del runbook (fase 1), no como veto.

## El proyecto, en lo que importa para desplegarlo

- Un solo proceso Node (Express) sirve la API y la SPA Angular compilada, en un contenedor (`Dockerfile`, `node:22-alpine`).
- La base es SQLite en archivo, con `better-sqlite3` (dependencia nativa) y 11 migraciones propias versionadas, sobre un volumen persistente.
- El proceso es persistente: un disparador en memoria cada 30 s envía avisos push con la app cerrada (`backend/src/reminders/waker.js`).
- Los datos son de salud (sueño y siestas) y hay varios usuarios aislados entre sí (feature 008). El repositorio es público.
- Uso personal: 1 a 3 usuarios en Sudamérica. Memoria medida en reposo: 18,55 MiB.
- Perfil completo: [perfil-despliegue.json](perfil-despliegue.json).

## Restricciones

| Restricción | Vetó a |
|---|---|
| Costo ≤ 5 USD por mes (tarjeta aceptada) | Cloudflare (5 USD exactos sin margen para impuestos; 6,5 a 8,3 USD el mes de transición) |
| Disparador de avisos con resolución ≤ 1 min | Cloudflare (los Cron Triggers pueden tardar hasta 15 min en propagarse en cada deploy y las ventanas de aviso son de 10 min) |
| Datos sensibles: sesión obligatoria, secretos fuera del repo, respaldo fuera de la plataforma | Nadie: los tres dependen del bucket de T014 |
| No perder datos en una migración | Nadie (Fly no migra) |
| Latencia razonable desde Sudamérica | Riesgo para Cloudflare (D1 sin región cercana; 5 a 10 consultas secuenciales por pantalla) |

## Por qué ganó

- **Ajuste total:** no cambia una línea de código. El proceso persistente, el volumen con SQLite y el binario nativo de `better-sqlite3` funcionan hoy en producción (`fly.toml`, `/api/health` ok).
- **Operación probada:** cada merge a `master` despliega por SHA desde GHCR, con reintento ante «volume not found» y rollback automático si el health check falla (`.github/workflows/deploy.yml`). En las últimas tandas de Renovate se desplegaron más de 15 versiones sin incidentes.
- **Costo dentro del tope**, con 1,7 USD de margen. Es un supuesto que hay que contrastar con la factura real.
- **Seguridad sin login verificada en producción el 2026-11-13:** HSTS, CSP, `X-Frame-Options: DENY`, `nosniff` y `Referrer-Policy` presentes; `/api/sleep`, `/api/push` y `/api/admin/backup` responden 401 sin sesión o con un token falso.

## Por qué no los otros

- **VPS + Docker (2,42):** el crítico encontró que el plan de corte no se podía ejecutar tal como estaba escrito (`fly scale count 0` deja sin máquina para hacer `sftp`) y que los secretos no se pueden copiar con `fly secrets list`. El mes de migración rompe el tope de costo, sobre todo si se compra un dominio. Además, los parches, el firewall y los respaldos quedan a cargo del owner. Sigue siendo el plan B más sólido.
- **Cloudflare (1,73, vetado por mayoría):** obliga a reescribir 27 archivos y 15 transacciones para pasar de `better-sqlite3` a D1, que es asíncrono y no tiene transacciones interactivas. El cron puede perder disparos durante cada deploy, la latencia con D1 lejos de Sudamérica es incierta y el costo llega al tope sin margen.

## Hallazgos que condicionan el diseño

Los críticos y los jueces coincidieron en estos puntos, que pasan al runbook:

1. **Respaldo externo (T014) obligatorio.** No se considera cumplida la restricción hasta tener en R2 un `.db.age` bajado, descifrado y verificado a mano, con `integrity_check` y conteo de filas.
2. **Alarma si el respaldo falla.** Un cron de Actions roto puede pasar los 14 días de retención sin que nadie lo note.
3. **`superfly/flyctl-actions/setup-flyctl@master`** (`deploy.yml:76`) es una referencia mutable de un tercero que corre con `FLY_API_TOKEN`. Hay que fijarla a un SHA. El token ya es de deploy y está limitado a la app (T026, `fly tokens create deploy --app descanso-sleep`), y el job ya usa el *environment* `production`. Conviene además pasar el secreto a ese environment y protegerlo.
4. **`/api/admin/backup` es público con un token Bearer.** Hoy responde 401 sin token, pero no tiene límite de intentos ni registro de accesos.
5. **Costo:** confirmar los 3,3 USD con la factura real de Fly, que no tiene tope de gasto.

## Costos aceptados

- Un solo host y un solo volumen, sin réplica. Se mitiga con los snapshots diarios de Fly (5 días), las copias previas a cada migración y, cuando se configure, el respaldo externo cifrado.
- Cada deploy corta el servicio unos segundos (estrategia `rolling` con una sola máquina), y un aviso que caiga en ese instante puede atrasarse hasta el siguiente tick. Por eso conviene fusionar fuera del horario de los avisos.
- Dependencia de Fly: si cambia sus precios o condiciones, hay que activar el plan B.

## Disenso

Los tres jueces votaron igual, así que no hubo disenso en el orden. Los tres advirtieron lo mismo sobre su propio primer puesto: **hoy no hay ninguna copia de los datos fuera de Fly.** El juez de seguridad condicionó su voto a cerrar T014, fijar la action de flyctl y proteger `/api/admin/backup`. El juez de operación agregó que el rollback automático debería abortar cuando hubo una migración de esquema. Hoy el código de la versión anterior tolera el esquema nuevo (lo probó T042 con la imagen de la 011), pero no hay ninguna garantía general.

## Cambios de código que el despliegue necesita

- [ ] Fijar `superfly/flyctl-actions/setup-flyctl` a un SHA en `.github/workflows/deploy.yml`. Renovate lo va a mantener actualizado.
- [ ] El job de deploy ya declara `environment: production` (`deploy.yml:68`). Falta mover `FLY_API_TOKEN` al secreto del environment y agregarle reglas de protección (lo hace el owner).
- [ ] Agregar una notificación de fallo al job `Backup`, por ejemplo con un paso que abra un issue cuando falla.
- [ ] Limitar los intentos (rate limit) y registrar los accesos a `/api/admin/backup`.
- [ ] Opcional: que el rollback automático avise o se detenga si la versión nueva aplicó una migración.

## Qué reabriría esta decisión

- La factura de Fly supera los 5 USD por mes, o Fly cambia el plan de las máquinas o de los volúmenes.
- La audiencia deja de ser personal (más usuarios o necesidad de alta disponibilidad).
- Se pierde un volumen y la restauración tarda más de lo tolerable.
- Se decide pasar de SQLite a Postgres.
