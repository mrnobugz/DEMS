#!/usr/bin/env bash
set -euo pipefail

# Render injects PORT; default for local Docker
PORT="${PORT:-8000}"
WORKERS="${WEB_CONCURRENCY:-1}"

# Optional: run migrations explicitly before boot (also runs in app lifespan when AUTO_MIGRATE=true)
if [[ "${RUN_MIGRATIONS_ON_START:-true}" == "true" ]]; then
  python - <<'PY'
from app.db.migrate import run_migrations
run_migrations()
print("Alembic migrations applied.")
PY
fi

exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT}" \
  --workers "${WORKERS}" \
  --proxy-headers \
  --forwarded-allow-ips='*'
