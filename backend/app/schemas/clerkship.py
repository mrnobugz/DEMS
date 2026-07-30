"""Digital Clerkship structured intake blocks (anamnesis / pain / symptoms)."""

from __future__ import annotations

import json
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class MedicalHistoryFlags(BaseModel):
    model_config = ConfigDict(extra="forbid")
    diabetes: bool = False
    hypertension: bool = False
    asthma: bool = False
    heart_disease: bool = False
    major_surgery: bool = False
    hiv_aids: bool = False
    allergies_flag: bool = False


class PainAssessment(BaseModel):
    model_config = ConfigDict(extra="forbid")
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
    model_config = ConfigDict(extra="forbid")
    cavities: bool = False
    swelling: bool = False
    pus_discharge_fistula: bool = False
    halitosis: bool = False
    bleeding_gums: bool = False
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
        "major_surgery": "Major surgery",
        "hiv_aids": "HIV/AIDS",
        "allergies_flag": "Allergies",
    }
    active = [labels[k] for k, v in flags.model_dump().items() if v and k in labels]
    return ", ".join(active) if active else None
