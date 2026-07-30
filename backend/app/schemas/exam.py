"""Clinical examination structured blocks (Clerkship §3–§5)."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class VisitVitals(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bp_systolic: Optional[int] = Field(default=None, ge=50, le=300)
    bp_diastolic: Optional[int] = Field(default=None, ge=30, le=200)
    pulse: Optional[int] = Field(default=None, ge=20, le=250)
    height_cm: Optional[float] = Field(default=None, ge=30, le=280)
    weight_kg: Optional[float] = Field(default=None, ge=1, le=400)
    posture: Optional[str] = None
    gait: Optional[str] = None
    appearance: Optional[str] = Field(default=None, description="healthy_looking | ill_looking")


class ExtraOralExam(BaseModel):
    model_config = ConfigDict(extra="forbid")
    head_shape: Optional[str] = None
    facial_form: Optional[str] = None
    symmetry: Optional[str] = None
    proportions: Optional[str] = None
    profile: Optional[str] = None
    skeletal_anterior: Optional[str] = None
    skeletal_posterior: Optional[str] = None
    skeletal_vertical: Optional[str] = None
    smile_line: Optional[str] = None
    smile_corridor_mm: Optional[float] = None
    nasolabial_angle: Optional[str] = None
    chin: Optional[str] = None
    mentolabial_sulcus: Optional[str] = None
    lip_competence: Optional[str] = Field(default=None, description="competent | incompetent")
    tmj_tenderness: Optional[bool] = None
    tmj_sounds: Optional[bool] = None
    jaw_deviation: Optional[bool] = None
    restricted_movement: Optional[bool] = None
    lymph_nodes_palpable: Optional[bool] = None
    notes: Optional[str] = None


class IntraOralExam(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tongue: Optional[str] = None
    palate: Optional[str] = None
    gingiva_mucosa: Optional[str] = None
    periodontium: Optional[str] = None
    hard_tissue_notes: Optional[str] = None
    unerupted_teeth: Optional[str] = None
    missing_teeth: Optional[str] = None
    decayed_teeth: Optional[str] = None
    filled_teeth: Optional[str] = None
    defective_teeth: Optional[str] = None
    worn_teeth: Optional[str] = None
    discolored_teeth: Optional[str] = None
    plaque_by_sextant: Optional[str] = None
    calculus_by_sextant: Optional[str] = None
    occlusion: Optional[str] = Field(default=None, description="normal | malocclusion")
    prosthesis_status: Optional[str] = None
    oral_habits: Optional[str] = None
    notes: Optional[str] = None


class VisitInvestigations(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pulp_percussion: Optional[str] = None
    pulp_cold: Optional[str] = None
    pulp_heat: Optional[str] = None
    pulp_test_cavity: Optional[str] = None
    radiograph_notes: Optional[str] = None
    photography_notes: Optional[str] = None
    study_models_notes: Optional[str] = None
    pulp_percussion_result: Optional[str] = Field(
        default=None, description="positive | negative | delayed"
    )
    pulp_cold_result: Optional[str] = None
    pulp_heat_result: Optional[str] = None
    pulp_test_cavity_result: Optional[str] = None
    photography_type: Optional[str] = Field(default=None, description="extra_oral | intra_oral")
    photography_date: Optional[str] = None
    photography_tooth: Optional[str] = None
    photography_storage_key: Optional[str] = None
    study_models_date: Optional[str] = None
    study_models_photo_key: Optional[str] = None
    radiograph_lucency: Optional[str] = Field(
        default=None, description="radiolucent | opaque | mixed"
    )
    radiograph_root_involved: Optional[bool] = None
    radiograph_furcation: Optional[bool] = None
    radiograph_tooth: Optional[str] = None


class Icd10CodeRef(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=3, max_length=16)
    description: str = Field(min_length=1, max_length=400)


class VisitDiagnosis(BaseModel):
    model_config = ConfigDict(extra="forbid")
    problem_list: Optional[str] = None
    working_diagnosis: Optional[str] = None
    final_impression: Optional[str] = None
    referrals: Optional[str] = Field(
        default=None,
        description="Comma-separated: Oral Surgery, Orthodontics, Periodontics, etc.",
    )
    general_treatment_plan_notes: Optional[str] = None
    icd10_codes: list[Icd10CodeRef] = Field(default_factory=list)
