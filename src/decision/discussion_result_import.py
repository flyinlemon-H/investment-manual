from __future__ import annotations

import json
from typing import Any

from src.decision.decision_integration import discussion_result_to_decision_outcome
from src.decision.decision_schema import validate_discussion_result


def parse_discussion_result_json(raw_json: str) -> dict[str, Any]:
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid discussion result JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("discussion result JSON root must be an object")
    validate_discussion_result(data)
    return data


def import_discussion_result_to_decision_outcome(
    discussion_result: str | dict[str, Any],
    *,
    task_type: str,
    created_at: str | None = None,
) -> dict[str, Any]:
    if isinstance(discussion_result, str):
        parsed = parse_discussion_result_json(discussion_result)
    else:
        parsed = dict(discussion_result)
        validate_discussion_result(parsed)
    return discussion_result_to_decision_outcome(parsed, task_type=task_type, created_at=created_at)
