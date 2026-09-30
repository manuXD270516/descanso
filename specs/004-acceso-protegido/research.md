# Research: Acceso protegido y portabilidad (004)

Formato: Decisión / Razón / Alternativas. Referencias del diseño: registro de debate E2, E3, X2,
X3, X5, X6, R1 y V-01…V-04 en `docs/sdd/propuestas/2026-09-29-set-de-features.md`.

## R1. Hash de contraseñas con `crypto.scrypt`, en serie

- **Decisión**: `crypto.scrypt(password, salt16, 64, { N: 2**15, r: 8, p: 3, maxmem: 64 MiB })`,
  guardado como `scrypt$N$r$p$salt_b64$hash_b64` para poder subir el coste en el futuro. La
  comparación usa `crypto.timingSafeEqual`. Un **semáforo de concurrencia 1** (cola de promesas)
  serializa los hashes. Cuando el email no existe, se calcula igualmente un hash contra un
  `password_hash` ficticio generado al arrancar (FR-016).
- **Razón**: sin dependencias (principio I). Memoria por hash = 128·N·r = 32 MiB; en serie, el pico
  con 10 intentos simultáneos queda ~32 MiB por encima del uso base (~60 MiB), muy por debajo de
  256 MB (SC-005). Tiempo por hash ≈ 150–300 ms en shared-cpu-1x (SC-006: < 1 s).
- **Alternativas**: bcrypt/argon2 (dependencias nativas nuevas). PBKDF2 (más débil frente a GPU).
  Hash en paralelo (10 × 32 MiB haría OOM en 256 MB).

## R2. Sesiones: tabla `sessions` con huella del identificador

- **Decisión**: id aleatorio de 32 bytes (`crypto.randomBytes`) en base64url enviado en la cookie;
  en la base solo `sha256(id)`. Caducidad deslizante: `expires_at = last_seen_at + 30 días`;
  `last_seen_at` (y la cookie `Max-Age`) se renuevan **como máximo una vez por hora** por sesión,
  para no escribir en cada petición. Las sesiones caducadas se borran al crear una nueva.
- **Razón**: si alguien obtiene una copia de la base (p. ej. un respaldo), no puede usar las
  sesiones. FR-002, FR-004, FR-007.
- **Alternativas**: JWT (no se puede invalidar en el servidor sin lista negra: incumple FR-004).
  `express-session` (dependencia).

## R3. Cookie: `__Host-sid` en HTTPS, `sid` en HTTP local

- **Decisión**: `app.set('trust proxy', 1)` (Fly termina TLS y envía `X-Forwarded-Proto`). Si
  `req.secure`, la cookie es `__Host-sid=…; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`.
  En HTTP (desarrollo, tests, e2e) es `sid=…` con los mismos atributos salvo `Secure` y el
  prefijo. El servidor acepta solo el nombre que corresponde al esquema de la petición.
- **Razón**: `__Host-` exige `Secure`, y Playwright/supertest sobre `http://localhost` no
  enviarían una cookie `Secure` de forma fiable. En producción siempre es HTTPS.
- **Alternativas**: HTTPS local con certificados (fricción para el desarrollo y la e2e).

## R4. Alta del propietario con `OWNER_SETUP_TOKEN` (FR-008…FR-010)

- **Decisión**:
  - La migración 003 crea `users(id = 1, role = 'owner', email NULL, password_hash NULL)`, así
    existe un propietario al que asignar los datos (R6) antes de que tenga credenciales.
  - Tabla `auth_setup(id = 1, token_hash, used_at)`.
  - **Al arrancar** (`auth/bootstrap.js`, llamado desde `server.js` y desde los tests): si
    `OWNER_SETUP_TOKEN` (recortado) existe y `sha256(token) ≠ token_hash` →, en una transacción,
    `token_hash = nuevo`, `used_at = NULL`, `password_hash = NULL` del propietario y
    `DELETE FROM sessions`. Esto es a la vez el alta inicial y la recuperación (FR-010). Solo
    toca esas columnas: ningún otro dato.
  - `POST /api/auth/setup { token, email, password }`: exige `used_at IS NULL`, propietario sin
    contraseña y `timingSafeEqual(sha256(token), token_hash)`. Si todo va bien: guarda email
    normalizado y hash, marca `used_at` e inicia sesión. Un fallo cuenta para el rate limit.
  - `GET /api/auth/status` → `{ state: 'setup', nights }` / `{ state: 'setup-unavailable' }` (sin
    token configurado) / `{ state: 'login' }` / `{ state: 'authenticated', email }`.
- **Razón**: alta y recuperación sin terminal, con solo el panel de Fly
  (`flyctl secrets set` o la web). El token viaja solo en el cuerpo (US2-8).
