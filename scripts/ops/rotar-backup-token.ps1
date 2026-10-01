#Requires -Version 7.2
<#
.SYNOPSIS
  Genera un BACKUP_TOKEN nuevo, lo carga en Fly y en GitHub y comprueba que la app lo acepta.

.DESCRIPTION
  Pasos trazados (consola + log con marca de tiempo):
    1. requisitos: fly/flyctl, gh y curl instalados y con sesión iniciada
    2. genera 32 bytes aleatorios en hexadecimal (equivale a `openssl rand -hex 32`)
    3. Fly:    `fly secrets import` (reinicia la máquina para aplicarlo; reintenta si el host no
               tiene capacidad)
    4. GitHub: `gh secret set --env-file -`
    5. verifica GET /api/admin/backup con el token (reintenta mientras la máquina arranca)
       y comprueba que la copia descargada es un SQLite
  El token nunca se imprime ni se pasa como argumento de línea de comandos: va por stdin.
  Si falla a mitad, vuelve a ejecutarlo: genera otro token y deja ambos lados iguales.

.EXAMPLE
  pwsh scripts/ops/rotar-backup-token.ps1
#>
[CmdletBinding()]
param(
  [string]$App = 'descanso-sleep',
  [string]$Repo = 'manuXD270516/descanso',
  [string]$Url = 'https://descanso-sleep.fly.dev',
  [int]$VerifyTimeoutSec = 90,
  [int]$FlyAttempts = 4,
  [int]$FlyRetryDelaySec = 30
)

$ErrorActionPreference = 'Stop'
# flyctl y gh escriben UTF-8: sin esto PowerShell muestra "Γ£û" en lugar de "✖"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogFile = Join-Path ([System.IO.Path]::GetTempPath()) "rotar-backup-token-$stamp.log"
$CheckFile = Join-Path ([System.IO.Path]::GetTempPath()) "descanso-check-$stamp.db"
$token = $null

function Log([string]$Level, [string]$Msg) {
  $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz'), $Level, $Msg
  $color = @{ INFO = 'Gray'; OK = 'Green'; WARN = 'Yellow'; ERROR = 'Red' }[$Level]
  Write-Host $line -ForegroundColor $color
  Add-Content -Path $LogFile -Value $line
}

function Step([string]$Msg) { Log 'INFO' "── $Msg" }

$script:failLogged = $false
function Fail([string]$Msg) { Log 'ERROR' $Msg; $script:failLogged = $true; throw $Msg }

try {
  Log 'INFO' "Rotación de BACKUP_TOKEN · app=$App · repo=$Repo · url=$Url"
  Log 'INFO' "Log: $LogFile"

  Step '1/5 Requisitos'
  $fly = (Get-Command fly -ErrorAction SilentlyContinue) ?? (Get-Command flyctl -ErrorAction SilentlyContinue)
  if (-not $fly) { Fail 'No se encontró fly/flyctl en el PATH.' }
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Fail 'No se encontró gh en el PATH.' }
  if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) { Fail 'No se encontró curl.exe en el PATH.' }
  $flyUser = & $fly.Source auth whoami 2>$null
  if ($LASTEXITCODE -ne 0) { Fail 'fly no tiene sesión: ejecuta `fly auth login`.' }
  Log 'OK' "fly: $($fly.Source) · sesión de $flyUser"
  & gh auth status --hostname github.com *> $null
  if ($LASTEXITCODE -ne 0) { Fail 'gh no tiene sesión: ejecuta `gh auth login`.' }
  Log 'OK' 'gh: sesión activa'

  Step '2/5 Generar token'
  $token = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
  Log 'OK' "Token generado ($($token.Length) caracteres hex; no se muestra)"

  Step "3/5 Cargar en Fly ($App) · reinicia la máquina"
  # Si el host no tiene capacidad para reiniciar la máquina, Fly deja el secreto en "Staged" y suele
  # migrarla a otro host: se reintenta con el mismo token para que Fly y GitHub no queden distintos.
  for ($attempt = 1; ; $attempt++) {
    "BACKUP_TOKEN=$token" | & $fly.Source secrets import --app $App 2>&1 | ForEach-Object { Log 'INFO' "  fly: $_" }
    if ($LASTEXITCODE -eq 0) { break }
    if ($attempt -ge $FlyAttempts) {
      Fail "fly secrets import falló $attempt veces: el token nuevo puede quedar como Staged en Fly, GitHub no cambió y la app sigue con el anterior. Vuelve a ejecutar el script."
    }
    Log 'WARN' "Intento $attempt de $FlyAttempts falló; reintento en $FlyRetryDelaySec s con el mismo token"
    Start-Sleep -Seconds $FlyRetryDelaySec
  }
  Log 'OK' 'Fly actualizado'

  Step "4/5 Cargar en GitHub ($Repo)"
  # Formato dotenv por stdin: PowerShell añade un salto de línea al canalizar y así no entra en el valor
  "BACKUP_TOKEN=$token" | & gh secret set --env-file - --repo $Repo 2>&1 | ForEach-Object { Log 'INFO' "  gh: $_" }
  if ($LASTEXITCODE -ne 0) { Fail 'gh secret set falló: Fly ya tiene el token nuevo y GitHub no. Vuelve a ejecutar el script.' }
  Log 'OK' 'GitHub actualizado'

  Step "5/5 Verificar $Url/api/admin/backup"
  $deadline = (Get-Date).AddSeconds($VerifyTimeoutSec)
  $attempt = 0
  do {
    $attempt++
    $code = "Authorization: Bearer $token" | & curl.exe -s -o $CheckFile -w '%{http_code}' -H '@-' --max-time 30 "$Url/api/admin/backup"
    Log 'INFO' "  intento $attempt → HTTP $code"
    if ($code -eq '200') { break }
    Start-Sleep -Seconds 6
  } while ((Get-Date) -lt $deadline)
  if ($code -ne '200') { Fail "La app no aceptó el token (último HTTP $code tras $attempt intentos)." }

  $header = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($CheckFile), 0, 15)
  if ($header -ne 'SQLite format 3') { Fail 'La respuesta 200 no es una base SQLite.' }
  Log 'OK' "Copia válida: $([math]::Round((Get-Item $CheckFile).Length / 1KB, 1)) KB, cabecera SQLite"

  Log 'OK' 'Rotación completa: Fly y GitHub tienen el mismo BACKUP_TOKEN y la app lo acepta.'
}
catch {
  if (-not $script:failLogged) { Log 'ERROR' $_.Exception.Message }
  Log 'ERROR' "Rotación incompleta. Detalle en $LogFile"
  exit 1
}
finally {
  if (Test-Path $CheckFile) { Remove-Item $CheckFile -Force; Log 'INFO' 'Copia de prueba borrada' }
  $token = $null
}
