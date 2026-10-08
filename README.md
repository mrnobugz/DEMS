# DEMSTA — Dental Electronic Management System for Treatment & Administration

Modern dental clinic OS (Phase 1 foundation) built from the DCMS architecture requirements: FastAPI async modular monolith, React 19 PWA, RBAC + multi-clinic readiness, interactive odontogram, billing with idempotency, and a pluggable AI advisory gateway.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 · Vite · TypeScript · Tailwind CSS 4 · PWA (Workbox) · Zustand |
| Backend | FastAPI · SQLAlchemy 2 async · Pydantic v2 · Argon2 · JWT (rotating refresh) |
| Data | SQLite (local) / PostgreSQL 17 (Docker) · Redis-ready |
| Theme | Blue–white clinical UI · DEMSTA logo |

## Quick start (local, no Docker)

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
pip install -r requirements.txt
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

### Demo accounts (clinic code `MAIN`)

| Role | Email | Password |
|---|---|---|
| Super Admin | admin@demsta.clinic | Demsta!Admin1 |
| Dentist | dentist@demsta.clinic | Demsta!Dentist1 |
| Receptionist | front@demsta.clinic | Demsta!Front1 |
| Hygienist | hygiene@demsta.clinic | Demsta!Hygiene1 |

## Docker (when available)

```bash
docker compose up --build
```

Set `DATABASE_URL=postgresql+asyncpg://demsta:demsta@db:5432/demsta` for Postgres.

## What's included (Phase 1+)

- Auth: JWT access + rotating hashed refresh tokens, account lockout, RBAC
- Patients: unique IDs, fuzzy search, duplicate detection, medical/dental history, caries risk
- Scheduling: color-coded types, chair/dentist conflict detection, smart slot suggestions
- Clinical: interactive FDI odontogram, SOAP notes, consent records, AI note drafts
- Billing: invoices from line items, payments, idempotency keys
- AI gateway stubs: caries risk, smart schedule, SOAP draft (advisory only)
- PWA installability + network-first API caching
- Multi-tenant `clinic_id` on all core tables
- Audit log on clinical/billing/auth actions

## Project layout

```
DEMS/
├── backend/app/          # FastAPI modular monolith
├── frontend/             # React PWA
├── docker-compose.yml
└── Dental_Clinic_Management_System_Architecture_Requirements.md
```

## Next phases (per architecture doc)

Phase 2: restorative/perio tracking, treatment plans, e-Rx, inventory, HR  
Phase 3: DICOM imaging, lab cases, insurance, patient portal, recalls  
Phase 4–5: multi-clinic rollout, 3D viz, AI radiograph screening
