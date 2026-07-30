"""AI Gateway — advisory decision-support only (never autonomous diagnosis)."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AiSuggestion, Appointment, AppointmentStatus, Patient


async def caries_risk_score(db: AsyncSession, clinic_id: str, patient_id: str) -> dict[str, Any]:
    patient = (
        await db.execute(
            select(Patient).where(Patient.id == patient_id, Patient.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if not patient:
        return {"error": "patient_not_found"}

    score = 0.15
    factors: list[str] = []
    meds = (patient.current_medications or "").lower()
    chronic = (patient.chronic_conditions or "").lower()
    history = (patient.dental_history or "").lower()
    age_years = None
    if patient.date_of_birth:
        age_years = (date.today() - patient.date_of_birth).days // 365
        if age_years < 12 or age_years > 60:
            score += 0.1
            factors.append("age_band_elevated")

    if "diabet" in chronic:
        score += 0.25
        factors.append("diabetes")
    if "xerostomia" in meds or "dry mouth" in history:
        score += 0.15
        factors.append("dry_mouth_risk")
    if any(k in history for k in ("caries", "decay", "filling", "restoration")):
        score += 0.2
        factors.append("prior_caries_history")
    if patient.allergies:
        score += 0.05

    score = round(min(score, 0.98), 2)
    band = "low" if score < 0.35 else "moderate" if score < 0.6 else "high"
    payload = {
        "patient_id": patient_id,
        "score": score,
        "band": band,
        "factors": factors,
        "recall_suggestion_months": 6 if band == "low" else 4 if band == "moderate" else 3,
        "disclaimer": "Advisory only — confirm clinically before changing care plan.",
    }
    patient.caries_risk_score = score
    suggestion = AiSuggestion(
        clinic_id=clinic_id,
        patient_id=patient_id,
        suggestion_type="caries_risk",
        payload_json=json.dumps(payload),
    )
    db.add(suggestion)
    await db.flush()
    return payload


async def smart_schedule_slots(
    db: AsyncSession,
    clinic_id: str,
    dentist_id: str,
    duration_minutes: int = 30,
    preferred_date: date | None = None,
) -> dict[str, Any]:
    """Suggest open slots using occupancy heuristics (modern scheduling assistant)."""
    target = preferred_date or (datetime.now(UTC) + timedelta(days=1)).date()
    day_start = datetime.combine(target, datetime.min.time(), tzinfo=UTC).replace(hour=8)
    day_end = day_start.replace(hour=17)

    existing = (
        await db.execute(
            select(Appointment).where(
                Appointment.clinic_id == clinic_id,
                Appointment.dentist_id == dentist_id,
                Appointment.status.notin_([AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW]),
                Appointment.starts_at >= day_start,
                Appointment.starts_at < day_end,
            )
        )
    ).scalars().all()

    busy = sorted([(a.starts_at, a.ends_at) for a in existing], key=lambda x: x[0])
    cursor = day_start
    suggestions: list[dict[str, Any]] = []
    step = timedelta(minutes=duration_minutes)

    while cursor + step <= day_end and len(suggestions) < 6:
        # lunch block
        if cursor.hour == 12:
            cursor = cursor.replace(hour=13, minute=0)
            continue
        overlap = any(s < cursor + step and e > cursor for s, e in busy)
        if not overlap:
            # Prefer mid-morning / mid-afternoon for lower no-show heuristic
            preference = 0.9 if cursor.hour in (9, 10, 14, 15) else 0.7
            suggestions.append(
                {
                    "starts_at": cursor.isoformat(),
                    "ends_at": (cursor + step).isoformat(),
                    "score": preference,
                    "reason": "Low conflict + historically stable attendance window",
                }
            )
        cursor += timedelta(minutes=15)

    payload = {
        "dentist_id": dentist_id,
        "date": target.isoformat(),
        "duration_minutes": duration_minutes,
        "slots": suggestions,
        "is_ai_suggested": True,
        "disclaimer": "Scheduling assistant suggestion — staff must confirm before booking.",
    }
    db.add(
        AiSuggestion(
            clinic_id=clinic_id,
            suggestion_type="smart_schedule",
            payload_json=json.dumps(payload),
        )
    )
    await db.flush()
    return payload


async def draft_soap_note(chief_complaint: str, findings: str | None = None) -> dict[str, Any]:
    """Clinical note assistance — draft only, never auto-finalized."""
    draft = {
        "subjective": f"Patient reports: {chief_complaint.strip()}",
        "objective": findings or "Clinical exam pending documentation.",
        "assessment": "Provisional assessment pending clinician confirmation.",
        "plan": "Discuss findings with patient; propose treatment options; obtain consent as needed.",
        "ai_draft": True,
        "is_ai_suggested": True,
        "disclaimer": "AI draft only — review and edit before saving as clinical record.",
    }
    return draft
