from __future__ import annotations

from typing import Any


REVIEW_TASK_REQUIRED_FIELDS = [
    "review_id",
    "source_input_id",
    "created_at",
    "symbol",
    "task_type",
    "priority",
    "status",
    "summary",
    "payload",
    "available_actions",
]

REVIEW_TASK_STATUSES = {"pending", "reviewing", "approved", "rejected", "deferred"}
REVIEW_TASK_TYPES = {
    "trade",
    "technical_material",
    "report",
    "event",
    "ai_draft",
    "long_term_logic_review",
    "task_command",
    "other",
}
REVIEW_TASK_PRIORITIES = {"low", "normal", "high", "urgent"}
DEFAULT_AVAILABLE_ACTIONS = ["approve", "reject", "defer"]


def validate_review_task(task: dict[str, Any]) -> None:
    missing = [field for field in REVIEW_TASK_REQUIRED_FIELDS if field not in task]
    if missing:
        raise ValueError(f"review task missing required fields: {', '.join(missing)}")
    if task["task_type"] not in REVIEW_TASK_TYPES:
        raise ValueError(f"invalid review task task_type: {task['task_type']}")
    if task["priority"] not in REVIEW_TASK_PRIORITIES:
        raise ValueError(f"invalid review task priority: {task['priority']}")
    if task["status"] not in REVIEW_TASK_STATUSES:
        raise ValueError(f"invalid review task status: {task['status']}")
    if not isinstance(task["available_actions"], list) or not task["available_actions"]:
        raise ValueError("review task available_actions must be a non-empty list")


def normalize_task_type(value: Any) -> str:
    task_type = str(value or "other").strip().lower()
    if task_type in REVIEW_TASK_TYPES:
        return task_type
    return "other"


def default_priority(task_type: str) -> str:
    if task_type == "trade":
        return "high"
    if task_type in {"task_command", "event"}:
        return "normal"
    return "low"
