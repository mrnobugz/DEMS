from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import Response

from app.api.deps import ClinicId, DbSession, require_any_permission, require_permission
from app.models import User
from app.schemas import (
    Page,
    PatientAssignDentist,
    PatientCreate,
    PatientMergeRequest,
    PatientOut,
    PatientRegisterOut,
    PatientRegisterRequest,
    PatientSafetyCreate,
    PatientSafetyOut,
    PatientSafetySummaryOut,
    PatientUpdate,
    RegistrationDraftCancel,
    RegistrationDraftOut,
    RegistrationDraftSave,
    VitalSignCreate,
    VitalSignOut,
)
from app.services import domain as svc
from app.services import patient_records as records
from app.services import registration_drafts as drafts_svc
from app.services import vitals as vitals_svc

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("", response_model=Page[PatientOut])
async def list_patients(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:read"))],
    q: str | None = None,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    items, total = await svc.list_patients(
        db, clinic_id, q=q, limit=limit, offset=offset, actor=user
    )
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.post("", response_model=PatientOut, status_code=201)
async def create_patient(
    body: PatientCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:*"))],
):
    return await svc.create_patient(db, clinic_id, user.id, body)


@router.post("/register", response_model=PatientRegisterOut, status_code=201)
async def register_patient(
    body: PatientRegisterRequest,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:*"))],
):
    return await svc.register_patient(db, clinic_id, user.id, body)


@router.get("/registration-drafts", response_model=list[RegistrationDraftOut])
async def list_registration_drafts(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:read"))],
    status: str = Query("open", pattern="^(open|cancelled|completed|all)$"),
    limit: int = Query(50, ge=1, le=200),
):
    return await drafts_svc.list_drafts(db, clinic_id, status=status, limit=limit)


@router.post("/registration-drafts", response_model=RegistrationDraftOut, status_code=201)
async def create_registration_draft(
    body: RegistrationDraftSave,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:*"))],
):
    return await drafts_svc.save_draft(db, clinic_id, user.id, body)


@router.get("/registration-drafts/{draft_id}", response_model=RegistrationDraftOut)
async def get_registration_draft(
    draft_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:read"))],
):
    return await drafts_svc.get_draft(db, clinic_id, draft_id)


@router.put("/registration-drafts/{draft_id}", response_model=RegistrationDraftOut)
async def update_registration_draft(
    draft_id: str,
    body: RegistrationDraftSave,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:*"))],
):
    return await drafts_svc.save_draft(db, clinic_id, user.id, body, draft_id=draft_id)


@router.post("/registration-drafts/{draft_id}/cancel", response_model=RegistrationDraftOut)
async def cancel_registration_draft(
    draft_id: str,
    body: RegistrationDraftCancel,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:*"))],
):
    return await drafts_svc.cancel_draft(db, clinic_id, user.id, draft_id, reason=body.reason)


@router.get("/{patient_id}", response_model=PatientOut)
async def get_patient(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:read"))],
):
    return await svc.get_patient(db, clinic_id, patient_id, actor=user)


@router.patch("/{patient_id}", response_model=PatientOut)
async def update_patient(
    patient_id: str,
    body: PatientUpdate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:update"))],
):
    # Enforce assignment scope before mutation
    await svc.get_patient(db, clinic_id, patient_id, actor=user)
    return await svc.update_patient(db, clinic_id, user.id, patient_id, body)


@router.put("/{patient_id}/primary-dentist", response_model=PatientOut)
async def assign_primary_dentist(
    patient_id: str,
    body: PatientAssignDentist,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[
        User, Depends(require_any_permission("patients:assign", "patients:*"))
    ],
):
    return await svc.assign_primary_dentist(
        db, clinic_id, user.id, patient_id, body.dentist_id
    )


@router.get("/{patient_id}/safety", response_model=PatientSafetySummaryOut)
async def get_patient_safety(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:read"))],
):
    await svc.get_patient(db, clinic_id, patient_id, actor=user)
    return await records.safety_summary(db, clinic_id, patient_id)


@router.post("/{patient_id}/safety", response_model=PatientSafetyOut, status_code=201)
async def add_patient_safety(
    patient_id: str,
    body: PatientSafetyCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("patients:update", "patients:*"))],
):
    await svc.get_patient(db, clinic_id, patient_id, actor=user)
    return await records.add_safety_item(
        db,
        clinic_id,
        user.id,
        patient_id,
        kind=body.kind,
        code=body.code,
        label=body.label,
        notes=body.notes,
    )


@router.delete("/{patient_id}/safety/{item_id}", response_model=PatientSafetyOut)
async def remove_patient_safety(
    patient_id: str,
    item_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("patients:update", "patients:*"))],
):
    await svc.get_patient(db, clinic_id, patient_id, actor=user)
    return await records.deactivate_safety_item(db, clinic_id, user.id, patient_id, item_id)


@router.get("/{patient_id}/duplicates", response_model=list[PatientOut])
async def list_patient_duplicates(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:read"))],
):
    patient = await svc.get_patient(db, clinic_id, patient_id, actor=user)
    return await records.find_duplicates(db, clinic_id, patient)


@router.post("/{patient_id}/merge", response_model=PatientOut)
async def merge_patient(
    patient_id: str,
    body: PatientMergeRequest,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:merge"))],
):
    return await records.merge_patients(
        db, clinic_id, user.id, keep_id=patient_id, drop_id=body.drop_id
    )


@router.post("/{patient_id}/history-reviewed", response_model=PatientOut)
async def mark_history_reviewed(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("patients:update", "patients:*"))],
):
    await svc.get_patient(db, clinic_id, patient_id, actor=user)
    return await records.mark_history_reviewed(db, clinic_id, user.id, patient_id)


@router.post("/{patient_id}/photo", response_model=PatientOut)
async def upload_patient_photo(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("patients:update", "patients:*"))],
    file: UploadFile = File(...),
):
    data = await file.read()
    return await svc.save_patient_photo(
        db,
        clinic_id,
        user.id,
        patient_id,
        filename=file.filename or "identity.jpg",
        content_type=file.content_type or "image/jpeg",
        data=data,
        actor=user,
    )


@router.get("/{patient_id}/photo")
async def get_patient_photo(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:read"))],
):
    patient, data = await svc.read_patient_photo(db, clinic_id, patient_id, actor=user)
    return Response(
        content=data,
        media_type=patient.photo_content_type or "image/jpeg",
        headers={"Cache-Control": "private, max-age=120"},
    )


@router.get("/{patient_id}/vitals", response_model=list[VitalSignOut])
async def list_patient_vitals(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:read"))],
):
    return await vitals_svc.list_vitals(db, clinic_id, patient_id, actor=user)


@router.get("/{patient_id}/vitals/latest", response_model=VitalSignOut | None)
async def latest_patient_vitals(
    patient_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("patients:read"))],
):
    return await vitals_svc.latest_vitals(db, clinic_id, patient_id, actor=user)


@router.post("/{patient_id}/vitals", response_model=VitalSignOut, status_code=201)
async def record_patient_vitals(
    patient_id: str,
    body: VitalSignCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_any_permission("clinical:vitals", "clinical:*"))],
):
    return await vitals_svc.record_vitals(
        db, clinic_id, user.id, patient_id, body, actor=user
    )
