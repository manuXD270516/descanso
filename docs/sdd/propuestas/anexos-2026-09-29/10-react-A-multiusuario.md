# Propuesta A — Multiusuario (borrador ReAct v0)

## 1. Resumen y recomendación

- **Recomendación**: email + contraseña con `crypto.scrypt` (N=2^15, r=8, p=3, maxmem 64 MB) y sesiones en SQLite con una cookie `HttpOnly; Secure; SameSite=Lax`.
- **Registro**: por invitación.
- **Bloqueo previo**: DT-01 (un sistema de migraciones).
- **Aplazado a P3**: passkeys y email.

## 2. Historias

- **P1 HU1 — Entrar con mi cuenta (M)**:
  - `/api/*` → 401 sin sesión, salvo health, auth y admin por token;
  - 5 fallos en 15 min → 429;
  - logout invalida la sesión en el servidor.
- **P1 HU2 — Aislamiento (L)**:
  - una suite de dos usuarios en todos los endpoints: acceso a un id ajeno → 404;
  - stats y listados sin filas ajenas;
  - un usuario nuevo empieza con 3 métricas iniciales.
- **P1 HU3 — Datos actuales para el propietario (M)**:
  - el 100 % de las filas asignadas al propietario, con recuento antes y después;
  - migración idempotente;
  - aborta si no hay respaldo reciente o propietario configurado.
- **P2 HU4 — Invitar (S)**: enlace de un solo uso que caduca a las 72 h; registrarse sin invitación → 403.
- **P2 HU5 — Exportar y borrar la cuenta (M)**: JSON completo (RGPD art. 20); el borrado pide contraseña y deja 0 filas.
- **P2 HU6 — Zona horaria por usuario (S)**: `users.timezone` (IANA) para "hoy" y para validar la fecha de la noche (DT-04).
- **P3 HU7 — Recuperar por email (M)**: token de un solo uso, 30 min, respuesta uniforme.
- **P3 HU8 — Passkeys (L)**: con `@simplewebauthn/server`.

## 3. Requisitos funcionales

- **FR-01**: `requireAuth` en `/api`.
- **FR-02**: sesiones con id de 32 B, hash SHA-256, caducidad deslizante de 30 días y rotación al entrar.
- **FR-03**: scrypt y `timingSafeEqual`; contraseña de al menos 10 caracteres.
- **FR-04**: todas las consultas filtran por `user_id`; los valores de métricas, a través de su métrica.
- **FR-05**: CSRF con `Sec-Fetch-Site` y `Origin`; CORS de mismo origen (DT-17).
- **FR-06**: rate limit en memoria.
- **FR-07**: invitaciones de un solo uso que crea el propietario.
- **FR-08**: exportar y borrar la cuenta.
- **FR-09**: el respaldo sigue siendo global con `BACKUP_TOKEN`.
- **Fuera de alcance**: registro abierto, OAuth, 2FA, compartir datos, pagos, cifrado por usuario en reposo, varias regiones.

## 4. Opciones

| Opción | Coste | Veredicto |
|--------|-------|-----------|
| **scrypt + sesión SQLite** | 0 € | **Elegida** |
| Enlace mágico | Resend: 3.000 emails/mes gratis | Descartada |
| Passkeys | Requiere librería | P3 |
| OAuth | Apple: 99 $/año | Encaje bajo |

- Node 22 no tiene `crypto.argon2`.
- scrypt con N=2^17 usa 128 MiB, un riesgo en una VM de 256 MB.
- Recuperación inicial: un enlace de reset manual que genera el propietario.

## 5. Datos y migración

- **Paso 0 (DT-01)**: tabla `schema_migrations` + un runner `backend/migrations/NNN_*`, con transacciones; la 001 es la línea base.
- **Tablas nuevas**: `users` (email UNIQUE NOCASE, password_hash, role owner/user, timezone), `sessions`, `invites` y `password_resets`.
- **Columna nueva**: `ALTER TABLE sleep_records|naps|metrics ADD COLUMN user_id REFERENCES users(id)`.
- **Índices**: `(user_id, date)` y `(user_id, sort_order)`.
- **NOT NULL con triggers**, no reconstruyendo las tablas: reconstruirlas implica copiar y hacer DROP, en tensión con el principio II.
- **Migración 002**: propietario desde `OWNER_EMAIL`, contraseña mediante `node scripts/set-password.js` por `fly ssh`, y `UPDATE` para asignarle las filas sin usuario; la semilla de métricas se hace por usuario.
- **Aislamiento**: una capa `repo/*.js` que recibe `userId` como primer argumento, un test estático de SQL y una suite de dos usuarios.

## 6. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Fuga entre usuarios | Repositorio, test estático, suite de dos usuarios y 404 |
| Datos de salud bajo el RGPD art. 9 | Consentimiento explícito, política, exportar y borrar, minimización y aviso de retención en respaldos |
| Memoria de scrypt en 256 MB | N=2^15, rate limit, o VM de 512 MB |
| Pérdida del volumen | S3 diario + snapshots de Fly (5 días) |
| Rotura al migrar | Transacción, idempotencia y respaldo previo |
| Fuerza bruta o enumeración | Rate limit y respuestas uniformes |
| El rate limit se reinicia con el auto-stop | Aceptado |

## 7. Dependencias

- **Deuda que bloquea o que se resuelve aquí**:
  - DT-01 bloquea;
  - resuelve DT-17, DT-04 y DT-10;
  - DT-02 y DT-03 se validan de paso;
  - DT-06 filtra por usuario.
- **Otras áreas**:
  - el dashboard, fases y wearables deben nacer con `user_id`, así que conviene hacer multiusuario antes;
  - los tokens OAuth de wearables necesitan cifrado de columnas y revocación al borrar la cuenta.

## 8. Estimación

| Trabajo | Talla |
|---------|-------|
| DT-01 | M |
| HU1 | M |
| HU2 | L (unas 35 consultas) |
| HU3 | M |
| HU4 | S |
| HU5 | M |
| HU6 | S |
| HU7 | M |
| HU8 | L |
| Frontend | M |

- **Escala**: SQLite admite cientos de usuarios.
- **Coste**: unos 6,5 $/mes si estuviera siempre encendida; menos con auto-stop.

**Preguntas**:
1. ¿Usuarios en la UE o fuera del círculo de familia y amigos? Define el cumplimiento del RGPD.
2. ¿Recuperación manual al principio, o email desde el día 1?
3. ¿Compartir datos con la pareja o el médico?

## 9. Enmiendas

- **MAJOR**: alcance mono-usuario → multiusuario + principio "VIII. Privacidad por usuario".
- **MINOR**:
  - II, borrar la cuenta a petición del usuario no es DROP (y retención en respaldos);
  - I, librerías de seguridad justificadas;
  - V, cabeceras de seguridad, CORS de mismo origen y secretos de auth.

## Fuentes

- **OWASP**: Password Storage, CSRF, Forgot Password.
- **Node**: documentación de `crypto` (v22 y actual).
- **Normativa**: RGPD art. 9.
- **Infraestructura y proveedores**: Fly (volúmenes y precios), SQLite "when to use", Resend (precios), SimpleWebAuthn.
- **Express**: guía de seguridad.
