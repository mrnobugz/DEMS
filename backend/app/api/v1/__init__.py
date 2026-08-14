from fastapi import APIRouter

from app.api.v1 import (
    appointments,
    auth,
    billing,
    clinical,
    clinical_depth,
    departments,
    imaging,
    insurance,
    inventory,
    lab,
    notifications,
    ops,
    owner,
    patients,
    pharmacy,
    phase2_ops,
    portal,
    specialty,
    staff,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(patients.router)
api_router.include_router(appointments.router)
api_router.include_router(clinical.router)
api_router.include_router(clinical_depth.router)
api_router.include_router(billing.router)
api_router.include_router(insurance.router)
api_router.include_router(ops.router)
api_router.include_router(owner.router)
api_router.include_router(staff.router)
api_router.include_router(inventory.router)
api_router.include_router(lab.router)
api_router.include_router(imaging.router)
api_router.include_router(pharmacy.router)
api_router.include_router(departments.router)
api_router.include_router(specialty.router)
api_router.include_router(phase2_ops.router)
api_router.include_router(notifications.router)
api_router.include_router(portal.router)
