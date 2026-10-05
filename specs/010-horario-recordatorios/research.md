# Research: Mi horario de sueño y recordatorios (010)

Formato: Decisión / Razón / Alternativas. Diseño de referencia: feature 010 y ronda 2 del debate
(E11, X18, X26, UX-14, UX-16, UX-18, UX-22, UX-23) en `docs/sdd/propuestas/`. Spike previo al plan:
[`spike/README.md`](spike/README.md) (2026-10-04, emulador Android 15).

## R1. Horario versionado en horas de pared

- **Decisión**:
  - `schedule_versions(id, user_id, effective_from, created_at)`, con índice `(user_id, effective_from, id)`;
  - `schedule_days(version_id, weekday, bed_min, wake_min, active)`, con PK `(version_id, weekday)`.
  - `weekday` es el día de la **noche** (0 = domingo … 6 = sábado, como `Date.getDay()`).
  - `bed_min` y `wake_min` son minutos de reloj de pared (0–1439), sin zona horaria.
  - Interpretación de la hora de acostarse:
    - si `bed_min` < 720 (antes de mediodía), cae **después de medianoche**, es decir, en el día
      siguiente del calendario;
    - si no, cae el mismo día.
    - La hora de levantarse siempre es de la mañana siguiente a la noche.
  - Guardar crea siempre una versión nueva con `effective_from = hoy`, la fecha que envía el cliente
    (como `to` en el dashboard de 005); el `SEQUENCE` del calendario siempre crece.
  - La versión vigente en D es la de mayor `effective_from` ≤ D y, el mismo día, la de id mayor.
  - **Nada se borra**: así se conserva qué días estuvieron activos, para emitirlos cancelados en el
    calendario. Lo detectó la implementación; la primera idea sustituía la del mismo día y perdía
    ese dato.
- **Razón**:
  - El horario es una regla recurrente de reloj de pared, no un instante: "7:00" sigue siendo las
    7:00 tras viajar o con el cambio de horario (spec FR-005). El principio III (ISO con offset)
    rige los instantes registrados; ningún instante se guarda sin offset (ver Constitution Check).
  - Las versiones con "desde" mantienen intacto el pasado, que es lo que necesitará 011.
- **Alternativas**:
  - Una tabla sin versiones (pierde el historial).
  - Guardar con zona horaria (contradice la "hora de pared").
  - JSON en `user_settings` (no se puede consultar ni aislar por fila).

## R2. "Avisarme antes" en `user_settings.lead_min`

- **Decisión**: `lead_min INTEGER NOT NULL DEFAULT 30 CHECK (15..60)`, editable con `PUT /api/me`, como
  `cycle_min` en 006.
- **Razón**: un solo ajuste por persona, sin endpoint nuevo.

## R3. Archivo de calendario generado sin librería (`backend/src/ics.js`)

- **Decisión**: una función pura `scheduleIcs({ userId, version, days, everActive, baseUrl, lead, now })`.
  - **Hora flotante**: `DTSTART:AAAAMMDDTHHMMSS`, sin `TZID` ni `Z`.
  - `DURATION:PT15M`.
  - `RRULE:FREQ=WEEKLY;BYDAY=XX`.
  - `UID:sched-<userId>-<weekday>@descanso-sleep.fly.dev`.
  - `SEQUENCE:<version.id>`.
  - `DTSTAMP` en UTC.
  - `SUMMARY` con el texto del aviso.
  - `DESCRIPTION` con "Abrir Descanso: <baseUrl>/#noche" y, además, `URL:<baseUrl>/#noche`.
  - `VALARM ACTION:DISPLAY TRIGGER:-PT<lead>M`.
  - Los días inactivos que estuvieron activos en alguna versión anterior se emiten con
    `STATUS:CANCELLED` y sin alarma. Los que nunca estuvieron activos no se emiten.
  - CRLF y plegado a 75 octetos, como el generador del spike.
  - `DTSTART` cae en la primera fecha ≥ `effective_from` cuyo día de la semana es el de la noche,
    más un día si `bed_min` < 720.
- **Razón**:
  - Es lo que el spike validó: Google Calendar guarda `iCalUid` y `sequenceNumber`, actualiza y
    borra los cancelados.
  - Google descarta `URL`, así que el enlace va también en `DESCRIPTION` (FR-010).
  - Sin dependencias (principio I).
  - Se prueba contra archivos de referencia (golden) y con las mismas reglas que
    `spike/validate-ics.py`.
- **Alternativas**:
  - Librería iCal (dependencia nueva para unas 60 líneas).
  - `VTIMEZONE` desde IANA (complejo y contrario a la hora de pared).
  - Suscripción webcal (los calendarios descartan sus alarmas: fuera de alcance).

## R4. Guía por plataforma, según el spike

- **Decisión**: un componente `calendar-guide` que detecta Android o iPhone por el *user agent* y
  muestra primero esa guía.
  - **Android (Google Calendar, verificado)**:
    - abrir el archivo con Google Calendar → "Añadir todo";
    - el aviso usa la **notificación por defecto del calendario de destino**, así que se explica
      cómo crear un calendario "Descanso" en calendar.google.com con notificación por defecto =
      "Avisarme antes", e importar en él;
    - reimportar actualiza.
  - **Calendario del fabricante (AOSP, verificado con Etar)**:
    - importa un solo evento cada vez y duplica al reimportar;
    - antes de reimportar hay que borrar los anteriores;
    - hay que comprobar el recordatorio de cada evento;
    - hay que conceder "Alarmas y recordatorios".
  - **iPhone**: "Añadir todo" (**no verificado**).
  - **Siempre**:
    - avisar de que el modo descanso / No molestar puede silenciar el aviso;
    - como alternativa, crear una alarma recurrente en el reloj del móvil con las horas del
      horario, que se muestran en la propia guía.
