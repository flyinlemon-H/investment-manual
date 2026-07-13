from __future__ import annotations

import hashlib
import json
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


RESOLUTION_TYPES = {"no_action_required", "plan_applied", "dismissed", "superseded"}
ACTIONABLE_LOGIC_STATUSES = {"weakened", "invalid", "insufficient_information"}


def build_task_resolution_projection(
    ai_drafts: list[dict[str, Any]],
    review_tasks: list[dict[str, Any]],
    decision_outcomes: list[dict[str, Any]],
    plan_update_requests: list[dict[str, Any]],
    plan_application_audits: list[dict[str, Any]],
    existing_resolutions: list[dict[str, Any]],
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    current_time = now or datetime.now(timezone.utc)
    tasks_by_draft = {
        str(task.get("source_input_id") or ""): task
        for task in review_tasks
        if task.get("source_input_id")
    }
    outcomes_by_review = {
        str(outcome.get("source_review_id") or ""): outcome
        for outcome in decision_outcomes
        if outcome.get("source_review_id")
    }
    outcomes_by_id = {
        str(outcome.get("decision_id") or ""): outcome
        for outcome in decision_outcomes
        if outcome.get("decision_id")
    }
    requests_by_decision = {
        str(request.get("source_decision_id") or ""): request
        for request in plan_update_requests
        if request.get("source_decision_id")
    }
    audits_by_application = {
        _text(audit.get("application_id")): audit
        for audit in plan_application_audits
        if audit.get("application_id")
    }
    resolutions = [item for item in existing_resolutions if _valid_resolution(item)]
    resolution_keys = {_resolution_key(item) for item in resolutions}
    projections: list[dict[str, Any]] = []

    for draft in ai_drafts:
        draft_id = _text(draft.get("draft_id") or draft.get("id"))
        task = tasks_by_draft.get(draft_id, {})
        result = _result(draft, task)
        review_id = _text(task.get("review_id") or draft.get("source_review_id"))
        outcome = outcomes_by_review.get(review_id, {})
        decision_id = _text(outcome.get("decision_id"))
        request = requests_by_decision.get(decision_id, {})
        logic_status = _text(result.get("logic_status") or draft.get("logic_status")).lower()
        created_at = _text(task.get("created_at") or draft.get("created_at") or draft.get("generatedAt"))
        validation_passed = _validation_passed(draft, task)
        provider = _text(draft.get("provider")).lower()
        model = _text(draft.get("model")).lower()
        is_mock = "mock" in provider or "mock" in model
        has_ai_result = bool(result and _text(result.get("summary") or result.get("investmentThesis")))
        task_type = _text(draft.get("task_type") or draft.get("taskName") or task.get("task_type"))
        symbol = _text(draft.get("symbol") or result.get("symbol") or task.get("symbol")).upper()
        schedule = review_schedule(logic_status, created_at, current_time)
        projection = {
            "draftId": draft_id,
            "reviewId": review_id,
            "decisionId": decision_id,
            "requestId": _text(request.get("request_id")),
            "symbol": symbol,
            "taskType": task_type,
            "createdAt": created_at,
            "logicStatus": logic_status,
            "validationPassed": validation_passed,
            "hasAiResult": has_ai_result,
            "isMock": is_mock,
            "taskValid": bool(review_id and symbol and task_type and validation_passed and has_ai_result and not is_mock),
            "actionable": _is_actionable(task_type, logic_status, outcome),
            "priority": _priority(task_type, logic_status),
            "userSummary": _user_summary(task_type, logic_status, result),
            **schedule,
        }
        projections.append(projection)

    # A successful formal plan audit resolves its source review without changing source objects.
    for audit in plan_application_audits:
        if _text(audit.get("result")) != "applied":
            continue
        decision_id = _text(audit.get("source_decision_id"))
        outcome = outcomes_by_id.get(decision_id, {})
        review_id = _text(audit.get("source_review_id") or outcome.get("source_review_id"))
        projection = next((item for item in projections if item["reviewId"] == review_id), None)
        if not projection:
            continue
        resolution = _make_resolution(
            projection,
            "plan_applied",
            _text(audit.get("applied_at")) or current_time.isoformat(),
            source_decision_id=decision_id,
            source_request_id=_text(audit.get("source_request_id")),
            source_application_id=_text(audit.get("application_id")),
            summary="计划更新已应用",
        )
        _append_resolution(resolutions, resolution_keys, resolution)

    # A validated valid result with no requested change is complete without user action.
    for projection in projections:
        if not projection["taskValid"] or projection["taskType"] != "long_term_logic_review":
            continue
        if projection["logicStatus"] != "valid":
            continue
        outcome = outcomes_by_review.get(projection["reviewId"], {})
        result = _result_by_draft_id(ai_drafts, review_tasks, projection["draftId"])
        change_required = bool(result.get("change_required") or outcome.get("outcome_type") == "plan_update")
        operation_required = bool(result.get("operation_required") or outcome.get("outcome_type") == "operation_request")
        if change_required or operation_required:
            continue
        resolution = _make_resolution(
            projection,
            "no_action_required",
            projection["createdAt"] or current_time.isoformat(),
            source_decision_id=projection["decisionId"],
            summary="本次复核已完成，无需调整",
        )
        _append_resolution(resolutions, resolution_keys, resolution)

    # Older unresolved tasks of the same symbol and type are historical, not homepage work.
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for projection in projections:
        if projection["taskValid"]:
            grouped[(projection["symbol"], projection["taskType"])].append(projection)
    for group in grouped.values():
        ordered = sorted(group, key=lambda item: item["createdAt"], reverse=True)
        for old in ordered[1:]:
            if _resolution_for(old["reviewId"], resolutions):
                continue
            resolution = _make_resolution(
                old,
                "superseded",
                current_time.isoformat(),
                source_decision_id=old["decisionId"],
                summary="已有更新的复核结果，本记录转入历史",
            )
            _append_resolution(resolutions, resolution_keys, resolution)

    latest_keys: set[tuple[str, str]] = set()
    for projection in sorted(projections, key=lambda item: item["createdAt"], reverse=True):
        key = (projection["symbol"], projection["taskType"])
        projection["isCurrent"] = bool(projection["taskValid"] and key not in latest_keys)
        if projection["taskValid"]:
            latest_keys.add(key)
        resolution = _resolution_for(projection["reviewId"], resolutions)
        projection["resolved"] = bool(resolution)
        projection["resolutionType"] = _text(resolution.get("resolution_type")) if resolution else ""
        projection["resolutionId"] = _text(resolution.get("resolution_id")) if resolution else ""
        projection["resolvedAt"] = _text(resolution.get("resolved_at")) if resolution else ""
        projection["sourceApplicationId"] = _text(resolution.get("source_application_id")) if resolution else ""
        audit = audits_by_application.get(projection["sourceApplicationId"], {})
        projection["applicationAppliedAt"] = _text(audit.get("applied_at"))
        projection["archivedPlanCount"] = len(audit.get("archived_plan_ids") or [])
        projection["createdPlanCount"] = len(audit.get("created_plan_ids") or [])
        projection["applicationAuditId"] = _text(audit.get("application_id"))
        projection["actionable"] = bool(projection["actionable"] and not projection["resolved"])

    home = [
        item for item in projections
        if item["taskValid"] and item["isCurrent"] and item["actionable"] and not item["resolved"]
    ]
    home.sort(key=lambda item: (_priority_rank(item["priority"]), item["createdAt"]), reverse=True)
    history = sorted(projections, key=lambda item: item["createdAt"], reverse=True)
    system_issues = [
        {
            "draftId": item["draftId"],
            "reviewId": item["reviewId"],
            "symbol": item["symbol"],
            "taskType": item["taskType"],
            "issue": "AI Draft 校验失败或结果不完整",
        }
        for item in projections
        if not item["isMock"] and item["reviewId"] and (not item["validationPassed"] or not item["hasAiResult"])
    ]
    return {
        "taskResolutions": resolutions,
        "taskProjections": projections,
        "homeTaskProjections": home,
        "historyProjections": history,
        "systemIssues": system_issues,
    }


def review_schedule(logic_status: str, reviewed_at: str, now: datetime) -> dict[str, Any]:
    reviewed = _parse_datetime(reviewed_at)
    interval = 90 if logic_status == "valid" else (30 if logic_status == "weakened" else None)
    next_due = reviewed + timedelta(days=interval) if reviewed and interval else None
    if logic_status == "invalid":
        due_status = "action_required"
        reason = "长期逻辑可能失效"
    elif logic_status == "insufficient_information":
        due_status = "awaiting_information"
        reason = "等待补充资料或新版复核"
    elif next_due:
        due_status = "due" if now.astimezone(timezone.utc) >= next_due.astimezone(timezone.utc) else "scheduled"
        reason = "定期复核"
    else:
        due_status = "unknown"
        reason = ""
    return {
        "lastReviewedAt": reviewed_at,
        "reviewIntervalDays": interval,
        "nextReviewDue": next_due.date().isoformat() if next_due else "",
        "reviewDueStatus": due_status,
        "reviewTriggerReason": reason,
    }


def write_new_resolutions(directory: Path, resolutions: list[dict[str, Any]]) -> list[Path]:
    directory.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for resolution in resolutions:
        validate_resolution(resolution)
        path = directory / f"{resolution['resolution_id']}.json"
        if path.exists():
            continue
        temp = path.with_suffix(".json.tmp")
        try:
            with temp.open("w", encoding="utf-8", newline="\n") as handle:
                json.dump(resolution, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            json.loads(temp.read_text(encoding="utf-8"))
            os.replace(temp, path)
            written.append(path)
        except Exception:
            temp.unlink(missing_ok=True)
            raise
    return written


def validate_resolution(resolution: dict[str, Any]) -> None:
    required = {"resolution_id", "source_review_id", "symbol", "task_type", "resolution_type", "summary", "resolved_at", "source_application_id"}
    missing = sorted(required - set(resolution))
    if missing:
        raise ValueError("resolution missing fields: " + ", ".join(missing))
    if resolution.get("resolution_type") not in RESOLUTION_TYPES:
        raise ValueError("invalid resolution_type")
    for field in ("resolution_id", "source_review_id", "symbol", "task_type", "summary", "resolved_at"):
        if not _text(resolution.get(field)):
            raise ValueError(f"resolution {field} must be non-empty")


def _make_resolution(
    projection: dict[str, Any],
    resolution_type: str,
    resolved_at: str,
    *,
    source_decision_id: str = "",
    source_request_id: str = "",
    source_application_id: str = "",
    summary: str,
) -> dict[str, Any]:
    token = "|".join((projection["reviewId"], resolution_type, source_application_id))
    resolution_id = "resolution_" + hashlib.sha256(token.encode("utf-8")).hexdigest()[:24]
    return {
        "resolution_id": resolution_id,
        "source_review_id": projection["reviewId"],
        "source_decision_id": source_decision_id,
        "source_request_id": source_request_id,
        "symbol": projection["symbol"],
        "task_type": projection["taskType"],
        "resolution_type": resolution_type,
        "summary": summary,
        "resolved_at": resolved_at,
        "source_application_id": source_application_id or None,
        "last_reviewed_at": projection.get("lastReviewedAt") or "",
        "review_interval_days": projection.get("reviewIntervalDays"),
        "next_review_due": projection.get("nextReviewDue") or "",
        "review_due_status": projection.get("reviewDueStatus") or "unknown",
        "review_trigger_reason": projection.get("reviewTriggerReason") or "",
        "version": "1.0",
    }


def _append_resolution(items: list[dict[str, Any]], keys: set[tuple[str, str, str]], value: dict[str, Any]) -> None:
    key = _resolution_key(value)
    if key not in keys:
        validate_resolution(value)
        items.append(value)
        keys.add(key)


def _resolution_key(item: dict[str, Any]) -> tuple[str, str, str]:
    return (_text(item.get("source_review_id")), _text(item.get("resolution_type")), _text(item.get("source_application_id")))


def _resolution_for(review_id: str, resolutions: list[dict[str, Any]]) -> dict[str, Any]:
    matches = [item for item in resolutions if _text(item.get("source_review_id")) == review_id]
    order = {"plan_applied": 4, "dismissed": 3, "no_action_required": 2, "superseded": 1}
    return max(matches, key=lambda item: order.get(_text(item.get("resolution_type")), 0), default={})


def _valid_resolution(item: dict[str, Any]) -> bool:
    try:
        validate_resolution(item)
        return True
    except ValueError:
        return False


def _validation_passed(draft: dict[str, Any], task: dict[str, Any]) -> bool:
    payload = task.get("payload") if isinstance(task.get("payload"), dict) else {}
    direct = _text(draft.get("validation_status") or draft.get("validationStatus") or payload.get("validation_status")).lower()
    if direct:
        return direct == "passed"
    validation = draft.get("validation") if isinstance(draft.get("validation"), dict) else {}
    return validation.get("schemaValid") is True and validation.get("businessValid") is True


def _result(draft: dict[str, Any], task: dict[str, Any]) -> dict[str, Any]:
    payload = task.get("payload") if isinstance(task.get("payload"), dict) else {}
    for value in (draft.get("result"), draft.get("draft"), payload.get("result")):
        if isinstance(value, dict) and value:
            return value
    return {}


def _result_by_draft_id(drafts: list[dict[str, Any]], tasks: list[dict[str, Any]], draft_id: str) -> dict[str, Any]:
    draft = next((item for item in drafts if _text(item.get("draft_id") or item.get("id")) == draft_id), {})
    task = next((item for item in tasks if _text(item.get("source_input_id")) == draft_id), {})
    return _result(draft, task)


def _is_actionable(task_type: str, logic_status: str, outcome: dict[str, Any]) -> bool:
    if task_type == "long_term_logic_review":
        return logic_status in ACTIONABLE_LOGIC_STATUSES
    return _text(outcome.get("outcome_type")) in {"plan_update", "operation_request"}


def _priority(task_type: str, logic_status: str) -> str:
    if task_type == "long_term_logic_review" and logic_status == "invalid":
        return "urgent"
    if logic_status in {"weakened", "insufficient_information"}:
        return "high"
    return "normal"


def _priority_rank(priority: str) -> int:
    return {"urgent": 4, "high": 3, "normal": 2, "low": 1}.get(priority, 0)


def _user_summary(task_type: str, logic_status: str, result: dict[str, Any]) -> str:
    if task_type == "long_term_logic_review":
        return {
            "valid": "长期逻辑有效，暂不需要处理",
            "weakened": "长期逻辑出现弱化，需要复核",
            "invalid": "长期逻辑可能失效，请优先处理",
            "insufficient_information": "信息不足，需要补充资料",
        }.get(logic_status, _text(result.get("summary")) or "长期逻辑复核结果待确认")
    return _text(result.get("summary")) or "AI 复核结果待确认"


def _parse_datetime(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _text(value: object) -> str:
    return str(value or "").strip()
