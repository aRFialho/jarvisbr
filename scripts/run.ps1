$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Jarvis = Join-Path $RepoRoot ".venv\Scripts\jarvisbr.exe"
if (-not (Test-Path $Jarvis)) {
  throw "Jarvis BR não está instalado. Rode scripts\install.ps1 primeiro."
}
& $Jarvis start
