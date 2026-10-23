# Feature Specification: Avisos push con la app cerrada

**Feature Branch**: `013-avisos-push`

**Created**: 2026-10-08

**Status**: Draft

**Input**: User description: `docs/sdd/features/013-avisos-push.md`. Que el móvil me avise a la hora de
prepararme, a la hora de acostarme y si olvidé marcar el despertar, **aunque tenga Descanso cerrado** y
sin instalar ninguna app (Android recibe estos avisos desde el navegador). Las horas son las del
horario de 010 (único horario de la app). Disparador elegido por el owner el 2026-09-29: el propio
servicio, siempre encendido, sin terceros de programación (≈ 3,3 $/mes en total). Cada usuario ve solo
lo suyo (constitución v2.0.0) y rige el principio VIII (v2.2.0): ningún aviso fuera de la app lleva
datos de sueño ni de salud, y ningún aviso menciona la racha (011, FR-023).

## Clarifications

### Session 2026-10-08

- Q: ¿Qué tipos vienen activos por defecto y cómo se evita el doble "prepárate" si la persona importó
  el calendario de 010? → A: **Los tres activos por defecto**; la explicación previa avisa de que, si
  importaste el calendario de 010, recibirás dos "prepárate", y ofrece desactivar el `prepare` de
  Descanso o borrar los eventos del calendario.
- Q: ¿Basta con informar de que el servicio de avisos del navegador ve cuándo llega cada aviso, o hace
  falta un consentimiento aparte? → A: **Basta con informarlo** en la explicación previa y en la
  política de privacidad (ve cuándo llega cada aviso, no su contenido); pulsar "Activar avisos" tras
  leerlo es el consentimiento.

### Session 2026-10-23

- Q: Si el perfil no tiene zona horaria, ¿qué hace "Activar avisos"? → A: **Propone la zona del
  navegador y la guarda al pulsar "Activar avisos"** (Edge Cases; research R14).
- Q: Borrar el registro de envíos a los 90 días y los dispositivos al cerrarse su sesión, ¿choca con el
  principio II? → A: **Se aclara con una enmienda PATCH de la constitución, aparte de esta feature**:
  las credenciales del navegador y los registros operativos no son historia personal (research R13).
- Q: ¿Se acepta que cada dispositivo dependa de la sesión que lo activó (cambiar la contraseña en otro
  dispositivo o 30 días sin uso detienen sus avisos)? → A: **Sí**; hay que reactivar en ese caso.

## Glosario

