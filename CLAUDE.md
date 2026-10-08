<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/011-rachas-constancia/plan.md
<!-- SPECKIT END -->

## Modelos por tipo de trabajo

- Diseño, specs, ADRs, decisiones y preguntas al owner → agente `arquitecto` (Claude Opus 5.5,
  `claude-opus-5-5`).
- Implementación, tests, archivado y cierre de PRs → agente `implementador` (Claude Sonnet 5.5,
  `claude-sonnet-5-5`).
- La sesión principal orquesta: reparte el trabajo, revisa diffs, resuelve conflictos e integra.
- Si una tarea mezcla ambos, primero `arquitecto` (spec y decisiones) y después `implementador`.
- Para cambiar de versión de modelo en el futuro, se actualiza el `model:` de ambos agentes y esta
  sección en el mismo PR.
