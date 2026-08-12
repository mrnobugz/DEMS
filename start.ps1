#Requires -Version 5.1
<#
.SYNOPSIS
  One-command DEMSTA local runner (API + PWA).

.DESCRIPTION
  - Creates Python venv and installs backend deps if needed
  - Installs frontend npm deps if needed
  - Starts FastAPI (:8000) and Vite (:5173)
  - Opens the app in your browser
  - Ctrl+C stops both

.PARAMETER Docker
  Use docker compose instead of local venv/npm.

.PARAMETER NoBrowser
  Do not open the browser.

.EXAMPLE
  .\start.ps1
  .\start.ps1 -Docker
#>
param(
  [switch]$Docker,
  [switch]$NoBrowser,
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
if (-not $Root) { $Root = Get-Location }

function Write-Step($msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

function Test-Command($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Wait-Http($url, $seconds = 60) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  return $false
}

if ($Docker) {
  if (-not (Test-Command "docker")) {
    throw "Docker is not installed or not on PATH."
  }
  Write-Step "Starting full stack with Docker Compose"
  Set-Location $Root
  docker compose up --build -d
  Write-Step "Waiting for API readiness"
  if (Wait-Http "http://127.0.0.1:8000/ready" 120) {
    Write-Host "API ready at http://127.0.0.1:8000" -ForegroundColor Green
  } else {
    Write-Host "API not ready yet — check: docker compose logs -f api" -ForegroundColor Yellow
  }
  Write-Host "Web:  http://127.0.0.1:5173" -ForegroundColor Green
  Write-Host "Docs: http://127.0.0.1:8000/docs" -ForegroundColor Green
  if (-not $NoBrowser) {
    Start-Process "http://127.0.0.1:5173"
  }
  Write-Host ""
  Write-Host "Stop with: docker compose down" -ForegroundColor DarkGray
  exit 0
}

# ── Local (venv + npm) ─────────────────────────────────
if (-not (Test-Command "python")) {
  throw "Python is not on PATH. Install Python 3.11+ and retry."
}
if (-not (Test-Command "npm")) {
  throw "npm is not on PATH. Install Node.js 20+ and retry."
}

$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Venv = Join-Path $Backend ".venv"
$VenvPython = Join-Path $Venv "Scripts\python.exe"
$VenvPip = Join-Path $Venv "Scripts\pip.exe"

if (-not (Test-Path $VenvPython)) {
  Write-Step "Creating Python virtualenv"
  Set-Location $Backend
  python -m venv .venv
}

if (-not $SkipInstall) {
  Write-Step "Installing backend dependencies"
  & $VenvPip install -r (Join-Path $Backend "requirements.txt")

  Write-Step "Installing frontend dependencies"
  Set-Location $Frontend
  if (Test-Path (Join-Path $Frontend "package-lock.json")) {
    npm ci
  } else {
    npm install
  }
}

$env:PYTHONPATH = $Backend
$env:ENVIRONMENT = if ($env:ENVIRONMENT) { $env:ENVIRONMENT } else { "development" }
$env:AUTO_MIGRATE = if ($env:AUTO_MIGRATE) { $env:AUTO_MIGRATE } else { "true" }
# Prefer SQLite for zero-setup local unless DATABASE_URL already set
if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "sqlite+aiosqlite:///./demsta.db"
}
$env:REDIS_ENABLED = if ($env:REDIS_ENABLED) { $env:REDIS_ENABLED } else { "false" }
$env:CORS_ORIGINS = if ($env:CORS_ORIGINS) {
  $env:CORS_ORIGINS
} else {
  "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"
}

Write-Step "Starting API on http://127.0.0.1:8000"
$api = Start-Process -FilePath $VenvPython `
  -ArgumentList @("-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000") `
  -WorkingDirectory $Backend `
  -PassThru `
  -WindowStyle Normal

Write-Step "Starting web on http://127.0.0.1:5173"
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) { $npm = Get-Command npm }
$web = Start-Process -FilePath "cmd.exe" `
  -ArgumentList @(
    "/c",
    " `"$($npm.Source)`" run dev -- --host 127.0.0.1 --port 5173"
  ) `
  -WorkingDirectory $Frontend `
  -PassThru `
  -WindowStyle Normal

try {
  Write-Step "Waiting for services"
  $apiOk = Wait-Http "http://127.0.0.1:8000/health" 90
  $webOk = Wait-Http "http://127.0.0.1:5173" 90

  if ($apiOk) { Write-Host "API  OK  http://127.0.0.1:8000/docs" -ForegroundColor Green }
  else { Write-Host "API  not responding yet (check the API window)" -ForegroundColor Yellow }

  if ($webOk) { Write-Host "Web  OK  http://127.0.0.1:5173" -ForegroundColor Green }
  else { Write-Host "Web  not responding yet (check the Vite window)" -ForegroundColor Yellow }

  if (-not $NoBrowser -and $webOk) {
    Start-Process "http://127.0.0.1:5173"
  }

  Write-Host ""
  Write-Host "DEMSTA is running. Close the API/Vite windows or press Ctrl+C here to stop." -ForegroundColor Cyan
  Write-Host "Demo: front@demsta.clinic / Demsta!Front1  (clinic MAIN)" -ForegroundColor DarkGray
  Write-Host ""

  # Keep parent alive; Ctrl+C cleans up children
  while ($true) {
    if ($api.HasExited -and $web.HasExited) { break }
    Start-Sleep -Seconds 2
  }
}
finally {
  Write-Step "Stopping processes"
  foreach ($p in @($api, $web)) {
    if ($null -ne $p -and -not $p.HasExited) {
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
      # Also stop child trees when possible
      Get-CimInstance Win32_Process -Filter "ParentProcessId=$($p.Id)" -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    }
  }
  Write-Host "Stopped." -ForegroundColor DarkGray
}
