# DEMSTA — Complete Implementation Todo List

**Product:** Dental Electronic Management System for Treatment & Administration  
**Goal:** One modern, cloud-ready clinic OS that replaces fragmented legacy PMS tools with a unified, secure, multi-clinic platform.  
**Status legend:** `[x]` done / scaffolded · `[ ]` todo · `[~]` partial  

---

## 0. Why DEMSTA exists (problems → brand innovations)

Older dental systems (on-prem Dentrix/Eaglesoft-style stacks, bolted-on “cloud”, paper/clerkship forms) create the same failures. DEMSTA is designed to **solve each one** with a named product capability.

| # | Legacy / elder-system problem | DEMSTA innovation / solution | Primary modules |
|---|---|---|---|
| P1 | Fragmented tools (chart + imaging + billing + SMS = multiple logins, double entry) | **Single Clinical Ledger** — one patient ID drives chart, schedule, billing, lab, imaging, portal | Patients, Clinical, Billing, Ops |
| P2 | Desktop-only / server in the cupboard; crash = downtime | **Cloud-native PWA Clinic OS** — installable, chairside tablets, offline drafts, no clinic server required | PWA, DevOps |
| P3 | Charting ≠ billing (re-type procedures → missed revenue) | **Chart-to-Cash** — completed chart items auto-create invoice lines with fee schedule + inventory decrement | Restorative, Billing, Inventory |
| P4 | Paper intake / Word clerkship forms; incomplete histories | **Digital Clerkship Engine** — structured anamnesis, exam, pulp tests, ortho/restorative fields from clinical forms | Clinical EMR |
| P5 | Generic “procedure” lines; no surface/lifecycle for restorations | **Surface-True Restorative Graph** — tooth + MODBL surfaces + status Planned→Temp→Final→Failed | Restorative |
| P6 | No real multi-site isolation; DSO reporting is spreadsheets | **Tenant-first data plane** — `clinic_id` + RLS + clinic switcher + chain dashboards | Multi-clinic, Security |
| P7 | Weak RBAC; front desk can see clinical notes | **Role + resource scoping** — dentist↔patient assignment; clinical notes sealed from receptionist | Auth/RBAC |
| P8 | High no-shows; one-channel reminders | **Recall & Reach** — SMS/email/WhatsApp/push via one notification gateway; risk-based recall intervals | CRM, Notifications |
| P9 | Treatment plans patients don’t understand → low acceptance | **Visual Case Studio** — odontogram + phased plan timeline + before/after + optional 3D walkthrough | Viz, Treatment Plan |
| P10 | AI bolted on, liability unclear | **Advisory AI Gateway** — suggestions flagged, dentist confirms, full audit; never auto-diagnoses | AI Layer |
| P11 | Lab cases tracked in notebooks; crowns get lost | **Lab Journey** — Sent→Lab→Received→Fitted linked to tooth + restoration + cost | Lab |
| P12 | Insurance/claims afterthought; denials unmanaged | **Claims Cockpit** (phased) — eligibility estimates → claim status → denial resubmit | Insurance |
| P13 | No audit trail; compliance theater | **Append-only Clinical Audit** — actor, before/after, IP; encryption for PHI | Security |
| P14 | Staff fight the UI; slow chairside | **Chairside Mode** — large-touch odontogram, SOAP templates, speech-to-text draft | PWA UX |
| P15 | Teaching/clinic forms vs real PMS mismatch | **Academic ↔ Practice bridge** — clerkship grading rubrics optional; same core data model for private clinics | Clinical, Education packs |

**Brand pillars (use in UI/copy):** *One record. One ledger. One clinic OS.*

---

## 1. Product decisions (do before / early in implementation)