- **Aviso push**: notificación del sistema que el móvil muestra aunque Descanso esté cerrado.
- **Tipos de aviso**: `prepare` ("prepárate"), `bedtime` ("hora de dormir") y `wake_check` ("¿ya
  despertaste?").
- **Noche N**: la noche cuya fecha es N, el día en que te acuestas (principio III). Su hora de
  acostarse cae el día N, o el N + 1 si es antes de mediodía (después de medianoche, como en 010); su
  hora de levantarse, siempre el N + 1.
- **Hora agendada**: hora de reloj de pared del horario de 010 convertida al instante real con la zona
  horaria del perfil (008), incluidos los cambios de horario oficial (DST).
- **Ventana de descarte**: tiempo máximo tras la hora agendada en que un aviso todavía tiene sentido;
  pasada, no se envía y queda como "descartado" (`skipped`).
- **Dispositivo**: un navegador de un móvil en el que la persona activó los avisos.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Activar avisos en este móvil (Priority: P1)

Como usuario con horario, en Ajustes activo los avisos en mi móvil después de leer qué recibiré, a qué
horas y que no llevan datos de salud; el navegador solo me pide permiso cuando pulso "Activar avisos".

**Why this priority**: sin dispositivo activado no hay avisos; es la puerta de toda la feature.

**Independent Test**: con horario L–V 23:15 → 7:00 y "Avisarme antes" 30 min, abrir Ajustes en Chrome
de Android → "Avisos en este móvil" explica los tres avisos con sus horas (22:45, 23:15 y 8:00) y que
el texto no lleva datos de salud; cargar la app no pide permiso; pulsar "Activar avisos" → el
navegador pide permiso → aceptar → el móvil aparece en la lista como "Chrome en Android". Repetir sin
horario → el botón está deshabilitado con "Primero agenda tu horario".

**Acceptance Scenarios**:

1. **Given** Ajustes, **When** lo abro, **Then** veo el bloque "Avisos en este móvil" con una
   explicación previa: los tres tipos de aviso, sus horas según mi horario y "Avisarme antes" (010),
   que el texto nunca lleva datos de sueño ni de salud y quién entrega el aviso (FR-005).
2. **Given** que abro o recargo la app en cualquier pantalla, **Then** el navegador nunca me pide
   permiso de notificaciones por su cuenta.
3. **Given** el bloque, **When** pulso "Activar avisos", **Then** el navegador pide el permiso y, si
   lo concedo, este dispositivo queda activado y aparece en la lista.
4. **Given** que deniego el permiso (o lo había denegado antes), **When** vuelvo al bloque, **Then**
   veo cómo reactivarlo desde los ajustes del navegador y el resto de la app funciona igual.
5. **Given** un navegador que no admite avisos con la app cerrada (p. ej., Safari en iPhone sin app
   instalada), **When** abro el bloque, **Then** veo "Este navegador no puede recibir avisos con la
   app cerrada" y la alternativa del calendario de 010; no hay botón activo.
6. **Given** que no tengo horario agendado, **When** abro el bloque, **Then** "Activar avisos" está
   deshabilitado con el texto "Primero agenda tu horario" y un enlace a "Mi horario".
7. **Given** varios móviles o navegadores activados, **When** veo la lista, **Then** cada uno aparece
   con un nombre aproximado ("Chrome en Android"), la fecha de activación y la opción de quitarlo;
   el actual va marcado "Este móvil".
8. **Given** un dispositivo de la lista, **When** lo quito, **Then** deja de recibir avisos de
   inmediato.
9. **Given** que cierro sesión en un móvil, **Then** ese móvil deja de recibir mis avisos; los demás
   dispositivos siguen activados.

---

### User Story 2 - Recibir los avisos a su hora (Priority: P1)

Como usuario con avisos activados, recibo en el móvil, con la app cerrada, el aviso de prepararme, el
de acostarme y, si sigo con la noche abierta una hora después de mi hora de levantarme, "¿ya
despertaste?"; cada uno una sola vez y nunca tarde.

**Why this priority**: es el valor de la feature: avisos con la app cerrada sin depender del
calendario.

**Independent Test**: con reloj simulado, zona `Europe/Madrid`, horario L–V 23:15 → 7:00, "Avisarme
antes" 30 min y los tres tipos activos: el lunes a las 22:45 ± 2 min llega "Descanso: en 30 min es tu
hora de dormir"; a las 23:15 ± 2 min, "Descanso: es tu hora de dormir"; con la noche abierta, el martes
a las 8:00 ± 2 min llega "Descanso: ¿ya despertaste?", y si la cerré a las 7:30 no llega. Reiniciar el
servicio dos veces entre medias no duplica ninguno. Si el servicio estuvo caído de 22:40 a 22:50, al
volver envía el de las 22:45 (dentro de su ventana de 10 min) y el de las 23:15 a su hora; si estuvo
caído hasta las 23:00, el de las 22:45 queda descartado (FR-011).

**Acceptance Scenarios**:

1. **Given** un horario activo para la noche N y el tipo `prepare` activo, **When** llega la hora de
   acostarme de N − "Avisarme antes", **Then** recibo "Descanso: en X min es tu hora de dormir" (X =
   "Avisarme antes") con un margen de ± 2 min.
2. **Given** el tipo `bedtime` activo, **When** llega la hora de acostarme de N, **Then** recibo
   "Descanso: es tu hora de dormir" con un margen de ± 2 min.
3. **Given** el tipo `wake_check` activo y la noche N abierta, **When** llega la hora de levantarme de
   N + 60 min, **Then** recibo "Descanso: ¿ya despertaste?" con un margen de ± 2 min; si la noche N ya
   está cerrada, no se envía.
4. **Given** una hora de acostarme después de medianoche (sábado 1:15), **When** llega el domingo a la
   1:15, **Then** el aviso es el de la noche del sábado y cuenta como tal para no repetirse.
5. **Given** cualquier aviso, **When** el servicio se reinicia, se despliega o evalúa varias veces la
   misma hora, **Then** ese aviso me llega como máximo una vez por tipo y noche.
6. **Given** que el servicio no pudo avisar a su hora, **When** vuelve a funcionar dentro de la ventana
   de descarte (10 min para `prepare` y `bedtime`, 60 min para `wake_check`), **Then** envía el aviso
   en ese momento; **When** vuelve después, **Then** no lo envía y queda descartado.
7. **Given** que toco un aviso `prepare` o `bedtime`, **Then** se abre Descanso en Noche con "Me voy a
   dormir" visible sin desplazarme; **Given** que toco `wake_check`, **Then** se abre en Noche con "Ya
   desperté" visible. Sin sesión, me pide entrar y después muestra Noche.
8. **Given** una pausa de 010 que incluye la noche N, o que el día de N está desactivado en mi
   horario, **Then** no recibo ningún aviso de esa noche.
9. **Given** que ya pulsé "Me voy a dormir" (hay una noche abierta) antes de la hora de `prepare` o
   de `bedtime`, **Then** esos avisos no se envían (como el aviso en la app de 010).
10. **Given** varios dispositivos activados, **When** vence un aviso, **Then** llega a todos ellos.
11. **Given** que cambio de zona horaria en mi perfil, **Then** los avisos siguientes usan la nueva
    zona: "23:15" sigue siendo las 23:15 de mi hora local.
12. **Given** el día del cambio de horario oficial, **When** la hora agendada no existe (salto de
    primavera), **Then** el aviso llega en la primera hora válida posterior; **When** existe dos veces
    (otoño), **Then** llega en la primera.

---

### User Story 3 - Elegir qué avisos recibo (Priority: P1)

Como usuario, activo o desactivo cada tipo de aviso por separado, para recibir solo los que me sirven
(por ejemplo, solo "¿ya despertaste?" si ya uso la alarma del calendario).

**Why this priority**: evita avisos duplicados con el calendario de 010 y avisos que no quiero; sin
esto la persona tendría que desactivarlo todo.

**Independent Test**: desactivar `prepare` y dejar los otros dos → a las 22:45 no llega nada y a las
23:15 llega "es tu hora de dormir"; volver a activar `prepare` → al día siguiente llega a las 22:45.

**Acceptance Scenarios**:

1. **Given** el bloque de avisos, **When** lo veo, **Then** hay un interruptor por tipo, con su hora
   de hoy al lado ("Prepárate · 22:45").
2. **Given** un tipo desactivado, **Then** ningún dispositivo recibe ese aviso hasta reactivarlo.
3. **Given** que cambio un tipo, mi horario o "Avisarme antes", **Then** el cambio rige desde el
   siguiente aviso que aún no se haya enviado, incluida la noche de hoy.
4. **Given** que activo los avisos por primera vez, **Then** los tres tipos están activos y la
   explicación me avisa del doble "prepárate" si importé el
   calendario de 010, con la opción de desactivar el de Descanso (FR-012).

---

### User Story 4 - Aviso de prueba (Priority: P2)

Como usuario, me envío un aviso de prueba para comprobar que este móvil los recibe, y si falla sé por
qué.

**Why this priority**: da confianza y diagnostica permisos retirados o dispositivos caducados; no es
imprescindible para recibir los avisos.

**Independent Test**: con este móvil activado, pulsar "Enviarme un aviso de prueba" → en menos de 10 s
llega "Descanso: aviso de prueba" y la app dice "Enviado". Retirar el permiso desde el navegador y
repetir → la app dice que el permiso está retirado y cómo reactivarlo. Pulsar 4 veces en un minuto →
la cuarta se rechaza con "Espera un momento antes de probar otra vez".

**Acceptance Scenarios**:

1. **Given** este dispositivo activado, **When** pulso "Enviarme un aviso de prueba", **Then** recibo
   un aviso de prueba sin datos de salud en este dispositivo, en menos de 10 s.
2. **Given** que el envío falla porque retiré el permiso o el dispositivo ya no es válido, **When** lo
   pruebo, **Then** veo el motivo en lenguaje claro y cómo reactivarlo; un dispositivo que ya no es
   válido desaparece de la lista.
3. **Given** "No molestar" o "Silenciar hoy" activos, **When** pido el aviso de prueba, **Then** llega
   igualmente (lo he pedido yo).
4. **Given** más de 3 avisos de prueba en un minuto, **Then** los siguientes se rechazan con un
   mensaje amable.

---

### User Story 5 - No molestar y silenciar hoy (Priority: P2)

Como usuario, silencio los avisos de hoy con un toque, o defino una franja de "No molestar" en la que
nunca quiero avisos.

**Why this priority**: evita avisos en días o franjas en que no sirven sin tener que usar la pausa de
010 ni tocar el horario.

**Independent Test**: lunes a las 20:00 pulsar "Silenciar hoy" → no llegan los avisos de las 22:45,
23:15 ni el de las 8:00 del martes (noche del lunes); el martes a las 22:45 vuelve a llegar. Definir
"No molestar" de 23:00 a 07:00 → llega el de las 22:45, no el de las 23:15, que queda descartado.

**Acceptance Scenarios**:

1. **Given** "Silenciar hoy", **When** lo pulso, **Then** no recibo ningún aviso de la noche de hoy
   ni de noches anteriores (p. ej., un "¿ya despertaste?" pendiente de esta mañana); vuelven con la
   noche de mañana.
2. **Given** "Silenciar hoy" activo, **When** veo el bloque, **Then** dice "Avisos silenciados hasta
   mañana" con la opción de deshacerlo.
3. **Given** una franja "No molestar" (inicio y fin en hora local, que puede cruzar medianoche),
   **When** un aviso vence dentro de ella, **Then** no se envía y queda descartado; no se aplaza.
4. **Given** que cambio la franja, **Then** se aplica a los avisos que aún no se hayan enviado, porque
   se comprueba en el momento de enviar.
5. **Given** "Silenciar hoy" o "No molestar", **Then** se aplican a todos mis dispositivos.

---

### Edge Cases

- **Noche que cruza medianoche**: acostarse a las 1:15 del sábado → los avisos de 0:45 y 1:15 del
  domingo pertenecen a la noche del sábado (principio III); se deduplican y silencian como tal.
- **Hora de acostarse temprana**: si "Avisarme antes" hace que `prepare` caiga el día anterior a la
  hora de acostarse (p. ej., acostarse a las 0:15 con 30 min → 23:45 del día N), sigue siendo de la
  noche N.
- **Cambio de horario el mismo día**: se usa la versión vigente en la fecha de la noche (010, FR-004); si el aviso de esta
  noche ya se envió, no se repite con la hora nueva.
- **Pausa que empieza hoy**: no hay avisos de la noche de hoy; un `wake_check` de la noche anterior
  (no pausada) sí puede llegar esta mañana.
- **Noche abierta de días anteriores** (olvidé cerrarla): `prepare` y `bedtime` de hoy no se envían
  (FR-016) y `wake_check` solo existe para la noche abierta cuyo día está activo (como 010-R5).
- **Servicio caído más que la ventana**: los avisos vencidos se descartan; ninguno llega tarde (no
  llega "es tu hora de dormir" a las 00:40).
- **Envío interrumpido a mitad** (el servicio se cae justo al enviar): ese aviso no se reintenta para
  no duplicar; queda como fallido.
- **Dispositivo caducado o permiso retirado**: el servicio lo detecta al enviar y lo quita de la
  lista; los demás dispositivos y usuarios reciben sus avisos igual.
- **El mismo navegador lo usa otra persona**: si otra persona inicia sesión en ese navegador y activa
  avisos, el dispositivo pasa a ser suyo y desaparece de la lista de la primera.
- **Más de 5 dispositivos**: activar el sexto se rechaza pidiendo quitar uno.
- **Descanso abierto y visible en el dispositivo cuando vence un aviso**: el dispositivo lo muestra
  dentro de la app, nunca duplicado (FR-019).
- **Alarma del calendario de 010 importada**: puede haber dos avisos de "prepárate" (FR-012): la explicación previa lo advierte y ofrece cómo evitarlo.
- **"No molestar" o modo descanso del propio Android**: el aviso llega pero queda en silencio en la
  bandeja (spike de 013, 2026-10-23); el ahorro de batería del fabricante también puede silenciarlo o
  retrasarlo. La explicación lo advierte (como la guía de 010).
- **Móvil quieto y con la pantalla apagada mucho rato (reposo profundo de Android, "Doze")**: el
  sistema puede retener el aviso hasta que el móvil sale del reposo, más allá de ± 2 min (spike de
  013). Es un límite del sistema, no de Descanso: el margen de ± 2 min se mide hasta la entrega al
  servicio de avisos del navegador, y la explicación previa lo dice.
- **Móvil recién reiniciado** (el navegador sin ningún proceso abierto): el aviso arranca el navegador
  y puede tardar hasta unos 15 s en mostrarse (spike de 013); sigue dentro de ± 2 min, pero el aviso
  de prueba puede pasar de 10 s en ese caso.
- **Sin zona horaria en el perfil** (008 la deja sin fijar hasta que la persona la acepta): como en el
  perfil de 008, el bloque propone la del navegador y la muestra en la explicación previa; al pulsar
  "Activar avisos" se guarda en el perfil junto con la activación. Sin zona horaria no se calcula
  ningún aviso.
- **Sesión cerrada por otra vía**: un dispositivo recibe avisos mientras siga abierta la sesión con la
  que se activó; si esa sesión se cierra (cerrar sesión, caducidad de 30 días sin uso de 004 o cambio
  de contraseña desde otro dispositivo, que cierra las demás sesiones), el dispositivo deja de recibir
  avisos y, al volver a entrar, el bloque ofrece activarlos de nuevo (FR-007).
- **Rotación de las credenciales del servicio de avisos** (operación): los dispositivos activados
  dejan de recibir avisos; al abrir la app, el bloque pide "Vuelve a activar los avisos".
- **Dos usuarios**: los dispositivos, preferencias y avisos de uno nunca son visibles ni gestionables
  por el otro (404), y un aviso nunca llega a un dispositivo de otra persona.

## Requirements *(mandatory)*

### Functional Requirements

**Activación y dispositivos (US1)**

- **FR-001**: Ajustes MUST tener el bloque "Avisos en este móvil" con "Activar avisos". El permiso
  del navegador MUST pedirse solo como respuesta a ese botón, nunca al cargar la app ni en otra
  pantalla.
- **FR-002**: Antes de pedir el permiso, el bloque MUST mostrar qué avisos llegarán, a qué horas (según
  el horario vigente y "Avisarme antes" de 010) y que su texto no contiene datos de sueño ni de salud.
- **FR-003**: Sin horario agendado, "Activar avisos" MUST estar deshabilitado con el texto "Primero
  agenda tu horario" y un enlace a "Mi horario".
- **FR-004**: El bloque MUST mostrar el estado del dispositivo actual (no compatible, permiso
  denegado con instrucciones para reactivarlo, activado o hay que reactivar) y la app MUST funcionar
  igual en todos ellos.
- **FR-005**: La explicación previa y la política de privacidad MUST decir que el aviso lo entrega el
  servicio de avisos del navegador (Google, en Chrome de Android), que conoce cuándo llega un aviso
  pero no su contenido, y que Descanso no usa ningún otro tercero para programarlos. Pulsar "Activar
  avisos" tras leerlo MUST ser el consentimiento; no hay un consentimiento aparte.
- **FR-006**: Una persona MUST poder activar hasta 5 dispositivos; cada uno MUST listarse con un
  nombre aproximado (navegador y sistema), la fecha de activación y la opción de quitarlo, sin mostrar
  ningún identificador técnico. Activar de nuevo el mismo dispositivo MUST NOT duplicarlo.
- **FR-007**: Quitar un dispositivo, cerrar sesión en él o que el servicio de avisos lo declare no
  válido MUST hacer que deje de recibir avisos; borrar la cuenta MUST eliminar todos sus dispositivos.

**Envío (US2)**

- **FR-008**: El servicio MUST enviar, sin que la app esté abierta:
  - `prepare` a la hora de acostarse de la noche N − "Avisarme antes", con el texto "Descanso: en X
    min es tu hora de dormir";
  - `bedtime` a la hora de acostarse de N, con "Descanso: es tu hora de dormir";
  - `wake_check` a la hora de levantarse de N + 60 min, solo si la noche N sigue abierta, con
    "Descanso: ¿ya despertaste?".
- **FR-009**: Las horas MUST salir del horario de 010 (versión vigente en la fecha de la noche, así
  que un cambio guardado hoy rige ya los avisos de esta noche; día de la semana de la noche; hora de
  acostarse antes de mediodía = después de medianoche) y convertirse al instante real
  con la zona horaria del perfil (008). Una hora inexistente por DST MUST pasar a la primera válida
  posterior y una ambigua, a su primera ocurrencia. Cada aviso MUST llegar con un margen de ± 2 min,
  medido hasta su entrega al servicio de avisos del navegador (lo que tarde el sistema del móvil en
  mostrarlo queda fuera de Descanso: ver Edge Cases y Assumptions).
- **FR-010**: Cada aviso MUST enviarse como máximo una vez por persona, tipo y fecha de la noche,
  aunque el servicio evalúe varias veces, se reinicie o se despliegue. Un envío interrumpido MUST NOT
  reintentarse.
- **FR-011**: Un aviso no enviado dentro de su ventana de descarte (10 min para `prepare` y
  `bedtime`, 60 min para `wake_check`) MUST NOT enviarse y MUST quedar como descartado. Al arrancar,
  el servicio MUST enviar enseguida lo que siga dentro de su ventana.
- **FR-012**: Los avisos con la app cerrada MUST coexistir con la alarma del calendario de 010 sin
  desactivarla. Al activar los avisos por primera vez, los tres tipos MUST venir activos, y la
  explicación previa MUST avisar de que, si se importó el calendario de 010, llegarán dos "prepárate",
  y ofrecer desactivar el `prepare` de Descanso o borrar los eventos del calendario (guía de 010).
- **FR-013**: Tocar `prepare` o `bedtime` MUST abrir Noche con "Me voy a dormir" visible sin
  desplazarse; tocar `wake_check`, Noche con "Ya desperté" visible. Si ya hay una pestaña de Descanso
  abierta, MUST usarse esa. Sin sesión, MUST pedir entrar y luego mostrar Noche.
- **FR-014**: Un aviso que vence MUST enviarse a todos los dispositivos activados de la persona. Un
  fallo o una espera en un dispositivo o en una persona MUST NOT impedir ni retrasar más allá del
  margen los avisos de los demás.
- **FR-015**: MUST NOT enviarse avisos de una noche incluida en una pausa de 010 ni de una noche cuyo
  día esté desactivado en el horario.
- **FR-016**: `prepare` y `bedtime` MUST NOT enviarse si la persona ya tiene una noche abierta
  (coherente con el aviso en la app de 010, FR-018).

**Preferencias (US3, US5)**

- **FR-017**: Cada tipo de aviso MUST poder activarse y desactivarse por separado; las preferencias
  (tipos, "No molestar", "Silenciar hoy") MUST ser de la persona y aplicarse a todos sus dispositivos.
  Un cambio de tipos, horario o "Avisarme antes" MUST regir desde el siguiente aviso no enviado.
- **FR-018**: "Silenciar hoy" MUST impedir los avisos de la noche de hoy y de noches anteriores aún
  pendientes, hasta la noche de mañana, y MUST poder deshacerse. "No molestar" MUST admitir una franja
  de inicio y fin en hora local (puede cruzar medianoche) y MUST comprobarse en el momento del envío;
  un aviso que cae dentro MUST quedar descartado, no aplazado.

**Coexistencia con la app abierta**

- **FR-019**: Si Descanso está abierto y visible en un dispositivo cuando le llega un aviso, ese
  dispositivo MUST mostrarlo solo dentro de la app (aviso silencioso con `role="status"`, como 010-US5,
  o "¿Ya despertaste?" de 010-US3), nunca a la vez como notificación del sistema y como aviso en la
  app. Los demás dispositivos reciben la notificación normal.

**Aviso de prueba (US4)**

- **FR-020**: "Enviarme un aviso de prueba" MUST enviar un aviso al dispositivo actual en menos de
  10 s, sin datos de salud, ignorando "No molestar" y "Silenciar hoy", e informar del resultado; si
  falla, MUST explicar el motivo (permiso retirado, dispositivo caducado) y cómo reactivarlo.
- **FR-021**: El aviso de prueba MUST limitarse a 3 por minuto y persona.

**Privacidad y textos**

- **FR-022**: Ningún aviso fuera de la app MUST contener datos de sueño ni de salud (horas dormidas,
  métricas, notas, origen, rachas) ni mencionar la racha o su pérdida (011, FR-023); los textos son
  exactamente los de FR-008 y el de prueba, y una prueba automática lo vigila junto con la lista de
  términos prohibidos.
- **FR-023**: Descanso MUST NOT usar terceros para programar ni enviar avisos más allá del servicio de
  avisos del propio navegador, y MUST aceptar dispositivos solo de servicios de avisos de navegador
  conocidos.

**Operación**

- **FR-024**: Si el servicio no tiene configuradas sus credenciales de avisos, la feature MUST quedar
  desactivada sin afectar al resto de la app, y el bloque MUST decir "Los avisos no están disponibles".
- **FR-025**: Al rotar esas credenciales, la app MUST detectar que el dispositivo ya no es válido y
  pedir "Vuelve a activar los avisos".
- **FR-026**: La salud de administración MUST informar de la última evaluación, los avisos pendientes,
  descartados y fallidos en 24 h, sin datos personales; la salud pública no cambia.
- **FR-027**: El registro de avisos enviados o descartados MUST borrarse a los 90 días.

**Datos y aislamiento**

- **FR-028**: Las preferencias de avisos MUST incluirse en la exportación; los dispositivos MUST NOT
  exportarse (son credenciales del navegador, no datos de la persona). Todo MUST borrarse con la
  cuenta.
- **FR-029**: Todas las rutas nuevas MUST exigir sesión y protección CSRF, filtrar por usuario (lo
  ajeno → 404) y entrar en la suite de aislamiento de dos usuarios; el esquema solo crece (migración
  aditiva).

### Key Entities *(include if feature involves data)*

- **Dispositivo de avisos** (por persona): la dirección y las claves que da el navegador para
  entregarle avisos, un nombre aproximado, cuándo se activó y el último envío correcto. Único en toda
  la app; como máximo 5 por persona.
- **Entrega de aviso** (por persona): tipo, fecha de la noche, instante previsto (con offset, principio
  III), estado (en envío, enviado, descartado, fallido) y motivo; única por persona, tipo y noche. Se
  conserva 90 días.
- **Preferencias de avisos** (por persona): tipos activos, franja "No molestar" (inicio y fin en
  minutos de reloj de pared) y "Silenciar hoy" (fecha de la noche hasta la que rige).
- **Reutilizadas**: horario versionado, días, "Avisarme antes" y pausas (010); noche abierta y cuándo
  se cerró (006/010); zona horaria del perfil (008); sesión (004).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Con reloj simulado, el 100 % de los avisos de una semana de prueba (con noches que cruzan
  medianoche y los dos cambios de horario en `Europe/Madrid` y `America/Santiago`) se envía a ± 2 min de
  su hora agendada y con la fecha de la noche correcta.
- **SC-002**: 0 avisos duplicados con dos evaluaciones simultáneas sobre los mismos datos y tras
  reiniciar el servicio.
- **SC-003**: 0 avisos enviados fuera de su ventana de descarte; tras 3 min de servicio caído, se envía
  todo lo que sigue en ventana y se descarta el resto.
- **SC-004**: Con 20 personas, una con su dispositivo caducado y otra con uno que no responde, las 18
  restantes reciben su aviso dentro del margen y el dispositivo caducado desaparece de su lista.
- **SC-005**: El aviso de prueba llega en menos de 10 s en un Android real con Chrome cerrado desde
  recientes (spike: ~1,2–1,6 s; tras reiniciar el móvil puede tardar ~15 s, ver Edge Cases) (spike y
  prueba manual) y en la prueba de extremo a extremo con un servicio de avisos simulado.
- **SC-006**: 0 datos de salud y 0 menciones de la racha en los textos de aviso (prueba automática).
- **SC-007**: 0 peticiones de permiso de notificaciones sin pulsar "Activar avisos" (prueba de
  componente y de extremo a extremo).
- **SC-008**: Activar los avisos en un móvil compatible cuesta 2 toques ("Activar avisos" y aceptar el
  permiso).
- **SC-009**: 0 avisos en noches en pausa, días desactivados, con "Silenciar hoy" o dentro de "No
  molestar".
- **SC-010**: La suite de aislamiento de dos usuarios cubre el 100 % de las rutas nuevas.
- **SC-011**: El coste de operación total queda en ≈ 3,3 $/mes, sin terceros de programación, y el
  servicio sigue funcionando en la máquina actual sin ampliar su memoria.

## Assumptions

- **Plataforma**: Android con Chrome (u otro navegador compatible) recibe avisos con la app cerrada y
  sin instalarla; iPhone queda fuera (requiere app instalada, 012 descartada) y ve el estado "no
  compatible" con la alternativa del calendario de 010. El spike previo al plan (2026-10-23, HONOR 400
  con Android 16 y Chrome 155; [`spike/README.md`](spike/README.md)) confirmó la entrega con Chrome
  cerrado (~1,2–1,6 s), la apertura de Noche al tocarlo, la caducidad y el colapso de avisos, el 410
  de un permiso retirado y un pico de 54 MB de memoria del servicio.
