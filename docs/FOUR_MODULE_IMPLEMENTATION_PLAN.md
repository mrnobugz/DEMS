# DEMSTA four-module implementation plan

**Product:** DEMSTA (Dental Electronic Management System for Treatment & Administration)  
**Date:** 19 Sep 2026  
**Stance:** Extend the modular monolith. Do not replace Clinic, the warehouse ledger, or the patient chart.

## Status

**In progress.** Wave 0 + Configurations C1 shipped 19 Sep 2026:

- `domain_events` outbox (`appointment.created`, `appointment.status_changed`, `config.changed`)
- `system_settings` with platform → clinic → user inheritance
- `number_sequences` used by new patient IDs and invoices
- `org_departments`, `operatories`, `working_hours`, `holidays` (deactivate, do not delete)
- Config API `/api/v1/config/*` and Admin **Organization** view
- Appointments bind `operatory_id`; schedule chair picker uses operatories

Next slice: C2 editable role-permission matrix + provider profiles, then C3 catalogs.

Companion visual: Cursor canvas `four-module-expansion.canvas.tsx`.

---

## 1. What the codebase already is

DEMSTA is a **clinic-scoped modular monolith**:

| Layer | Reality |
|---|---|
| Tenant | `Clinic` (`MAIN`, `EAST`). Owner switches with `X-Clinic-Id`. This **is** the spec’s Branch. |
| Auth | JWT + hardcoded `Role` / permission catalog in `backend/app/core/rbac.py`, plus per-user grant/deny. |
| Clinical | Patient clerkship, visits, FDI odontogram (permanent + primary), perio 6-point, SOAP, treatment plans, restorative/endo/specialty, Rx, lab, imaging files, consents. |
| Money | Catalog + fee lines with `effective_from`, Chart-to-Cash, invoices, payments, aging, insurance plans (pre-EDI). |
| Stock | `StockLocation`, `StockLot`, append-only `StockMovement`, FEFO, moving weighted average, PO receive/issue/stocktake. |
| Reports | Thin KPI cards (`/reports`) + warehouse analysis tab. No events, no star schema. |

**Do not invent a second inventory or a second chart.** Requisition is a workflow on `post_movement`. Configurations is a promotion of `/admin` + `/owner`. Analytics consumes events that Wave 0 starts emitting.

---

## 2. Spec → DEMSTA mapping

| Spec name | Keep / map | New |
|---|---|---|
| Branch | `clinics` | None. Multi-site = more clinics in the chain. |
| Department | Enum `ClinicDepartment` is navigation only | `departments` org table (code, name, head, hours, store location). |
| Operatory / chair | `Appointment.chair_number` | `operatories` (name, department_id, equipment flags). |
| Role, Permission, User | `rbac.py` + `users` | DB `role_permissions` seeded from code; Admin can edit; code remains fallback. |
| Provider | `User` + `StaffProfile` | `provider_profiles` (specialty, schedule JSON, production/commission rates). |
| ProcedureCode | `catalog_items` + `fee_schedule_items` | Unify: catalog is the code master; fee schedules price it. |
| FeeSchedule | Flat `fee_schedule_items` | `fee_schedules` header (cash / corporate / insurance) + dated items. |
| Template | `drug_templates` | Note, consent, Rx, letter, medical-history questionnaire templates. |
| NumberSequence | Ad-hoc patient/invoice numbers | `number_sequences` (clinic, document type, prefix, next, padding). |
| SystemSetting | Env + `uiPrefs` | `system_settings` with scope `platform \| clinic \| user`. |
| Family / Guarantor | NOK columns | `family_accounts` + `family_members` (guarantor, shared AR). |
| ProcedureRecord | Chart / restoration / plan items | Unified `procedure_records` with lifecycle below. |
| Requisition | Issues + POs | `requisitions`, `requisition_lines`, `approval_workflows`. |
| GoodsReceipt | PO receive | `goods_receipts` (later three-way match). |
| ProcedureKit | `inventory_usages` | `procedure_kits` + `procedure_kit_lines` consumed on `procedure.completed`. |
| Analytics warehouse | OLTP report endpoints | `domain_events` now; facts/dims in Wave 4. |

### Design rules (non-negotiable)

