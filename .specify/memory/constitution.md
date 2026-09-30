# Descanso Constitution

## Core Principles

### I. Stack fijo

- Backend: Node.js 22 LTS + Express 5 + SQLite mediante better-sqlite3.
- Frontend: Angular 20 con componentes standalone y signals.
- NO se introducen ORMs, frameworks de estado ni librerías de UI salvo que el plan lo justifique
  explícitamente.

**Razón**: un stack acotado mantiene el proyecto mono-usuario pequeño, predecible y fácil de
mantener.

### II. Persistencia segura

- Los datos viven en un único archivo SQLite, ubicado por la variable `DB_PATH`.
- Todo cambio de esquema MUST hacerse con migraciones versionadas e idempotentes, aplicadas por el
  runner de migraciones, que guarda un respaldo previo.
- NUNCA se hace DROP de datos del usuario.
  - Aclaración: reconstruir una tabla dentro de una misma migración (crear la tabla nueva, copiar
    las filas, verificar recuentos y contenido, y solo entonces sustituir la antigua; patrón de
    12 pasos de SQLite) no es un DROP de datos, siempre que la verificación preceda a la
    sustitución y la migración sea atómica.

**Razón**: los registros de sueño son historia personal irrecuperable; las migraciones
repetibles evitan pérdidas y estados inconsistentes.

### III. Reglas de tiempo (NON-NEGOTIABLE)

- Las horas se guardan en ISO 8601 con offset.
- La "fecha de la noche" es el día en que la persona se acuesta.
- Esta regla MUST tener pruebas explícitas.

**Razón**: las noches cruzan la medianoche y las zonas horarias; sin una regla única y probada,
las métricas se asignan al día equivocado.

### IV. Calidad antes de terminar

- Ninguna tarea se da por terminada sin tests unitarios en backend (rutas y cálculos) y pruebas
  de componente en frontend.
- El lint MUST pasar sin errores.
- El build de producción MUST pasar en CI.

**Razón**: las puertas automáticas son la única garantía verificable de que una feature funciona.

### V. Despliegue como un solo servicio

- Express sirve la API y el build de Angular desde un único servicio.
- Imagen Docker multi-stage.
- Healthcheck en `/api/health`.
- Volumen persistente para la base de datos.
- Ningún secreto en el repositorio.

**Razón**: un único artefacto desplegable simplifica la operación y protege los datos y las
credenciales.

### VI. Simplicidad

- Cada feature entrega el mínimo que cumple su spec.
- Toda complejidad adicional MUST registrarse en la sección "Complexity Tracking" del plan, con
  su justificación.

**Razón**: YAGNI; la complejidad no justificada es deuda para un proyecto personal.

### VII. UX accesible en español

- La interfaz está en español.
- MUST ser responsive.
- El foco del teclado MUST ser visible.
- Se respeta `prefers-reduced-motion`.

**Razón**: la app se usa a diario desde distintos dispositivos, a menudo de noche y con poca
atención; debe ser clara y accesible.

## Alcance del producto

"Descanso" es un tracker personal de sueño, siestas y métricas, mono-usuario. El repositorio
contiene un MVP funcional en `backend/` y `frontend/`, que es la línea base sobre la que se
especifican las nuevas features.

## Flujo de trabajo y puertas de calidad

- Cada plan MUST verificar el cumplimiento de los principios I–VII antes de implementarse.
- Las desviaciones se documentan en "Complexity Tracking" (principio VI).
- Una tarea solo se cierra cuando se cumplen las puertas del principio IV.

## Governance

- Esta constitución prevalece sobre cualquier plan, spec o práctica del proyecto.
- Toda modificación se versiona y se documenta.
- Versionado semántico:
  - MAJOR: se elimina o redefine un principio de forma incompatible.
  - MINOR: se añade un principio o sección, o se amplía materialmente una guía.
  - PATCH: aclaraciones y cambios de redacción sin efecto semántico.
- Las revisiones de planes y PRs MUST comprobar el cumplimiento de esta constitución.

### Historial de enmiendas

| Versión | Fecha | Tipo | Cambio |
|---------|-------|------|--------|
| 1.0.1 | 2026-09-30 | PATCH | Principio II: toda migración pasa por el runner con respaldo previo (feature 003); reconstruir una tabla con copia verificada en la misma migración no es DROP de datos. Necesaria antes del plan de 004. |

**Version**: 1.0.1 | **Ratified**: 2026-09-29 | **Last Amended**: 2026-09-30
