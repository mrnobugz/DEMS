"""Digital Clerkship structured intake blocks (anamnesis / pain / symptoms)."""

from __future__ import annotations

import json
from datetime import date
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class MedicalHistoryFlags(BaseModel):
    """Systemic review used on dental clerkship medical-history forms."""

    model_config = ConfigDict(extra="ignore")
    diabetes: bool = False
    hypertension: bool = False
    asthma: bool = False
    heart_disease: bool = False
    bleeding_disorder: bool = False
    epilepsy: bool = False
    hepatitis: bool = False
    thyroid: bool = False
    kidney_disease: bool = False
    anaemia: bool = False
    cancer_radiation: bool = False
    major_surgery: bool = False
    hiv_aids: bool = False
    allergies_flag: bool = False
    latex_allergy: bool = False


class PainAssessment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    site: Optional[str] = Field(default=None, description="Tooth / region")
    onset: Optional[str] = Field(default=None, description="spontaneous | non_spontaneous")
    severity: Optional[str] = Field(default=None, description="mild | moderate | severe")
    character: Optional[str] = Field(default=None, description="localized | not_localized")
    quality: Optional[str] = Field(
        default=None, description="dull | burning | sharp | throbbing"
    )
    duration: Optional[str] = None
    radiation: Optional[str] = None
    aggravating_factors: Optional[str] = None
    relieving_factors: Optional[str] = None


class ReportedSymptoms(BaseModel):
    model_config = ConfigDict(extra="ignore")
    toothache: bool = False
    cavities: bool = False
    swelling: bool = False
    pus_discharge_fistula: bool = False
    halitosis: bool = False
    bleeding_gums: bool = False
    tooth_mobility: bool = False
    sensitivity: bool = False
    tmj_click: bool = False
    dry_mouth: bool = False
    loose_dentures: bool = False
    ulceration: bool = False


def dumps_block(model: BaseModel | dict | None) -> str | None:
    if model is None:
        return None
    if isinstance(model, dict):
        return json.dumps(model)
    return model.model_dump_json()


def loads_block(raw: str | None, cls: type[BaseModel]) -> Any:
    if not raw:
        return cls()
    try:
        return cls.model_validate_json(raw)
    except Exception:
        try:
            return cls.model_validate(json.loads(raw))
        except Exception:
            return cls()


def compose_address(
    *,
    po_box: str | None,
    street: str | None,
    house_number: str | None,
    area_ward: str | None,
    town_city: str | None,
    legacy: str | None = None,
) -> str | None:
    parts = [p for p in (house_number, street, area_ward, town_city, po_box and f"P.O. Box {po_box}") if p]
    if parts:
        return ", ".join(parts)
    return legacy


def flags_to_chronic_summary(flags: MedicalHistoryFlags | None) -> str | None:
    if not flags:
        return None
    labels = {
        "diabetes": "Diabetes",
        "hypertension": "Hypertension",
        "asthma": "Asthma",
        "heart_disease": "Heart disease",
        "bleeding_disorder": "Bleeding disorder",
        "epilepsy": "Epilepsy",
        "hepatitis": "Hepatitis",
        "thyroid": "Thyroid disease",
        "kidney_disease": "Kidney disease",
        "anaemia": "Anaemia",
        "cancer_radiation": "Cancer / radiation",
        "major_surgery": "Major surgery",
        "hiv_aids": "HIV/AIDS",
        "allergies_flag": "Allergies",
        "latex_allergy": "Latex allergy",
    }
    active = [labels[k] for k, v in flags.model_dump().items() if v and k in labels]
    return ", ".join(active) if active else None


def age_years(dob: date | None, today: date | None = None) -> int | None:
    if not dob:
        return None
    today = today or date.today()
    years = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    return max(years, 0)


def clerkship_registration_gaps(data) -> list[str]:
    """Front-desk particulars only — clinical anamnesis is completed by the dentist."""
    gaps: list[str] = []
    if not getattr(data, "first_name", None):
        gaps.append("First name")
    if not getattr(data, "last_name", None):
        gaps.append("Last name / surname")
    if not getattr(data, "date_of_birth", None):
        gaps.append("Date of birth")
    if not getattr(data, "sex", None):
        gaps.append("Sex")
    if not getattr(data, "phone", None):
        gaps.append("Telephone")
    if not getattr(data, "town_city", None):
        gaps.append("Town / city of residence")
    nok = getattr(data, "next_of_kin", None) or getattr(data, "emergency_contact_name", None)
    if not nok:
        gaps.append("Next of kin or emergency contact")
    years = age_years(getattr(data, "date_of_birth", None))
    if years is not None and years < 18:
        if not getattr(data, "guardian_name", None):
            gaps.append("Guardian name (patient is under 18)")
        if not getattr(data, "guardian_relationship", None):
            gaps.append("Guardian relationship")
        if not getattr(data, "guardian_phone", None):
            gaps.append("Guardian telephone")
    return gaps
