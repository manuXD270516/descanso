# Principios del proyecto "Descanso"

Tracker personal de sueño, siestas y métricas, mono-usuario, con un MVP funcional en el repo (backend/ y frontend/).

1. Stack fijo: Node.js 22 LTS + Express 5 + SQLite (better-sqlite3) en backend; Angular 20 standalone + signals en frontend. No introducir ORMs, frameworks de estado ni librerías de UI sin justificarlo en el plan.
2. Persistencia: SQLite en archivo único (DB_PATH). Todo cambio de esquema se hace con migraciones versionadas e idempotentes; nunca DROP de datos del usuario.
3. Tiempo: las horas se guardan en ISO 8601 con offset y la "fecha de la noche" es el día en que la persona se acuesta. Esta regla se prueba explícitamente.
4. Calidad: tests unitarios en backend (rutas y cálculos) y pruebas de componente en frontend antes de dar una tarea por terminada; lint sin errores; el build de producción debe pasar en CI.
5. Despliegue: un solo servicio (Express sirve la API y el build de Angular), imagen Docker multi-stage, healthcheck en /api/health, volumen persistente para la base. Ningún secreto en el repo.
6. Simplicidad: cada feature entrega el mínimo que cumple la spec; complejidad adicional se marca como "Complexity Tracking" y se justifica.
7. UX: interfaz en español, responsive, con foco visible y respeto a prefers-reduced-motion.
8. Gobernanza: la constitución prevalece sobre cualquier plan; los cambios se versionan y se documentan.
