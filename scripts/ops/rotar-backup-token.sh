#!/usr/bin/env bash
# Genera un BACKUP_TOKEN nuevo, lo carga en Fly y en GitHub y comprueba que la app lo acepta.
#
# Pasos trazados (consola + log con marca de tiempo):
#   1. requisitos: fly/flyctl, gh, curl y openssl instalados y con sesión iniciada
#   2. genera 32 bytes aleatorios en hexadecimal (openssl rand -hex 32)
#   3. Fly:    `fly secrets import` (reinicia la máquina para aplicarlo; reintenta si el host no
#              tiene capacidad)
#   4. GitHub: `gh secret set --env-file -`
#   5. verifica GET /api/admin/backup con el token (reintenta mientras la máquina arranca)
#      y comprueba que la copia descargada es un SQLite
# El token nunca se imprime ni se pasa como argumento (no aparece en `ps`): va por stdin.
# No usa `set -x` a propósito, porque mostraría el token.
# Si falla a mitad, vuelve a ejecutarlo: genera otro token y deja ambos lados iguales.
#
# Uso: scripts/ops/rotar-backup-token.sh
# Variables opcionales: APP, REPO, URL, VERIFY_TIMEOUT_SEC, FLY_ATTEMPTS, FLY_RETRY_DELAY_SEC
set -euo pipefail

APP="${APP:-descanso-sleep}"
REPO="${REPO:-manuXD270516/descanso}"
URL="${URL:-https://descanso-sleep.fly.dev}"
VERIFY_TIMEOUT_SEC="${VERIFY_TIMEOUT_SEC:-90}"
FLY_ATTEMPTS="${FLY_ATTEMPTS:-4}"
FLY_RETRY_DELAY_SEC="${FLY_RETRY_DELAY_SEC:-30}"

stamp="$(date +%Y%m%d-%H%M%S)"
tmp="${TMPDIR:-/tmp}"
LOG_FILE="$tmp/rotar-backup-token-$stamp.log"
CHECK_FILE="$tmp/descanso-check-$stamp.db"
token=""

log() {
  local level="$1"; shift
  printf '%s [%s] %s\n' "$(date +%Y-%m-%dT%H:%M:%S%z)" "$level" "$*" | tee -a "$LOG_FILE"
}
step() { log INFO "── $*"; }
fail() { log ERROR "$*"; log ERROR "Rotación incompleta. Detalle en $LOG_FILE"; exit 1; }

cleanup() {
  if [[ -f "$CHECK_FILE" ]]; then rm -f "$CHECK_FILE"; log INFO 'Copia de prueba borrada'; fi
  token=""
}
trap cleanup EXIT

log INFO "Rotación de BACKUP_TOKEN · app=$APP · repo=$REPO · url=$URL"
log INFO "Log: $LOG_FILE"

step '1/5 Requisitos'
if command -v fly >/dev/null 2>&1; then FLY=fly
elif command -v flyctl >/dev/null 2>&1; then FLY=flyctl
else fail 'No se encontró fly/flyctl en el PATH.'; fi
for cmd in gh curl openssl; do
  command -v "$cmd" >/dev/null 2>&1 || fail "No se encontró $cmd en el PATH."
done
fly_user="$("$FLY" auth whoami 2>/dev/null)" || fail 'fly no tiene sesión: ejecuta `fly auth login`.'
log OK "fly: $(command -v "$FLY") · sesión de $fly_user"
gh auth status --hostname github.com >/dev/null 2>&1 || fail 'gh no tiene sesión: ejecuta `gh auth login`.'
log OK 'gh: sesión activa'

step '2/5 Generar token'
token="$(openssl rand -hex 32)"
log OK "Token generado (${#token} caracteres hex; no se muestra)"

step "3/5 Cargar en Fly ($APP) · reinicia la máquina"
# Si el host no tiene capacidad para reiniciar la máquina, Fly deja el secreto en "Staged" y suele
# migrarla a otro host: se reintenta con el mismo token para que Fly y GitHub no queden distintos.
attempt=1
while :; do
  rc=0
  out="$(printf 'BACKUP_TOKEN=%s\n' "$token" | "$FLY" secrets import --app "$APP" 2>&1)" || rc=$?
  while IFS= read -r l; do log INFO "  fly: $l"; done <<<"$out"
  (( rc == 0 )) && break
  (( attempt >= FLY_ATTEMPTS )) && fail "fly secrets import falló $attempt veces: el token nuevo puede quedar como Staged en Fly, GitHub no cambió y la app sigue con el anterior. Vuelve a ejecutar el script."
  log WARN "Intento $attempt de $FLY_ATTEMPTS falló; reintento en $FLY_RETRY_DELAY_SEC s con el mismo token"
  sleep "$FLY_RETRY_DELAY_SEC"
  attempt=$((attempt + 1))
done
log OK 'Fly actualizado'

step "4/5 Cargar en GitHub ($REPO)"
if ! out="$(printf 'BACKUP_TOKEN=%s\n' "$token" | gh secret set --env-file - --repo "$REPO" 2>&1)"; then
  while IFS= read -r l; do log INFO "  gh: $l"; done <<<"$out"
  fail 'gh secret set falló: Fly ya tiene el token nuevo y GitHub no. Vuelve a ejecutar el script.'
fi
while IFS= read -r l; do log INFO "  gh: $l"; done <<<"$out"
log OK 'GitHub actualizado'

step "5/5 Verificar $URL/api/admin/backup"
deadline=$(( $(date +%s) + VERIFY_TIMEOUT_SEC ))
attempt=0
code=""
while :; do
  attempt=$((attempt + 1))
  code="$(printf 'Authorization: Bearer %s\n' "$token" \
    | curl -s -o "$CHECK_FILE" -w '%{http_code}' -H @- --max-time 30 "$URL/api/admin/backup" || true)"
  log INFO "  intento $attempt → HTTP $code"
  [[ "$code" == "200" ]] && break
  (( $(date +%s) >= deadline )) && break
  sleep 6
done
[[ "$code" == "200" ]] || fail "La app no aceptó el token (último HTTP $code tras $attempt intentos)."

[[ "$(head -c 15 "$CHECK_FILE")" == "SQLite format 3" ]] || fail 'La respuesta 200 no es una base SQLite.'
size_kb="$(( $(wc -c <"$CHECK_FILE") / 1024 ))"
log OK "Copia válida: ${size_kb} KB, cabecera SQLite"

log OK 'Rotación completa: Fly y GitHub tienen el mismo BACKUP_TOKEN y la app lo acepta.'