- [ ] Confirm primary deployment region(s), currency, tax rules, and data-protection baseline (GDPR/HIPAA-equivalent)
- [ ] Confirm payment gateway(s) (card + mobile money if regional)
- [ ] Confirm notification channels for Phase 1 vs later (email first; SMS/WhatsApp later)
- [ ] Confirm whether Phase 1 ships single-clinic UI only (data model stays multi-clinic)
- [ ] Confirm migration: greenfield only vs import from existing PMS/Excel
- [ ] Confirm chairside tablet as first-class layout (recommended: yes)
- [ ] Confirm tooth numbering default: FDI vs Universal (support both; clinic setting)
- [ ] Confirm AI launch posture: stubs only until Phase 5 (recommended)

---

## 2. Foundation & platform (scalable core)

### 2.1 Engineering platform
- [x] FastAPI modular monolith scaffold (`app/core`, `api/v1`, models, services)
- [x] React 19 + Vite + TypeScript + Tailwind PWA scaffold
- [x] JWT access + rotating hashed refresh tokens, lockout, RBAC roles
- [x] Multi-tenant `clinic_id` on core tables
- [x] Docker Compose (API + Postgres + Redis) — healthchecks + pool env
- [x] Alembic migrations as sole schema source of truth (`AUTO_MIGRATE`)
- [x] Repository layer with automatic `clinic_id` injection (`TenantRepository`)
- [x] PostgreSQL Row-Level Security policies mirroring app tenancy
- [x] Redis: rate-limit/cache (in-memory fallback when disabled)
- [ ] Celery or ARQ workers for reminders, reports, AI jobs
- [x] Request IDs on every response (`X-Request-ID`)
- [ ] Structured JSON logging shipped to aggregator
- [ ] Sentry (errors) + Prometheus metrics endpoints
- [ ] CI: lint → unit/integration tests → dependency/SAST scan → image build
- [ ] Encrypted object storage interface (S3-compatible) for images/consents
- [x] Secrets via env/vault only; no secrets in git
- [x] OpenAPI as frontend contract; error envelope `{error:{code,message,details}}`
- [x] API versioning discipline (`/api/v1`); pagination + max caps on all lists
- [x] Idempotency keys on payment/billing POSTs (extend to claim submit)
- [x] DB connection pooling + `pool_pre_ping` for horizontal API scale
- [x] `/live` + `/ready` probes (DB + Redis) for orchestrators
- [x] Rate limiting (stricter on `/auth/*`)

### 2.2 Security & compliance
- [x] Basic audit log on auth/clinical/billing actions
- [ ] MFA (TOTP) required for Admin + Dentist
- [ ] Column-level encryption for national ID / sensitive history fields
- [ ] File upload validation (MIME, size, antivirus hook)
- [ ] Security headers middleware (HSTS, CSP, etc.)
- [ ] CORS locked to PWA origins
- [ ] Rate limits stricter on `/auth/*`
- [ ] Breach-notification runbook + backup restore drill documented
- [ ] Data retention / right-to-erasure policy with clinical retention exceptions
- [ ] Patient consent versions stored encrypted + timestamped

### 2.3 Brand & UX system
- [x] DEMSTA logo + blue–white clinical theme baseline
- [x] Design tokens (CSS variables): brand, clinical status colors, surface states
- [x] Typography system (expressive, non-generic clinical UI — not Inter-default look)
- [x] Role-aware navigation (Reception vs Dentist vs Admin)
- [x] Chairside Mode layout (large targets, reduced chrome)
- [x] Empty states + offline banners
- [x] Accessibility pass (WCAG 2.1 AA target)
- [x] Localization hooks (i18n strings + multi-currency formatting)

---

## 3. Phase 1 — Clinic OS MVP (implement next)

**Outcome:** Digitize front desk + chairside basics with Chart-to-Cash seed. Solves P1–P3, P6–P7, P13 partially.

### 3.1 Auth, tenancy, staff
- [x] Login + role demo accounts
- [x] Clinic entity CRUD (Super Admin)
- [x] Staff invite / password reset / refresh revocation (invite + profiles; reset later)
- [x] Active-clinic claim in JWT + clinic switcher UI (`X-Clinic-Id` for platform owner)
- [x] Dentist↔patient assignment for resource scoping
- [x] Permission matrix enforced on every route (not UI-hide only)
- [x] Department panels: front desk, clinical, hygiene, imaging, lab, pharmacy, inventory, clinic admin, system owner
- [x] Extended roles: lab_tech, pharmacy, imaging_tech + rich multi-clinic seed