- **Razón**: FR-011 y SC-004, con los resultados medidos y no supuestos.

## R5. "¿Ya despertaste?" con horario y origen "Anotado después"

- **Decisión**:
  - `sleep_records.wake_logged_at TEXT NULL` (ISO UTC) lo fija el servidor al cerrar la noche,
    tanto con `POST /api/sleep/wake` como con un `PUT` que pase `wake_time` de `NULL` a un valor.
  - `sleep_records.wake_from_proposal INTEGER NOT NULL DEFAULT 0` se marca con
    `POST /api/sleep/wake { from_proposal: true }` cuando la hora confirmada es la propuesta sin
    cambios.
  - Origen "Anotado después" (`'late'`): `wake_logged_at − wake_time > 60 min`. Se deriva en el
    cliente y no se guarda (principio VIII: lo que se guarda es cuándo se anotó).
  - Regla del aviso en Noche:
    - con una versión vigente cuyo día de la noche abierta está activo, y sin pausa en la fecha
      de esa noche, aparece "¿Ya despertaste?" cuando ahora ≥ hora de levantarse agendada (la
      mañana siguiente a la noche) + 60 min;
    - la hora propuesta es la agendada;
    - si no se cumplen esas condiciones, se mantiene la regla de 006 (≥ 14 h, dormir + objetivo).
    - El "Aún no" de 006 (`NightUiService`) se reutiliza.
  - **Pasada la medianoche** (hallado en la implementación): la noche registrada lleva la fecha del
    día en que te acostaste (principio III), pero en el horario una hora antes de mediodía pertenece a
    la noche anterior (00:30 del sábado = noche del viernes). Por eso `scheduledWake` mira esa noche
    y la anterior, y toma la primera hora de levantarse agendada posterior a la hora real de acostarse
    (como mucho 18 h después).
- **Razón**: amplía 006-US4 sin otro mecanismo y deja guardado lo que necesita 011 (FR-013,
  FR-014).
- **Alternativas**:
  - Guardar el origen como columna (duplicaría un dato derivable).
  - Avisar con push (013, fuera de alcance).

## R6. Pausas con reglas en el servidor

- **Decisión**: tabla `pauses(id, user_id, start_date, end_date, created_at)`. Los endpoints están en
  `routes/schedule.js`.
  - `POST /api/pauses { start_date, end_date, today }` valida **dentro de una transacción**:
    - `today` es una fecha real a ±1 día de hoy en UTC;
    - `start_date ≥ today` y `end_date ≥ start_date`;
    - como máximo 14 días, ambos incluidos;
    - no se solapa con otra pausa (409 "Se solapa con otra pausa");
    - hay menos de 2 pausas con inicio en los 30 días anteriores al nuevo inicio, contados por
      `start_date`.
  - `POST /api/pauses/:id/end { today }`:
    - si la pausa ya empezó, `end_date = today` ("termina hoy");
    - si aún no empezó, se borra, porque es una cancelación de la propia persona.
- **Razón**: SC-007. La transacción evita que dos pestañas creen pausas que se solapen.
- **Alternativas**: `paused_until` en `user_settings` (no permite la regla de "2 cada 30 días" ni
  conservar el historial para 011).

## R7. Aviso con la app abierta

- **Decisión**: un componente raíz `bedtime-notice` en `app.html`.
  - Cada 30 s calcula, con la versión vigente hoy y el día de la noche de hoy, el instante
    `hora de acostarse − lead_min`.
  - Si ahora está a ±1 min de ese instante, no hay pausa, el día está activo y no hay noche
    abierta, muestra "En X min es tu hora de dormir" con `role="status"`, sin sonido y sin
    animación si `prefers-reduced-motion`.
  - Se puede cerrar y no vuelve a salir ese día (señal en memoria).
- **Razón**: FR-018 sin servidor (SC-008).

## R8. Bienvenida ampliada y "Mi horario"

- **Decisión**:
  - **`schedule-editor`**: un componente reutilizable con:
    - la hora de levantarse;
    - la hora de acostarse propuesta = levantarse − objetivo − 15 min, editable;
    - el modo "Igual todos los días", "Distinto el fin de semana" (noches de sábado y domingo) o
      "Cada día distinto";
    - activar y desactivar días.
  - **Bienvenida (005)**: objetivo → `schedule-editor` → guardar, o "Saltar"; sigue siendo una sola
    pantalla.
  - **Cuenta → "Mi horario"** (`accountView = 'schedule'`): editor, calendario (aviso, descarga y
    guía) y pausa.
- **Razón**: UX-14, con una sola bienvenida y un solo horario.

## R9. Exportación, borrado y aislamiento

- **Decisión**:
  - La exportación JSON añade `schedule_versions` (con sus `days`) y `pauses`. No hay CSV nuevo: el
    horario no es un registro diario.
  - El borrado de cuenta funciona por CASCADE.
  - Las rutas nuevas entran en la suite de aislamiento y las tablas en el meta-test del esquema.
  - `GET /api/schedule.ics` solo genera el archivo de la propia persona.
- **Razón**: FR-019 y FR-020.

## R10. Compatibilidad (expand/contract)

- **Decisión**: la migración `009_horario.js` solo crea tablas y añade columnas con `DEFAULT` o
  `NULL`. El código de 006 sigue funcionando sobre ella (`compat-previous-010.test.js` y el ensayo
  en Docker con la imagen de master).
