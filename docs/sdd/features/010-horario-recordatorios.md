# Feature 010 – Mi horario de sueño y recordatorios (sin servidor)

Quiero agendar a qué hora me acuesto y me levanto y que el móvil me avise, sin pagar más ni instalar nada. Este horario es el único y lo usan el resto de funciones: rachas, sugerencias y recordatorio de noche abierta.

## Historias

### (P1) Agendar mi horario

Esta historia amplía la bienvenida de la feature 005 (mi objetivo de sueño), de modo que sigue habiendo **una sola bienvenida**, que puedo saltar: objetivo → hora de levantarme → hora de acostarme propuesta → (feature 011) tarjeta de racha.

Todo en una sola pantalla:

- Primero me pregunta "¿A qué hora quieres levantarte?".
- Me propone la hora de acostarme (hora de levantarme − mi objetivo de sueño − 15 min), y puedo editarla.
- Por defecto marca "Igual todos los días", con la opción "Distinto el fin de semana". También puedo fijar un horario distinto para cada día (L–D).

Cada vez que edito el horario se crea una versión nueva que vale desde ese día. El pasado no cambia.

Las horas son **de reloj de pared**. Si viajo o cambia la hora, "7:00" sigue siendo 7:00 en mi hora local.

### (P1) Añadir a mi calendario, con alarma

"Añadir a mi calendario" descarga un archivo de calendario con:

- un evento semanal por cada día activo del horario;
- una alarma X minutos antes (entre 15 y 60 min, configurable).

El archivo pasa un validador del estándar iCalendar (RFC 5545).

Las instrucciones cambian según la plataforma e incluyen capturas:

- **iPhone:** abrir el archivo y pulsar "Añadir todo".
- **Android:** Google Calendar no importa archivos desde la app. Se ofrece la versión web o el calendario del fabricante.

Si cambio el horario, el nuevo archivo actualiza los eventos en lugar de duplicarlos. Los días que dejan de tener evento aparecen como cancelados. Si en alguna plataforma no es así, la guía me indica cómo borrar los anteriores.

Al tocar el evento o su alarma se abre la app en la pestaña Noche, con "Me voy a dormir" visible.

Ni el archivo ni los avisos contienen datos de salud. El texto es: "Descanso: en 30 min es tu hora de dormir".

### (P2) Recordatorio de noche abierta con horario

Esta historia amplía 006-US4:

- **Con horario:** si 60 minutos después de mi hora de levantarme agendada sigo con la noche abierta, al abrir la app veo "¿Ya despertaste?" con la hora agendada **ya propuesta, que debo confirmar o corregir**.
  - Un despertar registrado más de 60 min después de ocurrir queda marcado como "Anotado después" (origen, 006).
  - Confirmar la hora propuesta sin revisarla nunca mejora una racha (ver 011).
- **Sin horario:** se mantiene la regla de 14 horas.

### (P3) Aviso con la app abierta

Si tengo la app abierta a la hora de prepararme, aparece un aviso accesible:

- con `role="status"`, en un margen de ±1 min;
- sin sonido;
- respetando `prefers-reduced-motion`.

### (P2) Modo pausa

Un único "Modo pausa (viaje, enfermedad, turnos) hasta…". Sus reglas:

- empieza hoy o en una fecha futura, **nunca en el pasado**;
- dura como máximo 14 días;
- se permiten como máximo 2 pausas cada 30 días;
- una pausa que se solapa con otra se rechaza.

Mientras está activa:

- detiene los avisos dentro de la app;
- deja las rachas en pausa (feature 011).

El calendario se gestiona desde el propio calendario, y la guía lo explica.

## Fuera de alcance

- Notificaciones push con la app cerrada (feature 013, condicionada).
- App instalable (feature 012, condicionada).
- SMS o email.
- Alarmas con sonido.
- Alarma inteligente.
- Suscripción webcal como canal de avisos (los calendarios descartan sus alarmas).

Criterios de aceptación medibles por cada historia. Marca [NEEDS CLARIFICATION] lo ambiguo.

## Contexto técnico

- **Diseño de referencia:** `docs/sdd/propuestas/2026-09-29-set-de-features.md` (feature 010).
- **Anexos:** `15-react-F-recordatorios.md` y la ronda 2 del debate (`23`, `24`, `25`: E11, X18, X26, UX-14, UX-16, UX-18, UX-22, UX-23).
- **Depende de:**
  - 004: sesión y `user_settings`. No necesita zona horaria en el servidor: todo es hora de pared.
  - 005: amplía su bienvenida.
  - 006: recordatorio de noche abierta y origen "Anotado después".

**Esquema (migración aditiva):**
- `schedule_versions(id, user_id, effective_from, created_at, UNIQUE(user_id, effective_from))`. Solo inserciones.
- `schedule_days(version_id, weekday 0..6, bed_min, wake_min, active)`.
- `user_settings`: `lead_min` (15..60).
- `sleep_records` + `wake_logged_at`: cuándo se registró el despertar. Con él se deriva el origen "Anotado después" (> 60 min).
- `pauses(id, user_id, start_date, end_date)`: propiedad de 010.
  - Límites validados en el servidor, dentro de una transacción: ≤ 14 días, ≤ 2 cada 30 días, sin solapes (409), `start_date` ≥ hoy.
  - La leen los avisos y la racha (011).

**ICS sin librería:**
- **Hora flotante** (sin TZID ni VTIMEZONE), que da la semántica de "hora de pared".
- `RRULE:FREQ=WEEKLY;BYDAY=…` y `VALARM ACTION:DISPLAY TRIGGER:-PT{X}M`.
- `DTSTAMP`, CRLF y líneas plegadas a 75 octetos.
- UID **estable** `sched-<user_id>-<weekday>@descanso-sleep.fly.dev` y `SEQUENCE` = número de versión.
- Los días que ya no tienen evento se emiten con `STATUS:CANCELLED`.
- `URL:` apunta a la app (se abre en Noche).
- Criterio golden: al pasar de v1 a v2 del horario no aumenta el número de eventos.
- Se prueba contra un archivo de referencia (golden).

**Spike antes del plan:** comprobar que suena la alarma y que al reimportar se actualiza en lugar de duplicar, en 1 iPhone (Apple Calendar) y 2 Android (Google web y calendario del fabricante).

**Criterio de salida:** si en una plataforma la alarma importada no suena, la guía de esa plataforma lo dice claramente y ofrece como alternativa crear una alarma recurrente en el reloj del móvil, con las horas del horario. Ese dato cuenta a favor de 013 en la respuesta a P5.

**Coste de operación:** 0 $. El servidor no programa nada, así que no hace falta `zonedToUtc`.

**Datos:** la exportación de 004 y el borrado incluyen el horario.

**Aislamiento:** Sus rutas usan la capa `repo/` con `userId` (feature 008) y se añaden a la suite de aislamiento de dos usuarios de 008.
