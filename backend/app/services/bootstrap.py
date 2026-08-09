"""Bootstrap clinics, all department roles, and rich demo fabric for testing."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.rbac import Role
from app.db.session import AsyncSessionLocal, apply_tenant_rls
from app.models import (
    Appointment,
    AppointmentType,
    Clinic,
    ClinicalVisit,
    DentalChartEntry,
    DrugTemplate,
    EndoCase,
    EndoObturation,
    ImagingStudy,
    InventoryItem,
    Invoice,
    InvoiceLineItem,
    InvoiceStatus,
    LabCase,
    LabCaseStatus,
    Patient,
    PatientInsurancePlan,
    Payment,
    PaymentMethod,
    Prescription,
    PrescriptionItem,
    PrescriptionStatus,
    ProcedureCategory,
    PurchaseOrder,
    Restoration,
    RestorationCase,
    RestorationQuality,
    StaffLeave,
    StaffProfile,
    StaffShift,
    Supplier,
    TreatmentPlan,
    TreatmentPlanItem,
    User,
)
from app.services.domain import create_user, ensure_fee_schedule

settings = get_settings()


async def wipe_demo_data(db: AsyncSession) -> None:
    """Delete all tenant rows (demo reset). Order respects FKs loosely via CASCADE where set."""
    await apply_tenant_rls(db, None, bypass=True)
    # Child-first deletes for SQLite without full CASCADE coverage
    for table in (
        "prescription_items",
        "prescriptions",
        "drug_templates",
        "imaging_studies",
        "endo_obturations",
        "endo_cases",
        "restoration_qualities",
        "inventory_usages",
        "restorations",
        "restoration_cases",
        "lab_cases",
        "patient_insurance_plans",
        "inventory_items",
        "purchase_orders",
        "suppliers",
        "staff_profiles",
        "staff_shifts",
        "staff_leaves",
        "payments",
        "invoice_line_items",
        "invoices",
        "treatment_plan_items",
        "treatment_plans",
        "perio_sites",
        "perio_exams",
        "clinical_visits",
        "clinical_notes",
        "consent_records",
        "dental_chart_entries",
        "appointments",
        "appointment_types",
        "fee_schedule_items",
        "ai_suggestions",
        "refresh_tokens",
        "audit_logs",
        "patients",
        "users",
        "clinics",
    ):
        try:
            await db.execute(text(f"DELETE FROM {table}"))
        except Exception:
            pass
    await db.flush()


async def seed_if_empty() -> None:
    async with AsyncSessionLocal() as db:
        await apply_tenant_rls(db, None, bypass=True)

        if settings.seed_force:
            await wipe_demo_data(db)
            await seed_demo_fabric(db)
            await db.commit()
            return

        count = (await db.execute(select(func.count()).select_from(Clinic))).scalar_one()
        if count:
            return

        await seed_demo_fabric(db)
        await db.commit()


async def seed_demo_fabric(db: AsyncSession) -> None:
    """Full multi-clinic, multi-role demo dataset."""
    await apply_tenant_rls(db, None, bypass=True)

    main = Clinic(
        name=settings.default_clinic_name,
        code=settings.default_clinic_code,
        address="100 Smile Avenue, Health District",
        phone="+1-555-0100",
        email="care@demsta.clinic",
        timezone="UTC",
        currency="USD",
    )
    east = Clinic(
        name="DEMSTA East Wing",
        code="EAST",
        address="42 Horizon Blvd, East District",
        phone="+1-555-0200",
        email="east@demsta.clinic",
        timezone="UTC",
        currency="USD",
    )
    db.add_all([main, east])
    await db.flush()

    # Platform owner (null clinic)
    owner = create_user(
        None,
        email="owner@demsta.clinic",
        password="Demsta!Owner1",
        full_name="DEMSTA System Owner",
        role=Role.SUPER_ADMIN,
        phone="+1-555-0001",
    )
    db.add(owner)

    staff_defs = [
        ("admin@demsta.clinic", "Demsta!Admin1", "Amina Hassan", Role.CLINIC_ADMIN, None, "Clinic Admin", "admin"),
        ("dentist@demsta.clinic", "Demsta!Dentist1", "Dr. Noah Okello", Role.DENTIST, "Restorative & Endodontics", "Lead Dentist", "clinical"),
        ("hygiene@demsta.clinic", "Demsta!Hygiene1", "Lina Petrova", Role.HYGIENIST, "Periodontal Care", "Hygienist", "hygiene"),
        ("front@demsta.clinic", "Demsta!Front1", "Sara Mwangi", Role.RECEPTIONIST, None, "Front Desk Lead", "front-desk"),
        ("billing@demsta.clinic", "Demsta!Billing1", "Ken Otieno", Role.ACCOUNTANT, None, "Revenue Officer", "billing"),
        ("lab@demsta.clinic", "Demsta!Lab1", "Mei Tanaka", Role.LAB_TECH, "Fixed Pros", "Lab Technician", "lab"),
        ("pharmacy@demsta.clinic", "Demsta!Pharmacy1", "Grace Auma", Role.PHARMACY, None, "Pharmacy Tech", "pharmacy"),
        ("imaging@demsta.clinic", "Demsta!Imaging1", "David Kim", Role.IMAGING_TECH, "Oral Radiology", "Imaging Tech", "imaging"),
    ]
    users: dict[str, User] = {}
    for email, pwd, name, role, specialty, title, dept in staff_defs:
        u = create_user(
            main.id,
            email=email,
            password=pwd,
            full_name=name,
            role=role,
            specialty=specialty,
        )
        db.add(u)
        users[role.value if role != Role.CLINIC_ADMIN else "clinic_admin"] = u
        # unique keys for multiple? use email
        users[email] = u

    east_admin = create_user(
        east.id,
        email="admin@east.demsta.clinic",
        password="Demsta!Admin1",
        full_name="Elena Vargas",
        role=Role.CLINIC_ADMIN,
    )
    east_dentist = create_user(
        east.id,
        email="dentist@east.demsta.clinic",
        password="Demsta!Dentist1",
        full_name="Dr. Samir Patel",
        role=Role.DENTIST,
        specialty="General Dentistry",
    )
    db.add_all([east_admin, east_dentist])
    await db.flush()

    dentist = users["dentist@demsta.clinic"]
    seen_profiles: set[str] = set()
    for u in list(users.values()) + [east_admin, east_dentist]:
        if not isinstance(u, User) or not u.clinic_id or u.id in seen_profiles:
            continue
        seen_profiles.add(u.id)
        db.add(
            StaffProfile(
                clinic_id=u.clinic_id,
                user_id=u.id,
                title=u.role.replace("_", " ").title(),
                specialty=u.specialty,
                department=u.role if isinstance(u.role, str) else str(u.role),
                certifications_json='["BLS","Clinic Orientation"]',
            )
        )
    await db.flush()

    types = [
        AppointmentType(
            clinic_id=main.id,
            name="Consultation",
            category=ProcedureCategory.CONSULTATION,
            duration_minutes=20,
            color="#1E6BFF",
            default_fee=45,
        ),
        AppointmentType(
            clinic_id=main.id,
            name="Cleaning / Prophy",
            category=ProcedureCategory.CLEANING,
            duration_minutes=45,
            color="#0EA5E9",
            default_fee=90,
        ),
        AppointmentType(
            clinic_id=main.id,
            name="Composite Filling",
            category=ProcedureCategory.FILLING,
            duration_minutes=60,
            color="#2563EB",
            default_fee=150,
        ),
        AppointmentType(
            clinic_id=main.id,
            name="Extraction",
            category=ProcedureCategory.EXTRACTION,
            duration_minutes=45,
            color="#0369A1",
            default_fee=180,
        ),
        AppointmentType(
            clinic_id=main.id,
            name="Root Canal",
            category=ProcedureCategory.ROOT_CANAL,
            duration_minutes=90,
            color="#1D4ED8",
            default_fee=550,
        ),
        AppointmentType(
            clinic_id=main.id,
            name="Crown Prep",
            category=ProcedureCategory.CROWN,
            duration_minutes=75,
            color="#0284C7",
            default_fee=800,
        ),
    ]
    db.add_all(types)
    await db.flush()

    patients = [
        Patient(
            clinic_id=main.id,
            patient_code="P202600001",
            hospital_reg_number="HRN-2026-001",
            first_name="James",
            last_name="Kariuki",
            date_of_birth=date(1988, 3, 14),
            sex="male",
            marital_status="married",
            occupation="Teacher",
            tribe_nation="Kikuyu",
            phone="+1-555-1001",
            email="james.k@example.com",
            street="Uhuru Road",
            house_number="12B",
            area_ward="Westlands",
            town_city="Nairobi",
            address="12B, Uhuru Road, Westlands, Nairobi",
            allergies="Penicillin",
            chronic_conditions="Diabetes, Hypertension",
            dental_history="Multiple posterior restorations; prior caries",
            chief_complaint="Spontaneous throbbing pain lower left molar",
            family_social_history="Non-smoker; occasional sugary snacks",
            medical_history_json=(
                '{"diabetes":true,"hypertension":true,"asthma":false,'
                '"heart_disease":false,"major_surgery":false,"hiv_aids":false,'
                '"allergies_flag":true}'
            ),
            pain_assessment_json=(
                '{"onset":"spontaneous","severity":"severe","character":"localized",'
                '"quality":"throbbing","duration":"3 days","radiation":"to ear",'
                '"aggravating_factors":"cold drinks","relieving_factors":"analgesics"}'
            ),
            reported_symptoms_json=(
                '{"cavities":true,"swelling":true,"pus_discharge_fistula":false,'
                '"halitosis":false,"bleeding_gums":false,"loose_dentures":false,'
                '"ulceration":false}'
            ),
            caries_risk_score=0.72,
            referral_source="Walk-in",
        ),
        Patient(
            clinic_id=main.id,
            patient_code="P202600002",
            hospital_reg_number="HRN-2026-002",
            first_name="Maya",
            last_name="Chen",
            date_of_birth=date(1995, 11, 2),
            sex="female",
            marital_status="single",
            occupation="Designer",
            phone="+1-555-1002",
            email="maya.chen@example.com",
            town_city="Nairobi",
            dental_history="Regular hygiene visits",
            chief_complaint="Routine checkup",
            caries_risk_score=0.28,
            referral_source="Instagram",
        ),
        Patient(
            clinic_id=main.id,
            patient_code="P202600003",
            hospital_reg_number="HRN-2026-003",
            first_name="Omar",
            last_name="Diallo",
            date_of_birth=date(1979, 7, 22),
            sex="male",
            phone="+1-555-1003",
            insurance_number="INS-99821",
            dental_history="Needs crown on 36",
            chief_complaint="Broken filling tooth 36",
            caries_risk_score=0.55,
        ),
        Patient(
            clinic_id=main.id,
            patient_code="P202600004",
            hospital_reg_number="HRN-2026-004",
            first_name="Aisha",
            last_name="Njoroge",
            date_of_birth=date(2001, 5, 18),
            sex="female",
            phone="+1-555-1004",
            chief_complaint="Bleeding gums",
            caries_risk_score=0.41,
        ),
        Patient(
            clinic_id=main.id,
            patient_code="P202600005",
            hospital_reg_number="HRN-2026-005",
            first_name="Tom",
            last_name="Wanjiru",
            date_of_birth=date(1968, 1, 9),
            sex="male",
            phone="+1-555-1005",
            chief_complaint="Crown shade try-in",
            caries_risk_score=0.33,
        ),
        Patient(
            clinic_id=main.id,
            patient_code="P202600006",
            hospital_reg_number="HRN-2026-006",
            first_name="Fatima",
            last_name="Hassan",
            date_of_birth=date(1990, 9, 30),
            sex="female",
            phone="+1-555-1006",
            chief_complaint="Wisdom tooth pain",
            caries_risk_score=0.62,
        ),
        Patient(
            clinic_id=east.id,
            patient_code="P2026E0001",
            hospital_reg_number="HRN-E-001",
            first_name="Leo",
            last_name="Mensah",
            date_of_birth=date(1985, 4, 4),
            sex="male",
            phone="+1-555-2001",
            chief_complaint="New patient exam",
            caries_risk_score=0.35,
        ),
    ]
    db.add_all(patients)
    await db.flush()

    # Primary dentist assignment (resource scoping) — leave one unassigned as pool
    for p in patients[:5]:
        p.primary_dentist_id = dentist.id
    patients[5].primary_dentist_id = None  # Fatima — unassigned pool
    patients[6].primary_dentist_id = east_dentist.id
    await db.flush()

    db.add(
        PatientInsurancePlan(
            clinic_id=main.id,
            patient_id=patients[0].id,
            payer_name="DEMSTA Mutual Dental",
            plan_name="Family Plus",
            member_id="INS-JAMES-001",
            coverage_pct=80.0,
            annual_max=2000.0,
            amount_used_ytd=350.0,
            deductible=50.0,
            deductible_met=50.0,
            is_primary=True,
        )
    )
    await db.flush()

    now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    appts = [
        Appointment(
            clinic_id=main.id,
            patient_id=patients[0].id,
            dentist_id=dentist.id,
            appointment_type_id=types[1].id,
            chair_number=1,
            starts_at=now.replace(hour=9),
            ends_at=now.replace(hour=9) + timedelta(minutes=45),
            status="checked_in",
            reason="6-month recall cleaning",
            color=types[1].color,
        ),
        Appointment(
            clinic_id=main.id,
            patient_id=patients[1].id,
            dentist_id=dentist.id,
            appointment_type_id=types[0].id,
            chair_number=2,
            starts_at=now.replace(hour=11),
            ends_at=now.replace(hour=11) + timedelta(minutes=20),
            status="scheduled",
            reason="New patient consult",
            color=types[0].color,
        ),
        Appointment(
            clinic_id=main.id,
            patient_id=patients[2].id,
            dentist_id=dentist.id,
            appointment_type_id=types[5].id,
            chair_number=1,
            starts_at=now.replace(hour=14),
            ends_at=now.replace(hour=14) + timedelta(minutes=75),
            status="confirmed",
            reason="Crown preparation tooth 36",
            color=types[5].color,
        ),
        Appointment(
            clinic_id=main.id,
            patient_id=patients[3].id,
            dentist_id=users["hygiene@demsta.clinic"].id,
            appointment_type_id=types[1].id,
            chair_number=3,
            starts_at=now.replace(hour=10),
            ends_at=now.replace(hour=10) + timedelta(minutes=45),
            status="scheduled",
            reason="Hygiene recall",
            color=types[1].color,
        ),
    ]
    db.add_all(appts)
    await db.flush()

    chart = DentalChartEntry(
        clinic_id=main.id,
        patient_id=patients[0].id,
        tooth_number="36",
        surfaces="O",
        condition_code="filling",
        condition_label="Composite filling",
        status="completed",
        notes="Composite occlusal",
        recorded_by_id=dentist.id,
        visit_date=date.today(),
    )
    chart2 = DentalChartEntry(
        clinic_id=main.id,
        patient_id=patients[2].id,
        tooth_number="36",
        surfaces="MOD",
        condition_code="crown",
        condition_label="Crown prep",
        status="completed",
        notes="PFM crown prep complete",
        recorded_by_id=dentist.id,
        visit_date=date.today(),
    )
    db.add_all([chart, chart2])

    visit = ClinicalVisit(
        clinic_id=main.id,
        patient_id=patients[0].id,
        examiner_id=dentist.id,
        visit_date=date.today(),
        status="in_progress",
        chief_complaint="Pain tooth 36",
        vitals_json='{"bp_systolic":128,"bp_diastolic":82,"pulse":76}',
        diagnosis_json='{"working_diagnosis":"Irreversible pulpitis","icd10_codes":[{"code":"K04.01","description":"Reversible pulpitis"}]}',
    )
    db.add(visit)

    plan = TreatmentPlan(
        clinic_id=main.id,
        patient_id=patients[0].id,
        title="Endo + crown pathway",
        status="proposed",
    )
    db.add(plan)
    await db.flush()
    db.add(
        TreatmentPlanItem(
            treatment_plan_id=plan.id,
            phase_name="Phase 1",
            phase_order=1,
            procedure_name="Root canal therapy",
            tooth_number="36",
            description="RCT then crown",
            estimated_fee=550,
            icd10_code="K04.01",
            icd10_description="Reversible pulpitis",
        )
    )

    await ensure_fee_schedule(db, main.id)
    await ensure_fee_schedule(db, east.id)

    inv_paid = Invoice(
        clinic_id=main.id,
        patient_id=patients[1].id,
        invoice_number="INV-2026-0001",
        status=InvoiceStatus.PAID,
        subtotal=90,
        tax=0,
        total=90,
        amount_paid=90,
        issued_at=datetime.now(UTC) - timedelta(days=2),
    )
    inv_open = Invoice(
        clinic_id=main.id,
        patient_id=patients[0].id,
        invoice_number="INV-2026-0002",
        status=InvoiceStatus.ISSUED,
        subtotal=150,
        tax=0,
        total=150,
        amount_paid=0,
        issued_at=datetime.now(UTC) - timedelta(days=1),
    )
    db.add_all([inv_paid, inv_open])
    await db.flush()
    db.add_all(
        [
            InvoiceLineItem(
                invoice_id=inv_paid.id,
                description="Prophy cleaning",
                quantity=1,
                unit_price=90,
                total=90,
                procedure_code="D1110",
            ),
            InvoiceLineItem(
                invoice_id=inv_open.id,
                description="Composite filling",
                quantity=1,
                unit_price=150,
                total=150,
                procedure_code="D2391",
                chart_entry_id=chart.id,
            ),
            Payment(
                clinic_id=main.id,
                invoice_id=inv_paid.id,
                amount=90,
                method=PaymentMethod.MOBILE_MONEY,
                received_by_id=users["billing@demsta.clinic"].id,
                reference="MM-77821",
            ),
        ]
    )

    db.add_all(
        [
            InventoryItem(
                clinic_id=main.id,
                sku="COMP-A2",
                name="Composite A2 syringes",
                category="restorative",
                quantity=8,
                reorder_level=10,
                unit="syringe",
                unit_cost=12.5,
                notes="Below reorder — restock",
            ),
            InventoryItem(
                clinic_id=main.id,
                sku="GLOVE-M",
                name="Nitrile gloves M",
                category="PPE",
                quantity=240,
                reorder_level=100,
                unit="box",
                unit_cost=6.0,
            ),
            InventoryItem(
                clinic_id=main.id,
                sku="ANES-LIDO",
                name="Lidocaine 2% carpules",
                category="anesthetic",
                quantity=45,
                reorder_level=20,
                unit="carpule",
                unit_cost=1.8,
            ),
        ]
    )

    db.add_all(
        [
            LabCase(
                clinic_id=main.id,
                patient_id=patients[2].id,
                dentist_id=dentist.id,
                tooth="36",
                shade="A2",
                case_type="crown",
                status=LabCaseStatus.SENT,
                lab_name="SmileLab Pro",
                sent_at=datetime.now(UTC) - timedelta(days=3),
                due_at=datetime.now(UTC) + timedelta(days=4),
                lab_cost=180,
                notes="PFM crown",
            ),
            LabCase(
                clinic_id=main.id,
                patient_id=patients[4].id,
                dentist_id=dentist.id,
                tooth="21",
                shade="B1",
                case_type="veneer",
                status=LabCaseStatus.IN_PROGRESS,
                lab_name="SmileLab Pro",
                sent_at=datetime.now(UTC) - timedelta(days=7),
                due_at=datetime.now(UTC) - timedelta(days=2),  # overdue demo
                lab_cost=220,
            ),
            LabCase(
                clinic_id=main.id,
                patient_id=patients[1].id,
                dentist_id=dentist.id,
                tooth="16",
                shade="A3",
                case_type="crown",
                status=LabCaseStatus.RECEIVED,
                lab_name="SmileLab Pro",
                sent_at=datetime.now(UTC) - timedelta(days=14),
                received_at=datetime.now(UTC) - timedelta(days=1),
                lab_cost=175,
            ),
        ]
    )

    db.add_all(
        [
            ImagingStudy(
                clinic_id=main.id,
                patient_id=patients[0].id,
                captured_by_id=users["imaging@demsta.clinic"].id,
                study_type="PA",
                tooth="36",
                storage_key="stub://imaging/james/pa-36",
                notes="Periapical tooth 36",
            ),
            ImagingStudy(
                clinic_id=main.id,
                patient_id=patients[2].id,
                captured_by_id=users["imaging@demsta.clinic"].id,
                study_type="OPG",
                storage_key="stub://imaging/omar/opg",
            ),
        ]
    )

    templates = [
        DrugTemplate(
            clinic_id=main.id,
            name="Amoxicillin 500mg",
            category="antibiotic",
            default_dose="500mg TID",
            default_quantity="21",
            instructions="Take after meals for 7 days",
        ),
        DrugTemplate(
            clinic_id=main.id,
            name="Ibuprofen 400mg",
            category="analgesic",
            default_dose="400mg TID PRN",
            default_quantity="15",
            instructions="With food; max 1200mg/day",
        ),
        DrugTemplate(
            clinic_id=main.id,
            name="Chlorhexidine 0.12%",
            category="mouthwash",
            default_dose="15ml BID",
            default_quantity="1 bottle",
            instructions="Rinse 30s; do not swallow",
        ),
    ]
    db.add_all(templates)
    await db.flush()

    rx = Prescription(
        clinic_id=main.id,
        patient_id=patients[0].id,
        prescribed_by_id=dentist.id,
        status=PrescriptionStatus.ACTIVE,
        notes="Post-op cover",
    )
    db.add(rx)
    await db.flush()
    db.add(
        PrescriptionItem(
            prescription_id=rx.id,
            drug_name="Amoxicillin 500mg",
            dose="500mg TID",
            quantity="21",
            instructions="7 days",
        )
    )
    await db.flush()

    # Phase 2 — restorative graph + endo + procurement + HR
    supplier = Supplier(
        clinic_id=main.id,
        name="DentalSupply Co",
        contact_email="orders@dentalsupply.example",
        contact_phone="+1-555-8800",
    )
    db.add(supplier)
    await db.flush()
    db.add(
        PurchaseOrder(
            clinic_id=main.id,
            supplier_id=supplier.id,
            status="ordered",
            ordered_at=datetime.now(UTC) - timedelta(days=2),
            expected_at=date.today() + timedelta(days=5),
            lines_json='[{"sku":"COMP-A2","qty":20,"unit_cost":12.5}]',
        )
    )
    # mark composite inventory with expiry + supplier
    inv_rows = (
        await db.execute(select(InventoryItem).where(InventoryItem.clinic_id == main.id))
    ).scalars().all()
    for item in inv_rows:
        item.supplier_id = supplier.id
        if item.sku == "COMP-A2":
            item.expiry_date = date.today() + timedelta(days=45)

    rcase = RestorationCase(
        clinic_id=main.id,
        patient_id=patients[2].id,
        primary_tooth="36",
        case_type="crown",
        status="in_progress",
        warranty_months=24,
        lab_case_id=None,
        fee_code="crown",
        created_by_id=dentist.id,
        notes="PFM crown pathway",
    )
    db.add(rcase)
    await db.flush()
    # link lab case if exists
    lab = (
        await db.execute(
            select(LabCase).where(LabCase.clinic_id == main.id, LabCase.tooth == "36")
        )
    ).scalar_one_or_none()
    if lab:
        rcase.lab_case_id = lab.id

    rest_planned = Restoration(
        clinic_id=main.id,
        case_id=rcase.id,
        patient_id=patients[2].id,
        tooth_number="36",
        surfaces="MOD",
        restoration_type="crown_pfm",
        cavity_size="L",
        blacks_class="II",
        material="PFM",
        shade="A2",
        status="in_progress",
        chart_entry_id=chart2.id,
        recorded_by_id=dentist.id,
    )
    rest_done = Restoration(
        clinic_id=main.id,
        patient_id=patients[0].id,
        tooth_number="36",
        surfaces="O",
        restoration_type="filling_composite",
        cavity_size="M",
        blacks_class="I",
        material="Composite",
        shade="A2",
        status="completed",
        chart_entry_id=chart.id,
        recorded_by_id=dentist.id,
    )
    db.add_all([rest_planned, rest_done])
    await db.flush()
    if lab:
        lab.restoration_id = rest_planned.id
        lab.restoration_case_id = rcase.id
    db.add(
        RestorationQuality(
            restoration_id=rest_done.id,
            marginal_adaptation=5,
            contacts=4,
            wear=5,
            postop_sensitivity=5,
            pulp_status="vital",
            color_match=4,
            finishing=5,
        )
    )

    endo = EndoCase(
        clinic_id=main.id,
        patient_id=patients[0].id,
        tooth_number="36",
        procedure_type="rct",
        tooth_length_mm=21.5,
        canal_count=3,
        working_length_mm=20.0,
        prep_method="step-back",
        irrigants_json='["NaOCl 2.5%","EDTA 17%"]',
        dressings_json='["Ca(OH)2"]',
        status="in_progress",
        recorded_by_id=dentist.id,
        notes="Irreversible pulpitis pathway",
    )
    db.add(endo)
    await db.flush()
    db.add(
        EndoObturation(
            endo_case_id=endo.id,
            visit_date=date.today() - timedelta(days=1),
            canals_filled="MB, ML, D",
            material="Gutta-percha",
            notes="Warm vertical",
        )
    )

    patients[0].hygiene_recall_due = date.today() + timedelta(days=7)
    patients[0].perio_risk_band = "moderate"
    patients[3].hygiene_recall_due = date.today() - timedelta(days=2)
    patients[3].perio_risk_band = "high"

    # Staff cert / shift / leave
    for email in ("dentist@demsta.clinic", "hygiene@demsta.clinic"):
        u = users[email]
        prof = (
            await db.execute(select(StaffProfile).where(StaffProfile.user_id == u.id))
        ).scalar_one_or_none()
        if prof:
            prof.cert_expires_at = date.today() + timedelta(days=20)

    db.add(
        StaffShift(
            clinic_id=main.id,
            user_id=dentist.id,
            starts_at=datetime.now(UTC).replace(hour=8, minute=0, second=0, microsecond=0),
            ends_at=datetime.now(UTC).replace(hour=17, minute=0, second=0, microsecond=0),
            role_label="Operatory 1",
        )
    )
    db.add(
        StaffLeave(
            clinic_id=main.id,
            user_id=users["hygiene@demsta.clinic"].id,
            starts_on=date.today() + timedelta(days=14),
            ends_on=date.today() + timedelta(days=16),
            leave_type="annual",
            status="approved",
        )
    )
    await db.flush()
