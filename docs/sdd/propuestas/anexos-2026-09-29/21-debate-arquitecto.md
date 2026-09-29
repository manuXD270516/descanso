# Debate — Arquitecto (resumen fiel)

## Veredictos

- **A**: factible con cambios. Se divide en:
  - **A1**: acceso del propietario. Es urgente por DT-17: `cors()` abierto y sin autenticación.
  - **A2**: multi-inquilino. Tamaño L y cambio MAJOR; solo si hay más usuarios.
- **B**: factible con cambios. `stage_imports` se fusiona con `sleep_sessions` de D; el hipnograma depende de D-F0.
- **C**: factible. Hay que corregir el lag D−1 (X7) y FR-08 (X8).
- **D**: F0 tiene riesgo medio (200 MB con 256 MB de memoria). F1 tiene riesgo alto (worker, auto-stop, endpoints públicos) y no puede existir sin A1.

## Orden de entrega

1. **003 Migraciones y endurecimiento (M)**: DT-01, DT-02, DT-03, DT-04 (validar la fecha contra el offset de `bedtime`), DT-08, DT-21, DT-11 y el índice único parcial de noche abierta.
2. **004 Acceso del propietario (M)**:
   - `users` con una sola fila y `sessions`;
   - login y logout;
   - CSRF, CORS del mismo origen, rate limit y cabeceras;
   - todo lo que venga después nace con `user_id`.
3. **005 Tendencias (M)**: C-US1 a US3, `user_settings`, `analytics.js` puro y SVG propio.
4. **006 Diario y descargo (M)**: B-P1 y la calculadora P2; columnas nulables.
5. **007 Importación de Apple Health y CSV (L)**: D-F0 y el hipnograma de B-P2; tablas `sleep_sessions` y `sleep_stages`; conciliación.
6. **008 Multi-inquilino (L)**: solo si hay más usuarios. Reconstruir las tablas, `repo/` con `userId`, invitaciones y exportar/borrar.
7. **009 OAuth con un proveedor (L)**: `user_connections`, `sync_jobs`, `webhook_events`, cifrado y worker. Requiere 004 (y 008 si conecta más de una persona).
8. **Backlog**: C-US4 y US5, B-P3 y D-F2.

DT-01 debe ser una feature propia: si no, aparecerán cuatro runners distintos.

## Esquema unificado

```text
schema_migrations(version PK, name, checksum, applied_at)
users(id, email UNIQUE NOCASE, password_hash 'scrypt$N$r$p$salt$hash', role owner|user, timezone IANA NOT NULL, created_at)
sessions(id_hash BLOB PK, user_id NOT NULL →users CASCADE, expires_at, last_seen_at)
invites(token_hash PK, created_by, expires_at, used_at)                      -- A2
user_settings(user_id PK →users CASCADE, sleep_goal_min CHECK 240..720, workdays '12345', metric_lag DEFAULT 1)
sleep_records(+user_id NOT NULL, +sol_min, +awakenings, +waso_min, +out_of_bed_time, +source DEFAULT 'manual')
  INDEX(user_id, date); UNIQUE INDEX one_open(user_id) WHERE wake_time IS NULL
naps(+user_id NOT NULL) INDEX(user_id, date)
metrics(+user_id NOT NULL) INDEX(user_id, sort_order)
metric_entries                                                               -- sin cambios, vía metric_id
import_batches(id, user_id, kind, sha256, UNIQUE(user_id, sha256))
sleep_sessions(id, user_id, source, external_id, start_time, end_time, night_date,
               sleep_record_id NULL ON DELETE SET NULL, status linked|pending_review|ignored,
               is_primary, import_batch_id, imported_at,
               UNIQUE(user_id, source, external_id)) INDEX(user_id, night_date)
sleep_stages(session_id CASCADE, stage awake|light|deep|rem|unknown, start_time, end_time)  -- tramos
user_connections(id, user_id, provider, provider_user_id, token_ct, token_iv, token_tag, key_version,
                 cursor, status, last_error, UNIQUE(user_id, provider), UNIQUE(provider, provider_user_id))
sync_jobs(id, connection_id, kind, run_after, attempts, locked_until, last_error)
webhook_events(provider, event_id, received_at, PK(provider, event_id))
```

- **Regla de duración**: la duración solo se lee de `sleep_records`. Una sesión importada suma horas únicamente cuando se concilia (se vincula o crea un registro con `source`). Así no se cuentan horas dos veces.
- **Runner**: `backend/src/migrate.js` + `backend/migrations/NNN_*`.
  - Se ejecuta antes de `listen()`.
  - Cada migración va en una transacción que también registra su checksum; si el checksum no coincide, el arranque aborta.
  - Antes de migrar hace `db.backup('/data/backups/pre-NNN.db')` y conserva los 3 últimos.
- **Línea base 001** = el DDL actual sin cambios. Se marca como aplicada en bases existentes, y la semilla de métricas pasa a la creación de usuario.
- **Reconstrucción en 12 pasos** en lugar de triggers:
  1. crear `*_new` con `NOT NULL` y FK;
  2. `INSERT … SELECT`;
  3. verificar recuentos;
  4. `DROP` de la tabla antigua y `RENAME`;
  5. todo con `foreign_keys = OFF` fuera de la transacción, y después `foreign_key_check` e `integrity_check`;
  6. requiere una aclaración PATCH del principio II.

## Bloqueantes técnicos

