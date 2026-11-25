# Auditoría de deuda técnica

**Fecha:** 2026-11-24 · **Base:** `master` en `c43594b` · **Rúbrica:**
[rubrica-deuda-y-bugs.md](rubrica-deuda-y-bugs.md) · **Modo:** auditoría de deuda (agente `triador`).

Primera auditoría. Junta la deuda registrada en `specs/*/research.md` (001, 002, 003, 004, 005 y
008), los «Fuera de alcance» que dejan un riesgo, las tareas manuales pendientes del owner y los
`TODO`/`FIXME` del código, y verifica cada punto contra el código actual. Los puntos vigentes tienen
un id estable `DEU-NN`: las auditorías siguientes lo conservan y anotan la resolución en lugar de
borrarlo.

**Resumen:** 15 puntos vigentes (1 P0, 5 P1, 5 P2 y 4 P3), 21 resueltos y 10 obsoletos o aceptados
por el owner. No hay ningún `TODO`, `FIXME`, `HACK` ni `XXX` en `backend/src`, `frontend/src`,
`e2e/`, `scripts/` ni `.github/`. Hay dos hallazgos nuevos de esta auditoría (DEU-04 y DEU-08).

## 1. Deuda vigente, priorizada

Ejes: I impacto, S seguridad o privacidad, P probabilidad, E esfuerzo, R reversibilidad, B bloqueo.
Puntaje = 3·max(I,S) + min(I,S) + 2·P + R + B − (E − 1).

| Id | Prioridad | Puntaje | I | S | P | E | R | B | Origen | Punto | Fuente |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DEU-01 | **P0** | 22 | 3 | 1 | 3 | 1 | 3 | 3 | Acción del owner | No hay ninguna copia fuera de Fly: el job `Backup` nunca salió en verde (56 fallos desde el 2026-09-30) por falta de `BACKUP_AGE_RECIPIENT` y de los secretos del bucket. Fecha límite 2026-11-30 | #80; 002 T014 y T022; R-06; runbook fase 1 |
| DEU-02 | **P1** | 14 | 1 | 3 | 1 | 1 | 2 | 0 | Acción del owner | El repositorio es público y tiene *secret scanning* y *push protection* desactivados (verificado con la API). Un secreto commiteado por error quedaría expuesto sin aviso | Runbook fase 2, punto 5 |
| DEU-03 | **P1** | 14 | 1 | 3 | 1 | 1 | 2 | 0 | Acción del owner | `FLY_API_TOKEN` (acceso a la base con datos de salud) sigue sin restringirse al environment `production` limitado a `master` ni rotarse; el environment no tiene política de ramas (verificado con la API) | Runbook fase 2, puntos 2 y 9 (O-fly-7) |
| DEU-04 | **P1** | 13 | 2 | 1 | 3 | 1 | 0 | 0 | Código | El resumen de la pestaña Noche muestra «0 min» de promedio por noche cuando no hay noches: `/api/stats` devuelve `avg_sleep_min: 0` y `avg_nap_min: 0` sin observaciones. Incumple «"Sin dato" no es 0» (principio VIII). Hallazgo nuevo | `routes/stats.js:30`; 001 US4-5 |
| DEU-05 | **P1** | 13 | 3 | 0 | 1 | 2 | 3 | 0 | Configuración | GitHub desactiva los workflows programados de un repo público tras 60 días sin actividad: `Backup` y `Salud de producción` dejarían de correr y el aviso de fallo tampoco correría. Solo está documentado | 002 R-02; runbook «Problemas frecuentes» |
| DEU-06 | **P1** (piso III) | 9 | 2 | 0 | 1 | 1 | 1 | 0 | Código | `wake_time` (noches y `POST /api/sleep/wake`) y `start_time`/`end_time` de siestas aceptan cualquier cadena que entienda `Date.parse` (p. ej. `Sep 7 2026`), y se guardan sin desfase. Incumple «las horas se guardan en ISO 8601 con offset» (principio III) | 001 y 003 DT-24; `util.js:8`, `routes/sleep.js:26` y `:81`, `routes/naps.js:10` |
| DEU-07 | P2 | 10 | 1 | 1 | 3 | 1 | 0 | 0 | Código | La fuente se carga desde Google Fonts: cada visita avisa a un tercero (IP y agente) y sin red no hay fuente. La CSP lo permite a propósito | 001 DT-20; `frontend/src/index.html:10-12`; `auth/middleware.js:44-45` |
| DEU-08 | P2 | 9 | 1 | 0 | 3 | 1 | 0 | 0 | Configuración | Los avisos de fallo comentan lo mismo en cada corrida: `backup.yml` una vez por día y `health.yml` cada 30 minutos mientras producción no responde. El ruido esconde un fallo con otra causa. Hallazgo nuevo | #80; `backup.yml` y `health.yml`, jobs `avisar-fallo` |
| DEU-09 | P2 | 9 | 2 | 0 | 2 | 3 | 1 | 0 | Código (requiere decisión) | Se aceptan noches y siestas solapadas y horas futuras; el dashboard suma todas, así que un error de carga infla el sueño del día | 001 DT-05 |
| DEU-10 | P2 | 8 | 2 | 0 | 1 | 2 | 1 | 0 | Código | Cambiar el tipo de una métrica con valores no revalida los valores guardados (`PUT /api/metrics/:id` acepta `type` nuevo) | 001 DT-07; `routes/metrics.js:59-62` |
| DEU-11 | P2 | 8 | 1 | 0 | 3 | 2 | 0 | 0 | Código | Las confirmaciones de borrado usan `confirm()` nativo: poco accesible y difícil de probar | 001 DT-13; `metrics.component.ts:139`, `naps.component.ts:89`, `night.component.ts:322` |
| DEU-12 | P3 | 5 | 1 | 0 | 1 | 1 | 0 | 0 | Código | Una escala de más de 11 valores se trunca en la UI sin aviso; el backend no limita el rango | 001 DT-09; `metrics.component.ts:90` |
| DEU-13 | P3 | 4 | 1 | 0 | 1 | 2 | 0 | 0 | Código | Reordenar métricas manda un `PUT` por métrica, sin transacción: si uno falla, el orden queda a medias | 001 DT-06; `metrics.component.ts:143-155` |
| DEU-14 | P3 | 4 | 1 | 0 | 1 | 2 | 0 | 0 | Código | `/api/stats` (resumen de 14 días de Noche) guarda solo la última `bedtime`/`wake_time` de cada fecha: con dos noches en un día, la hora media ignora una. El dashboard ya está bien desde 005 | 001/003 DT-23, 005; `routes/stats.js:16-20` |
| DEU-15 | P3 | 3 | 1 | 0 | 1 | 3 | 0 | 0 | Código (requiere decisión) | La lista muestra las horas en la zona del dispositivo (`fmtTime`) y el resumen en la hora registrada (offset del ISO): difieren si la persona cambia de zona | 001 DT-10; `core/time.ts:35` |

