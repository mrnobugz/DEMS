from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import Response

from app.api.deps import ClinicId, DbSession, require_permission
from app.models import User
from app.schemas import ImagingStudyCreate, ImagingStudyOut
from app.services import departments as dept
from app.services.domain import write_audit

router = APIRouter(prefix="/imaging", tags=["imaging"])


@router.get("/studies", response_model=list[ImagingStudyOut])
async def list_studies(
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("imaging:read"))],
    patient_id: str | None = Query(None),
):
    _ = user
    return await dept.list_imaging(db, clinic_id, patient_id=patient_id)


@router.post("/studies", response_model=ImagingStudyOut, status_code=201)
async def create_study(
    body: ImagingStudyCreate,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("imaging:*"))],
):
    return await dept.create_imaging_study(db, clinic_id, user.id, body)


@router.post("/studies/{study_id}/upload", response_model=ImagingStudyOut)
async def upload_study(
    study_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("imaging:*"))],
    file: UploadFile = File(...),
):
    data = await file.read()
    study = await dept.upload_imaging_content(
        db,
        clinic_id,
        user.id,
        study_id,
        filename=file.filename or "upload.bin",
        content_type=file.content_type or "application/octet-stream",
        data=data,
    )
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=user.id,
        action="upload",
        resource_type="imaging_study",
        resource_id=study.id,
        after={
            "byte_size": study.byte_size,
            "content_type": study.content_type,
            "checksum_sha256": study.checksum_sha256,
        },
    )
    return study


@router.get("/studies/{study_id}/content")
async def study_content(
    study_id: str,
    db: DbSession,
    clinic_id: ClinicId,
    user: Annotated[User, Depends(require_permission("imaging:read"))],
):
    study, data = await dept.read_imaging_content(db, clinic_id, study_id)
    await write_audit(
        db,
        clinic_id=clinic_id,
        actor_id=user.id,
        action="view",
        resource_type="imaging_study",
        resource_id=study.id,
    )
    return Response(
        content=data,
        media_type=study.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{study.original_filename or study.id}"',
            "X-Content-Encrypted": "1" if study.is_encrypted else "0",
        },
    )