- **Riesgo aceptado**: en estado `setup`, `status` revela el número de noches (lo pide la spec,
  "Tus N noches están a salvo"). Es un recuento, no un dato de salud, y solo se ve durante la
  ventana de alta.
- **Alternativas**: token por URL (prohibido por la spec). Contraseña inicial en un secreto
  (quedaría en claro en el panel para siempre).

## R5. Rate limit en memoria por IP y por email (FR-015)

- **Decisión**: `auth/rate-limit.js`, un `Map` de claves `ip:<Fly-Client-IP>` y
  `email:<normalizado>` → marcas de tiempo de fallos. Hay ventana deslizante de 15 min; con 5
  fallos → 429 `Demasiados intentos. Vuelve a intentarlo en N min.` y la cabecera `Retry-After`.
  Un acierto borra solo la clave del email. Limpieza perezosa y un máximo de 10.000 claves.
  IP: `Fly-Client-IP` si existe; si no, `req.socket.remoteAddress`.
- **Razón**: sin dependencias. Con auto-stop, el mapa se vacía al arrancar (caso límite aceptado
  en la spec); con la máquina siempre encendida (feature 013) será exacto.
- **Alternativas**: tabla en SQLite (escrituras por intento y otra tabla que podar; no hace falta
  con un solo usuario).

## R6. `user_id` en noches, siestas y métricas: reconstrucción verificada con FK desactivadas

- **Decisión**: migración `004_user_id_en_datos.js` con el patrón de 12 pasos de SQLite, permitido
  por la constitución v1.0.1 (principio II). Para cada tabla (`sleep_records`, `naps`, `metrics`):
  1. `CREATE TABLE x_new (…, user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE)`;
  2. `INSERT INTO x_new (cols…, user_id) SELECT cols…, 1 FROM x`;
  3. **verificar**: el recuento es igual y la huella de las columnas originales (`SELECT … ORDER BY id`)
     coincide; si no, lanzar un error (se deshace todo);
  4. `DROP TABLE x`; `ALTER TABLE x_new RENAME TO x`;
  5. recrear índices: `idx_sleep_date`, `idx_naps_date` y el nuevo
     `ux_sleep_one_open ON sleep_records(user_id) WHERE wake_time IS NULL` (FR-019). Los índices
     por `user_id` para consultas llegan con el filtrado de 008.
- **Extensión del runner (contrato de 003)**: una migración `.js` puede exportar
  `foreignKeys: false`. El runner entonces ejecuta `PRAGMA foreign_keys = OFF` **antes** de abrir la
  transacción (dentro no tiene efecto), corre la migración, ejecuta `PRAGMA foreign_key_check`
  dentro de la transacción (si devuelve filas → error y rollback) y restaura
  `PRAGMA foreign_keys = ON` en un `finally`. La propiedad forma parte del archivo, así que la
  cubre el checksum.
- **Razón**: con las FK activas, `DROP TABLE metrics` ejecuta un `DELETE` implícito que **borraría en
  cascada todos los valores de `metric_entries`**. Este es el motivo de la extensión.
  `ADD COLUMN` no admite `REFERENCES` con un valor por defecto no nulo si las FK están activas, y la
  FK con `ON DELETE CASCADE` es la que usará "borrar mi cuenta" en 008.
- **Expand/contract**: `DEFAULT 1` hace que el código de 003, que no conoce `user_id`, siga
  insertando (las filas van al propietario). `ux_sleep_one_open` conserva su nombre, así que el
  `writeNight()` de 003 sigue traduciendo el error a 409.
- **Alternativas**: triggers para rellenar `user_id` (descartado en el debate, E3). `ADD COLUMN`
  sin FK (pierde la cascada que necesita 008).
- **`metric_entries`** no cambia: pertenece al usuario a través de su métrica.

## R7. Las rutas de datos no filtran todavía por usuario

- **Decisión**: en 004 las rutas de datos no cambian sus consultas: con un único usuario, todas
  las filas son suyas y las inserciones reciben `user_id = 1` por defecto. El filtrado por
  `req.user.id`, la capa `repo/` y la suite de aislamiento son de la feature 008.
- **Razón**: principio VI (mínimo que cumple la spec). FR-018 exige pertenencia, no aislamiento.
  Hacerlo aquí duplicaría el trabajo de 008.
- En 004 no hay ninguna ruta que cree usuarios; el único es el propietario creado por la migración.

## R8. CSRF por origen (FR-013)

- **Decisión**: middleware `csrf.js` para métodos distintos de GET/HEAD/OPTIONS en `/api/*`:
  - permitido si `Sec-Fetch-Site` es `same-origin` o `none`;
  - si falta `Sec-Fetch-Site`, permitido si `Origin` existe y su host coincide con `Host`;
  - en cualquier otro caso → 403 `Petición rechazada: origen no permitido`.
  - Excepción: `/api/admin/*`, que se autentica con `Authorization: Bearer` (no con cookie).
