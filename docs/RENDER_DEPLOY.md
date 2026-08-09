# Deploy DEMSTA on Render

This repo includes a Blueprint at [`render.yaml`](../render.yaml).

## What gets created

| Resource | Name | Notes |
|---|---|---|
| Web (Docker) | `demsta-api` | FastAPI + Alembic + 5 GB disk at `/var/data` |
| Static site | `demsta-web` | Vite/React PWA (`frontend/dist`) |
| Postgres | `demsta-db` | Managed Postgres 16 |

Redis is **off** by default (`REDIS_ENABLED=false`); the API uses in-process rate-limit fallback.

## One-time setup

1. Push this repo to GitHub/GitLab.
2. In [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
3. Select the repo; Blueprint path = `render.yaml`.
4. Apply / deploy. Wait until **demsta-api** and **demsta-db** are live.
5. Open **demsta-api** → copy its URL, e.g. `https://demsta-api-xxxx.onrender.com`.
6. Open **demsta-web** → Environment → set:
   - `VITE_API_BASE` = that API URL (**no** trailing slash)
7. Open **demsta-api** → Environment → set:
   - `FRONTEND_ORIGIN` = the static site URL, e.g. `https://demsta-web-xxxx.onrender.com`
   - Optional: `CORS_ORIGINS` = same URL (comma-separated extras allowed)
8. **Manual Deploy → Clear build cache & deploy** on **demsta-web** (Vite bakes `VITE_API_BASE` at build time).
9. Open the web URL and log in with a demo account (see root README).

## Health checks

- Liveness: `GET /live`
- Readiness (DB): `GET /ready` ← used by Render
- Simple: `GET /health`

## Persistent media

Imaging uploads are Fernet-encrypted under `OBJECT_STORAGE_PATH` (default `/var/data/object_store` on the API disk).  
Without the disk, uploads are lost on every deploy/restart.

## Plans / cost notes

`render.yaml` uses **starter** API + **basic-256mb** Postgres so the persistent disk is allowed.  
For a free experiment you can change both to `plan: free` and **remove the `disk:` block** (imaging storage becomes ephemeral).

## Local parity

```bash
docker compose up --build
```

Uses Postgres + Redis + API + Vite. Set `VITE_API_BASE` only when the frontend is not proxied.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Frontend API calls go to the static host | `VITE_API_BASE` missing/wrong → rebuild web |
| CORS errors | Set `FRONTEND_ORIGIN` on API to the exact https origin |
| `/ready` 503 | DB still provisioning, or `DATABASE_URL` not linked |
| Migrations fail | Check API logs; ensure `AUTO_MIGRATE=true` |
| Uploads vanish | Disk not mounted / free plan without disk |

## Demo seed

With `ALLOW_DEMO_RESEED=true` (default in Blueprint), use Owner UI or:

`POST /api/v1/owner/reseed-demo` (non-production only when that flag is on).

Set `SEED_FORCE=true` once on API boot to wipe+reseed, then set it back to `false`.