1. **Deactivate, do not delete** config and catalog rows that historical records reference (`is_active`, `deactivated_at`, `deactivated_by`).
2. **Price snapshots** on invoices and presented treatment plans. Fee changes never rewrite old money.
3. **Inheritance:** platform default → clinic override → user override (`SystemSetting`, tooth notation, locale, feature flags).
4. **Audit** every configuration write and every clinical view/edit/export (who, what, before, after, IP).
5. **CSV import + seed** so a new clinic can stand up codes, fees, items, and users without clicking through Admin.
6. **Stock quantities** change only through `StockMovement`. Balances are derived.
7. **Costing:** keep **moving weighted average** (already in `warehouse.py`). Do not switch to FIFO mid-flight.
8. **Domain events** are append-only. Consumers are idempotent on `event_id`.

---

## 3. Cross-cutting foundations (Wave 0 — first)

Ship this **before** Configurations screens, because later modules read it.

### 3.1 `domain_events` outbox

```
id, clinic_id, event_type, aggregate_type, aggregate_id,
payload_json, occurred_at, published_at, actor_id
```

First event types (payloads versioned):

| Event | When | Consumers (later) |
|---|---|---|
| `procedure.completed` | ProcedureRecord → completed | Billing, kit deduction, analytics |
| `appointment.status_changed` | Appointment PATCH | Analytics, notifications |
| `requisition.approved` | Approval step complete | Store, procurement |
| `stock.below_par` | After movement | Auto-indent, alerts |
| `config.changed` | Any config write | Audit UI, cache |
| `note.signed` | ClinicalNote locked | Audit, quality metrics |

Implementation: write the row in the same DB transaction as the domain change. A worker (ARQ/Celery — still TODO on the platform) drains unpublished rows. Until the worker exists, in-process handlers may run synchronously **and** persist the event so Analytics backfill is possible.

### 3.2 Mixins

- `ActivatableMixin`: `is_active`, `deactivated_at`, `deactivated_by_id`
- `ConfigAudited`: helper wrapping `write_audit` with resource type `config.*`

### 3.3 `system_settings` + `number_sequences`

Settings keys to seed immediately:

- `clinical.tooth_notation` = `fdi` \| `universal` \| `palmer`
- `clinic.timezone`, `clinic.currency` (already on `Clinic`; keep as source, settings can override display)
- `feature.*` flags (requisition, analytics_phi_drilldown, dicom)
- `notify.sms_enabled`, template keys already in notification outbox

Sequences: `patient`, `invoice`, `requisition`, `purchase_order`, `lab_case`.

### 3.4 Permissions to add

Keep existing catalog. Add:

- `config:*` (broader than `config:clinic`)
- `clinical:notes_read` / `clinical:notes_write` (field-level later uses these)
- `requisition:create`, `requisition:approve`, `requisition:fulfill`, `requisition:*`
- `reports:patient_drilldown` (audited)
- `patients:merge`

---

## 4. Wave 1 — Configurations

**UI home:** extend `/admin` into a Configurations module (`/admin?view=` plus a Modules card labelled Configurations). Do not add a parallel app. Owner `/owner` stays chain-level (create clinics, KPIs).

**Reference:** Open Dental Setup, Dentrix Office Manager.

### Phase C1 — Organization

**Tables:** `departments`, `operatories`, `working_hours`, `holidays`

- Department: clinic-scoped, links optional `stock_location_id` (already have location kinds store/department/pharmacy).
- Operatory: `department_id`, `code`, `name`, `is_active`. Migrate `appointments.chair_number` → `operatory_id` (keep chair_number as denormalized display during transition).
- Working hours: by clinic, department, or provider (day_of_week, start, end).
- Holidays: clinic calendar (not the same as `staff_leaves`).

**API:** `/api/v1/config/departments|operatories|hours|holidays`  
**UI:** Admin view `organization`  
**Tests:** cannot delete department with appointments; deactivate works; hours used by slot suggestions (hook into existing appointment slot API).

### Phase C2 — Users, roles, providers

**Reuse:** `StaffUserManager`, `/staff`, user permission overrides (migration 017).

**Add:**

- Persist `role_permissions` (role, permission_id, allowed). Seed from `PERMISSIONS` in `rbac.py`.
- Make `RolePermissionMatrix` **editable** for `clinic_admin` / `super_admin`.
- `provider_profiles`: specialty, license (already on user/profile), weekly schedule, default operatory, production goal, commission_rate_bps.
- Branch-scoped access: staff already have `clinic_id`. Platform users keep null clinic + `X-Clinic-Id`. No extra Branch ACL unless a user must sit in two clinics — then a `user_clinic_memberships` table (defer unless EAST dentists need MAIN access).

