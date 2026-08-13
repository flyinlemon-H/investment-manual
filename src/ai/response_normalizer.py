from __future__ import annotations

import json
import re
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

_MARKDOWN_JSON_FENCE = re.compile(
    r"\A```(?:json)?[ \t]*\r?\n(?P<body>[\s\S]*?)\r?\n```[ \t]*\Z",
    re.IGNORECASE,
)


def parse_ai_response_content(response: Any) -> dict[str, Any] | list[Any]:
    if isinstance(response, (dict, list)):
        return response
    if not isinstance(response, str):
        raise ValueError("AI response content must be a JSON object, array, or string.")

    text = response.strip()
    if not text:
        raise ValueError("AI response content is empty.")

    fence = _MARKDOWN_JSON_FENCE.fullmatch(text)
    if fence:
        text = fence.group("body").strip()
        if not text:
            raise ValueError("AI response JSON fence is empty.")
    elif text.startswith("```") or text.endswith("```"):
        raise ValueError("AI response Markdown fence must contain one complete JSON value.")

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError("AI response content must contain exactly one JSON value.") from exc
    if not isinstance(parsed, (dict, list)):
        raise ValueError("AI response JSON root must be an object or array.")
    return parsed


def normalize_ai_response(response: Any, *, task_name: str | None = None) -> dict[str, Any] | list[Any]:
    parsed = parse_ai_response_content(response)
    if not isinstance(parsed, dict):
        return parsed

    response = parsed
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
