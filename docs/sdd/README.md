# Flujo SDD automatizado

| Comando | Qué hace | Cuándo pide tu intervención |
|---|---|---|
| `/sdd-init [constitucion.md]` | Bootstrap de Spec Kit + constitución | Nunca (solo permisos) |
| `/sdd-feature <feature.md> [--auto]` | specify → clarify → plan → tasks → analyze + revisión de sobre-ingeniería | En `clarify`, salvo `--auto` |
| `/sdd-ship [nnn]` | implement → tests → build → verificación → commit → PR | Si fallan tests tras 3 intentos |

Arranque completo dentro de Claude Code:

```
/sdd-init
/sdd-feature docs/sdd/features/001-linea-base.md
/sdd-ship 001
/sdd-feature docs/sdd/features/002-pipeline-ci-cd.md
/sdd-ship 002
```

Sin UI: `scripts/sdd-headless.sh docs/sdd/features/001-linea-base.md docs/sdd/features/002-pipeline-ci-cd.md`

Para una feature nueva basta crear `docs/sdd/features/<nnn>-<nombre>.md` con la descripción funcional y, opcionalmente, una sección `## Contexto técnico` que `/sdd-feature` pasa al plan.