Reglas de piso aplicadas: DEU-01 también cumple la regla 2 (pérdida irreversible sin red, fallo en
curso) y la regla 5 (fecha límite a 6 días); DEU-06 sube a P1 por la regla 3 (principio III);
DEU-04 tendría al menos P2 por la regla 4 (principio VIII). El orden dentro de cada prioridad es
por puntaje y después por menor esfuerzo.

## 2. PRs propuestos para P0 y P1 (no implementados)

### DEU-01 (P0): respaldo externo

No hay PR que lo resuelva: es la T014 de la 002, del owner. Los pasos están en el ejemplo resuelto
de la rúbrica (sección 7) y en `docs/runbooks/configurar-bucket-respaldos.md`. La mejora de
configuración asociada es DEU-08 (P2). Al cerrarse, se cierran también T022 de la 002 y el riesgo
R-06.

### DEU-02 (P1): *secret scanning* y *push protection*

Acción del owner, sin PR: Settings → Code security → activar *Secret scanning* y *Push protection*.
Comprobación: `gh api repos/manuXD270516/descanso --jq .security_and_analysis` muestra `enabled` en
`secret_scanning` y `secret_scanning_push_protection`.

### DEU-03 (P1): `FLY_API_TOKEN` en el environment y rotado

Acción del owner, sin PR: los puntos 2 y 9 de la fase 2 del runbook de despliegue (restringir el
environment `production` a `master`, rotar el token cargándolo con `fly tokens create deploy … |
gh secret set FLY_API_TOKEN --env production` y borrar el del repositorio). El agente no toca el
token. Comprobación: el siguiente `Deploy` sale en verde y
`gh api repos/manuXD270516/descanso/environments --jq '.environments[].deployment_branch_policy'`
deja de ser `null`.

### DEU-04 (P1): «sin dato» en el resumen de Noche

Rama `fix/deu-04-resumen-sin-dato`.

- `backend/src/routes/stats.js`: `avg` devuelve `null` sin observaciones, así que
  `avg_sleep_min` y `avg_nap_min` valen `null` cuando no hay noches o siestas (igual que ya hacen
  `avg_bedtime_min` y `avg_wake_min`).
