# Feature 001 – Línea base del tracker de descanso

Documenta como especificación el producto existente, sin cambiar comportamiento:

- Registrar la hora de dormir de hoy con un solo gesto y cerrar la noche al día siguiente con la hora de despertar; solo puede existir una noche abierta a la vez.
- Registrar y editar noches pasadas (dormir, despertar, notas) y eliminarlas.
- Registrar siestas con hora de inicio y fin, ver su duración y agruparlas por día (últimos 30 días).
- Ver promedios de los últimos 14 días: duración media por noche, hora media de dormir, hora media de despertar y total de siestas; ver una cinta visual noche por noche con sueño y siestas sobre un eje de 24 h.
- Métricas customizables desde un panel: crear/editar/archivar/eliminar/reordenar métricas de tipo escala (mín–máx), número (con unidad opcional), sí/no o texto, con color; registrar un valor por métrica y día, navegar entre días y ver historial de 7 días.
- Los datos persisten entre reinicios y sesiones.

Criterios de aceptación medibles por cada historia. Marca [NEEDS CLARIFICATION] lo ambiguo.

## Contexto técnico

Usa el código actual como implementación de referencia: backend/src (Express 5, better-sqlite3, rutas sleep/naps/metrics/stats) y frontend/src/app (App con tabs, NightComponent, NapsComponent, MetricsComponent, ApiService, core/time.ts). El plan debe extraer el data-model desde db.js, generar contracts/openapi.yaml a partir de las rutas existentes y proponer la estructura de tests (node:test + supertest en backend; Angular TestBed en frontend) sin reescribir la app. Identifica deuda técnica visible pero no la corrijas aquí; regístrala en research.md.
