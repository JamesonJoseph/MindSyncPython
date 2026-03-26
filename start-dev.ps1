$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"
$venvPython = Join-Path $backendDir ".venv\Scripts\python.exe"

Write-Host "Preparing backend..."
if (-not (Test-Path $venvPython)) {
    python -m venv (Join-Path $backendDir ".venv")
}

& $venvPython -m ensurepip --upgrade
& $venvPython -m pip install -r (Join-Path $backendDir "requirements.txt")

Write-Host "Preparing frontend..."
Push-Location $frontendDir
npm install
Pop-Location

Write-Host "Starting backend on port 5000..."
$backend = Start-Process -FilePath $venvPython `
    -ArgumentList "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000" `
    -WorkingDirectory $backendDir `
    -PassThru

Write-Host "Starting Expo dev server..."
$frontend = Start-Process -FilePath "npm.cmd" `
    -ArgumentList "start" `
    -WorkingDirectory $frontendDir `
    -PassThru

Write-Host ""
Write-Host "Backend PID: $($backend.Id)"
Write-Host "Frontend PID: $($frontend.Id)"
Write-Host "Backend health: http://127.0.0.1:5000/health"
Write-Host "Expo/Metro: http://localhost:8081"
Write-Host ""
Write-Host "If frontend uses a phone, make sure frontend\.env points to your PC LAN IP on port 5000."
