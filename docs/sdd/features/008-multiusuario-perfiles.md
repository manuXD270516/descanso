# Feature 008 – Multiusuario con perfiles

> Decisión del usuario del 2026-09-29 (P1 = sí): varias personas usarán Descanso y cada una tendrá su propio perfil. Esta feature va justo después de la 004, para que las siguientes (005, 006, 010, 011…) se construyan ya con aislamiento por usuario.

Quiero que otras personas usen Descanso, cada una con su cuenta y su perfil, y que nadie vea ni toque los datos de otra. Como propietario, decido quién entra.

## Historias

### (P1) Invitar a alguien

- Como propietario genero un enlace de invitación de un solo uso que caduca a las 72 h.
- Registrarse sin una invitación válida devuelve 403.
- La invitación explica con honestidad: "Nadie ve tus datos desde la app. Quien administra el servidor tiene acceso técnico a la base y a los respaldos, y se compromete a no usarlo". El mismo texto aparece en la política de privacidad.

### (P1) Mis datos solo los veo yo

- Todas las consultas se filtran por usuario.
- Pedir un recurso de otra persona devuelve 404, como si no existiera.
- Lo verifica una suite de aislamiento con dos usuarios que recorre **todos** los endpoints.
- Los listados, el resumen y el dashboard nunca incluyen filas ajenas.
- La regla "una sola noche abierta" y la noche abierta actual son por usuario.
- Un usuario nuevo empieza con sus propias 3 métricas iniciales y sin noches ni siestas.

### (P1) Mi perfil

Veo y edito:

- mi nombre visible;
- mi email;
- mi zona horaria (propuesta desde el navegador);
- mi objetivo de sueño;
- mis preferencias: racha (011) y recordatorios (010).

Cambiar la contraseña exige la contraseña actual y cierra mis otras sesiones.

### (P2) Recuperar mi contraseña

- Con 5 usuarios o menos, el propietario genera un enlace de un solo uso (30 min) para quien lo pida.
  - Esa recuperación cierra todas las sesiones de la persona.
  - Al entrar, la persona ve un aviso: "Tu contraseña fue restablecida el …".
  - La acción queda en un **registro de auditoría** que la persona puede consultar en su perfil (quién y cuándo).
- Si hay más usuarios, se hace por email: queda condicionado a añadir un proveedor de email.
- La respuesta es la misma exista o no la cuenta.

### (P2) Exportar y borrar mi cuenta

- La exportación de la 004 pasa a ser por usuario.
- Borrar la cuenta:
  - exige la contraseña;
  - deja 0 filas mías en la base viva;
  - purga mis datos de los respaldos en 14 días como máximo (retención de S3);
  - me informa de ese plazo.

### (P2) Consentimiento

Al registrarme acepto explícitamente una política de privacidad breve que explica:

- qué datos de salud se guardan;
- para qué se usan;
- cómo exportarlos y borrarlos.

Si hay usuarios en la UE aplica el RGPD, art. 9.

## Fuera de alcance

- Registro abierto sin invitación.
- Compartir datos entre usuarios.
- Roles más allá de propietario y usuario.
- Iniciar sesión con Google o Apple.
- 2FA y passkeys.
- Planes de pago.

Criterios de aceptación medibles por cada historia. Marca [NEEDS CLARIFICATION] lo ambiguo.

## Contexto técnico

- **Diseño de referencia:** `docs/sdd/propuestas/2026-09-29-set-de-features.md` (feature 008 y notas del debate: X4, UX-12, E4, R4).
- **Anexos:** `10-react-A-multiusuario.md` y `21-debate-arquitecto.md`.
- **Depende de 003 y 004:** 004 ya deja `users`, `sessions` y `user_id NOT NULL DEFAULT <propietario>`.

### Antes del plan

Aplicar dos enmiendas:

- **MAJOR** del alcance de la constitución: de mono-usuario a multiusuario con aislamiento estricto.
- **MINOR** del principio II: el borrado a petición del propio usuario no es DROP.

### Aislamiento

- Capa `backend/src/repo/*.js`: todas las funciones reciben `userId`; las rutas nunca llaman a `db.prepare` directamente.
- Meta-test sobre `sqlite_master`: toda tabla con datos tiene `user_id` o está en una lista blanca de tablas hijas.
- Arreglar el IDOR de `DELETE /metrics/:id/entries/:date`.
- `assertNoOtherOpen` y `/sleep/open` pasan a ser por usuario, con índice parcial `(user_id) WHERE wake_time IS NULL`.
- La semilla de métricas pasa de `db.js` al alta de usuario.

### Contraer `DEFAULT <propietario>` (expand/contract)

- Una vez desplegado el código que siempre envía `user_id`, una migración posterior, en un **despliegue aparte**, quita el valor por defecto.
- SQLite no permite `ALTER … DEFAULT`, así que la migración reconstruye la tabla con una copia verificada, cubierta por el PATCH del principio II.
- Hasta esa contracción, una consulta sin `user_id` asignaría filas al propietario en silencio. Lo mitigan la capa `repo/` y el meta-test.
- Criterio: el código N−1 sigue pasando la prueba de humo.

### Esquema nuevo

- `invites(token_hash, created_by, expires_at, used_by, used_at)`.
- `password_resets(token_hash, user_id, expires_at, used_at)`.
- Perfil: `users.display_name`.
- `audit_log(id, user_id, actor_user_id, action, created_at)`: la persona afectada ve las acciones del propietario sobre su cuenta.
- La recuperación por rotación de `OWNER_SETUP_TOKEN` (feature 004) afecta **solo al rol owner**.

### Respaldos

- `BACKUP_TOKEN` pasa a ser global de operación.
- Los respaldos se cifran en el cliente, porque contienen datos de todos los usuarios.
- La retención de 14 días queda documentada en la política.

### Pruebas

- Suite de aislamiento dirigida por tabla.
- Meta-test de esquema.
- Invitaciones: caducidad, un solo uso y 403.
- Borrado de cuenta → 0 filas.
- E2E con dos contextos de navegador aislados, usando el fixture de login de la 004.