- **Límites del sistema del móvil** (spike de 013, sin cambiar el diseño): el margen de ± 2 min
  (FR-009, SC-001) se mide hasta la entrega al servicio de avisos del navegador. Después, el reposo
  profundo de Android (Doze) puede retener el aviso más allá del margen con el móvil quieto y apagado;
  "No molestar" y el ahorro de batería del fabricante pueden silenciarlo o retrasarlo; y tras reiniciar
  el móvil el primer aviso tarda hasta ~15 s. La explicación previa lo advierte. Confirmar el
  comportamiento de Doze en una noche real queda como prueba manual opcional tras implementar.
- **Disparador**: el propio servicio, siempre encendido (decisión del owner, P5b, 2026-09-29); deja de
  apagarse sin tráfico, lo que se registra en el plan (principio VI). No requiere enmienda del
  principio V.
- **Horario de referencia**: la versión de 010 vigente en la fecha de la noche rige sus avisos (la
  guardada hoy rige ya los de esta noche, incluida la parte que cruza medianoche); los avisos ya
  enviados no se recalculan.
- **`wake_check`** usa la misma regla que "¿Ya despertaste?" de 010 (R5): noche abierta cuyo día está
  activo y sin pausa, hora de levantarse agendada + 60 min. El aviso en la app de 010 sigue igual.
- **Silenciar hoy**: "hoy" es la noche cuya fecha es el día actual en la zona del perfil; silencia
  también lo pendiente de noches anteriores (el `wake_check` de esta mañana).
- **No molestar** está desactivado por defecto; la franja puede cruzar medianoche.
- **Coexistencia con el calendario** (aclaración 2026-10-08): los tres tipos vienen activos y
  la explicación previa avisa de que, si importaste el calendario de 010, recibirás dos "prepárate", y
  ofrece desactivar el de Descanso o borrar los eventos del calendario.
- **Coexistencia con la app abierta**: nunca se muestran a la vez la notificación del sistema y el
  aviso en la app en el mismo dispositivo (FR-019).
- **Privacidad** (aclaración 2026-10-08): activar los avisos tras la explicación previa es el
  consentimiento; el contenido viaja cifrado y el servicio del navegador solo conoce cuándo llega un
  aviso.
- **Textos**: los de la entrada; `prepare` usa el valor real de "Avisarme antes" ("en 45 min…").
- Fuera de alcance: iPhone, sonido o vibración configurables, avisos de rachas o logros y de
  marketing, terceros de programación (QStash, OneSignal, ntfy, cron externo), email y SMS, y aplazar
  ("posponer") un aviso.
