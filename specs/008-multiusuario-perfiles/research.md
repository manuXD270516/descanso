# Research: Multiusuario con perfiles (008)

Formato: Decisión / Razón / Alternativas. Diseño de referencia: feature 008 y debate (X4, UX-12,
E4, R4) en `docs/sdd/propuestas/2026-09-29-set-de-features.md`; anexos `10-react-A` y `21`.

## R1. Capa `repo/` con `userId` obligatorio

- **Decisión**: `backend/src/repo/` con un módulo por agregado: `sleep.js`, `naps.js`,
  `metrics.js`, `entries.js`, `stats.js`, `export.js`, `users.js`, `invites.js`, `audit.js`.
  - Cada función de datos de usuario recibe `userId` como **primer argumento** y lo usa en
    `WHERE user_id = ?` (o en el `JOIN` con `metrics` para `metric_entries`); si falta, lanza.
  - Las rutas **no** llaman a `db.prepare`: se comprueba con un test estático que busca
    `db.prepare` / `db.exec` en `backend/src/routes/`.
  - Leer o tocar un recurso ajeno devuelve `undefined` / `changes = 0`, y la ruta responde 404:
    lo ajeno se comporta como inexistente (FR-007).
- **Razón**: un único sitio donde se filtra por usuario. Es auditable y el test estático impide
  regresiones. Es la mitigación acordada mientras exista `DEFAULT 1` (contracción posterior).
- **Alternativas**: filtrar en cada ruta (fácil de olvidar); vistas SQL por usuario (SQLite no
  tiene variables de sesión); un ORM con scopes (principio I).

## R2. IDOR de `DELETE /metrics/:id/entries/:date` y demás rutas de métricas

- **Decisión**: todas las operaciones sobre valores pasan por `entries.*(userId, metricId, …)`,
  que comprueban `metrics.user_id = userId`. Hoy `DELETE /metrics/:id/entries/:date` borra por
  `metric_id` sin comprobar el dueño (IDOR). Lo cubre la suite de aislamiento.

## R3. Esquema: migración `005_multiusuario.js` (`foreignKeys: false`)

- **Decisión**:
  - **Reconstruir `users`** (el CHECK de `role` no se puede alterar) con copia verificada:
    `role IN ('owner','user')`, `display_name TEXT`, `timezone TEXT` (IANA, NULL = sin fijar),
    `consent_version TEXT`, `consent_at TEXT`, `reset_notice_at TEXT`. El propietario existente
    recibe `display_name` = parte local de su email.
  - **Nuevas tablas**: `user_settings(user_id PK, sleep_goal_min 240..720 DEFAULT 480)`,
    `invites`, `password_resets` y `audit_log`, todas con FK a `users` y `ON DELETE` coherente con
    el borrado de cuenta (data-model.md).
  - `foreignKeys: false`: sin él, el `DROP TABLE users` del patrón de 12 pasos borraría en
    cascada sesiones, noches, siestas y métricas.
- **Expand/contract**: el código de 004 lee y escribe columnas existentes de `users`, que se
  conservan, e ignora las tablas nuevas; arranca y funciona con el esquema de 008 (probado).
- **Contracción pendiente**: quitar `DEFAULT 1` de `user_id` va en una migración de un despliegue
  **posterior** (la primera feature tras 008), cuando ya no haya ninguna imagen desplegable que
  inserte sin `user_id`. Se anota en la guía y en `research` de la feature siguiente.

## R4. Invitaciones y enlaces de recuperación por fragmento

- **Decisión**:
  - Token de 32 bytes (`randomBytes`, base64url); en la base solo `sha256`.
  - Invitación: 72 h, un uso. Recuperación: 30 min, un uso.
  - El enlace usa el **fragmento**: `https://…/#invitacion=<token>` y `#restablecer=<token>`. El
    navegador no envía el fragmento al servidor ni a los logs. El frontend lo lee, lo borra de la
    barra (`history.replaceState`) y lo manda en el **cuerpo** del POST.
  - El canje es atómico: `UPDATE invites SET used_by = ?, used_at = ? WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?` dentro de la transacción de alta; si
    `changes = 0` → 403. Dos registros simultáneos: solo uno gana.
  - Todos los fallos de canje cuentan para el rate limit (por IP).
