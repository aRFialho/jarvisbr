param(
  [Parameter(Mandatory=$true)][string]$ApiUrl,
  [Parameter(Mandatory=$true)][string]$PairingCode,
  [string]$AllowedDirs = "$env:USERPROFILE\Downloads;$env:USERPROFILE\Pictures",
  [string]$AgentDir = "$env:USERPROFILE\.jarvis-agent"
)

$ErrorActionPreference = "Stop"

Write-Host "Jarvis Agent - instalacao em segundo plano"
Write-Host "API: $ApiUrl"

$agentPath = Resolve-Path "$PSScriptRoot"
$deviceName = if ($env:COMPUTERNAME) { $env:COMPUTERNAME } else { "Desktop Windows" }
$publicKey = [guid]::NewGuid().ToString()

$claimBody = @{
  code = $PairingCode
  friendlyName = $deviceName
  deviceType = "desktop"
  platform = "Windows"
  publicKey = $publicKey
} | ConvertTo-Json

$claim = Invoke-RestMethod -Method Post -Uri "$ApiUrl/devices/claim" -ContentType "application/json" -Body $claimBody
$token = $claim.token

New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null
$envFile = Join-Path $AgentDir ".env"
@"
JARVIS_API_URL=$ApiUrl
JARVIS_DEVICE_TOKEN=$token
JARVIS_ALLOWED_DIRS=$AllowedDirs
JARVIS_AGENT_DATA_DIR=$AgentDir
"@ | Set-Content -Path $envFile -Encoding UTF8

$venv = Join-Path $AgentDir ".venv"
if (-not (Test-Path $venv)) {
  python -m venv $venv
}

$pip = Join-Path $venv "Scripts\pip.exe"
$python = Join-Path $venv "Scripts\python.exe"
& $pip install --upgrade pip
& $pip install -e $agentPath

$launcher = Join-Path $AgentDir "run-agent.ps1"
@"
Set-Location "$agentPath"
`$env:JARVIS_API_URL="$ApiUrl"
`$env:JARVIS_DEVICE_TOKEN="$token"
`$env:JARVIS_ALLOWED_DIRS="$AllowedDirs"
`$env:JARVIS_AGENT_DATA_DIR="$AgentDir"
& "$python" -m jarvis_agent.main
"@ | Set-Content -Path $launcher -Encoding UTF8

$taskName = "JarvisBR Background Agent"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

$manifest = Invoke-RestMethod -Method Get -Uri "$ApiUrl/install/public-manifest"
if ($manifest.androidApkUrl) {
  $apkPath = Join-Path $AgentDir "downloads\jarvisbr-android.apk"
  New-Item -ItemType Directory -Force -Path (Split-Path $apkPath) | Out-Null
  Invoke-WebRequest -Uri $manifest.androidApkUrl -OutFile $apkPath
  Write-Host "APK Android baixado em: $apkPath"
} else {
  Write-Host "APK Android ainda nao configurado no backend. Quando ANDROID_APK_URL existir no Render, o agent tentara baixar automaticamente."
}

Write-Host "Agent instalado e iniciado em segundo plano."
Write-Host "Aparelho vinculado: $($claim.device.friendly_name)"
