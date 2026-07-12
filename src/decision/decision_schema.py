from __future__ import annotations

from typing import Any


DISCUSSION_RESULT_REQUIRED_FIELDS = [
    "discussion_id",
    "source_review_id",
    "symbol",
    "final_conclusion",
    "user_constraints",
    "change_required",
    "created_at",
]

DECISION_RESULT_REQUIRED_FIELDS = [
    "decision_id",
    "source_review_id",
    "symbol",
    "task_type",
    "outcome_type",
    "conclusion",
    "created_at",
]

PLAN_UPDATE_REQUEST_REQUIRED_FIELDS = [
    "request_id",
    "source_decision_id",
    "symbol",
    "task_type",
    "request_type",
    "reason",
    "current_plan_reference",
    "requested_changes",
    "created_at",
]

OPERATION_REQUEST_REQUIRED_FIELDS = [
    "request_id",
    "source_decision_id",
    "symbol",
    "task_type",
    "operation_type",
    "reason",
    "created_at",
]

DECISION_OUTCOME_TYPES = {
    "no_change",
    "plan_update",
    "operation_request",
}


def validate_discussion_result(result: dict[str, Any]) -> None:
    missing = [field for field in DISCUSSION_RESULT_REQUIRED_FIELDS if field not in result]
    if missing:
        raise ValueError(f"discussion result missing required fields: {', '.join(missing)}")
    for field in ["discussion_id", "source_review_id", "symbol", "final_conclusion", "created_at"]:
        if not isinstance(result[field], str) or not result[field].strip():
            raise ValueError(f"discussion result {field} must be a non-empty string")
    if not isinstance(result["user_constraints"], list):
        raise ValueError("discussion result user_constraints must be a list")
    if not all(isinstance(item, str) for item in result["user_constraints"]):
        raise ValueError("discussion result user_constraints must only contain strings")
    if not isinstance(result["change_required"], bool):
        raise ValueError("discussion result change_required must be a boolean")


def validate_decision_result(result: dict[str, Any]) -> None:
    missing = [field for field in DECISION_RESULT_REQUIRED_FIELDS if field not in result]
    if missing:
        raise ValueError(f"decision result missing required fields: {', '.join(missing)}")
    for field in ["decision_id", "source_review_id", "symbol", "task_type", "conclusion", "created_at"]:
        if not isinstance(result[field], str) or not result[field].strip():
            raise ValueError(f"decision result {field} must be a non-empty string")
    if result["outcome_type"] not in DECISION_OUTCOME_TYPES:
        raise ValueError(f"invalid decision outcome_type: {result['outcome_type']}")


def validate_plan_update_request(request: dict[str, Any]) -> None:
    missing = [field for field in PLAN_UPDATE_REQUEST_REQUIRED_FIELDS if field not in request]
    if missing:
        raise ValueError(f"plan update request missing required fields: {', '.join(missing)}")
    for field in ["request_id", "source_decision_id", "symbol", "task_type", "reason", "created_at"]:
        if not isinstance(request[field], str) or not request[field].strip():
            raise ValueError(f"plan update request {field} must be a non-empty string")
    if request["request_type"] != "plan_update":
        raise ValueError("plan update request request_type must be plan_update")
    if not isinstance(request["current_plan_reference"], dict):
        raise ValueError("plan update request current_plan_reference must be an object")
    if not isinstance(request["requested_changes"], list):
        raise ValueError("plan update request requested_changes must be a list")


def validate_operation_request(request: dict[str, Any]) -> None:
    missing = [field for field in OPERATION_REQUEST_REQUIRED_FIELDS if field not in request]
    if missing:
        raise ValueError(f"operation request missing required fields: {', '.join(missing)}")
    for field in ["request_id", "source_decision_id", "symbol", "task_type", "operation_type", "reason", "created_at"]:
        if not isinstance(request[field], str) or not request[field].strip():
            raise ValueError(f"operation request {field} must be a non-empty string")
