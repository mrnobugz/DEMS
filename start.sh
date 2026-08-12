#!/usr/bin/env bash
# One-command DEMSTA local runner (API + PWA)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DOCKER=0
NO_BROWSER=0
SKIP_INSTALL=0

for arg in "$@"; do
  case "$arg" in
    --docker) DOCKER=1 ;;
    --no-browser) NO_BROWSER=1 ;;
    --skip-install) SKIP_INSTALL=1 ;;
  esac
done

step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }

wait_http() {
  local url="$1" seconds="${2:-60}" i=0
  while [ "$i" -lt "$seconds" ]; do
    if curl -sf "$url" >/dev/null 2>&1; then return 0; fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

cleanup() {
  step "Stopping processes"
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  echo "Stopped."
}
trap cleanup EXIT INT TERM

if [[ "$DOCKER" -eq 1 ]]; then
  step "Starting full stack with Docker Compose"
  cd "$ROOT"
  docker compose up --build -d
  step "Waiting for API readiness"
  wait_http "http://127.0.0.1:8000/ready" 120 || true
  echo "Web:  http://127.0.0.1:5173"
  echo "Docs: http://127.0.0.1:8000/docs"
  [[ "$NO_BROWSER" -eq 0 ]] && (xdg-open "http://127.0.0.1:5173" 2>/dev/null || open "http://127.0.0.1:5173" 2>/dev/null || true)
  echo "Stop with: docker compose down"
  trap - EXIT INT TERM
  exit 0
fi

command -v python3 >/dev/null || command -v python >/dev/null || { echo "Python required"; exit 1; }
command -v npm >/dev/null || { echo "npm required"; exit 1; }
PY=python3
command -v python3 >/dev/null || PY=python

BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$BACKEND/.venv"

if [[ ! -x "$VENV/bin/python" ]]; then
  step "Creating Python virtualenv"
  (cd "$BACKEND" && "$PY" -m venv .venv)
fi

if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  step "Installing backend dependencies"
  "$VENV/bin/pip" install -r "$BACKEND/requirements.txt"
  step "Installing frontend dependencies"
  if [[ -f "$FRONTEND/package-lock.json" ]]; then
    (cd "$FRONTEND" && npm ci)
  else
    (cd "$FRONTEND" && npm install)
  fi
fi

export PYTHONPATH="$BACKEND"
export ENVIRONMENT="${ENVIRONMENT:-development}"
export AUTO_MIGRATE="${AUTO_MIGRATE:-true}"
export DATABASE_URL="${DATABASE_URL:-sqlite+aiosqlite:///./demsta.db}"
export REDIS_ENABLED="${REDIS_ENABLED:-false}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173}"

step "Starting API on http://127.0.0.1:8000"
(
  cd "$BACKEND"
  "$VENV/bin/python" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
) &
API_PID=$!

step "Starting web on http://127.0.0.1:5173"
(
  cd "$FRONTEND"
  npm run dev -- --host 127.0.0.1 --port 5173
) &
WEB_PID=$!

step "Waiting for services"
wait_http "http://127.0.0.1:8000/health" 90 && echo "API  OK  http://127.0.0.1:8000/docs" || echo "API  not ready yet"
wait_http "http://127.0.0.1:5173" 90 && echo "Web  OK  http://127.0.0.1:5173" || echo "Web  not ready yet"

if [[ "$NO_BROWSER" -eq 0 ]]; then
  xdg-open "http://127.0.0.1:5173" 2>/dev/null || open "http://127.0.0.1:5173" 2>/dev/null || true
fi

echo ""
echo "DEMSTA is running. Press Ctrl+C to stop."
echo "Demo: front@demsta.clinic / Demsta!Front1  (clinic MAIN)"
wait
