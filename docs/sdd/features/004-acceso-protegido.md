# Feature 004 – Acceso protegido y portabilidad (multiusuario, paso 1)

Hoy cualquiera con la URL puede leer y modificar mis datos de sueño (DT-17). Como propietario quiero que solo yo pueda entrar, sin perder la comodidad del gesto único al dormir y al despertar. También quiero poder llevarme mis datos.

## Entrar con mi cuenta (P1)

- Entro con email y contraseña.
- La sesión dura 30 días y se renueva con el uso.
- Registrar que me voy a dormir o que desperté nunca me pide contraseña mientras la sesión esté vigente.
- Si la sesión caducó con una noche abierta, al entrar veo directamente esa noche.
- Sin sesión, toda la API responde 401, salvo el chequeo de salud, la autenticación y el respaldo protegido por token.
- Cerrar sesión la invalida también en el servidor.

## Alta y recuperación del propietario, sin terminal (P1)

- La primera vez que abro la app tras la migración veo "Crea tu contraseña" y el mensaje "Tus N noches están a salvo". Para entrar pego en un formulario un código de un solo uso que se obtiene de un secreto configurado en el proveedor de hosting. El código nunca viaja en la URL.
- Mientras no haya contraseña, la API responde 401.
- Si olvido la contraseña, rotar ese secreto desde el panel del proveedor reactiva el alta. Además invalida todas las sesiones abiertas y la contraseña anterior.
- Todos los datos existentes pasan a ser míos: el recuento de filas es idéntico antes y después.

## Defensas (P1)

- Se rechazan las peticiones que modifican datos desde otro origen (CSRF).
- CORS solo del mismo origen.
- Tras 5 intentos fallidos en 15 minutos (por IP real del cliente y por email), la respuesta es 429.
- La app no se queda sin memoria con 10 intentos de login simultáneos en una máquina de 256 MB.
- Se añaden cabeceras de seguridad.

## Exportar mis datos (P2)

- Descargo todos mis datos en JSON y CSV: noches, siestas, métricas y valores.
- Con ese JSON se puede reconstruir una base vacía con los mismos recuentos.

## Compatibilidad con el rollback (P1)

- Los datos quedan asociados a un usuario de forma que la versión anterior del código siga funcionando con el esquema nuevo (regla expand/contract de la feature 003).
- La garantía de "una sola noche abierta" pasa a ser por usuario.

Fuera de alcance: más usuarios, invitaciones, recuperación por email, passkeys, inicio de sesión con Google o Apple, 2FA.

Criterios de aceptación medibles por cada historia. Marca [NEEDS CLARIFICATION] lo ambiguo.

## Contexto técnico

Diseño de referencia: `docs/sdd/propuestas/2026-09-29-set-de-features.md` (feature 004, registro de debate E2, E3, X2, X3, X5, X6, R1, V-01 a V-04). Depende de la feature 003.

**Autenticación**
- Sin librerías nuevas: `crypto.scrypt` de Node 22 (N=2^15, r=8, p=3, `maxmem` de 64 MB).
- Semáforo de un solo hash concurrente y hash ficticio cuando el email no existe.
- Sesiones en la tabla `sessions`, guardando solo el hash del id.
- Cookie `__Host-sid` con `HttpOnly; Secure; SameSite=Lax`.
- `last_seen_at` se actualiza como máximo una vez por hora.
- El rate limit usa la cabecera `Fly-Client-IP`.

**Alta del propietario**
- `OWNER_SETUP_TOKEN` es un secreto de Fly; en la base se guarda solo su hash y se marca como usado.

**Esquema**
- Tablas `users`, `sessions` y `user_settings`.
- `user_id NOT NULL DEFAULT <id del propietario>` en `sleep_records`, `naps` y `metrics`. Las tablas se reconstruyen copiando y verificando, no con triggers.
- Requiere antes la enmienda PATCH del principio II.
- Criterio: con el esquema de 004, el código de 003 pasa su suite de humo.

**Pruebas**
- Contrato de autenticación: 401, 429, logout, atributos de la cookie y CSRF.
- Humo en Docker con `--memory=256m`.
- La suite E2E de Playwright añade un fixture de login con `storageState`.
