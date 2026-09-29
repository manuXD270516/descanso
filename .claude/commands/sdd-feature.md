---
description: Ejecuta specify → clarify → plan → tasks → analyze para una feature descrita en un archivo
argument-hint: <ruta-a-feature.md> [--auto]
allowed-tools: Bash(git *), Bash(.specify/scripts/bash/*), Bash(ls *), Bash(cat *), Read, Write, Edit, Glob, Grep, Skill, AskUserQuestion
---

Argumentos: $ARGUMENTS
Constitución vigente: @.specify/memory/constitution.md

Toma la ruta del primer argumento como archivo de la feature y léelo. Si aparece `--auto`, el modo es automático.

## Secuencia

Ejecuta cada paso invocando la skill de Spec Kit correspondiente y **no avances al siguiente hasta verificar el artefacto en disco**. Al terminar cada paso escribe una línea `✔ <paso> → <archivo>`.

1. `speckit-specify` con el contenido íntegro del archivo de la feature como argumento. Verifica que existe `specs/<nnn>-*/spec.md` y que se creó la rama.
2. `speckit-clarify`.
   - Modo normal: deja que la skill me pregunte; respondo yo.
   - Modo `--auto`: responde cada pregunta con la opción más simple compatible con la constitución y anota cada supuesto en una sección `## Assumptions (auto-clarify)` al final de `spec.md`.
3. `speckit-plan`. Si el archivo de la feature contiene una sección `## Contexto técnico`, pásala como argumento del plan. Verifica `plan.md`, `research.md`, `data-model.md` y `contracts/`.
4. `speckit-tasks`. Verifica `tasks.md`.
5. `speckit-analyze`. Si reporta hallazgos CRITICAL, corrígelos en los artefactos (no en código) y vuelve a ejecutar `speckit-analyze` una sola vez.
6. Revisión de sobre-ingeniería: cruza `tasks.md` con la constitución y con `spec.md`; elimina o simplifica tareas que no respalde ningún requisito, y lista en el resumen final qué quitaste y por qué.
7. Commit en la rama de la feature: `docs(sdd): spec, plan y tareas de <nnn>-<nombre>`.

## Cierre

Resumen final con: número de historias, número de tareas (y cuántas en paralelo `[P]`), supuestos pendientes, y la instrucción exacta para continuar: `/sdd-ship <nnn>`.

**No implementes código en este comando.** La implementación se hace con `/sdd-ship` para que pueda revisar el plan antes.
