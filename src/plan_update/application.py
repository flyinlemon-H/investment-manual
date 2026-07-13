from __future__ import annotations

import copy
import hashlib
import json
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from .draft import compare_plan_draft, resolve_min_trade_unit, validate_plan_update_draft

APPLICATION_REQUIRED = {"application_id", "draft_id", "source_request_id", "source_decision_id", "symbol", "current_plan_snapshot_hash", "confirmed_changes", "user_confirmed_at", "source_draft_status", "status", "created_at"}


def plan_snapshot_hash(plans: list[dict[str, Any]]) -> str:
    canonical = json.dumps(plans, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def validate_application_request(request: dict[str, Any], stock: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    missing = sorted(APPLICATION_REQUIRED - set(request))
    if missing:
        errors.append("missing application fields: " + ", ".join(missing))
    for field in ("application_id", "draft_id", "source_request_id", "source_decision_id", "symbol", "current_plan_snapshot_hash", "user_confirmed_at", "created_at"):
        if field in request and (not isinstance(request[field], str) or not request[field].strip()):
            errors.append(f"{field} must be a non-empty string")
    if request.get("status") != "confirmed_pending_application":
        errors.append("application status must be confirmed_pending_application")
    if request.get("source_draft_status") != "pending_confirmation":
        errors.append("source draft status must be pending_confirmation")
    if not _valid_datetime(request.get("user_confirmed_at")):
        errors.append("user_confirmed_at must be a valid datetime")
    if str(request.get("symbol") or "").upper() != str(stock.get("code") or stock.get("symbol") or "").upper():
        errors.append("application symbol does not match target stock")
    changes = request.get("confirmed_changes")
    if not isinstance(changes, dict):
        errors.append("confirmed_changes must be an object")
        changes = {}
    draft = changes.get("draft")
    validation = changes.get("validation")
    if not isinstance(draft, dict):
        errors.append("confirmed_changes.draft must be an object")
        draft = {}
    if not isinstance(validation, dict) or validation.get("schema_valid") is not True or validation.get("business_valid") is not True:
        errors.append("draft must have schema_valid=true and business_valid=true")
    if draft.get("draft_id") != request.get("draft_id"):
        errors.append("draft_id mismatch")
    if draft.get("source_request_id") != request.get("source_request_id"):
        errors.append("source_request_id mismatch")
    if draft.get("source_decision_id") != request.get("source_decision_id"):
        errors.append("source_decision_id mismatch")
    if str(draft.get("symbol") or "").upper() != str(request.get("symbol") or "").upper():
        errors.append("draft symbol mismatch")
    if draft.get("draft_status") != "draft":
        errors.append("draft_status must remain draft")
    expected = plan_snapshot_hash(stock.get("plans") or [])
    if request.get("current_plan_snapshot_hash") != expected:
        errors.append("current plans changed; regenerate the plan draft")
    unit = resolve_min_trade_unit(stock)
    if not unit["reliable"] and any(plan.get("quantity") is not None for plan in draft.get("proposed_plans") or [] if isinstance(plan, dict)):
        warnings.append("minTradeUnit is unknown; quantities require explicit user confirmation")
    return {"valid": not errors, "errors": errors, "warnings": warnings, "draft": draft, "before_snapshot_hash": expected}


def build_application_preview(request: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    stock = find_stock(state, request.get("symbol"))
    if stock is None:
        return {"valid": False, "errors": ["target stock not found"], "warnings": [], "diff": []}
    validation = validate_application_request(request, stock)
    draft = validation.get("draft") or {}
    if draft:
        draft_validation = validate_plan_update_draft(draft, _request_from_application(request), stock)
        validation["warnings"].extend(draft_validation.get("warnings") or [])
        validation["errors"].extend(draft_validation.get("errors") or [])
    validation["valid"] = not validation["errors"]
    validation["diff"] = compare_plan_draft(stock.get("plans") or [], draft)
    return validation


def apply_plan_update(request: dict[str, Any], state: dict[str, Any], *, applied_at: str | None = None) -> dict[str, Any]:
    preview = build_application_preview(request, state)
    if not preview["valid"]:
        raise ValueError("; ".join(preview["errors"]))
    stock = find_stock(state, request["symbol"])
    assert stock is not None
    draft = preview["draft"]
    application_id = request["application_id"]
    timestamp = applied_at or datetime.now().astimezone().isoformat()
    plans = stock.get("plans") if isinstance(stock.get("plans"), list) else []
    by_id = {_plan_id(plan): plan for plan in plans}
    archive_ids = set(str(value) for value in draft.get("plans_to_archive") or [])
    delete_ids = set(str(value) for value in draft.get("plans_to_delete") or [])
    retained: list[str] = []
    archived: list[str] = []
    created: list[str] = []
    proposed_existing: set[str] = set()
    for proposed in draft.get("proposed_plans") or []:
        old_id = str(proposed.get("plan_id") or "")
        if old_id and old_id in by_id:
            proposed_existing.add(old_id)
            if _comparable(by_id[old_id]) == _comparable(proposed) and old_id not in archive_ids and old_id not in delete_ids:
                retained.append(old_id)
                continue
            _archive(by_id[old_id], timestamp, "modified_by_plan_update", application_id)
            archived.append(old_id)
        new_plan = _new_formal_plan(proposed, request, timestamp)
        plans.append(new_plan)
        created.append(new_plan["id"])
    for plan_id in archive_ids | delete_ids:
        if plan_id in by_id and plan_id not in archived:
            reason = "delete_suggestion_archived" if plan_id in delete_ids else "archived_by_plan_update"
            _archive(by_id[plan_id], timestamp, reason, application_id)
            archived.append(plan_id)
    for plan_id in by_id:
        if plan_id not in archived and plan_id not in retained and plan_id not in proposed_existing:
            retained.append(plan_id)
    stock["plans"] = plans
    return {"retained_plan_ids": sorted(set(retained)), "archived_plan_ids": sorted(set(archived)), "created_plan_ids": created, "warnings": preview["warnings"], "before_snapshot_hash": preview["before_snapshot_hash"], "after_snapshot_hash": plan_snapshot_hash(plans), "applied_at": timestamp}


def find_stock(state: dict[str, Any], symbol: object) -> dict[str, Any] | None:
    key = str(symbol or "").strip().upper()
    return next((stock for stock in state.get("stocks") or [] if str(stock.get("code") or stock.get("symbol") or "").strip().upper() == key), None)


def create_backup(path: Path, now: datetime | None = None) -> Path:
    stamp = (now or datetime.now()).strftime("%Y%m%d_%H%M%S")
    target = path.parent / "backups" / f"{path.stem}_before_plan_update_{stamp}{path.suffix}"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, target)
    load_json(target)
    return target


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    temp = path.with_suffix(path.suffix + ".tmp")
    try:
        with temp.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2); handle.write("\n"); handle.flush(); os.fsync(handle.fileno())
        load_json(temp); os.replace(temp, path); load_json(path)
    except Exception:
        temp.unlink(missing_ok=True)
        raise


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def write_application_bridge(path: Path, audit: dict[str, Any]) -> None:
    payload = {"generated_at": datetime.now().astimezone().isoformat(), "applications": [audit]}
    content = "window.PLAN_APPLICATION_STATUS = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
    temp = path.with_suffix(path.suffix + ".tmp")
    try:
        with temp.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(content); handle.flush(); os.fsync(handle.fileno())
        temp.read_text(encoding="utf-8"); os.replace(temp, path)
    except Exception:
        temp.unlink(missing_ok=True)
        raise


def _request_from_application(application: dict[str, Any]) -> dict[str, Any]:
    return {"request_id": application.get("source_request_id"), "source_decision_id": application.get("source_decision_id"), "symbol": application.get("symbol")}


def _new_formal_plan(plan: dict[str, Any], request: dict[str, Any], timestamp: str) -> dict[str, Any]:
    action_type = str(plan.get("action_type") or "")
    action = "buy" if action_type in {"add_review", "add", "buy"} else ("sell" if action_type in {"reduce_review", "reduce", "sell", "take_profit", "stop_loss"} else action_type)
    price, quantity = plan.get("trigger_price"), plan.get("quantity")
    return {"id": "plan_" + uuid.uuid4().hex, "type": action_type, "action": action, "triggerPrice": price, "price": price, "quantity": quantity, "shares": quantity, "status": "active", "priority": plan.get("priority"), "summary": plan.get("reason") or "", "note": plan.get("reason") or "", "conditions": copy.deepcopy(plan.get("conditions") or []), "invalidationConditions": copy.deepcopy(plan.get("invalidation_conditions") or []), "source": "ai_plan_update_application", "validUntil": plan.get("valid_until"), "createdAt": timestamp, "updatedAt": timestamp, "sourceRequestId": request["source_request_id"], "sourceDecisionId": request["source_decision_id"], "applicationId": request["application_id"]}


def _archive(plan: dict[str, Any], timestamp: str, reason: str, application_id: str) -> None:
    plan.update({"status": "archived", "archivedAt": timestamp, "archived_at": timestamp, "archiveReason": reason, "archive_reason": reason, "sourceApplicationId": application_id, "source_application_id": application_id})


def _plan_id(plan: dict[str, Any]) -> str:
    return str(plan.get("id") or plan.get("plan_id") or "")


def _comparable(plan: dict[str, Any]) -> dict[str, Any]:
    return {"action": plan.get("action_type", plan.get("type", plan.get("action"))), "price": plan.get("trigger_price", plan.get("triggerPrice", plan.get("price"))), "quantity": plan.get("quantity", plan.get("shares")), "status": plan.get("status", "active"), "reason": plan.get("reason", plan.get("summary", plan.get("note", "")))}


def _valid_datetime(value: object) -> bool:
    try:
        datetime.fromisoformat(str(value).replace("Z", "+00:00")); return True
    except (TypeError, ValueError):
        return False
