# Quickstart: validar la feature 010

## 1. Puertas automáticas

```bash
cd backend && npm test && npm run lint
cd frontend && npx ng lint && npx ng test --watch=false --browsers=ChromeHeadless && npx ng build
cd e2e && npm test
```

Incluyen:
- `migrations-009.test.js` y `compat-previous-010.test.js` (código de 006 sobre el esquema nuevo);
- `ics.test.js`: archivos de referencia v1 y v2, CRLF, plegado, UID y SEQUENCE, cancelados, sin
  datos de salud y enlace en `DESCRIPTION`;
- `schedule.test.js`: versiones, vigente por fecha, 400, `.ics` y aislamiento;
- `pauses.test.js`: las 4 reglas, 409, terminar hoy y cancelar;
- `diary`/`sleep`: `wake_logged_at` y `from_proposal`;
- specs de frontend: editor, bienvenida, guía por plataforma, regla de "¿Ya despertaste?", origen
  "Anotado después" y aviso con la app abierta;
- e2e `horario.spec.ts`.

## 2. Archivo de calendario contra el validador del spike

```bash
curl -s -b <cookie> "http://localhost:3995/api/schedule.ics?today=AAAA-MM-DD" -o v1.ics
python specs/010-horario-recordatorios/spike/validate-ics.py v1.ics v2.ics
```

Tras cambiar el horario y descargar v2: mismos UID, SEQUENCE creciente y días quitados cancelados.

## 3. Compatibilidad

Imagen de master (006) sobre una base migrada por 010: entrar, noche, despertar, perfil y exportar sin
errores (ensayo en Docker, como en 006).

## 4. Verificación local y manual

```bash
node scripts/smoke-local.mjs run          # incluye las comprobaciones de 010
node scripts/smoke-local.mjs serve --build --fresh
```

1. Bienvenida: objetivo 7 h 30 → levantarse 7:00 → propone 23:15 → "Distinto el fin de semana",
   9:00 → 1:15 → guardar.
2. Cuenta → Mi horario: el horario, "Avisarme antes" (30), "Añadir a mi calendario" (descarga) y la
   guía de Android primero (con notificación por defecto del calendario y aviso de No molestar).
3. Con una noche abierta y la hora de levantarse + 61 min (`setNow` o sembrado): "¿Ya despertaste?"
   con la hora agendada; confirmar → la noche queda "Anotado después".
4. Pausa de 5 días desde hoy → sin avisos; una de 15 días → error.
5. Con la app abierta a la hora de acostarse − aviso: "En 30 min es tu hora de dormir".