**Tests:** matrix change is audited; receptionist still lacks `clinical:*` unless granted; provider schedule blocks booking outside hours.

### Phase C3 — Clinical catalogs

**Reuse:** `catalog_items`, `catalog_categories`, ICD-10 JSON, `ProcedureCatalogAdmin`.

**Add:**

- Clinic setting for tooth numbering; odontogram reads it (today notation is per chart entry).
- Surface definition table only if custom surfaces are required; default MODBL/F/L/P stays code.
- `diagnosis_codes` can remain ICD-10 file for K00–K14; add clinic extras table.
- `medication_formulary` (promote/extend `drug_templates`).
- `allergy_types`, `medical_alert_types` (coded lists for structured history).

**CSV:** procedures, fees, allergies, formulary.

### Phase C4 — Financial config

**Reuse:** `fee_schedule_items`, `catalog_fee_rates`, payment method enum, TZS on clinic.

**Add:** `fee_schedules` (name, payer_kind, currency, `effective_from`/`effective_to`, `is_active`). Items belong to a schedule. Invoice line copies `unit_price`, `fee_schedule_id`, `fee_schedule_item_id`.

Also: tax rates, discount rules (percent/amount, max, role who can apply), insurer/plan setup (extend existing `patient_insurance_plans` products).

### Phase C5 — Templates, sequences, requisition setup, import

- Templates: SOAP, progress, consent, Rx, letterhead/print, SMS/email (notification templates already keyed — make them clinic-editable).
- Number sequences UI.
- Feature flags UI.
- Requisition setup: item categories (already catalog/inventory kinds), UoM + conversions, suppliers (exist), stores (exist), **approval chains** (department × amount × category), par levels (inventory already has reorder).
- Backup settings: document RPO/RTO in ops; UI can show last backup timestamp from platform later — do not fake a backup engine in the app.
- Import tools: CSV endpoints with dry-run, row errors, audit.

**Wave 1 done when:** a new clinic can be created, hours/chairs/roles/fees/items imported, and staff log in with a real permission matrix.

---

## 5. Wave 2 — Clinical / Patient Records

**UI home:** `PatientDetailPage` + specialty chairwork. Hygiene stays a recall bay that deep-links into the same chart.

**Reference:** Open Dental / Dentrix chart, Carestream R4 imaging.

### Phase CR1 — Registration and medical safety

- `family_accounts` + members; guarantor for billing.
- Duplicate detection: strengthen existing fuzzy search; **merge** workflow (`patients:merge`) with audit of surviving/loser IDs. Never hard-delete the loser; mark merged_into_id.
- Structured `patient_allergies`, `patient_conditions`, `patient_medications`, pregnancy status (today JSON/free text — migrate, keep JSON as fallback).
- **Alert banner** component on AppShell patient routes, chairwork, billing, pharmacy.
- Periodic medical-history questionnaire from Config templates; patient or staff signature.

### Phase CR2 — Chart and procedure lifecycle

- Odontogram view toggle: existing / planned / completed (data already has `entry_kind` and restoration status).
- `procedure_records`:
  - Links: patient, visit, tooth, surfaces, `catalog_item_id`, provider, operatory, treatment_plan_item_id.
  - Status: `planned → scheduled → completed → invoiced` (and `cancelled`).
  - Completing **is the key event:** same transaction as today chart-to-cash + inventory usage, **plus** `procedure.completed`.
- Primary vs permanent: already on `DentalChartEntry.dentition`; expose a chart mode toggle if the UI is weak.

### Phase CR3 — Plans, notes, conversion

- Treatment plan **fee snapshot** at presentation (`presented_at`, `presented_total`, line snapshots).
- Patient acceptance already exists; keep lock on accepted version.
- One-click convert accepted items → appointments (duration from catalog default).
- SOAP: `is_finalized` exists. Add `signed_at`, `signed_by`, lock writes, **addenda** as child notes (`parent_note_id`, never overwrite body).

### Phase CR4 — Documents, consents, timeline

