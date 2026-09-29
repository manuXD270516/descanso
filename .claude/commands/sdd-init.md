---
description: Inicializa Spec Kit en el repo y redacta la constitución del proyecto
argument-hint: [ruta-a-constitucion.md, por defecto docs/sdd/constitution.md]
allowed-tools: Bash(bash scripts/sdd-bootstrap.sh), Bash(git *), Bash(specify *), Read, Write, Edit, Glob, Skill
---

Estado actual del repo:
!`git status --short 2>/dev/null | head -20 || echo "sin git"`
!`ls .specify 2>/dev/null || echo "spec-kit no inicializado"`

## Pasos

1. Si `.specify/` no existe, ejecuta `bash scripts/sdd-bootstrap.sh` y muestra el resultado.
2. Lee el archivo de principios: @${ARGUMENTS:-docs/sdd/constitution.md}
3. Invoca la skill `speckit-constitution` pasándole ese contenido íntegro como argumento.
4. Verifica que `.specify/memory/constitution.md` quedó escrito, sin placeholders `[...]` pendientes. Si quedan, complétalos con la información del archivo de principios, sin inventar reglas nuevas.
5. Haz commit: `docs(sdd): constitución v1.0.0`.
6. Termina con un resumen de 5 líneas: qué principios quedaron y qué comando sigue (`/sdd-feature`).

No modifiques código de la aplicación en este comando.
