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

function Test-PythonExecutable {
  param([Parameter(Mandatory=$true)][string]$Executable)
  try {
    $version = & $Executable -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
    return ($LASTEXITCODE -eq 0 -and $version -in @("3.11", "3.12", "3.13"))
  } catch {
    return $false
  }
}

function Resolve-PythonExecutable {
  foreach ($version in @("3.13", "3.12", "3.11")) {
    try {
      $candidate = (& py "-$version" -c "import sys; print(sys.executable)" 2>$null | Select-Object -First 1)
      if ($LASTEXITCODE -eq 0 -and $candidate) {
        $candidate = $candidate.Trim()
        if ((Test-Path $candidate) -and (Test-PythonExecutable $candidate)) {
          return $candidate
        }
      }
    } catch {}
  }

  try {
    $candidate = (& python -c "import sys; print(sys.executable)" 2>$null | Select-Object -First 1)
    if ($LASTEXITCODE -eq 0 -and $candidate) {
      $candidate = $candidate.Trim()
      if ((Test-Path $candidate) -and (Test-PythonExecutable $candidate)) {
        return $candidate
      }
    }
  } catch {}

  $commonCandidates = @(
    "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
    "$env:ProgramFiles\Python313\python.exe",
    "$env:ProgramFiles\Python312\python.exe",
    "$env:ProgramFiles\Python311\python.exe"
  )

  foreach ($candidate in $commonCandidates) {
    if ($candidate -and (Test-Path $candidate) -and (Test-PythonExecutable $candidate)) {
      return $candidate
    }
  }

  if ($env:LOCALAPPDATA) {
    $pythonRoot = Join-Path $env:LOCALAPPDATA "Programs\Python"
    if (Test-Path $pythonRoot) {
      $discovered = Get-ChildItem -Path $pythonRoot -Filter python.exe -Recurse -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending
      foreach ($item in $discovered) {
        if (Test-PythonExecutable $item.FullName) {
          return $item.FullName
        }
      }
    }
  }

  return $null
}

function Install-PythonIfNeeded {
  $resolved = Resolve-PythonExecutable
  if ($resolved) {
    return $resolved
  }

  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "Python 3.11-3.13 não foi encontrado e o winget não está disponível. Instale Python 3.12 em https://www.python.org/downloads/windows/ e rode novamente."
  }

  Write-Host "[Jarvis BR] Python compatível não encontrado. Instalando Python 3.12..." -ForegroundColor Yellow
  & winget install --id Python.Python.3.12 -e --scope user --accept-source-agreements --accept-package-agreements --disable-interactivity

  Start-Sleep -Seconds 2
  $resolved = Resolve-PythonExecutable
  if (-not $resolved) {
    throw "O Python 3.12 foi solicitado ao winget, mas ainda não foi localizado. Feche e abra o PowerShell e rode o instalador novamente."
  }

  Write-Host "[Jarvis BR] Python encontrado em: $resolved" -ForegroundColor Green
  return $resolved
}

function Resolve-OllamaExecutable {
  $command = Get-Command ollama -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidates = @(
    "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
    "$env:LOCALAPPDATA\Ollama\ollama.exe",
    "$env:ProgramFiles\Ollama\ollama.exe"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  return $null
}

$PythonExe = Install-PythonIfNeeded
Write-Host "[Jarvis BR] Usando Python: $PythonExe" -ForegroundColor Cyan
Write-Host "[Jarvis BR] Criando ambiente Python..." -ForegroundColor Cyan

if (Test-Path ".venv") {
  Write-Host "[Jarvis BR] Ambiente .venv existente encontrado. Recriando para evitar conflito..." -ForegroundColor Yellow
  Remove-Item ".venv" -Recurse -Force
}

& $PythonExe -m venv .venv
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao criar o ambiente virtual do Jarvis BR."
}

$Python = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$Pip = Join-Path $RepoRoot ".venv\Scripts\pip.exe"

& $Python -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao atualizar o pip."
}

& $Pip install -e ($RepoRoot + "[voice]")
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao instalar as dependências do Jarvis BR."
}

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
}

$OllamaExe = Resolve-OllamaExecutable
if (-not $OllamaExe) {
  if ($InstallOllama) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
      Write-Warning "winget não encontrado. Instale Ollama manualmente em https://ollama.com"
    } else {
      Write-Host "[Jarvis BR] Instalando Ollama..." -ForegroundColor Cyan
      & winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements --disable-interactivity
      Start-Sleep -Seconds 2
      $OllamaExe = Resolve-OllamaExecutable
      if ($OllamaExe) {
        Write-Host "[Jarvis BR] Ollama encontrado em: $OllamaExe" -ForegroundColor Green
      } else {
        Write-Warning "Ollama foi solicitado ao winget, mas ainda não foi localizado. Ele poderá aparecer após reabrir o PowerShell."
      }
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
Write-Host "[Jarvis BR] RAM detectada: $RamGB GB. Modelo sugerido: $Model" -ForegroundColor Green

if ($PullModel -and $OllamaExe) {
  Write-Host "[Jarvis BR] Verificando serviço Ollama..." -ForegroundColor Cyan
  & $OllamaExe list *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[Jarvis BR] Iniciando Ollama em segundo plano..." -ForegroundColor Cyan
    Start-Process -FilePath $OllamaExe -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 4
  }

  Write-Host "[Jarvis BR] Baixando $Model..." -ForegroundColor Cyan
  & $OllamaExe pull $Model
  if ($LASTEXITCODE -ne 0) {
    Write-Warning ("Não consegui baixar o modelo automaticamente. Depois rode: " + $OllamaExe + " pull " + $Model)
  }
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
