# Runbook: recuperar el acceso (olvidé la contraseña)

Descanso no envía emails. Para recuperar el acceso se **cambia el código de alta**
(`OWNER_SETUP_TOKEN`) en Fly. Al arrancar con un código distinto al último visto, la app:

- borra la contraseña del propietario;
- cierra **todas** las sesiones abiertas (en todos los dispositivos);
- vuelve a mostrar "Crea tu contraseña".

**No se toca ningún dato**: noches, siestas y métricas siguen ahí. Objetivo: menos de 5 minutos
(SC-008 de la feature 004).

## Pasos

1. Genera un código nuevo en tu máquina y guárdalo en tu gestor de contraseñas. Fly no deja volver
   a leer el valor de un secreto.
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Configúralo **sin** `--stage`, para que la máquina se reinicie con el valor nuevo:
   ```bash
   flyctl secrets set OWNER_SETUP_TOKEN=<código nuevo> --app descanso-sleep
   ```
   También sirve el panel web de Fly: *Secrets* → editar `OWNER_SETUP_TOKEN` → *Deploy secrets*.
3. Abre https://descanso-sleep.fly.dev → "Crea tu contraseña" → pega el código, tu email y una
   contraseña nueva (mínimo 12 caracteres; una frase de 3–4 palabras va bien).
4. Comprueba en `flyctl logs --app descanso-sleep` la línea
   `[acceso] código de alta nuevo: alta del propietario abierta y sesiones cerradas`.

## Notas

- El código solo sirve **una vez**: tras crear la contraseña queda gastado. Para otra recuperación,
  repite con un código nuevo.
- Mientras el alta está abierta, cualquiera que tenga el código puede crear la cuenta. No lo
  compartas y completa el alta en cuanto cambies el secreto.
- Configurar `--stage` (sin reinicio) deja el cambio para el próximo despliegue; úsalo solo si no
  tienes prisa.
- Si nunca configuraste el secreto, la app muestra "Falta configurar el código de alta" y la API
  responde 401: tus datos no quedan expuestos.

## Registro de ensayos

| Fecha | Entorno | Duración | Resultado |
|-------|---------|----------|-----------|
