# DEMSTA — Dental Electronic Management System for Treatment & Administration

Modern dental clinic OS built from the DCMS architecture requirements: FastAPI async modular monolith, React 19 PWA, RBAC + multi-clinic readiness, department panels, interactive odontogram, billing with Chart-to-Cash, and a pluggable AI advisory gateway.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 · Vite · TypeScript · Tailwind CSS 4 · PWA (Workbox) · Zustand |
| Backend | FastAPI · SQLAlchemy 2 async · Pydantic v2 · Argon2 · JWT (rotating refresh) |
| Data | SQLite (local) / PostgreSQL 17 (Docker) · Redis (rate-limit/cache) · Alembic |
| Scale | Connection pooling · tenant repositories · Postgres RLS · `/ready` probes · rate limits |
| Theme | Blue–white clinical UI · DEMSTA logo · Chairside Mode · role-aware department panels |

## Quick start (one command)

**Windows** (double-click or PowerShell):

```powershell
.\start.bat
# or
.\start.ps1
```

**macOS / Linux / Git Bash:**

```bash
chmod +x start.sh
./start.sh
```

This installs deps if needed, starts API (`:8000`) + PWA (`:5173`), and opens the browser.  
Ctrl+C (or close the windows) stops both.

| Flag | Effect |
|---|---|
| `-Docker` / `--docker` | `docker compose up --build -d` instead |
| `-NoBrowser` / `--no-browser` | Don’t open a browser tab |
| `-SkipInstall` / `--skip-install` | Skip pip/npm install |

App: http://127.0.0.1:5173 · API docs: http://127.0.0.1:8000/docs

### Manual (two terminals)

```bash
# Backend
cd backend && python -m venv .venv
# Windows: .\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

## Demo accounts

### System owner (cross-clinic)

| Role | Clinic code | Email | Password |
|---|---|---|---|
| Super Admin / Owner | `PLATFORM` | owner@demsta.clinic | Demsta!Owner1 |

Owner console: `/owner` — create clinics, chain KPIs, switch active clinic (`X-Clinic-Id`).

### Clinic MAIN — DEMSTA Dental Care

| Role | Email | Password | Home panel |
|---|---|---|---|
| Clinic Admin | admin@demsta.clinic | Demsta!Admin1 | `/admin` |
| Dentist | dentist@demsta.clinic | Demsta!Dentist1 | `/clinical` |
| Hygienist | hygiene@demsta.clinic | Demsta!Hygiene1 | `/hygiene` |
| Receptionist | front@demsta.clinic | Demsta!Front1 | `/front-desk` |
| Accountant | billing@demsta.clinic | Demsta!Billing1 | `/billing` |
| Lab Tech | lab@demsta.clinic | Demsta!Lab1 | `/lab` |
| Pharmacy | pharmacy@demsta.clinic | Demsta!Pharmacy1 | `/pharmacy` |
| Imaging Tech | imaging@demsta.clinic | Demsta!Imaging1 | `/imaging` |

### Clinic EAST — DEMSTA East Wing

| Role | Email | Password |
|---|---|---|
| Clinic Admin | admin@east.demsta.clinic | Demsta!Admin1 |
| Dentist | dentist@east.demsta.clinic | Demsta!Dentist1 |

Login clinic code: `EAST`.

### Patient portal

| Clinic | Patient ID | PIN | URL |
|---|---|---|---|
| MAIN | P202600001 (James Kariuki) | 1234 | http://127.0.0.1:5173/portal/login |

Currency everywhere is **TZS (TSh)**.

### Reseed

- Env: `SEED_FORCE=true` on API start wipes and reseeds  
- Or Owner UI / `POST /api/v1/owner/reseed-demo` (non-production)

## Department map

| Route | Department |
|---|---|
| `/owner` | System owner (multi-clinic) |
| `/admin` | Clinic admin / HR lite |
| `/front-desk` | Reception |
| `/clinical` | Dentist chair |
| `/hygiene` | Hygiene / perio |
| `/imaging` | Imaging suite |
| `/lab` | Lab journey |
| `/pharmacy` | e-Rx / pharmacy |
| `/inventory` | Stock |
| `/billing` | Revenue |
| `/reports` | Financial / clinical / operational |
| `/patients` `/schedule` `/ai` | Shared tools |

## Docker (scalable local stack)

```bash
docker compose up --build
```

Starts **Postgres 17** + **Redis 7** + API + web.

- Liveness: http://127.0.0.1:8000/live  
- Readiness: http://127.0.0.1:8000/ready  
- API docs: http://127.0.0.1:8000/docs  

## What's included

- Auth: JWT + RBAC roles including lab / pharmacy / imaging + platform owner
- Multi-clinic: MAIN + EAST seed; owner clinic CRUD + switcher
- Patients: clerkship demographics, visits, ICD-10 K00–K14, odontogram, perio
- Chart-to-Cash billing + fee schedule
- Department shells: inventory, lab cases, imaging studies, prescriptions, staff invite
- **Phase 2 clinical depth:** Surface-True Restorative, endodontics, perio recall, structured investigations, plan timeline, inventory usage/suppliers, reports
- PWA + Chairside Mode + role-aware navigation
- Scale foundation: Alembic, Postgres RLS, tenant repos, Redis rate limits

## Deploy on Render

Blueprint: [`render.yaml`](./render.yaml) · step-by-step: [`docs/RENDER_DEPLOY.md`](./docs/RENDER_DEPLOY.md)

Creates **Postgres**, **demsta-api** (Docker + persistent disk for encrypted imaging), and **demsta-web** (static PWA).

After the first deploy, set cross-service URLs:

1. `VITE_API_BASE` on **demsta-web** → API `https://…onrender.com` (no trailing slash), then rebuild web  
2. `FRONTEND_ORIGIN` on **demsta-api** → web `https://…onrender.com`

Health: `/ready` · Env templates: `backend/.env.example`, `frontend/.env.example`

## Project layout

```
DEMS/
├── backend/app/          # FastAPI modular monolith
├── frontend/             # React PWA
├── render.yaml           # Render Blueprint
├── docs/RENDER_DEPLOY.md
├── docker-compose.yml
└── DEMSTA_COMPLETE_TODO.md
```

## Roadmap

**[DEMSTA_COMPLETE_TODO.md](./DEMSTA_COMPLETE_TODO.md)** · Architecture: [Dental_Clinic_Management_System_Architecture_Requirements.md](./Dental_Clinic_Management_System_Architecture_Requirements.md)
