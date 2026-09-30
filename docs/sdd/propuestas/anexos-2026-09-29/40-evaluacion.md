# Evaluación independiente (evaluator-optimizer) — rondas 1 y 2

Rúbrica: [00-rubrica.md](00-rubrica.md). El evaluador no participó en la investigación ni en el debate. Contrastó la v1 con los documentos A–D, los tres debates, la constitución 1.0.0 y el código (`db.js`, `app.js`, `fly.toml`).

## Ronda 1 (sobre [30-reflexion-v1.md](30-reflexion-v1.md))

Pesos: C1 valor 25 %, C2 factibilidad 20 % (O), C3 constitución 20 % (O), C4 privacidad 15 % (O), C5 esfuerzo 10 %, C6 testabilidad 10 %. (O) marca los criterios obligatorios.

| Feature | C1 | C2 | C3 | C4 | C5 | C6 | Ponderada | Veredicto |
|---------|----|----|----|----|----|----|-----------|-----------|
| 003 | 3 | 5 | 5 | 4 | 4 | 5 | 4,25 | Aprobada (correcciones menores) |
| 004 | 4 | 3 | 4 | 4 | 3 | 4 | 3,70 | Requiere revisión: rompía el rollback (R1) |
| 005 | 5 | 5 | 5 | 4 | 4 | 4 | 4,65 | Aprobada |
| 006 | 3 | 5 | 4 | 5 | 5 | 4 | 4,20 | Aprobada (correcciones menores) |
| 007 | 4 | 3 | 3 | 4 | 2 | 3 | 3,30 | Requiere revisión |

### Revisiones exigidas

- **V-01, 004**: `user_id NOT NULL` rompe expand/contract y el rollback automático. Se pide `NOT NULL DEFAULT <propietario>` y un humo de la versión N−1.
- **V-02, 004**:
  - hay que definir cómo se consume `OWNER_SETUP_TOKEN`;
  - falta la recuperación del propietario.
- **V-03, 004**: el criterio "reimportar" presupone un importador que no existe.
- **V-04, 004**: la excepción CSRF para webhooks es prematura, porque no llegan hasta 009.
- **V-05, 003**: el índice único falla si la base ya tiene datos que lo violan. Se pide una verificación previa que aborte limpio.
- **V-06, 003**:
  - la alerta de volumen al 70 % no aparecía;
  - "fuera de alcance: cambios visibles" choca con DT-11.
- **V-07, 005**: queda por decidir si las siestas cuentan en el objetivo, si varias noches de una misma fecha se suman y si la noche en curso debe distinguirse de un hueco.
- **V-08, 006**:
  - "70–120 min" no tiene fuente; la fuente abierta dice 70–110;
  - falta el texto de "sin beneficio demostrado";
  - no se decide dónde se guardan los ajustes.
- **V-09, 006**:
  - los chips guardan rangos pero las columnas son enteras;
  - hay un enlace a 007 aunque 007 podría no existir;
  - la "hora propuesta" no está definida.
- **V-10, 007**: falta el spike con un export real, las librerías nombradas, Complexity Tracking, la desactivación del DTD y un tamaño máximo.
- **V-11, 007**: falta un criterio de memoria medible en Chromium y en Safari iOS.
- **V-12, 007**: las muestras fragmentadas del iPhone y del Watch deben agruparse en sesiones y deduplicarse.
- **V-13, enmiendas**: separar PATCH de MINOR y fijar un calendario respecto a los planes.

### Revisiones transversales

- Las notas de 008/009 omitían X4, UX-08, UX-12, R4 y R7.
- Faltaba la **matriz de factibilidad de wearables**, que era lo pedido.
- Multiusuario debía presentarse como "paso 1 / paso 2", no como descartado.
- Se había perdido la pregunta "¿estimado o medido?" sobre el REM.

## Ronda 2 (sobre la v2 en el repo)

- Todas las revisiones quedaron resueltas.
- V-10 quedó parcial y se completó con un criterio de salida del spike.
- Al revisar las entradas se detectaron tres correcciones más, que se aplicaron:
  - prioridades en cada historia;
  - regla de conciliación en 007, porque "usar el reloj" nunca debe borrar lo anotado;
  - en 004, rotación de sesiones al rotar el secreto y entrada del token por formulario, nunca en la URL.

| Feature | Ronda 1 | Ronda 2 | Veredicto |
|---------|---------|---------|-----------|
| 003 | 4,25 | 4,25 | Aprobada |
| 004 | 3,70 | 4,00 | Aprobada |
| 005 | 4,65 | 4,65 | Aprobada |
| 006 | 4,20 | 4,20 | Aprobada |
| 007 | 3,30 | 3,90 | Aprobada (condicionada a P2 y al spike) |
| 008 / 009 | — | — | Semillas bien condicionadas |

Veredicto global: **lista para presentar al usuario**.