- `frontend/src/app/core/api.service.ts`: los dos campos pasan a `number | null`. La plantilla no
  cambia: `fmtDuration(null)` ya muestra «—».
- Tests: `backend/test/stats.test.js` (caso «sin datos»: `null`); `night.component.spec.ts` (sin
  noches se ve «—», nunca «0 min») y los `EMPTY_STATS` de `night-006.spec.ts` y
  `night-010.spec.ts`; `e2e/tests/resumen.spec.ts`, caso US4-5, espera «—».
- Contrato y spec: `specs/001-linea-base/contracts/openapi.yaml` (`[integer, 'null']`) y la
  aceptación US4-5 de `specs/001-linea-base/spec.md`, con una nota que remite al principio VIII
  (enmienda 2.1.0, posterior a la spec). Ver la pregunta 1.
- Compatibilidad: un servicio único despliega backend y frontend juntos; un frontend viejo con el
  backend nuevo muestra «—» porque `fmtDuration` ya acepta `null`. Sin cambio de esquema.

### DEU-05 (P1): que los workflows programados no se desactiven

Rama `chore/deu-05-workflows-activos`; toca `.github/workflows/`, así que va con revisión explícita
del owner.

- `backup.yml` y `health.yml`: un paso final con `if: always()` que vuelve a habilitar el propio
  workflow por la API (`gh api -X PUT repos/$GH_REPO/actions/workflows/<archivo>/enable`), con
  `permissions: actions: write` solo en ese job. No lee secretos nuevos.
- Verificación en el PR: comprobar en la documentación de GitHub que habilitar un workflow activo
  reinicia el contador de inactividad; si no lo reinicia, se descarta y se pasa a la alternativa
  (un recordatorio en el runbook para revisar `gh workflow list` cada mes). Ver la pregunta 2.
- Runbook: actualizar la fila de «Problemas frecuentes» que hoy solo dice «reactivarlos en
  Actions».

### DEU-06 (P1): toda hora con desfase

Rama `fix/deu-06-iso-con-desfase`.

- `backend/src/util.js`: `isIso` exige la forma `AAAA-MM-DDTHH:MM[:SS[.mmm]]` seguida de `Z` o
  `±HH:MM`, además de `Date.parse`. Los cuatro usos (`routes/sleep.js:22`, `:26` y `:81`, y `routes/naps.js:10`) quedan
  cubiertos sin tocar las rutas; los mensajes de error dicen «ISO 8601 con desfase (p. ej.
  2026-09-05T23:30:00-04:00)».
- Tests primero: `backend/test/util.test.js` (acepta `-04:00`, `+02:00` y `Z`; rechaza
  `Sep 7 2026`, `2026-09-05T23:30` sin desfase y `2026-09-05`) y `validation-dt.test.js`
  (`POST /api/sleep` con `wake_time` sin desfase → 400; `POST /api/sleep/wake` → 400; siesta con
  `end_time` sin desfase → 400). Los tests de la fecha de la noche (`sleep-night.test.js`) siguen
  en verde sin cambios: los fixtures usan `-04:00` y `+02:00`.
- Sin migración: solo cambia la validación de escritura y las filas existentes no se tocan. El
  frontend ya manda siempre el desfase (`inputLocalToIso`), así que la e2e no cambia.

## 3. Puntos resueltos

