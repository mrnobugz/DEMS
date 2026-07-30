# Dental Clinic Management System (DCMS)
## Architecture & Requirements Document — v1.0

---

## 1. Executive Summary

The Dental Clinic Management System (DCMS) is a modern, secure, and scalable platform for managing all operational and clinical activities of a dental clinic (or multi-clinic network). It consists of:

- A **Progressive Web App (PWA)** frontend — installable, offline-capable, responsive across desktop/tablet/mobile.
- A **FastAPI backend** exposing a versioned REST (and optionally GraphQL) API, built with an async, modular, security-first architecture.
- A **PostgreSQL** data layer with strict data protection for health information.

The system is designed to start as a **modular monolith** that can evolve into independently scalable services as load grows, and to support **multi-clinic / multi-tenant** deployment from day one at the data-model level, even if the first release targets a single clinic.

---

## 2. Goals & Non-Goals

### 2.1 Goals
- Digitize the full patient lifecycle: registration → scheduling → clinical treatment → billing → follow-up.
- Provide role-based access for Admin, Dentist, Hygienist, Receptionist, Accountant, and Patient (portal).
- Offer offline-tolerant front-desk operation (PWA) for unreliable connectivity environments.
- Meet health-data security expectations comparable to HIPAA/GDPR even where not legally mandated.
- Be horizontally scalable and cloud-deployable (Docker/Kubernetes ready).
- Provide a foundation that can later support multiple clinic branches under one account.

### 2.2 Non-Goals (Phase 1)
- Full insurance clearinghouse integration (EDI 837/835) — planned for a later phase.
- Native mobile apps (PWA covers mobile use in Phase 1).
- Telemedicine / video consultation (future add-on).

---

## 3. User Roles & Permissions Matrix

| Role | Patients | Scheduling | Clinical Records | Billing | Inventory | Staff/HR | Reports | System Config |
|---|---|---|---|---|---|---|---|---|
| Super Admin | Full | Full | Full | Full | Full | Full | Full | Full |
| Clinic Admin | Full | Full | Read | Full | Full | Full (own clinic) | Full | Clinic-level |
| Dentist | Read/Update | Read/Update own | Full (own patients) | Read | Read | — | Own performance | — |
| Hygienist | Read | Read/Update own | Limited write | — | Read | — | — | — |
| Receptionist | Full (non-clinical) | Full | — | Create/Read | Read | — | — | — |
| Accountant | — | — | — | Full | — | — | Financial | — |
| Patient (portal) | Own record only | Book/Cancel own | Read own | Read own invoices | — | — | — | — |

