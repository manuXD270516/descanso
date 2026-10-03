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

## 3. Resultados (rellenar)

| Calendario | A: eventos v1 | B: ¿suena? | C: ¿abre la app? | D: v2 ¿actualiza o duplica? ¿miércoles? | Notas |
|------------|---------------|------------|------------------|------------------------------------------|-------|
| Google Calendar web + app Android | | | | | |
| Calendario del fabricante (¿cuál?) | | | | | |
| Apple Calendar (iPhone, iOS ¿versión?) | | | | | |

Cuando los tengas, pásamelos (basta con el texto de la tabla) y sigo con el plan. Si una
plataforma duplica o no suena, la guía de 010 lo dirá y ofrecerá la alternativa (borrar los
anteriores o crear una alarma recurrente en el reloj).

Al terminar, borra del calendario los eventos de prueba.
