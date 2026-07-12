from __future__ import annotations

from typing import Any


ARRAY_FIELDS = {
    "coreDrivers",
    "fundamentalSupport",
    "longTermRisks",
    "invalidationConditions",
    "informationGaps",
    "notes",
}

ENUM_FIELDS = {
    "status",
    "draft_status",
    "review_status",
    "logic_status",
    "confidence",
}


def normalize_ai_response(response: dict[str, Any], *, task_name: str | None = None) -> dict[str, Any]:
    normalized = dict(response)
    if task_name == "long_term_logic_review":
        for field in ARRAY_FIELDS:
            if field in normalized:
                normalized[field] = normalize_array_field(normalized[field])
        for field in ENUM_FIELDS:
            if isinstance(normalized.get(field), str):
                normalized[field] = normalize_enum_value(normalized[field])
    return normalized


def normalize_array_field(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        return [stripped] if stripped else []
    return [value]


def normalize_enum_value(value: str) -> str:
    return value.strip().lower()