### 3.2 Patient Registration & Demographics (Architecture §4.1 + Clerkship form)
- [x] Unique patient ID, fuzzy search, duplicate detection (baseline)
- [x] **Hospital / clinic registration number** field (clerkship)
- [x] Full demographics: DOB, sex, marital status, occupation, tribe/nation (configurable)
- [x] Structured address: P.O. Box, street, house no., area/ward, town/city
- [x] Emergency contact + next of kin + referral source
- [ ] Digital intake form (tablet + portal-ready schema) — staff UI done; portal later
- [x] Medical history checkboxes: diabetes, BP, asthma, allergies, heart, surgeries, HIV/AIDS, pregnancy trimester
- [x] Current medications (type + dosage)
- [x] Family / social / developmental history (incl. prenatal/postnatal where relevant)
- [x] Past dental history (attendance reasons: checkup, extraction, scaling, restoration, prosthesis)
- [x] **Pain assessment block:** onset, severity, character, quality, duration, radiation, aggravating/relieving
- [x] Reported symptoms checklist (cavities, swelling, fistula, halitosis, bleeding, loose dentures, ulceration)
- [~] Consent capture (signature pad + hashed trail + audit; encrypted PDF/object storage later)
- [ ] Duplicate merge workflow with audit

### 3.3 Scheduling
- [x] Color-coded appointment types, conflict detection, smart slot suggestions (baseline)
- [~] Day/week multi-doctor calendar (month + chair-lane view later)
- [x] Drag-and-drop reschedule (API conflict recheck on PATCH)
- [ ] Configurable durations per appointment type
- [ ] Recurring appointments (ortho recall every N weeks)
- [~] Waitlist + offer into open slot (auto-offer on cancel later)
- [x] No-show flag + reporting seed
- [ ] Offline draft appointments + sync/conflict resolution

### 3.4 Clinical notes & odontogram (baseline EMR)
- [x] SOAP notes + interactive FDI odontogram (baseline)
- [x] Per-tooth history timeline (chart + restorations + endo)
- [ ] Adult vs pediatric (primary) charting modes
- [ ] Existing vs planned conditions (distinct visual coding)
- [ ] SOAP templates per procedure type (clinic-configurable)
- [ ] Procedure coding hooks (CDT/local code map)
- [ ] Append-only edit policy (amendments as new versions)

### 3.5 Clinical Examination module (Clerkship §3) — structured visit forms
- [x] Visit container linking complaint → exam → investigations → diagnosis → plan
- [x] Vital signs: BP, pulse, height, weight, posture, gait, appearance (healthy/ill)
- [x] Extra-oral: head/face form, symmetry, proportions, profile
- [x] Skeletal relationships (A/P/vertical)
- [x] Aesthetic markers: smile line, smile corridor (mm), nasolabial angle, chin, mentolabial sulcus
- [x] Lip competence; TMJ (tenderness, sounds, deviation, restriction); lymph nodes
- [x] Intra-oral soft tissue: tongue, palate, gingiva/mucosa, periodontium summary
- [x] Hard tissue status flags: unerupted / missing / decayed / filled / defective / worn / discolored
- [x] Deposits (plaque/calculus) by sextant
- [x] Occlusion / malocclusion + prosthesis status + oral habits

### 3.6 Billing MVP (Chart-to-Cash seed)
- [x] Invoices, payments, idempotency (baseline)
- [x] Fee schedule master (clinic-scoped)
- [x] Invoice lines generated from completed clinical/chart items
- [x] Payment methods: cash, card, mobile money, bank transfer (pluggable gateway)
- [~] PDF receipts + daily cash-up report (browser print receipt + cash-up by method; PDF lib later)
- [x] Outstanding balance list (simple aging)

