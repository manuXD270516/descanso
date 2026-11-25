# Runbook: rotar las claves VAPID de los avisos push

Las claves VAPID (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`) identifican a Descanso ante
el servicio de avisos del navegador (Google en Chrome de Android). Se rotan si la privada se filtra o por
higiene. **Nunca** van en el repositorio, en commits ni en el chat (principio V de la constitución).

## Efecto de rotarlas

- **Todas las suscripciones dejan de valer**: cada dispositivo se suscribió con la clave pública
  anterior, y el servicio de avisos rechaza (401, 403 o 410) los envíos firmados con otra.
- No se pierde ningún dato: noches, horario y preferencias siguen igual.
- La app lo detecta: en Cuenta → Mi horario → "Avisos en este móvil", cada móvil ve **"Vuelve a activar
  los avisos"** (su clave no coincide con la actual) y basta con pulsar "Activar avisos" otra vez.
  Hasta entonces no recibe avisos; los envíos a dispositivos sin clave válida quedan como `failed` en
  el registro de 90 días y los que responden 410 se borran solos.
- Conviene avisar a quien use los avisos antes de rotar y rotar de día, no por la noche.

## Pasos

1. Genera las claves **en tu máquina** y guárdalas en tu gestor de contraseñas (Fly no deja volver a
   leer un secreto):
   ```bash
   cd backend && npx web-push generate-vapid-keys
   ```
2. Configúralas en Fly **sin** `--stage`, para que la máquina se reinicie con los valores nuevos
   (`VAPID_SUBJECT` es un `mailto:` tuyo):
   ```bash
   flyctl secrets set VAPID_PUBLIC_KEY=<pública> VAPID_PRIVATE_KEY=<privada> VAPID_SUBJECT=mailto:<tu email> --app descanso-sleep
   ```
3. Comprueba que el disparador arrancó con `GET /api/admin/health` y el token de administración:
   ```bash
   curl -sf -H "Authorization: Bearer $BACKUP_TOKEN" https://descanso-sleep.fly.dev/api/admin/health
   ```
   `reminders.enabled` debe ser `true` y `last_tick_at` debe avanzar cada 30 s. Sin las tres variables, el
   servicio registra "Avisos push desactivados: faltan VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o
   VAPID_SUBJECT" y el resto de la app funciona igual.
4. En tu móvil: Mi horario → "Avisos en este móvil" → "Vuelve a activar los avisos" → "Activar avisos" →
   "Enviarme un aviso de prueba".

## Notas

- Para desactivar los avisos sin rotar, quita los secretos (`flyctl secrets unset VAPID_PRIVATE_KEY ...`):
  el bloque dirá "Los avisos no están disponibles".
- En local, exporta las tres variables en la terminal (o en un `.env` ignorado por git para
  `docker compose`) y usa `REMINDER_WAKER=off` si no quieres que el disparador envíe nada.
- El único tercero en el camino de un aviso es el servicio de avisos del navegador, que ve cuándo llega
  cada aviso pero no su contenido (cifrado). Descanso no usa ningún otro para programarlos.
