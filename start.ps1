#Requires -Version 5.1
<#
.SYNOPSIS
  One-command DEMSTA local runner (API + PWA).

.DESCRIPTION
  - Creates Python venv and installs backend deps if needed
  - Installs frontend npm deps if needed
  - Starts the clinic API and Django admin (:8000) and Vite (:5173)
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
  if ((Wait-Http "http://127.0.0.1:8000/ready" 120)) {
    Write-Host "API ready at http://127.0.0.1:8000" -ForegroundColor Green
  } else {
    Write-Host "API not ready yet - check: docker compose logs -f api" -ForegroundColor Yellow
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

# --- Local (venv + npm) ---
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

function Test-VenvStale($venvPath, $pythonPath) {
  if (-not (Test-Path $pythonPath)) { return $true }
  $cfgPath = Join-Path $venvPath "pyvenv.cfg"
  if (-not (Test-Path $cfgPath)) { return $true }
  # Windows console launchers embed the absolute python path from creation time.
  # After moving the repo (e.g. D:\DEMS -> F:\DEMS), pip.exe breaks; detect via cfg.
  $cfg = Get-Content $cfgPath -Raw
  if ($cfg -match '(?m)^command\s*=\s*.+-m venv\s+(.+)\s*$') {
    $createdAt = $Matches[1].Trim().Trim('"')
    $current = [System.IO.Path]::GetFullPath($venvPath)
    $createdNorm = [System.IO.Path]::GetFullPath($createdAt)
    if (-not [string]::Equals($createdNorm, $current, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $true
    }
  }
  # Smoke-test that python can run pip as a module (avoids broken pip.exe launchers)
  & $pythonPath -c "import pip" 2>$null | Out-Null
  return ($LASTEXITCODE -ne 0)
}

if (Test-VenvStale $Venv $VenvPython) {
  Write-Step "Recreating Python virtualenv (missing or moved)"
  if (Test-Path $Venv) {
    Remove-Item -LiteralPath $Venv -Recurse -Force
  }
  Set-Location $Backend
  python -m venv .venv
  if (-not (Test-Path $VenvPython)) {
    throw "Failed to create virtualenv at $Venv"
  }
}

function Invoke-PipInstall([string]$Python, [string[]]$PipArgs, [int]$Attempts = 4) {
  # Windows Defender / SearchIndexer often lock newly extracted wheels (WinError 32).
  for ($i = 1; $i -le $Attempts; $i++) {
    & $Python -m pip @PipArgs
    if ($LASTEXITCODE -eq 0) { return }
    if ($i -eq $Attempts) {
      throw "pip $($PipArgs -join ' ') failed after $Attempts attempts (exit $LASTEXITCODE)"
    }
    Write-Host "pip busy/locked (attempt $i/$Attempts); retrying..." -ForegroundColor Yellow
    Start-Sleep -Seconds (3 * $i)
  }
}

if (-not $SkipInstall) {
  Write-Step "Installing backend dependencies"
  # Use python -m pip so installs survive moved/renamed venvs (pip.exe embeds old paths)
  Invoke-PipInstall $VenvPython @("install", "--disable-pip-version-check", "--upgrade", "pip")
  Invoke-PipInstall $VenvPython @(
    "install", "--disable-pip-version-check",
    "-r", (Join-Path $Backend "requirements.txt")
  )

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
  -ArgumentList @("-m", "uvicorn", "app.asgi:application", "--reload", "--host", "127.0.0.1", "--port", "8000") `
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