### 3.7 Phase 1 quality bar
- [x] E2E test: register patient → book → examine → note → invoice → pay (service-layer)
- [ ] Load test smoke on patient search & calendar
- [ ] Security review of auth + tenant isolation
- [ ] Ops runbook: backup, restore, deploy

---

## 4. Phase 2 — Clinical depth & operations

**Outcome:** Surface-True Restorative Graph + perio + plans + e-Rx + stock. Solves P4–P5, P11 partial.

### 4.1 Restorative Treatment Tracking (Architecture §4.3.2 + Clerkship §6)
- [x] Per-tooth, per-surface (M/O/I/D/B/F/L/P) restoration records
- [x] Types: filling (composite/amalgam/GIC), inlay/onlay, crown (PFM/zirconia/e-max), veneer, bridge (abutment/pontic map), post & core, RCT+restoration
- [x] Cavity size (S/M/L) + Black’s class I–V
- [x] Material + shade + lab link
- [x] Status lifecycle: Planned → In Progress (prep/temp) → Completed → Failed/Replaced
- [x] Multi-visit restoration case ID spanning appointments
- [x] Longevity / warranty → auto recall flag
- [x] Chart color-coding by status/material
- [x] Link to fee schedule + inventory usage
- [x] Quality rubrics (teaching/clinic): marginal adaptation, contacts, wear, postop sensitivity, pulp status, color match, finishing

### 4.2 Endodontics (Clerkship §6)
- [x] Procedure type: pulpotomy / pulpectomy / RCT
- [x] Tooth length, canal count, working length (mm)
- [x] Prep method (conventional / step-back / step-down)
- [x] Irrigants, dressings (Eugenol, Cresophane, CPCP, etc.)
- [x] Obturations across visits with dates
- [x] Link endo case → final restoration

### 4.3 Periodontal charting
- [x] Perio chart UI exists — wire full persistence + history
- [x] 6 sites/tooth: PD, BOP, mobility, furcation, plaque/gingival indices, recession
- [x] Trend view over visits
- [x] Auto-flag high-risk → shorter hygiene recall

### 4.4 Diagnosis & Treatment Planning (Clerkship §5 + Architecture §4.3.4)
- [x] Ranked problem list → working diagnosis → final impression
- [x] **Dental ICD-10-CM K00–K14** searchable catalog on visit diagnosis + treatment-plan items (GitHub CMS extract)
- [x] Phased treatment plans with dependencies
- [x] Cost per phase/procedure + patient vs insurance estimate
- [x] Timeline / Gantt-style visual plan
- [x] Patient sign-off locks accepted plan version
- [x] Internal/external referral routing (OS, Ortho/Pedo, Operative, Perio, Pros, Medical/Surgical)

### 4.5 Investigations (Clerkship §4) — pre-PACS
- [x] Photography metadata (extra/intra-oral, dated)
- [x] Study models notes + photos
- [x] Pulp testing: percussion, cold, heat, test cavity
- [x] Radiograph report fields (radiolucent/opaque, root/furcation) pending full DICOM

### 4.6 E-Prescription
- [x] Drug templates (antibiotics, analgesics, mouthwash) — department shell
- [x] Allergy + medication interaction warnings (advisory)
- [x] Prescription CRUD + history API/UI (PDF later)

### 4.7 Inventory / stock
- [x] Items, low-stock thresholds, adjust stock — department shell
- [x] Suppliers, POs, expiry alerts
- [x] Usage linked to logged procedures/restorations
- [x] Material cost-per-procedure report seed

### 4.8 Staff / HR
- [x] Profiles + staff invite (clinic admin panel)
- [x] Certifications expiry reminders
- [x] Shift/leave scheduling
- [x] Performance metrics hooks (procedures, revenue)

### 4.9 Reports (Phase 2)
- [x] Financial: daily/monthly revenue, outstanding
- [x] Clinical: top procedures, restoration failure rate
- [x] Operational: utilization, no-show rate

---

## 5. Phase 3 — Imaging, lab, insurance, portal, recall

