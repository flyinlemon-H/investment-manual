from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

from src.decision.decision_schema import (
    validate_decision_result,
    validate_discussion_result,
    validate_operation_request,
    validate_plan_update_request,
)


LOCAL_TZ = timezone(timedelta(hours=8))
OPERATION_KEYWORDS = {
    "operation",
    "operation_request",
    "record_operation",
    "record_operation_result",
    "操作",
    "记录操作",
    "操作结果",
}


def create_discussion_result(
    *,
    discussion_id: str,
    source_review_id: str,
    symbol: str,
    final_conclusion: str,
    user_constraints: list[str] | None = None,
    change_required: bool = False,
    created_at: str | None = None,
) -> dict[str, Any]:
    result = {
        "discussion_id": discussion_id,
        "source_review_id": source_review_id,
        "symbol": symbol,
        "final_conclusion": final_conclusion,
        "user_constraints": user_constraints or [],
        "change_required": change_required,
        "created_at": created_at or now_iso(),
    }
    validate_discussion_result(result)
    return result


def discussion_result_to_decision_outcome(
    discussion_result: dict[str, Any],
    *,
    task_type: str,
    created_at: str | None = None,
) -> dict[str, Any]:
    validate_discussion_result(discussion_result)
    outcome = {
        "decision_id": safe_id("decision", discussion_result["discussion_id"]),
        "source_review_id": discussion_result["source_review_id"],
        "symbol": discussion_result["symbol"],
        "task_type": task_type,
        "outcome_type": infer_outcome_type(discussion_result),
        "conclusion": discussion_result["final_conclusion"],
        "created_at": created_at or now_iso(),
    }
    validate_decision_result(outcome)
    return outcome


def decision_outcome_to_plan_update_request(
    decision_outcome: dict[str, Any],
    *,
    current_plan_reference: dict[str, Any] | None = None,
    requested_changes: list[str] | None = None,
    created_at: str | None = None,
) -> dict[str, Any] | None:
    validate_decision_result(decision_outcome)
    if decision_outcome["outcome_type"] != "plan_update":
        return None
    request = {
        "request_id": safe_id("plan_update_request", decision_outcome["decision_id"]),
        "source_decision_id": decision_outcome["decision_id"],
        "symbol": decision_outcome["symbol"],
        "task_type": decision_outcome["task_type"],
        "request_type": "plan_update",
        "reason": decision_outcome["conclusion"],
        "current_plan_reference": current_plan_reference or {},
        "requested_changes": requested_changes or [decision_outcome["conclusion"]],
        "created_at": created_at or now_iso(),
    }
    validate_plan_update_request(request)
    return request


def decision_outcome_to_operation_request(
    decision_outcome: dict[str, Any],
    *,
    operation_type: str = "record_operation_result",
    created_at: str | None = None,
) -> dict[str, Any] | None:
    validate_decision_result(decision_outcome)
    if decision_outcome["outcome_type"] != "operation_request":
        return None
    request = {
        "request_id": safe_id("operation_request", decision_outcome["decision_id"]),
        "source_decision_id": decision_outcome["decision_id"],
        "symbol": decision_outcome["symbol"],
        "task_type": decision_outcome["task_type"],
        "operation_type": operation_type,
        "reason": decision_outcome["conclusion"],
        "created_at": created_at or now_iso(),
    }
    validate_operation_request(request)
    return request


def infer_outcome_type(discussion_result: dict[str, Any]) -> str:
    if not discussion_result.get("change_required"):
        return "no_change"
    text = " ".join(
        [
            str(discussion_result.get("final_conclusion") or ""),
            " ".join(str(item) for item in discussion_result.get("user_constraints") or []),
        ]
    ).lower()
    if any(keyword.lower() in text for keyword in OPERATION_KEYWORDS):
        return "operation_request"
    return "plan_update"


def now_iso() -> str:
    return datetime.now(LOCAL_TZ).isoformat()


def safe_id(*parts: str) -> str:
    raw = "_".join(str(part or "") for part in parts)
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", raw).strip("_") or "decision"
