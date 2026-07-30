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

## Quick start (local, no Docker)

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
pip install -r requirements.txt
# Fresh demo seed (optional wipe):
# set SEED_FORCE=true
uvicorn app.main:app --reload --port 8000
```

API docs: http://127.0.0.1:8000/docs  
Health: http://127.0.0.1:8000/health

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

App: http://127.0.0.1:5173

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

## Project layout

```
DEMS/
├── backend/app/          # FastAPI modular monolith
├── frontend/             # React PWA
├── docker-compose.yml
└── DEMSTA_COMPLETE_TODO.md
```

## Roadmap

**[DEMSTA_COMPLETE_TODO.md](./DEMSTA_COMPLETE_TODO.md)** · Architecture: [Dental_Clinic_Management_System_Architecture_Requirements.md](./Dental_Clinic_Management_System_Architecture_Requirements.md)
