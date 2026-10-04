# Spike de 010: alarma y reimportación del calendario

**Objetivo**: comprobar, antes del plan, lo que el archivo de calendario puede prometer en cada
plataforma (spec US2, SC-004).

## 1. Generar los archivos

Elige una hora unos 10 minutos en el futuro (hora de tu móvil) y ejecuta:

```bash
node specs/010-horario-recordatorios/spike/make-spike-ics.mjs --at 21:40 --lead 5
```

Salen `spike-v1.ics` y `spike-v2.ics` en esta carpeta (git los ignora):
- **v1**: un evento semanal por día a esa hora, con alarma 5 min antes.
- **v2**: los mismos eventos, 15 min más tarde y con el miércoles cancelado.

Pásalos al móvil por correo, Drive o cable. No contienen datos de salud.

## 2. Probar en cada calendario

| Paso | Qué hacer | Qué anotar |
|------|-----------|------------|
| A | Importar `spike-v1.ics` | ¿Cuántos eventos aparecen? ¿A la hora correcta? |
| B | Esperar a la hora − 5 min | ¿Suena o vibra la alarma con la pantalla bloqueada? ¿Qué texto muestra? |
| C | Tocar la notificación o el evento | ¿Se abre algo? ¿El enlace `descanso-sleep.fly.dev` es pulsable? |
| D | Importar `spike-v2.ics` | ¿Se **actualizan** los eventos (15 min más tarde) o se **duplican**? ¿Desaparece el miércoles? |

**Cómo importar en cada calendario:**
- **Google Calendar (web, desde el ordenador):** Configuración → Importar y exportar → Importar, y
  elegir el calendario. Comprueba la alarma en el móvil, con la app de Google Calendar.
- **Calendario del fabricante (Android, p. ej. Samsung, Huawei o Xiaomi):** abrir el `.ics` desde
  Archivos o el correo → "Abrir con" el calendario.
- **iPhone (Apple Calendar):** abrir el `.ics` desde Mail o Archivos → "Añadir todo".

## 3. Resultados

### 3.1 Emulador Android (2026-10-04, ejecutado por Claude con autorización)

Entorno: emulador oficial, Pixel 7, **Android 15 (API 35, imagen Google Play)**, zona
`America/La_Paz`. Sin cuenta de Google. Calendario local "Descanso-prueba" (cuenta `LOCAL`), creado
con Etar. Archivos validados antes con `validate-ics.py` (RFC 5545: OK). Evidencias (capturas,
consultas al proveedor de calendario y `dumpsys`) en [`evidence/`](evidence/).

| Calendario | A: eventos v1 | B: ¿suena? | C: ¿abre la app? | D: v2 ¿actualiza o duplica? ¿miércoles? | Notas |
|------------|---------------|------------|------------------|------------------------------------------|-------|
| **Google Calendar app** (`com.google.android.calendar`, sin cuenta, en calendario local) | ✅ "ICS file → **ADD ALL**": los 7 eventos semanales, duración de 15 min correcta (19–23) | ❌ **descarta la alarma**: `hasAlarm=0`, ningún recordatorio (28) | — (no hay alarma que tocar) | ✅ **actualiza**: mismas filas, título y hora de v2; el **miércoles cancelado se borra**; 7 → 6 eventos, sin duplicar (24–26). Guarda `iCalUid` y `sequenceNumber` del archivo en propiedades extendidas (27) | Confirma el diseño UID estable + SEQUENCE. La entrada de la feature suponía que Google Calendar no importa desde la app: **en Android 15 sí** importa |
| **Etar 1.0.57** (calendario AOSP sobre el proveedor de Android, como los de fabricante) | ⚠️ abre el **editor de un solo evento** (el primero, domingo); no "añadir todo" (06–08) | ✅ **suena**: notificación de prioridad alta con sonido a la hora del recordatorio (10, 11). ⚠️ pero **ignora el `TRIGGER` del archivo**: usa su valor por defecto (10 min); su lista empieza en 10 min (15, 20, 25, 30, 45, 60 disponibles) | ⚠️ tocar la notificación abre el **detalle del evento**; la URL es un enlace que abre `descanso-sleep.fly.dev` en el navegador: **2 toques** (12–14) | ❌ **duplica**: descarta el UID (`uid2445=NULL`) y crea otro evento (15, 16) | Necesita el permiso de Android 14+ "Alarmas y recordatorios" (`SCHEDULE_EXACT_ALARM`) para avisar a la hora exacta (03). Ignora `DURATION` (pone 1 h) |