| Punto | Estado | Referencia |
|---|---|---|
| 001 DT-01 Esquema sin migraciones | Resuelto | 003: `backend/src/migrate.js` y `backend/src/migrations/` (11 migraciones) |
| 001 DT-02 `/api/stats` sin rango → 500 | Resuelto | 003: `parseRange(..., { required: true })` en `routes/stats.js:9` |
| 001 DT-03 `from`/`to` sin validar | Resuelto | 003: `parseRange` en `util.js` |
| 001 DT-04 Fecha de la noche solo en el cliente | Resuelto | 003: `routes/sleep.js:39` y `routes/naps.js:13` |
| 001 DT-08 Sí/no guardaba «0» ante cualquier valor | Resuelto | 003: `validateValue` en `routes/metrics.js` |
| 001 DT-11 Cinta con una noche por fecha | Resuelto | 003 |
| 001 DT-12 Errata «Ya despertí» | Resuelto | 001 |
| 001 DT-14 Node 20 en vez de 22 | Resuelto | 001: `backend/package.json` (`engines.node >=22`) |
| 001 DT-15 Sin `HEALTHCHECK` | Resuelto | 002: `Dockerfile` (`HEALTHCHECK`) y `fly.toml` (`http_service.checks`) |
| 001 DT-16 Toolchain en la imagen y sin `.dockerignore` | Resuelto | `Dockerfile` sin `python3 make g++` (binario precompilado) y `.dockerignore` |
| 001 DT-17 CORS abierto y sin autenticación | Resuelto | 004: sesión obligatoria, CSRF por origen, cabeceras de seguridad |
| 001 DT-18 Sin tests, lint ni CI | Resuelto | 001 y 002: `.github/workflows/ci.yml` (check `quality` y `e2e`) |
| 001 DT-19 `subscribe: Function` y `any` | Resuelto | `metrics.component.ts` usa `Observable<unknown>` y `HttpErrorResponse`; sin `any` en `frontend/src` |
| 001 DT-21 Media circular devolvía 1440 | Resuelto | 003: `% 1440` en `circularAvg` (`util.js`) |
| 001 DT-22 `formDuration` no se recalculaba | Resuelto | 001 |
| 001/003/005 DT-23 en el dashboard | Resuelto en parte | 005: `GET /api/dashboard` suma todas las noches; lo que queda es DEU-14 |
| 002 R-05 Arranque en frío | Resuelto | 013: `min_machines_running = 1` en `fly.toml` |
| 004 Filtrado por usuario y suite de aislamiento | Resuelto | 008: capa `repo/` con `userId`, `isolation.test.js` y `schema-isolation.test.js` |
| 008 Contraer `DEFAULT 1` en `user_id` | Resuelto | 005: migración `006_contraer_user_id.js` |
| Runbook fase 2, punto 3: aviso ante fallo del respaldo | Resuelto | #76: job `avisar-fallo` en `backup.yml` |
| Runbook fase 2, punto 4: límite de intentos en `/api/admin/backup` | Resuelto | #77 |

## 4. Obsoletos o aceptados por el owner

No se puntúan mientras no se cumpla su disparador (rúbrica, regla 6).

| Punto | Estado | Disparador para reabrirlo |
|---|---|---|
| 002 R-01 Segundos sin servicio en cada despliegue | Aceptado (spec 002) | Más de una persona usándola a diario con quejas |
| 002 R-03 Costo por uso de Fly y del bucket | Aceptado (clarificación 002) | Factura de Fly mayor a 5 USD (regla de corte 3 del runbook, fase 1b) |
| 002 R-04 Cambio de runtime en Render | Obsoleto | Ya no se usa Render |
| 002 R-06 El rollback no repara una base rota | Mitigado | El runner de migraciones guarda `pre-NNN.db` en el volumen; la red externa llega con DEU-01 |
| 004 Rate limit persistente | Aceptado (research 004) | Más de una máquina (`fly.toml` tiene una) |
| 004 Fuera de alcance: recuperar la contraseña por email, passkeys, OAuth y 2FA | Aceptado (spec 004) | Cuentas fuera del círculo de invitación o un incidente de acceso |
| 008 Recuperación por email | Aceptado (research 008); hoy, `docs/runbooks/recuperar-acceso.md` | Más de 5 usuarios |
| 008 Reaceptar la política al cambiar de versión | Aceptado (research 008); `POLICY_VERSION` 2026-10-23 con `policy-version.test.js` | Un cambio material de la política |
| 010, 011 y 013 Fuera de alcance | Sin riesgo | Son límites de producto (canales, gamificación, iPhone), no defectos |
| `TODO`/`FIXME` del código | Sin ocurrencias | — |

## 5. Preguntas abiertas para el owner

1. **[BLOQUEANTE para el PR de DEU-04]** La aceptación US4-5 de la spec 001 pide «0 min» sin datos,
   y la e2e lo comprueba; el principio VIII (enmienda 2.1.0, del 2026-10-03) dice que la ausencia
   nunca se muestra como cero, y la constitución prevalece.
   - A: mostrar «—» y actualizar US4-5, el contrato y la e2e (recomendada).
   - B: mantener «0 min» y registrar la excepción en la constitución con una enmienda.
2. **DEU-05:** ¿preferís el paso que vuelve a habilitar los workflows (A, recomendada si GitHub
   confirma que reinicia el contador) o solo un recordatorio mensual en el runbook (B, sin tocar
   workflows)?
3. **DEU-06:** ¿se acepta `Z` como desfase válido? Recomendación: sí, es ISO 8601 con desfase cero
   y no rompe scripts; el frontend siempre manda `±HH:MM`.
4. **DEU-09 y DEU-15** necesitan una decisión de producto (qué hacer con solapes y horas futuras;
   qué zona horaria se muestra) antes de cualquier PR: van al agente `arquitecto` como feature
   propia o como aclaración de una spec existente.
