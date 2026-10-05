param(
  [switch]$InstallOllama,
  [switch]$PullModel,
  [switch]$NoStartup
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

if ($env:OS -ne "Windows_NT") {
  throw "Este instalador é destinado ao Windows."
}

function Resolve-Python {
  foreach ($version in @("3.13", "3.12", "3.11")) {
    try {
      & py "-$version" -c "import sys; print(sys.executable)" 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) { return @("py", "-$version") }
    } catch {}
  }
  try {
    $v = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
    if ($v -in @("3.11", "3.12", "3.13")) { return @("python") }
  } catch {}
  throw "Instale Python 3.11, 3.12 ou 3.13 e rode novamente."
}

$Py = Resolve-Python
Write-Host "[Jarvis BR] Criando ambiente Python..." -ForegroundColor Cyan
if ($Py.Count -eq 2) {
  & $Py[0] $Py[1] -m venv .venv
} else {
  & $Py[0] -m venv .venv
}

$Python = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$Pip = Join-Path $RepoRoot ".venv\Scripts\pip.exe"
& $Python -m pip install --upgrade pip
& $Pip install -e "${RepoRoot}[voice]"

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
}

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  if ($InstallOllama) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
      Write-Warning "winget não encontrado. Instale Ollama manualmente em https://ollama.com"
    } else {
      Write-Host "[Jarvis BR] Instalando Ollama..." -ForegroundColor Cyan
      winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements
    }
  } else {
    Write-Warning "Ollama não encontrado. Use -InstallOllama ou configure OpenJarvis/Gemini no .env."
  }
}

$RamGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
if ($RamGB -lt 15) { $Model = "qwen3.5:2b" }
elseif ($RamGB -lt 25) { $Model = "qwen3.5:4b" }
elseif ($RamGB -lt 45) { $Model = "qwen3.5:9b" }
else { $Model = "qwen3.5:27b" }

$EnvText = Get-Content ".env" -Raw
$EnvText = [regex]::Replace($EnvText, "JARVIS_OLLAMA_MODEL=.*", "JARVIS_OLLAMA_MODEL=$Model")
$EnvText = [regex]::Replace($EnvText, "JARVIS_OPENJARVIS_MODEL=.*", "JARVIS_OPENJARVIS_MODEL=$Model")
Set-Content ".env" $EnvText -Encoding UTF8
Write-Host "[Jarvis BR] RAM detectada: ${RamGB} GB. Modelo sugerido: $Model" -ForegroundColor Green

if ($PullModel -and (Get-Command ollama -ErrorAction SilentlyContinue)) {
  Write-Host "[Jarvis BR] Baixando $Model..." -ForegroundColor Cyan
  ollama pull $Model
}

if (-not $NoStartup) {
  $Startup = [Environment]::GetFolderPath("Startup")
  $Vbs = Join-Path $Startup "JarvisBR.vbs"
  $Exe = Join-Path $RepoRoot ".venv\Scripts\jarvisbr.exe"
  $EscapedExe = $Exe.Replace('"', '""')
  $EscapedRoot = $RepoRoot.Replace('"', '""')
  $Content = @"
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "$EscapedRoot"
shell.Run Chr(34) & "$EscapedExe" & Chr(34) & " start", 0, False
"@
  Set-Content -Path $Vbs -Value $Content -Encoding ASCII
  Write-Host "[Jarvis BR] Inicialização automática instalada em $Vbs" -ForegroundColor Green
}

Write-Host ""
Write-Host "Instalação concluída." -ForegroundColor Green
Write-Host "1) Edite .env se quiser trocar provider/modelo."
Write-Host "2) Teste: .\.venv\Scripts\jarvisbr.exe doctor"
Write-Host "3) Inicie: .\.venv\Scripts\jarvisbr.exe start"
Write-Host "4) Gestos: 2 palmas = conversa | 3 palmas = agente | Ctrl+Alt+J = conversa"