**Outcome:** Close remaining revenue-cycle and patient-engagement gaps. Solves P8, P11–P12, imaging silo.

### 5.1 Imaging / PACS-lite
- [x] Study metadata registry + stub storage keys (imaging department shell)
- [~] Encrypted object storage for X-rays, OPG, CBCT, photos (local Fernet store + upload/view)
- [ ] DICOM import/export/view
- [~] In-browser viewer (basic image view; zoom/contrast/annotate later)
- [~] Link images to visit/tooth/procedure (tooth + visit_id on study)
- [ ] Before/after comparison UI

### 5.2 Lab Case Management
- [x] Case pipeline: Sent → In Progress → Received → Fitted (department shell)
- [x] Shade/specs, dates, lab cost
- [x] Overdue alerts
- [x] Hard link to restoration entry

### 5.3 Insurance
- [x] Patient plans, coverage %, annual/lifetime limits
- [x] Co-pay estimate at invoicing
- [ ] Claim draft/submit/status/denial/resubmit (pre-EDI)
- [ ] EDI 837/835 adapter interface (implement later Phase 6)

### 5.4 Payment plans & commissions
- [ ] Installment schedules + reminders + overdue
- [ ] Bad-debt aging 30/60/90+
- [ ] Doctor commission rules + statements

### 5.5 Patient portal & CRM
- [ ] Portal: view plan, appointments, invoices, pay, limited history
- [ ] Self-book within clinic rules
- [ ] Automated reminders (24h / 2h)
- [ ] Recall engine (hygiene/ortho/perio intervals by risk)
- [ ] Front-desk recall due list

### 5.6 Notifications service
- [ ] Unified gateway abstraction (email/SMS/WhatsApp/push)
- [ ] Templated, localized messages
- [ ] Provider swap without touching domain logic

---

## 6. Phase 4 — Scale, multi-clinic polish, visualization

**Outcome:** DSO-ready visibility + Visual Case Studio. Solves P2, P6, P9 at scale.

- [ ] Multi-clinic rollout UX (switcher, chain admin)
- [ ] Cross-clinic dashboards (revenue, utilization, retention)
- [ ] Optional patient share across clinics in a chain
- [ ] 3D tooth/mouth visualization (Three.js) for case acceptance
- [ ] Growth analytics: acquisition, recall compliance, chair ROI
- [ ] WhatsApp channel productionization
- [ ] Horizontal scale playbook (K8s, blue/green, autoscaling)

---

## 7. Phase 5 — AI Gateway (advisory only)

**Outcome:** Decision support without replacing clinician. Solves P10.

- [x] AI gateway stubs (caries risk, smart schedule, SOAP draft)
- [ ] Persist all AI outputs as `is_ai_suggested` annotations
- [ ] Dentist confirm/override required before chart commit
- [ ] Radiograph pre-screen (caries/bone loss/periapical) — BAA/self-hosted preference
- [ ] Restoration failure prediction → recall feed
- [ ] Smart scheduling from duration + specialty + no-show history
- [ ] Clinical note STT + summarization (draft only)
- [ ] Constrained patient FAQ/booking chatbot (no unsupervised medical advice)
- [ ] Inventory demand forecasting
- [ ] PHI egress controls + audit for every model call

---

## 8. Phase 6 — Hardening & interoperability

- [ ] PWA offline sync maturity (encrypted IndexedDB, conflict UX)
- [ ] EDI insurance clearinghouse integration
- [ ] Analytics maturity (export, scheduled reports, BI hooks)
- [ ] Dedicated DB migration path per high-compliance clinic
- [ ] Penetration test + remediation
- [ ] Formal DR / RPO-RTO targets validated

---

## 9. DEMSTA brand innovation backlog (differentiate from elder PMS)

Ship these as named features (not generic checkboxes) so marketing and product stay aligned:

