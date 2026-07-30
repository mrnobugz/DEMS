"""Dental ICD-10-CM K00–K14 lookup (oral cavity & salivary glands).

Data extracted from: https://github.com/smog1210/2022-ICD-10-CM-JSON
(CMS ICD-10-CM 2022 code list).
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "icd10_dental_k00_k14.json"

_CODE_RE = re.compile(r"^K(0[0-9]|1[0-4])(\.\d+)?$", re.IGNORECASE)


@lru_cache(maxsize=1)
def load_catalog() -> dict[str, Any]:
    with DATA_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def normalize_code(code: str) -> str:
    compact = code.upper().replace(".", "").replace(" ", "")
    if len(compact) <= 3:
        return compact
    return f"{compact[:3]}.{compact[3:]}"


def is_dental_oral_code(code: str) -> bool:
    try:
        return bool(_CODE_RE.match(normalize_code(code)))
    except Exception:
        return False


def get_code(code: str) -> dict[str, Any] | None:
    target = normalize_code(code).replace(".", "").upper()
    for row in load_catalog()["codes"]:
        if row["code_compact"] == target:
            return row
    return None


def search_codes(
    q: str | None = None,
    *,
    category: str | None = None,
    billable_only: bool = False,
    limit: int = 40,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = load_catalog()["codes"]
    if category:
        cat = category.upper().replace(".", "")[:3]
        rows = [r for r in rows if r["category"] == cat]
    if billable_only:
        rows = [r for r in rows if r.get("billable")]
    if q:
        needle = q.strip().lower()
        compact = needle.replace(".", "").replace(" ", "")
        scored: list[tuple[int, dict[str, Any]]] = []
        for row in rows:
            code = row["code"].lower()
            desc = row["description"].lower()
            cc = row["code_compact"].lower()
            if compact and cc.startswith(compact):
                scored.append((0, row))
            elif needle in code or compact in cc:
                scored.append((1, row))
            elif needle in desc:
                scored.append((2, row))
            elif needle in row.get("category_label", "").lower():
                scored.append((3, row))
        scored.sort(key=lambda x: (x[0], x[1]["code_compact"]))
        rows = [r for _, r in scored]
    return rows[: max(1, min(limit, 100))]


def categories() -> list[dict[str, str]]:
    seen: dict[str, str] = {}
    for row in load_catalog()["codes"]:
        seen.setdefault(row["category"], row["category_label"])
    return [{"code": k, "label": v} for k, v in sorted(seen.items())]
