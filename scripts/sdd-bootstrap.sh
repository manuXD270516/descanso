#!/usr/bin/env bash
# Prepara el repo para Spec-Driven Development con GitHub Spec Kit + Claude Code.
# Idempotente: se puede volver a ejecutar sin romper nada.
set -euo pipefail

command -v uv >/dev/null || { echo "Instalando uv..."; curl -LsSf https://astral.sh/uv/install.sh | sh; export PATH="$HOME/.local/bin:$PATH"; }
command -v specify >/dev/null || uv tool install specify-cli

if [ ! -d .git ]; then
  git init -q
  git add -A
  git commit -qm "chore: línea base del proyecto"
fi

if [ ! -d .specify ]; then
  specify init --here --force --non-interactive --integration claude --script sh
  specify extension add git            # ramas por feature
  specify extension add agent-context  # mantiene CLAUDE.md sincronizado con el plan
fi

specify check
git add -A && git commit -qm "chore: spec-kit inicializado" || true
echo "Listo. Skills disponibles: $(ls .claude/skills | grep speckit | tr '\n' ' ')"