| ID | Dónde | Problema | Cambio |
|---|---|---|---|
| X1 | A, respaldo previo | La app no puede comprobar S3 | El runner hace un `db.backup` propio |
| X2 | A, rate limit | `req.ip` es la IP del proxy | Usar `Fly-Client-IP` y limitar también por email |
| X3 | A, scrypt | 32 MiB por hash × 4 hilos de libuv = 128 MiB | Semáforo de 1; rate limit antes de hashear; hash ficticio si el email no existe |
| X4 | A, IDOR | `DELETE entries` no comprueba el propietario; `assertNoOtherOpen` y `/sleep/open` son globales | JOIN por `user_id`; índice parcial por usuario |
| X5 | A, sesión deslizante | Escribe en cada petición | Actualizar `last_seen_at` como mucho una vez por hora; cookie `__Host-sid` |
| X6 | A, CSRF | Peticiones sin `Origin` ni `Sec-Fetch-Site` | Rechazar las no GET si faltan ambas, salvo webhooks y admin |
| X7 | C, emparejamiento | Acostarse a la 01:30 del sábado desplaza el emparejamiento | Emparejar por la mañana del despertar, derivada de `wake_time` |
| X8 | C, FR-08 | Duplicaría horas con las importaciones | Usar solo `sleep_records` conciliados |
| X9 | C, "hoy" | Servidor en UTC y `settings` global | `user_settings` + `users.timezone`; el cliente envía `to` |
| X10 | B/D | Tablas incompatibles | Esquema unificado |
| X11 | D, export de Apple | Un `export.zip` de más de 1 GB no cabe en 256 MB; además trae un DTD interno | Parsear en el navegador (Web Worker con `File.stream()`) y enviar solo sesiones en JSON, lotes ≤ 5 MB. Si se hace en el servidor: SAX sin entidades y sin `express.json` |
| X12 | D, fechas de Apple | Formato `2024-01-01 23:10:00 -0300`; `isIso` es laxo | Validador estricto y normalización |
| X13 | D, SLA < 15 min | Nada despierta la máquina y el auto-stop mata el worker | `sync_jobs` con lease y reanudación; pull al arrancar; SLA "al abrir la app o recibir un webhook" |
| X14 | D, GCM | Sin AAD; sin rotación de claves | AAD = `user_id\|provider`, nonce de 96 bits, `key_version` |
| X15 | D, HMAC | Necesita el body crudo | `express.raw` en la ruta; deduplicar con `webhook_events`; payload como aviso + pull |
| X16 | D, refresh token | Es de un solo uso | Mutex por conexión |

## Pruebas obligatorias

- **003**:
  - base nueva;
  - fixture `legacy.db` con hash de todas las filas idéntico antes y después;
  - ejecutar dos veces no cambia nada;
  - un fallo hace rollback completo;
  - un checksum alterado aborta.
- **A**:
  - aislamiento entre dos usuarios dirigido por tabla, en todos los endpoints;
  - meta-test sobre `sqlite_master` para `user_id`;
  - contrato de auth: 401, 429, logout, cookie, CSRF;
  - HU3 contra `legacy.db`;
  - borrado → 0 filas;
  - Docker con `--memory=256m` y 10 logins concurrentes;
  - E2E con fixture de login y `storageState` (la suite Playwright debe prepararlo ya).
- **B**:
  - TST y eficiencia como funciones puras, con nulos → "—";
  - 400 por rangos;
  - calculadora con cruce de medianoche y cambio de offset;
  - snapshot de palabras prohibidas;
  - fases suman TST ± 1;
  - tabla accesible.
- **C**:
  - 23:30 y 00:30 → 0;
  - DE, SRI y deuda con fixtures;
  - huecos ≠ 0;
  - Spearman contra SciPy;
  - umbrales de n;
  - rango en la zona horaria del usuario;
  - contrato de `/api/dashboard`;
  - E2E.
- **D**:
  - fecha de la noche en importaciones: antes y después de medianoche, DST, `dateOfSleep` como fecha de fin;
  - solapes iPhone + Watch;
  - reimportar → 0 filas nuevas;
  - frontera del 50 %;
  - 200 MB sintéticos con RSS < 100 MB;
  - adaptadores con fetch inyectado;
  - firma inválida → 401; duplicados idempotentes;
  - `state` → 400;
  - manipulación del texto cifrado o del AAD → error;
  - lease caducado → se recupera.

## Riesgos operativos

- **R1 — rollback con esquema nuevo.** El rollback de R13 redespliega la imagen anterior sobre una base ya migrada, y el código viejo falla con `user_id NOT NULL`. Mitigación: migraciones expand/contract (N−1 tolera el esquema N), o que el runbook de rollback restaure `pre-NNN.db`.
- **R2 — migración lenta.** Una migración que tarde más de 20 s de grace provoca un rollback y lleva a R1. Hay que medirla con el tamaño real.
- **R3 — volumen de 1 GB.** Se llena con `pre-NNN`, WAL y uploads. Podar y alertar al 70 %.
- **R4 — respaldo global.** Contiene a todos los usuarios y los tokens. La supresión tarda 14 días en llegar a S3. Perder `TOKEN_ENC_KEY` obliga a reconectar.
- **R5 — cron.** Los workflows programados se desactivan tras 60 días.
- **R6 — deploy o auto-stop a mitad de una importación.** Todo debe ser reanudable e idempotente.
- **R7 — observabilidad.** Mostrar el estado de sincronización y un contador en `/api/health` sin datos personales.