| Innovation name | Problem solved | Phase |
|---|---|---|
| **Single Clinical Ledger** | Double entry across tools | 1–2 |
| **Chart-to-Cash** | Missed charges | 1–2 |
| **Digital Clerkship Engine** | Paper forms / incomplete anamnesis | 1–2 |
| **Surface-True Restorative Graph** | Vague fillings/crowns | 2 |
| **Lab Journey** | Lost lab cases | 3 |
| **Recall & Reach** | No-shows & lost patients | 3 |
| **Visual Case Studio** | Low treatment acceptance | 2–4 |
| **Chairside Mode** | Slow, cluttered charting | 1–2 |
| **Tenant-first Clinic Fabric** | Multi-site chaos | 1 + 4 |
| **Advisory AI Gateway** | Unsafe black-box AI | 5 |
| **Claims Cockpit** | Denial chaos | 3–6 |
| **Education Pack** (optional) | Teaching clinics need rubrics | 2 |

---

## 10. Implementation order (execute next)

Work in **vertical slices**, not horizontal “finish all models then UI”.

### Sprint track A — Close Phase 1 gaps (immediate)
1. [~] Product decisions §1 (region, payments, tooth numbering)
2. [x] Alembic + Postgres + RLS + repository tenancy
3. [x] Expand patient schema to full clerkship demographics + medical/pain blocks
4. [x] Visit/exam structured forms (vitals → extra/intra-oral)
5. [x] Fee schedule + Chart-to-Cash invoice from completed items
6. [x] Calendar day/week + drag-drop + waitlist
7. [~] Consent capture + audit hardening (pad + list + audit; encryption/PDF later)
8. [~] E2E happy path (service-layer done) + security pass remaining

### Sprint track B — Phase 2 clinical core
1. [x] Restoration + surface model + odontogram binding
2. [x] Endo multi-visit case
3. [x] Perio persistence + trends
4. [x] Treatment plan phases + patient sign-off
5. [x] e-Rx + inventory usage links
6. [x] Reports v1

### Sprint track C — Phase 3 engagement & revenue
1. [~] Imaging storage + basic viewer (DICOM/annotate later)
2. [x] Lab Journey (overdue + restoration hard-link)
3. [~] Insurance estimates (claims status later)
4. [ ] Portal + Recall & Reach notifications

### Sprint track D — Scale & intelligence
1. [ ] Multi-clinic dashboards + 3D Visual Case Studio
2. [ ] AI Gateway production features
3. [ ] Offline + EDI + pen-test

---

## 11. Definition of Done (every feature)

A feature is done only when **all** are true:

1. API + UI + migration + tenant scoped  
2. RBAC enforced server-side  
3. Audit log for clinical/billing writes  
4. Tests (unit + at least one API integration)  
5. OpenAPI updated  
6. No double entry required vs another DEMSTA module  
7. Documented in short module README or architecture cross-link  

---

## 12. Current codebase snapshot (as of this list)

| Area | State |
|---|---|
| Auth / RBAC / refresh | Done (scaffold + hardening items remain) |
| Patients / clerkship intake | Done |
| Scheduling day/week + DnD + waitlist | Done (month/offline later) |
| Odontogram / SOAP / tooth timeline / consent pad | Done (encrypted PDF later) |
| Billing / Chart-to-Cash / aging / cash-up / print receipt | Done (PDF lib later) |
| Phase 2 clinical depth (restorative/endo/perio/plans/e-Rx/inventory/reports) | Done |
| AI stubs | Present |
| PWA installability | Baseline |
| DICOM / lab polish / insurance / portal / workers | Not yet |
| Dentist↔patient assignment + scoped list/get | Done |
| E2E happy path (service-layer) | Done |
| Lab overdue + restoration hard-link | Done |
| Imaging encrypted local upload/view | Done (PACS/DICOM later) |
| Insurance plans + co-pay estimate | Done (claims later) |
| Portal / recall / claims / HTTP E2E | Next |

---

*This list is the single source of truth for implementation sequencing. Next action: **portal + Recall & Reach**, insurance claims draft, or Track A polish (HTTP E2E / security review).*
