#!/usr/bin/env bash
# Corre el flujo completo sin abrir la UI: bootstrap + constitución + N features.
# Uso: scripts/sdd-headless.sh docs/sdd/features/001-linea-base.md [docs/sdd/features/002-*.md ...]
# Requiere claude CLI autenticado. clarify corre en modo --auto (supuestos quedan en spec.md).
set -euo pipefail
FLAGS=(--permission-mode acceptEdits --output-format text)

[ -d .specify ] || claude -p "/sdd-init docs/sdd/constitution.md" "${FLAGS[@]}"

for feature in "$@"; do
  echo "=== $feature ==="
  claude -p "/sdd-feature $feature --auto" "${FLAGS[@]}"
  nnn=$(git branch --show-current | cut -d- -f1)
  claude -p "/sdd-ship $nnn" "${FLAGS[@]}"
  git checkout -q main
done