Hallazgos transversales:
- **Hora flotante**: los dos calendarios la interpretan en la hora local del dispositivo (Bolivia GMT-4), como se quería.
- **Modo descanso de Android**: la regla "Sleeping" de No molestar bloquea `reminders` y `events` (10-notificaciones.txt). Si la persona activa el modo descanso **antes** de la hora del aviso, la alarma del calendario no sonará. La guía debe decirlo.

### 3.2 Google Calendar app con cuenta de Google (calendario sincronizado "Descanso-spike")

Con autorización de la persona usuaria, se usó un calendario secundario creado solo para la prueba.
Las evidencias con datos de la cuenta (capturas tras iniciar sesión) quedan fuera del repositorio
(`evidence/privado/`); se versionan solo los volcados filtrados a ese calendario (40–44, 48, 49.txt).

| Paso | Resultado |
|------|-----------|
| A: v1 | ✅ "ADD ALL" → 7 eventos sincronizados con Google (el servidor añade `WKST=MO`) (41) |
| B: alarma del archivo | ❌ el `VALARM` se descarta (`hasAlarm=0`); a la hora prevista no hubo aviso (42) |
| B': con **notificación por defecto** del calendario (15 min) | ✅ los eventos importados reciben **la notificación por defecto del calendario, no la del archivo** (15, no 7) (48) y **suena** a su hora (49) |
| C: tocar | ⚠️ Google **descarta la propiedad `URL`** (descripción vacía): no hay enlace a Descanso |
| D: v2 | ✅ **actualiza** (mismas filas, hora nueva) y **borra el miércoles cancelado**: 7 → 6, sin duplicar (44) |

### 3.3 Conclusiones para el plan y la guía

1. **UID estable + SEQUENCE + `STATUS:CANCELLED` funcionan** en Google Calendar (app, con y sin cuenta). Se mantiene el diseño.
2. **La alarma no la controla el archivo en Google Calendar**: la guía de Android debe pedir crear un
   calendario "Descanso" con **notificación por defecto = "Avisarme antes"** *antes* de importar (o
   importar en uno que ya la tenga). En Etar y calendarios AOSP se usa su recordatorio por defecto.
3. **Poner el enlace también en `DESCRIPTION`** (`Abrir Descanso: https://descanso-sleep.fly.dev/`):
   Google descarta `URL`. Tocar el aviso abre el evento; el enlace lleva a la app (2 toques, no 1:
   ajustar FR-010/US2-8).
4. **Google Calendar importa `.ics` desde la app en Android 15**: la guía de Android lo ofrece primero.
5. Avisar en la guía del **modo descanso / No molestar** y, en calendarios no Google, del permiso
   "Alarmas y recordatorios".

### 3.4 Pendiente

| Calendario | Estado |
|------------|--------|
| Google Calendar **web** (Importar) | Sin probar: el Chrome del emulador está desactualizado y la web no carga; actualizarlo en Play Store o probar desde un PC |
| Apple Calendar (iPhone) | No se puede emular en Windows: guía "no verificada" salvo prueba manual |
| Limpieza | Borrar el calendario "Descanso-spike" de la cuenta (calendar.google.com → Configuración → Descanso-spike → Eliminar calendario) y quitar la cuenta del emulador |

Cuando los tengas, pásamelos (basta con el texto de la tabla) y sigo con el plan. Si una
plataforma duplica o no suena, la guía de 010 lo dirá y ofrecerá la alternativa (borrar los
anteriores o crear una alarma recurrente en el reloj).

Al terminar, borra del calendario los eventos de prueba.