- Generic `documents` (kind: id_scan, photo, letter, form) using existing encrypted storage.
- Consent **templates** from Config; instances stay `consent_records`.
- Patient timeline API: appointments, visits, procedures, notes, images, invoices, Rx, lab, consents — one feed for the chart header.

### Phase CR5 — Later (do not block Waves 3–4)

- Field-level ACL (reception: demographics + balance; hide SOAP).
- Break-glass with reason + page-view audit.
- FHIR-shaped identifiers (`Patient.identifier`, procedure codes as Coding).
- DICOM viewer (OHIF/Cornerstone), sensor bridges.
- Encryption-at-rest for column-level national ID (already on the TODO).

**Governance from day one of CR1:** continue `write_audit` on edits; add read-audit for chart export and break-glass. Retention policy documented (Tanzania health-record rules) even if erasure is not automated yet.

**Wave 2 done when:** a dentist can chart, complete a procedure, lock the note, convert a plan to the book, and reception cannot read the note body.

---

## 6. Wave 3 — Requisition

**Assumption (implement this unless product says otherwise):** two documents, one ledger.

1. **Internal requisition (indent):** department → store.  
2. **Purchase requisition:** store → procurement → PO → GRN → then issue.

**UI home:** new `/inventory?view=requisitions` (and later `/requisition` module card). Do not split stock into a second app.

**Reference:** Odoo Purchase/Inventory, hospital indents.

### Statuses

`draft → pending_approval → approved | rejected → partially_fulfilled → fulfilled → closed`  
plus `cancelled`.

### Phase R1

- `requisitions` + `requisition_lines` (item, qty, uom, urgency, from_department, to_location).
- Templates (“weekly endo kit”) stored as requisition templates.
- Single-level approval (department head or clinic_admin).
- Fulfillment calls existing `warehouse.post_movement` (issue). Concurrent issues stay atomic as they are today.
- Attachments + comments.

### Phase R2

- `approval_workflows` / `approval_steps` from Config (by department, category, amount).
- Delegation (out-of-office).
- FEFO already in warehouse; surface expiry alerts on requisition pick list.
- Auto-draft requisition when `stock.below_par` fires.

### Phase R3

- Purchase requisition type on the same tables (`kind = internal | purchase`).
- Optional RFQ later; PO already exists — make **multi-line** PO editor (today UI is single-line).
- `goods_receipts` + lines, QC flag, then stock receive.
- Supplier price lists (extend suppliers).
- Returns to supplier as a movement type (may already exist — wire UI).
- Three-way match (PO ↔ GRN ↔ supplier invoice) as a finance flag, not a blocker for R3 ship.

### Phase R4

- `procedure_kits` BOM; consumer of `procedure.completed`.
- Department monthly budgets + warning (not hard stop unless flag on).
- Stocktake already exists; attach to requisition closed-loop reporting.
- Inter-clinic transfer: movement type exists conceptually — require owner permission and two-clinic IDs.

**Roles:** requester (any clinical/dept user), approver, storekeeper (`inventory:issue`), procurement (`inventory:*`), finance (`reports:financial` / billing).

**Wave 3 done when:** endo kit indent approves, FEFO issues to the department, a stock-out raises a PR, PO+GRN restocks, and completing a filling deducts the kit without a second stock screen.

---

## 7. Wave 4 — Analytics

**Do not** run heavy aggregations on the primary OLTP path. Wave 0 events are the contract.

**UI home:** replace thin `/reports` with `/analytics` (keep `/reports` redirect). Role dashboards.

### Metric definitions (lock these names)

| Term | Definition |
|---|---|
| Production | Sum of completed procedure fee snapshots in period (not cash). |
| Collections | Sum of payments in period. |
| Collection ratio | Collections / production. |
| No-show | Appointments with status no_show / scheduled count in period. |
| Chair utilization | Booked operatory minutes / open hours from Config. |
| Plan acceptance | Accepted plan value / presented plan value. |
| Supply cost % | COGS of issued clinical stock / production. |

Store this glossary in `docs/METRICS.md` when A1 starts so UI labels cannot drift.

### Phase A1 — Operational reports

- Date range, clinic (owner), provider, department filters.
- Production, collections, appointments, stock levels (reuse warehouse analysis).
- CSV/Excel export.
- Queries against replica connection string when `DATABASE_REPLICA_URL` is set; else primary with statement timeout.

