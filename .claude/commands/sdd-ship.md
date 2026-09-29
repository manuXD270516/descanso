---
description: Implementa la feature activa, corre tests y build, y deja el PR listo
argument-hint: [<nnn> número de feature; por defecto la de la rama actual]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Skill
---

Feature: ${ARGUMENTS:-la de la rama actual}
Rama actual: !`git branch --show-current`
Tareas pendientes:
!`f=$(ls -d specs/${ARGUMENTS:-$(git branch --show-current | cut -d- -f1)}-* 2>/dev/null | head -1); [ -n "$f" ] && grep -c '^- \[ \]' "$f/tasks.md" || echo "tasks.md no encontrado"`

## Secuencia

1. Si la rama actual no corresponde a la feature indicada, haz `git checkout <rama-de-la-feature>`.
2. Invoca `speckit-implement`. Deja que ejecute las tareas por fases y marque `[X]` en `tasks.md`.
3. Puerta de calidad (obligatoria, según constitución):
   - `cd backend && npm ci && npm test`
   - `cd frontend && npm ci && npx ng lint --if-present && npx ng test --watch=false --browsers=ChromeHeadless && npx ng build`
   Si algo falla, corrígelo y repite. Máximo 3 iteraciones; si no pasa, detente y reporta el error exacto.
4. Verificación manual mínima: arranca el backend con `DB_PATH=/tmp/sdd-check.db PORT=3999 node src/server.js &`, comprueba `curl -sf localhost:3999/api/health`, ejecuta un caso feliz por cada historia de `spec.md` con `curl`, y mata el proceso.
5. Commit por fase o al final: `feat(<nnn>): <título de la feature>`, con el cuerpo listando las historias cubiertas.
6. Si `gh` está disponible: `git push -u origin HEAD` y `gh pr create --fill --base main`, con un cuerpo que enlace `specs/<nnn>-*/spec.md` y resuma la verificación del paso 4.

## Cierre

Reporta: tareas completadas / totales, resultado de tests y build, URL del PR (o el comando para crearlo si `gh` no está), y deuda registrada en `research.md` que quedó fuera.