- **Razón**: los navegadores modernos envían `Sec-Fetch-Site` y `Origin` en las peticiones que
  modifican. Sumado a `SameSite=Lax`, no hace falta un token CSRF. Sin dependencias.
- **Tests**: supertest envía `Sec-Fetch-Site: same-origin`; la e2e envía `Origin` con la URL del
  servidor (realista).

## R9. CORS y cabeceras de seguridad (FR-014, FR-017)

- **Decisión**: se **elimina** `cors()` y la dependencia `cors`. Sin cabeceras CORS, el navegador
  deniega por defecto las lecturas desde otros orígenes. `security-headers.js` pone:
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;
  - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`;
  - `Strict-Transport-Security: max-age=31536000` solo si `req.secure`.
- **Build de Angular**: `optimization.styles.inlineCritical: false` en `angular.json`. El CSS
  crítico en línea usa `onload="this.media='all'"`, un manejador en línea que `script-src 'self'`
  bloquea: la app se quedaría sin estilos. `'unsafe-inline'` en estilos se mantiene porque Angular
  usa atributos `style` en plantillas.
- **Alternativas**: `helmet` (dependencia para ~15 líneas).

## R10. Exportación (FR-022…FR-024)

- **Decisión**:
  - `GET /api/export.json` → `{ format: 'descanso-export', version: 1, exported_at, sleep_records, naps, metrics, metric_entries }`
    con `Content-Disposition: attachment; filename="descanso-AAAA-MM-DD.json"`.
  - `GET /api/export/{noches|siestas|metricas|valores}.csv`: CSV RFC 4180, UTF-8 **con BOM**
    (para que Excel reconozca los acentos), separador `,`, cabeceras en español y fechas ISO
    tal como se guardan.
  - Sin `password_hash`, `sessions`, `auth_setup` ni `users` (FR-024). Solo se incluye
    `user_id` implícitamente al ser el propietario; se omite la columna.
  - Reconstrucción (SC-007): la función de test `importExport(db, json)` en
    `backend/test/fixtures/import-export.js` inserta en una base nueva y compara recuentos. No es
    una funcionalidad de usuario.
- **Razón**: JSON versionado para portabilidad; un CSV por tipo (aclaración del 2026-09-30).
  Sin librerías de CSV ni ZIP.

## R11. Frontend

- **Decisión**:
  - `core/auth.service.ts`: `status` como signal (`setup` | `setup-unavailable` | `login` | `authenticated`), `login`, `setup`, `logout`.
  - Interceptor funcional `authInterceptor`: ante un 401 de `/api/*` (salvo `/api/auth/*`) marca el estado `login`.
  - `App`: según `status` muestra `SetupComponent`, `LoginComponent`, la pantalla "Falta configurar el código de alta" o la app. La pestaña activa se conserva en memoria al volver de "Entrar" (caso límite).
  - Cabecera: menú "Cuenta" (`<details>` nativo, accesible por teclado) con "Exportar (JSON)", los 4 CSV como enlaces `download` y "Cerrar sesión".
  - Formularios con `autocomplete="username"`, `new-password` / `current-password`, errores con `role="alert"` y foco en el primer error (principio VII).
- **Razón**: sin router (la app ya usa pestañas con un signal); cambios localizados.

## R12. Tests y e2e

- **Backend**: `test/helpers.js` crea el propietario una vez por proceso (`OWNER_SETUP_TOKEN=test-token`,
  `bootstrap()`, `POST /api/auth/setup`) y exporta `api` como `supertest.agent` con la cookie y
  `Sec-Fetch-Site: same-origin` por defecto. También exporta `anon` (sin sesión). Así los 103
  tests existentes siguen igual. Para que la suite no tarde demasiado, los parámetros de scrypt
  se pueden bajar **solo** con `NODE_ENV=test` (N=2^10). Un test verifica que en producción son
  los de R1.
- **E2E**: `support/server.ts` pasa `OWNER_SETUP_TOKEN` al servidor. El fixture `api` hace el alta (o
  entra) por API con `Origin` y comparte la cookie con el contexto del navegador (`context.addCookies`),
  equivalente al `storageState`. Pruebas nuevas: alta, entrada, salida, 401 y exportación.
- **Humo de memoria**: `scripts/smoke-login-mem.mjs` levanta la imagen con `docker run --memory=256m`,
  lanza 10 logins concurrentes y lee el pico de `docker stats`.

## Deuda y seguimiento

- Filtrado por usuario, capa `repo/` y suite de aislamiento → 008 (R7).
- Rate limit persistente → solo si hay varias máquinas (no previsto).