### Phase A2 — Dashboards

- Role views: owner (chain), clinic_admin, dentist (own data), store manager, finance.
- Materialized views refreshed nightly (Postgres) from event table + OLTP.
- Targets and threshold alerts (`stock.below_par` already; add production vs target).
- Scheduled email via existing notification outbox.
- Patient-level drill-down requires `reports:patient_drilldown` and is audited.

**Build option:** custom charts in the PWA first (consistent with clinical UI). Embed Metabase only if A1 SQL becomes a bottleneck — do not introduce it in A1.

### Phase A3 — Warehouse and prediction

- Star schema: facts `procedure`, `appointment`, `payment`, `stock_movement`, `requisition`; dims date, patient, provider, clinic, procedure, item, supplier.
- Incremental ETL from `domain_events`.
- Cohorts, lapsed patients, no-show risk, recall targeting — after months of events.

**Wave 4 A1–A2 done when:** owner and dentist see production vs collections for a date range without opening Billing, and store sees stockouts and expiry waste.

---

## 8. Frontend module map

| Module | Route | Nav |
|---|---|---|
| Configurations | `/admin` views: `organization`, `staff`, `roles`, `procedures`, `fees`, `templates`, `sequences`, `requisition-setup`, `import` | Modules dashboard card; `config:*` |
| Clinical | `/patients/:id` + `/clinical/*` | Existing; hide notes from reception via permission |
| Requisition | `/inventory?view=requisitions` then promote to `/requisition` if the tab outgrows warehouse | `requisition:*` |
| Analytics | `/analytics` | `reports:*` |

Keep AppShell, chairside mode, i18n EN/SW, floating back nav.

---

## 9. Testing and UAT

| Area | Must have |
|---|---|
| Config | Deactivate vs delete; fee date snapshot; CSV dry-run; matrix audit |
| Clinical | Merge; SOAP addenda; procedure.completed exactly once; reception 403 on notes |
| Requisition | Concurrent issue; FEFO pick; approval skip/reject; kit deduction on complete |
| Analytics | Metric fixtures match glossary; drill-down audited |
| UAT | Dentists on odontogram/perio views; store staff on indent + GRN |

Continue Alembic-only schema changes and tenant `clinic_id` on every new table.

---

## 10. Suggested calendar (2-week sprints)

| Sprint | Deliverable |
|---|---|
| 0 | Domain events table, settings, sequences, activatable mixin, new permissions |
| 1 | C1 organization + operatory on appointments |
| 2 | C2 editable RBAC matrix + provider profile |
| 3 | C3–C4 catalogs + named fee schedules |
| 4 | C5 templates, approval chains, CSV import |
| 5 | CR1 family, merge, structured alerts |
| 6 | CR2 procedure lifecycle + odontogram view toggles + event publish |
| 7 | CR3 plan snapshot, convert to appointments, SOAP lock/addenda |
| 8 | CR4 documents, consent templates, timeline |
| 9 | R1 internal requisition + one approval |
| 10 | R2 multi-level + below-par auto-draft |
| 11 | R3 purchase PR, multi-line PO, GRN |
| 12 | R4 kits + budgets |
| 13 | A1 operational reports + glossary |
| 14 | A2 role dashboards + scheduled email |
| 15+ | CR5 DICOM/field ACL, A3 warehouse, Metabase only if needed |

CR5 items (DICOM, field ACL, FHIR) can slip after A1 if chairside UAT is still open; **do not slip Wave 0 events**.

---

## 11. Out of scope for this expansion

- Replacing SQLite/Postgres dual support or rewriting the PWA.
- Live SMS/WhatsApp (outbox already exists).
- EDI 837/835, MFA, Celery — stay on `DEMSTA_COMPLETE_TODO.md` tracks unless they block a wave (worker is needed for event drain and scheduled reports; add a minimal ARQ worker in sprint 0 or 13).
- Building Metabase/Superset on day one.

---

## 12. Immediate next implementation (when you say go)

Vertical slice, not a model dump:

1. Alembic: `domain_events`, `system_settings`, `number_sequences`, `departments`, `operatories`.
2. Bind appointments to `operatory_id`.
3. Config API + Admin **Organization** view.
4. Publish `appointment.status_changed` from the existing appointment PATCH (proves the outbox).

That is Wave 0 + C1. Everything else in this document attaches to it.