Permissions are enforced via **RBAC with resource-level scoping** (e.g., a dentist can only access patients they are assigned to, not the entire clinic's records), not just role-name checks.

---

## 4. Functional Requirements by Module

### 4.1 Patient Registration & Demographics
- Demographics: name, DOB, contact, address, emergency contact, next of kin, referral source.
- **Unique Patient ID** auto-assigned on registration (used across charting, billing, imaging, and portal — the single key tying every module together).
- Medical & dental history: digital intake forms for allergies, chronic diseases (e.g., diabetes, hypertension), current medications, previous dental work — fillable by patient pre-visit via the portal or in-clinic on a tablet.
- Consent management: digital capture of patient (or guardian) signatures for specific procedures (extractions, root canals, sedation), stored as encrypted, timestamped, versioned documents tied to the specific procedure consented to.
- Patient search: by name, phone, ID, insurance number, with fuzzy matching; duplicate detection on registration.
- Patient portal: view treatment plans, upcoming appointments, invoices/pay bills, treatment history, book next appointment (detailed in 4.7.3).

### 4.2 Appointment & Scheduling
- Multi-doctor, multi-chair calendar view (day/week/month) with **drag-and-drop** rescheduling.
- **Color-coding by procedure type** (e.g., cleaning vs. surgery vs. consultation) for at-a-glance chair/doctor load.
- Appointment types with configurable duration (checkup, cleaning, extraction, root canal, etc.).
- Double-booking alerts and conflict detection enforced at the API layer, not just the UI (so it holds even via portal self-booking or integrations).
- Recurring appointments (e.g., orthodontic follow-ups every 4 weeks).
- Waitlist management with auto-fill on cancellation.
- No-show tracking and reporting.

### 4.3 Clinical & Dental-Specific Modules (Core EMR)

#### 4.3.1 Dental Charting (Odontogram)
- Interactive 2D (baseline) and progressively-enhanced 3D odontogram (Section 10.2), with **separate adult (permanent, FDI/Universal) and pediatric (primary teeth) charting modes**.
- Mark existing conditions (decay, missing teeth, existing crowns/fillings, fractures) and proposed treatments distinctly (existing vs. planned, color/pattern-coded).
- Full per-tooth history view: every condition and procedure ever logged against that tooth, across visits.

#### 4.3.2 Restorative Treatment Tracking
Restorations are one of the most frequent procedure types in a dental practice, so they get first-class data modeling rather than being a generic "procedure" line item:

- **Per-tooth, per-surface recording**: each restoration is logged against a specific tooth (FDI/Universal number) and specific surface(s) — Mesial, Occlusal/Incisal, Distal, Buccal/Facial, Lingual/Palatal (MODBL) — so multi-surface fillings are captured precisely (e.g., "Tooth 36, MOD composite").
- **Restoration type**: filling (composite, amalgam, glass ionomer), inlay/onlay, crown (PFM, zirconia, e-max), veneer, bridge (with abutment/pontic tooth mapping), post & core, root canal + restoration combo.
- **Material & shade**: material used, shade match (for anterior/aesthetic cases), lab used (for crowns/bridges sent out — linked to Lab Case Management, 4.5.2).
- **Status lifecycle**: Planned → In Progress (e.g., prep done, temp placed) → Completed → Failed/Replaced, so multi-visit restorations (like crowns needing a temp then a final cementation visit) are tracked as one case across visits rather than disconnected notes.
- **Longevity & recall**: expected lifespan/warranty period per restoration type, auto-flagging patients due for a restoration check at recall time.
- **Linkage to billing & inventory**: each restoration entry links to the fee schedule (for invoicing) and decrements inventory (e.g., composite material used) for cost tracking.
- **Chart visualization**: the odontogram color-codes teeth/surfaces by restoration status and material, giving dentists an at-a-glance treatment history per tooth.

#### 4.3.3 Periodontal Charting
- Dedicated periodontal exam screen recorded per tooth, per site (typically 6 sites/tooth: mesio-buccal, buccal, disto-buccal, mesio-lingual, lingual, disto-lingual):
  - Pocket depth (mm)
  - Bleeding on probing (yes/no)
  - Mobility grade (0–3)
  - Furcation involvement (grades I–III, molars)
  - Plaque index / gingival index
  - Recession (mm)
- Periodontal chart history over time (trend view per tooth/site) to show improvement or deterioration between hygiene visits.
- Auto-flag patients whose periodontal scores indicate they should be moved to a more frequent hygiene recall interval.

#### 4.3.4 Treatment Planning
- Step-by-step treatment **phases** (e.g., Phase 1: extractions, Phase 2: implants, Phase 3: crowns) with sequencing/dependencies.
- Estimated cost per phase and per procedure, with **insurance coverage estimate** applied (expected patient portion vs. expected insurance portion) pulled from the patient's insurance plan (4.4.1).
- Timeline/scheduling view tying each phase to target dates, and status (proposed/accepted/in progress/completed).
- Patient sign-off/approval captured (ties into Consent Management, 4.1) before treatment begins, with the accepted plan version locked and auditable.

#### 4.3.5 Imaging & Radiography (PACS / DICOM)
- Secure storage and viewing of intraoral X-rays (periapical, bitewing), OPG/panoramic, and CBCT scans, plus intraoral camera photos.
- **DICOM compatibility**: ability to import/export/view standard DICOM files so the system can interoperate with third-party imaging sensors/software already used by many practices, rather than locking the clinic into one imaging vendor.
- Lightweight in-browser DICOM/image viewer (zoom, contrast/brightness adjustment, annotation/measurement tools) in the PWA — no separate desktop viewer required for routine review.
- Image versioning and linkage to the specific visit/tooth/procedure they support; before/after comparison view (Section 10.2).
- Optional AI pre-screening on uploaded radiographs (Section 10.1) — advisory only, dentist-confirmed.
- Images stored in encrypted object storage, access-logged like any other clinical record (Section 7).

#### 4.3.6 E-Prescription (e-Rx)
- Prescribe antibiotics, analgesics/painkillers, mouthwashes, and other common dental medications from configurable templates (common dosages/durations pre-filled, editable).
- **Drug interaction alerts**: cross-check against the patient's recorded current medications and known allergies (from 4.1) before the prescription is finalized, surfacing warnings rather than silently blocking (final clinical judgment stays with the prescriber).
- Dosage templates per drug/procedure combination (e.g., standard post-extraction analgesic regimen), editable per patient.
- Printable and/or digitally-transmittable prescription (PDF, or direct e-Rx transmission to a pharmacy where locally supported).
- Full prescription history per patient, visible alongside clinical notes.

#### 4.3.7 Clinical Notes (EMR)
- Customizable templates for chief complaint, progress notes, and procedure details (SOAP-style: Subjective, Objective, Assessment, Plan — but templates configurable per clinic/procedure type).
- Procedure coding (configurable, can map to CDT codes for insurance).
- Full audit trail of who created/edited each clinical entry, with timestamps (append-only where possible).

### 4.4 Financial & Billing Modules

#### 4.4.1 Insurance Management
- Track each patient's insurance plan(s), coverage percentages per procedure category, and annual/lifetime limits.
- Generate and submit claims (structured for future EDI 837/835 integration), track claim status (submitted/approved/rejected/paid), and manage co-pay calculation automatically at invoicing time.
- Claim denial/resubmission workflow with reason tracking.

#### 4.4.2 Invoicing, Payment Plans & Outstanding Balances
- Invoice generation directly from completed dental-chart/treatment-plan entries (no manual re-entry of what was done).
- Multiple payment methods (cash, card, mobile money, bank transfer) via a pluggable payment gateway interface.
- **Payment plans/installments** — common for orthodontics and larger treatment plans — with configurable schedules, automated installment reminders, and overdue tracking.
- Outstanding balance and **bad-debt tracking/aging report** (30/60/90+ days).
- Receipts (PDF), statements, refunds, and credit notes with an approval workflow.

#### 4.4.3 Doctor Commissions / Revenue Split
- Configurable commission rules per dentist/specialist (flat %, tiered, or per-procedure-type rates) — common for clinics with visiting/associate dentists.
- Automatic calculation of each practitioner's earnings per completed, paid procedure.
- Commission statements exportable per practitioner per pay period, feeding into payroll (4.6).

### 4.5 Operational & Inventory Management

#### 4.5.1 Dental Inventory / Stock Control
- Stock items (consumables: gloves, syringes, composite resins, implants, anesthetic cartridges), supplier records, purchase orders.
- Expiry date tracking with alerts (important for implants, anesthetics, and other date-sensitive materials).
- Low-stock threshold alerts and reorder suggestions.
- Usage tracking linked directly to procedures/restorations logged in the chart (Section 4.3.2), enabling real material-cost-per-procedure analysis.

#### 4.5.2 Lab Case Management
- Track physical cases sent to external dental laboratories (crowns, bridges, dentures, aligners, night guards).
- Case record includes: item(s) sent, shade/specs, dispatch date, expected return date, actual return date, lab used, and associated lab cost.
- Status pipeline: Sent → In Progress at Lab → Received → Fitted/Delivered, with overdue-return alerts.
- Linked to the specific patient, tooth/teeth, and restoration entry (4.3.2) so a crown's full journey — prep, impression, lab turnaround, try-in, cementation — is traceable as one case.

### 4.6 Staff Management (HR)
- Staff profiles, roles, qualifications/certifications with expiry reminders (e.g., license renewal, CPR certification).
- **Access control/permissions enforced by role** (e.g., front-desk/receptionist accounts cannot view or edit clinical notes — enforced by the RBAC layer in Section 7.2, not just hidden in the UI).
- Shift scheduling and leave management.
- Payroll integration point (base salary + commission from 4.4.3), exportable for external payroll processing if not run natively.
- Performance metrics (procedures completed, revenue generated, patient satisfaction if collected).

### 4.7 Patient Engagement (CRM)

#### 4.7.1 Automated Reminders
- SMS, email, and/or WhatsApp notifications for upcoming appointments, configurable lead time (e.g., 24h and 2h before), to reduce no-shows.
- Delivered via the unified notification service abstraction (4.8) so channels/providers can be swapped without touching business logic.

#### 4.7.2 Recall System
- Automated recall reminders (e.g., "time for your 6-month cleaning") driven by procedure-specific recall intervals (hygiene, ortho check, periodontal maintenance — intervals can differ by patient risk profile, tying into 4.3.3 and 10.1).
- Recall due list reportable and actionable from the front desk (Section 4.8).

#### 4.7.3 Patient Portal
- Patients view treatment plans, pay outstanding invoices, download receipts/statements, view treatment/imaging history (non-sensitive summary level), and self-book or reschedule appointments within clinic-defined rules.

### 4.8 Analytics & Reporting

#### 4.8.1 Financial Reports
- Daily/monthly revenue, cash vs. credit/insurance split, outstanding payments and aging, commission payouts.

#### 4.8.2 Clinical Reports
- Most-performed procedures, material usage (tied to inventory, 4.5.1), restoration failure/replacement rates.

#### 4.8.3 Growth & Operational Metrics
- New patient acquisition trends, patient retention/recall compliance rate, chair/dentist utilization rate, no-show/cancellation rate.
- All reports exportable to CSV/PDF, and visualized per Section 10.2 rather than tables-only.

### 4.9 Notifications (Technical Service Layer)
- Unified notification service abstraction (email/SMS/WhatsApp/push) so providers (Twilio, SendGrid, WhatsApp Business API, Firebase) can be swapped without touching business logic in 4.2, 4.7.1, or 4.7.2.
- Templated messages, localization-ready.

### 4.10 Multi-Clinic / Multi-Tenant Support
**Decision: built in from the start**, not deferred to a later phase.

- **Tenancy model**: shared PostgreSQL database with a `clinic_id` column on every clinic-scoped table, enforced by (a) application-layer query scoping in the repository layer and (b) PostgreSQL Row-Level Security policies as a defense-in-depth backstop — so a bug in application code can't silently leak one clinic's data to another.
- **Staff-to-clinic assignment**: a staff member (especially a visiting/associate dentist) can be linked to one or more clinics; JWT/session context carries the "active clinic" the user is currently operating in, with a clinic-switcher in the UI for multi-clinic staff.
- **Clinic-scoped resources**: patients, appointments, clinical records, inventory, lab cases, invoices, and commissions are all scoped per-clinic. A patient record *can* optionally be shared across clinics in the same chain (configurable), but defaults to clinic-local.
- **Cross-clinic reporting**: chain-level dashboards (revenue, utilization, growth metrics — Section 4.8) aggregate across all clinics a Super Admin/owner has access to, while a single-clinic Admin only ever sees their own clinic's data.
- **Growth path**: a high-volume or high-compliance clinic can later be migrated to its own dedicated database without application changes, since the `clinic_id` boundary is already the unit of isolation everywhere.
- **Out of scope for now**: separate software-subscription/billing-for-the-platform-itself (distinct from the clinic's own patient billing in Section 4.4) — worth revisiting if this is ever sold as multi-tenant SaaS to unrelated clinic owners rather than operated as one chain.

---

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Availability | Target 99.5%+ uptime; graceful degradation if background services (SMS/email) fail |
| Performance | API p95 response time < 300ms for standard CRUD; search endpoints < 500ms |
| Scalability | Stateless API instances behind a load balancer; horizontal scaling via container orchestration |
| Offline support | PWA must allow viewing today's schedule and creating draft records offline, syncing on reconnect |
| Data retention | Clinical records retained per local medical record-keeping regulations (configurable retention policy) |
| Auditability | Every read/write to clinical and billing data logged with actor, timestamp, and action |
| Security | See Section 7 |
| Localization | UI and notification templates support multiple languages/currencies |
| Accessibility | WCAG 2.1 AA target for the PWA |

---

## 6. System Architecture

### 6.1 High-Level Architecture

```
                     ┌─────────────────────┐
                     │   PWA Frontend       │
                     │ (React/Vue + Vite)   │
                     │  Service Worker      │
                     └──────────┬───────────┘
                                │ HTTPS / TLS 1.3
                     ┌──────────▼───────────┐
                     │  Reverse Proxy        │
                     │ (Nginx / Traefik)     │
                     │  - TLS termination    │
                     │  - Rate limiting      │
                     └──────────┬───────────┘
                                │
                     ┌──────────▼───────────┐
                     │   FastAPI App(s)      │
                     │  (stateless, async)   │
                     │  - Auth & RBAC        │
                     │  - Domain services    │
                     └───┬──────────┬────────┘
                         │          │
             ┌───────────▼──┐   ┌───▼─────────────┐
             │ PostgreSQL   │   │ Redis            │
             │ (primary DB) │   │ (cache/session/  │
             │              │   │  rate-limit/queue│
             └──────────────┘   └───┬─────────────┘
                                     │
                          ┌──────────▼──────────┐
                          │  Celery/ARQ Workers  │
                          │ (reminders, reports, │
                          │  recurring billing)  │
                          └──────────────────────┘
```

Object storage (e.g., S3-compatible) sits alongside PostgreSQL for encrypted attachments (X-rays, documents), referenced by URL/key in the database rather than stored as blobs.

### 6.2 Backend Layering (per module)

```
Route (FastAPI router)
   → Dependency (auth, permission check, tenant scoping)
   → Service (business logic, orchestration)
   → Repository (SQLAlchemy queries)
   → Model (ORM entity)
```

This keeps routes thin, business rules testable in isolation, and DB access swappable.

### 6.3 Multi-Tenant Data Isolation
- Every clinic-scoped SQLAlchemy model includes a `clinic_id` foreign key; a shared base repository method injects the current request's `clinic_id` filter automatically, so individual endpoint code cannot forget to scope a query.
- A `tenant_context` middleware resolves the active `clinic_id` from the authenticated user's session/JWT claims at the start of each request and makes it available to the dependency-injection chain.
- PostgreSQL Row-Level Security policies mirror the same `clinic_id` check at the database level, so even a raw/ad-hoc query (e.g., run by an analyst or a future internal tool) is still constrained.
- Super Admin/chain-owner roles carry a claim allowing access across a defined set of `clinic_id`s (their chain), rather than bypassing the check entirely.

### 6.4 Suggested Backend Directory Structure

```
app/
├── core/           # settings, security utils, logging, custom exceptions
├── db/             # session factory, base model, Alembic migrations
├── models/         # SQLAlchemy models (patient, appointment, clinical, billing, ...)
├── schemas/        # Pydantic request/response schemas
├── api/v1/         # routers grouped by domain
├── services/       # business logic per domain
├── repositories/   # data access layer
├── tasks/          # background jobs (Celery/ARQ)
├── middleware/     # audit logging, rate limiting, request-id, tenant context
└── main.py
```

---

## 7. Security Architecture

Security is treated as a first-class module, not an afterthought.

### 7.1 Authentication
- OAuth2 password flow (or OIDC if integrating external identity providers).
- Short-lived JWT access tokens (10–15 min) + rotating, hashed refresh tokens persisted server-side (allows revocation).
- Multi-Factor Authentication (TOTP) required for Admin and Dentist roles; optional for others.
- Account lockout / exponential backoff after repeated failed logins.

### 7.2 Authorization
- Role-Based Access Control (RBAC) combined with resource-level scoping (e.g., dentist ↔ assigned patients).
- Enforced centrally via FastAPI dependencies — never trusted from the client.
- Tenant/clinic isolation enforced at the query layer, reinforced with PostgreSQL row-level security policies.

### 7.3 Data Protection
- TLS 1.3 for all traffic (frontend ↔ backend, backend ↔ DB where supported).
- Column-level encryption for highly sensitive fields (national ID, full medical history) using envelope encryption (KMS-managed keys).
- Encrypted object storage for attachments (X-rays, scanned documents).
- Database backups encrypted at rest, tested restore procedure.

### 7.4 Application Security
- Strict Pydantic schemas — reject unknown/extra fields, enforce type and length constraints.
- File upload validation: MIME-type verification, size limits, antivirus scanning before storage.
- Parameterized queries only (SQLAlchemy ORM prevents raw SQL injection by default; no raw string interpolation permitted).
- Security headers via middleware: HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy.
- CORS restricted to the known PWA origin(s) only.
- Rate limiting per IP and per account (Redis-backed), stricter on `/auth/*` endpoints.

### 7.5 Audit & Monitoring
- Append-only audit log table: actor, action, resource, before/after diff (for clinical/billing data), timestamp, IP.
- Centralized structured logging (JSON logs) shipped to a log aggregator.
- Application monitoring (Prometheus/Grafana) and error tracking (Sentry).
- Alerting on anomalous access patterns (e.g., bulk record exports, off-hours admin logins).

### 7.6 Secrets & Configuration
- No secrets in source control; environment variables injected at deploy time.
- Production secrets managed via a vault (HashiCorp Vault, AWS Secrets Manager, or equivalent).
- Separate configuration profiles per environment (dev/staging/prod).

### 7.7 Compliance Posture
- Design assumes HIPAA/GDPR-equivalent obligations regardless of jurisdiction: data minimization, right-to-access, right-to-erasure (with clinical-record retention exceptions where legally required), consent logging, and breach-notification readiness.

---

## 8. API Design Principles

- Versioned base path: `/api/v1/...`
- Consistent resource naming (`/patients`, `/appointments`, `/invoices`).
- Pagination via cursor or limit/offset with sane defaults and max caps.
- Standard error envelope: `{ "error": { "code": "...", "message": "...", "details": [...] } }`
- Idempotency keys supported on payment/billing POST endpoints to prevent duplicate charges on retry.
- OpenAPI docs auto-generated by FastAPI, restricted or disabled in production if exposing schema is a concern.

---

## 9. PWA Frontend Requirements

- Installable (manifest.json), works across desktop and mobile browsers.
- Service worker (Workbox) caches app shell and last-viewed non-sensitive data.
- Sensitive cached data (if any) stored in encrypted IndexedDB, never plain `localStorage`.
- Background Sync API for actions performed offline (e.g., new appointment draft), synced on reconnect with conflict resolution.
- Web Push (VAPID) for reminders and staff notifications.
- Responsive layouts for front-desk tablets and dentist-chairside devices.

---

## 10. AI & Intelligent Visualization Layer

A "modern" clinic system in 2026 is expected to do more than digitize paper forms — it should actively assist clinicians and give patients a clearer picture of their own mouth. This layer is designed as a set of **optional, pluggable services** that sit alongside the core modules rather than being baked into them, so the system remains useful even where AI features are disabled (e.g., due to cost, regulatory restrictions, or offline environments).

### 10.1 AI-Assisted Diagnostics (Restorative & Radiology)
- **X-ray/radiograph analysis**: integrate a dental-imaging AI model (third-party API or self-hosted, e.g., a model fine-tuned for caries/bone-loss/periapical-lesion detection) to pre-screen uploaded X-rays and highlight suspected caries, existing restorations, and bone-level changes for the dentist to confirm — always presented as a **decision-support suggestion**, never an autonomous diagnosis.
- **Caries risk scoring**: combine patient history (diet, hygiene habits, past caries, medical conditions like diabetes) into a simple risk score surfaced on the patient dashboard, to prioritize recall scheduling.
- **Restoration failure prediction**: using historical data (material, tooth position, patient age, oral hygiene score) to flag restorations statistically likely to need replacement soon — feeds directly into the recall/longevity tracking already defined in Section 4.3.2.
- All AI outputs are stored as **advisory annotations** linked to the clinical record, with the reviewing dentist's confirmation/override captured in the audit trail — this keeps liability and clinical judgment clearly with the licensed professional.

### 10.2 Visualization Capabilities
- **Interactive 2D dental chart / odontogram** (baseline, Section 4.3.1): SVG/Canvas-based, color-coded by condition/restoration/status, clickable per tooth/surface.
- **3D tooth & mouth visualization** (progressive enhancement): a 3D model (e.g., Three.js/WebGL in the PWA) for treatment-plan walkthroughs — useful for patient education ("here's what your crown will look like") and for treatment planning on complex cases (implants, bridges).
- **Before/after imaging**: side-by-side or overlay comparison of intraoral photos/X-rays across visits to visualize treatment progress or restoration wear over time.
- **Visual treatment plan timeline**: a Gantt-style view of a patient's multi-visit treatment plan (e.g., root canal → post & core → crown), so patients and staff see the full case at a glance.
- **Analytics dashboards**: revenue, recall, and chair-utilization visualizations (charts) for admins — data already defined in Sections 4.7 (Patient Engagement/Recall) and 4.8 (Analytics & Reporting), presented visually rather than only as tables/exports.

### 10.3 Other AI-Enhanced Touchpoints (as needed)
- **Smart scheduling assistant**: suggests optimal appointment slots based on procedure duration, dentist specialty, and historical no-show patterns for that patient.
- **Clinical note assistance**: optional speech-to-text and note-summarization to help dentists draft SOAP notes faster (draft only — dentist reviews/edits before saving, never auto-finalized).
- **Patient-facing chatbot**: FAQ/booking assistant on the PWA/portal for common questions (hours, appointment rescheduling, pre-op instructions), backed by a constrained knowledge base rather than open-ended generation, to avoid giving unsupervised medical advice.
- **Inventory demand forecasting**: predict consumable usage (e.g., composite material) from historical procedure volume to optimize reordering.

### 10.4 Architectural Approach for AI Features
- AI/ML capabilities are exposed as an internal **"AI Gateway" microservice**, decoupled from the core FastAPI monolith, so model upgrades/swaps (self-hosted vs. third-party API) don't touch core clinical/billing logic.
- Model inference calls are async and queued (via the existing Celery/ARQ workers) so they never block the request/response cycle for routine CRUD operations.
- All patient data sent to any AI model (self-hosted or third-party) must respect the same encryption, access-control, and audit requirements as Section 7 — no PHI leaves the security boundary ungoverned; strongly prefer self-hosted or contractually-bound (BAA-equivalent) providers for anything touching clinical images or notes.
- Every AI-generated suggestion is visually and structurally distinguished in the UI/API from human-entered clinical data (e.g., an `is_ai_suggested: true` flag, a distinct color/badge), preserving a clear line between assistive output and the clinician's own record.

---

## 11. Deployment & DevOps

- Containerized with Docker; `docker-compose` for local/dev; Kubernetes (or managed container service) for production scaling.
- CI/CD pipeline: lint → test → security scan (dependency + SAST) → build image → deploy.
- Database migrations via Alembic, applied automatically in CI/CD with rollback plan.
- Blue/green or rolling deployments to avoid downtime.
- Automated backups (DB + object storage) with periodic restore testing.

---

## 12. Suggested Delivery Phases

| Phase | Scope |
|---|---|
| Phase 1 | Auth/RBAC, Patient Registration (unique ID, history, consent), Scheduling (drag-drop, color-coded), basic Clinical Notes/EMR, Billing (cash/card), Odontogram (2D) |
| Phase 2 | Restorative tracking, Periodontal charting, Treatment Planning (phases + cost estimate), E-Prescription, Inventory/Stock Control, Staff/HR, Financial & Clinical reports |
| Phase 3 | Imaging & Radiography (PACS/DICOM viewer), Lab Case Management, Insurance Management, Payment Plans & Doctor Commissions, Patient Portal, Recall System |
| Phase 4 | Multi-clinic rollout, 3D tooth visualization, Growth/analytics dashboards, WhatsApp notification channel |
| Phase 5 | AI Gateway: X-ray pre-screening, restoration-failure prediction, smart scheduling, patient chatbot, inventory forecasting |
| Phase 6 | PWA offline sync hardening, EDI insurance integration (837/835), analytics maturity |

---

## 13. Open Questions to Confirm Before Build

1. ~~Single clinic only for Phase 1, or multi-clinic from the start?~~ **Decided: multi-clinic from the start**, using a shared database with `clinic_id` scoping + PostgreSQL Row-Level Security (see Section 4.10 and 6.4). Phase 1 UI may still ship configured for a single clinic, but the data model and auth model support multiple clinics from day one.
2. Which countries/regions (affects currency, tax rules, and applicable data-protection law)?
3. Preferred payment gateway(s) for the billing module?
4. Do dentists need chairside tablet mode with a stripped-down clinical-only UI?
5. Any existing system to migrate data from?
6. Which AI features are must-have for launch vs. nice-to-have later (e.g., X-ray analysis is higher-effort/higher-liability than a scheduling assistant or dashboard visualizations)?
7. Self-hosted AI models vs. third-party API providers — this affects cost, data-residency, and compliance posture significantly.

---

*End of document.*