- **Razón**: FR-002 ("no llega al servidor en la URL"). Mismo patrón de huella que las sesiones de 004.
- **Alternativas**: token en query string (queda en logs de Fly e historial); envío por email
  (sin proveedor, fuera de alcance).

## R5. Registro y consentimiento

- **Decisión**: `POST /api/auth/register { invite, display_name, email, password, accept_policy, policy_version }`.
  - Exige `accept_policy === true` y `policy_version === POLICY_VERSION` (constante en
    `backend/src/policy.js`, hoy `2026-10-01`).
  - Valida la invitación, el email único NOCASE (409 si existe, **sin gastar la invitación**) y la
    contraseña (12–128).
  - En una transacción: inserta el usuario (`role = 'user'`, `consent_*`), crea su
    `user_settings`, **siembra sus 3 métricas** (`repo/metrics.seedDefaults(userId)`), canjea la
    invitación e inicia sesión.
  - El texto de la política vive en el frontend (`core/privacy.ts`) con la misma versión. Un test
    comprueba que las dos constantes coinciden.
- **Razón**: FR-004…FR-006. El email duplicado se responde 409 porque solo llega con una
  invitación válida (no permite enumerar emails desde fuera).

## R6. Perfil y cambios sensibles

- **Decisión**:
  - `GET/PUT /api/me`: `display_name` (1–60, recortado), `timezone` (validada con
    `Intl.supportedValuesOf('timeZone')` más `UTC`) y `sleep_goal_min` (240–720, en
    `user_settings`).
  - `PUT /api/me/email { email, password }` y `PUT /api/me/password { current, password }` verifican
    la contraseña con el semáforo de 004. Un fallo cuenta en el rate limit (`ip` + `user:<id>`).
    Al cambiar la contraseña, `DELETE FROM sessions WHERE user_id = ? AND id_hash <> ?` (FR-012).
  - La zona propuesta la calcula el frontend con `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- **Razón**: confirmar con la contraseña los cambios que permiten tomar la cuenta.

## R7. Recuperación por el propietario y auditoría

- **Decisión**:
  - `POST /api/people/:id/reset-link` (solo propietario, solo para `role = 'user'`) devuelve el
    enlace y registra `audit_log(user_id = :id, actor = owner, action = 'reset_link_created')`.
  - `POST /api/auth/reset { token, password }`: canje atómico. Fija la contraseña, borra **todas**
    las sesiones de la persona, pone `reset_notice_at = now` y audita `password_reset`. Responde
    204 sin iniciar sesión (la persona entra con la nueva).
  - Al entrar, `login` devuelve `reset_notice_at` si no se ha mostrado. El frontend muestra
    "Tu contraseña fue restablecida el …" y llama a `POST /api/me/reset-notice/ack`, que la borra.
  - `GET /api/me/activity`: las entradas de `audit_log` de la persona (acción, nombre del actor y fecha).
  - "¿Olvidaste tu contraseña?" es una pantalla estática del frontend: mismo mensaje siempre,
    sin consultar al servidor (FR-017).
- **Razón**: UX-12 (≤ 5 usuarios, sin email) y transparencia (la persona ve quién actuó).
- **Propietario**: la rotación de `OWNER_SETUP_TOKEN` de 004 pasa a cerrar **solo** sus sesiones
  (`WHERE user_id = 1`) y a borrar solo su contraseña (FR-018).

## R8. Borrado de cuenta

- **Decisión**: `DELETE /api/me { password }`. Exige la contraseña y, si el usuario es propietario
  y existe algún otro usuario, responde 409 (FR-021). Luego `DELETE FROM users WHERE id = ?`: las FK
  `ON DELETE CASCADE` eliminan sesiones, noches, siestas, métricas (y sus valores),
  `user_settings`, `password_resets`, `audit_log` (como afectado) e invitaciones que usó. Un test
  comprueba 0 filas con su `user_id` en **todas** las tablas (consulta generada desde
  `sqlite_master`) y recuentos ajenos intactos.
- **Razón**: la constitución v2.0.0 (principio II) permite este borrado: confirmación explícita,
  solo filas del dueño y probado.
- **Propietario sin otros usuarios**: puede borrar su cuenta; queda la instalación vacía y el
  alta de 004 se reabre con un código nuevo.

## R9. Meta-test de esquema (SC-002)

- **Decisión**: `test/schema-isolation.test.js` recorre `sqlite_master` (tablas que no son de
  sistema). Toda tabla debe tener columna `user_id`, estar en `SYSTEM` (`schema_migrations`,
  `auth_setup`, `sqlite_sequence`), ser `users`, o estar en `CHILD` con su padre justificado
  (`metric_entries` → `metrics.user_id`; `invites` → `created_by`/`used_by`). Una tabla nueva sin
  clasificar hace fallar el test.

## R10. Suite de aislamiento de dos usuarios (SC-001)

- **Decisión**: `test/isolation.test.js` crea A y B con datos completos (noche abierta y cerrada,
  siesta, métrica con valores). Recorre **todas las rutas registradas** de los routers de datos
  (introspección de Express, como `security.test.js` de 004), sustituyendo `:id` y `:date` por
  los de A, y llama como B: toda petición sobre recursos de A → 404 (o lista sin filas de A). La
  huella de las filas de A es idéntica antes y después. Los listados, `/stats`, `/sleep/open` y
  la exportación de B no contienen nada de A.

## R11. Respaldos cifrados con `age` (FR-022, FR-023)

- **Decisión**:
  - En `backup.yml`, tras `integrity_check`: `age -r "$BACKUP_AGE_RECIPIENT" -o backup.db.age backup.db`
    y se sube `descanso/<TS>.db.age`. Si el secreto falta, el paso falla antes de subir nada.
    `age` se instala con `apt-get install -y age`.
  - La clave pública (`age1…`) es el secreto `BACKUP_AGE_RECIPIENT`. La **privada** solo la guarda el
    propietario (gestor de contraseñas). El pipeline nunca puede descifrar.
  - La poda borra `*.db` y `*.db.age` de más de 14 días.
  - El runbook `restaurar-respaldo.md` añade: `age -d -i clave.txt -o restore.db <archivo>.db.age` +
    `integrity_check`, e instalar `age` (`winget install FiloSottile.age`, `brew install age`, apt).
- **Razón**: cifrado asimétrico: un CI comprometido no puede leer respaldos. `age` es estándar,
  pequeño y sin configuración.
- **Alternativas**: `openssl enc` con contraseña simétrica (el CI tendría la clave para descifrar);
  GPG (más complejo de operar).

## R12. Frontend sin router

- **Decisión**:
  - `App` añade vistas al signal existente: `'profile' | 'people' | 'privacy'` junto a las
    pestañas, abiertas desde el menú **Cuenta**. "Personas" solo aparece para el propietario.
  - `core/link-tokens.ts` lee `#invitacion=` / `#restablecer=` al arrancar y los borra de la URL.
  - Pantallas nuevas en `features/account/`: `register`, `reset-password`, `forgot`, `profile`,
    `people` y `privacy`.
  - El aviso de restablecimiento es un `role="status"` descartable en la cabecera.
- **Razón**: sigue la decisión de 004 (sin router); cambios localizados.

## R13. E2E con dos usuarios

- **Decisión**: fixture `secondUser` que, con el `api` del propietario, crea una invitación y
  registra a B por API en un contexto de petición y de navegador propios. `aislamiento.spec.ts`
  usa dos navegadores: A registra datos y B no los ve; B intenta un id de A por API → 404. Además,
  una prueba del flujo de invitación por la UI y otra de recuperación.

## Rollback (FR-024)

El rollback automático vuelve a la imagen anterior. En el primer despliegue de 008 solo existe el
propietario, así que volver a 004 es inocuo. Tras invitar a alguien, **no** se debe volver
manualmente por debajo de 008. `rollback-migracion.md` y `guia-migraciones.md` lo prohíben y
explican la alternativa: arreglar hacia delante o restaurar un respaldo.

## Deuda y seguimiento

- Contracción de `DEFAULT 1` en `user_id` → migración en la primera feature tras 008.
- Recuperación por email (> 5 usuarios) → feature futura con proveedor de email.
- Reaceptar la política cuando cambie de versión → cuando haya un cambio material.
