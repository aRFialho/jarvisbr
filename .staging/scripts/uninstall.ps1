param([switch]$RemoveData)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$StartupVbs = Join-Path ([Environment]::GetFolderPath("Startup")) "JarvisBR.vbs"
if (Test-Path $StartupVbs) { Remove-Item $StartupVbs -Force }

$Venv = Join-Path $RepoRoot ".venv"
if (Test-Path $Venv) { Remove-Item $Venv -Recurse -Force }

if ($RemoveData) {
  $Data = Join-Path $env:LOCALAPPDATA "JarvisBR"
  if (Test-Path $Data) { Remove-Item $Data -Recurse -Force }
}

Write-Host "Jarvis BR removido da inicialização e ambiente virtual apagado."
