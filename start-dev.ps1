$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"
$venvPython = Join-Path $backendDir ".venv\Scripts\python.exe"
$backendPython = $null
$backendLog = Join-Path $root "backend.log"
$backendErrorLog = Join-Path $root "backend-error.log"
$frontendLog = Join-Path $frontendDir "expo.log"
$frontendErrorLog = Join-Path $frontendDir "expo-error.log"

function Get-PythonCommandPath {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand) {
        return $pythonCommand.Source
    }
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        return $pyLauncher.Source
    }
    throw "Python 3.10+ is required but was not found in PATH."
}

Write-Host "Preparing backend..."
if (-not (Test-Path $venvPython)) {
    $pythonCommand = Get-PythonCommandPath
    & $pythonCommand -m venv (Join-Path $backendDir ".venv")
}

$pythonCommand = Get-PythonCommandPath
$backendPython = $pythonCommand
if (Test-Path $venvPython) {
    $backendPython = $venvPython
    $venvPip = Join-Path $backendDir ".venv\Scripts\pip.exe"
    if (Test-Path $venvPip) {
        try {
            & $venvPip install -r (Join-Path $backendDir "requirements.txt")
        } catch {
            Write-Warning "Backend venv install failed. Falling back to system Python."
            $backendPython = $pythonCommand
        }
    } else {
        Write-Warning "Backend venv is missing pip. Falling back to system Python."
        $backendPython = $pythonCommand
    }
}

Write-Host "Preparing frontend..."
Push-Location $frontendDir
if ($env:CI) {
    $normalizedCi = $env:CI.Trim().ToLowerInvariant()
    if ($normalizedCi -in @("true", "false", "1", "0")) {
        $env:CI = $normalizedCi
    } else {
        Remove-Item Env:CI -ErrorAction SilentlyContinue
    }
}
& "npm.cmd" install
Pop-Location

foreach ($logPath in @($backendLog, $backendErrorLog, $frontendLog, $frontendErrorLog)) {
    if (Test-Path $logPath) {
        Remove-Item $logPath -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "Starting backend on port 5000..."
$backend = Start-Process -FilePath $backendPython `
    -ArgumentList "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000" `
    -WorkingDirectory $backendDir `
    -RedirectStandardOutput $backendLog `
    -RedirectStandardError $backendErrorLog `
    -PassThru

Write-Host "Starting Expo dev server..."
$frontendCommand = "Remove-Item Env:CI -ErrorAction SilentlyContinue; `$env:EXPO_OFFLINE='1'; Set-Location '$frontendDir'; & 'npm.cmd' start -- --offline"
$frontend = Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $frontendCommand `
    -RedirectStandardOutput $frontendLog `
    -RedirectStandardError $frontendErrorLog `
    -PassThru

Write-Host ""
Write-Host "Backend PID: $($backend.Id)"
Write-Host "Frontend PID: $($frontend.Id)"
$backendReady = $false
for ($i = 0; $i -lt 18; $i++) {
    Start-Sleep -Seconds 2
    try {
        $health = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5000/health -TimeoutSec 3
        if ($health.StatusCode -eq 200) {
            $backendReady = $true
            break
        }
    } catch {
    }
}

Write-Host "Backend health: http://127.0.0.1:5000/health"
Write-Host "Expo/Metro: http://localhost:8081"
Write-Host ""
if ($backendReady) {
    Write-Host "Backend is responding on port 5000."
} else {
    Write-Warning "Backend is still not responding after 36 seconds. Check backend-error.log."
}
Write-Host "If frontend uses a phone, make sure frontend\.env points to your PC LAN IP on port 5000."
