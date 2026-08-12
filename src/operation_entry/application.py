from __future__ import annotations

import copy
import hashlib
import json
import os
import shutil
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any

from src.decision.decision_integration import safe_id
from src.plan_update.application import atomic_write_json, load_json


APPLICATION_REQUIRED = {
    "application_id",
    "draft_id",
    "source_type",
    "source_request_id",
    "source_decision_id",
    "source_review_id",
    "symbol",
    "task_type",
    "current_position_snapshot_hash",
    "previous_shares",
    "new_shares",
    "previous_avg_cost",
    "new_avg_cost",
    "operation_date",
    "note",
    "user_confirmed_at",
    "status",
    "created_at",
    "schema_version",
}


def stock_symbol(stock: dict[str, Any]) -> str:
    return str(stock.get("code") or stock.get("symbol") or "").strip().upper()


def find_stock(state: dict[str, Any], symbol: object) -> dict[str, Any] | None:
    key = str(symbol or "").strip().upper()
    if not key:
        return None
    return next((stock for stock in state.get("stocks") or [] if stock_symbol(stock) == key), None)


def is_cash_stock(stock: dict[str, Any]) -> bool:
    values = {
        str(stock.get("type") or "").strip().lower(),
        str(stock.get("assetType") or "").strip().lower(),
        str(stock.get("category") or "").strip().lower(),
        str(stock.get("role") or "").strip().lower(),
    }
    return bool(values & {"cash", "现金", "cash_equivalent"}) or not stock_symbol(stock)


def position_snapshot_payload(stock: dict[str, Any]) -> dict[str, Any]:
    return {
        "symbol": stock_symbol(stock),
        "shares": _canonical_position_value(stock.get("shares")),
        "avgCost": _canonical_position_value(stock.get("avgCost")),
        "positionUpdatedAt": stock.get("positionUpdatedAt") or stock.get("updatedAt") or "",
    }


def position_snapshot_hash(stock: dict[str, Any]) -> str:
    canonical = json.dumps(
        position_snapshot_payload(stock),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def validate_application_request(
    request: dict[str, Any],
    stock: dict[str, Any],
    *,
    today: date | None = None,
) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    missing = sorted(APPLICATION_REQUIRED - set(request))
    if missing:
        errors.append("missing application fields: " + ", ".join(missing))

    for field in (
        "application_id",
        "draft_id",
        "source_type",
        "symbol",
        "task_type",
        "current_position_snapshot_hash",
        "operation_date",
        "user_confirmed_at",
        "created_at",
        "schema_version",
    ):
        if field in request and (not isinstance(request[field], str) or not request[field].strip()):
            errors.append(f"{field} must be a non-empty string")

    try:
        uuid.UUID(str(request.get("application_id") or ""))
    except (ValueError, AttributeError):
        errors.append("application_id must be a UUID")

    source_type = request.get("source_type")
    if source_type not in {"operation_request", "manual_operation"}:
        errors.append("source_type must be operation_request or manual_operation")
    elif source_type == "operation_request":
        for field in ("source_request_id", "source_decision_id", "source_review_id"):
            if not isinstance(request.get(field), str) or not request[field].strip():
                errors.append(f"{field} must be a non-empty string for operation_request")
        expected_request_id = safe_id("operation_request", str(request.get("source_decision_id") or ""))
        if request.get("source_request_id") != expected_request_id:
            errors.append("source_request_id does not match source_decision_id")
    else:
        for field in ("source_request_id", "source_decision_id", "source_review_id"):
            if request.get(field) is not None:
                errors.append(f"{field} must be null for manual_operation")
        if request.get("task_type") != "manual_operation":
            errors.append("task_type must be manual_operation for manual_operation")
    if not isinstance(request.get("note"), str):
        errors.append("note must be a string")

    if request.get("status") != "confirmed_pending_application":
        errors.append("application status must be confirmed_pending_application")
    if not _valid_datetime(request.get("user_confirmed_at")):
        errors.append("user_confirmed_at must be a valid datetime")
    if not _valid_datetime(request.get("created_at")):
        errors.append("created_at must be a valid datetime")
    operation_date = _valid_date(request.get("operation_date"))
    if operation_date is None:
        errors.append("operation_date must be a valid ISO date")
    elif operation_date > (today or date.today()):
        errors.append("operation_date cannot be in the future")

    if is_cash_stock(stock):
        errors.append("target stock must be a non-cash security with a valid symbol")
    if str(request.get("symbol") or "").strip().upper() != stock_symbol(stock):
        errors.append("application symbol does not match target stock")

    previous_shares = _integer(request.get("previous_shares"))
    new_shares = _integer(request.get("new_shares"))
    formal_shares = _integer(stock.get("shares"))
    if previous_shares is None or previous_shares < 0:
        errors.append("previous_shares must be a non-negative integer")
    if new_shares is None or new_shares < 0:
        errors.append("new_shares must be a non-negative integer")
    if formal_shares is None or formal_shares < 0:
        errors.append("formal shares must be a non-negative integer")
    elif previous_shares != formal_shares:
        errors.append("previous_shares does not match formal data")

    if not _position_value_equal(request.get("previous_avg_cost"), stock.get("avgCost")):
        errors.append("previous_avg_cost does not match formal data")

    normalized_cost = request.get("new_avg_cost")
    if new_shares is not None:
        if new_shares > 0:
            numeric_cost = _positive_number(normalized_cost)
            if numeric_cost is None:
                errors.append("new_avg_cost must be a positive number when new_shares is greater than zero")
            else:
                normalized_cost = numeric_cost
        elif new_shares == 0:
            valid, normalized_cost = _normalize_zero_position_cost(stock, normalized_cost)
            if not valid:
                errors.append("new_avg_cost does not follow the formal zero-position convention")

    expected_hash = position_snapshot_hash(stock)
    if request.get("current_position_snapshot_hash") != expected_hash:
        errors.append("current position changed; regenerate the operation entry request")

    if previous_shares is not None and new_shares is not None:
        same_shares = previous_shares == new_shares
        same_cost = _position_value_equal(request.get("previous_avg_cost"), normalized_cost)
        if same_shares and same_cost:
            warnings.append("shares and avgCost are unchanged")
        if not same_shares and same_cost:
            warnings.append("shares changed while avgCost stayed unchanged; confirm the broker value")
        if same_shares and not same_cost:
            warnings.append("shares are unchanged while avgCost changed; explicit confirmation is required")
        if new_shares == 0 and not _is_zero_position_cost(normalized_cost):
            warnings.append("cleared position has an unusual avgCost representation")

    schema_valid = not missing and all(field in request for field in APPLICATION_REQUIRED)
    return {
        "schema_valid": schema_valid,
        "business_valid": not errors,
        "valid": schema_valid and not errors,
        "warnings": warnings,
        "errors": errors,
        "before_snapshot_hash": expected_hash,
        "normalized_new_avg_cost": normalized_cost,
        "position_change": _position_change(previous_shares, new_shares),
    }


def build_application_preview(request: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    stock = find_stock(state, request.get("symbol"))
    if stock is None:
        return {
            "schema_valid": False,
            "business_valid": False,
            "valid": False,
            "warnings": [],
            "errors": ["target stock not found"],
            "position_change": "unknown",
        }
    result = validate_application_request(request, stock)
    result["symbol"] = stock_symbol(stock)
    result["previous_shares"] = stock.get("shares")
    result["new_shares"] = request.get("new_shares")
    result["previous_avg_cost"] = stock.get("avgCost")
    result["new_avg_cost"] = result.get("normalized_new_avg_cost")
    result["source_type"] = request.get("source_type")
    result["fields_to_modify"] = ["shares", "avgCost"] + (["updatedAt"] if "updatedAt" in stock else [])
    result["fields_unchanged"] = [
        "currentPrice",
        "currentValue",
        "plans",
        "tradeHistory",
        "longTermLogic",
        "technicalReview",
        "priceHistory",
        "marketDataFreshness",
        "riskState",
        "cash",
        "other stocks",
    ]
    return result


def apply_operation_result(
    request: dict[str, Any],
    state: dict[str, Any],
    *,
    applied_at: str | None = None,
) -> dict[str, Any]:
    before = copy.deepcopy(state)
    preview = build_application_preview(request, state)
    if not preview["valid"]:
        raise ValueError("; ".join(preview["errors"]))
    stock = find_stock(state, request["symbol"])
    assert stock is not None
    timestamp = applied_at or datetime.now().astimezone().isoformat()
    stock["shares"] = int(request["new_shares"])
    stock["avgCost"] = preview["normalized_new_avg_cost"]
    if "updatedAt" in stock:
        stock["updatedAt"] = timestamp
    verify_non_target_fields_unchanged(before, state, request["symbol"])
    return {
        "before_snapshot_hash": preview["before_snapshot_hash"],
        "after_snapshot_hash": position_snapshot_hash(stock),
        "previous_shares": preview["previous_shares"],
        "new_shares": stock["shares"],
        "previous_avg_cost": preview["previous_avg_cost"],
        "new_avg_cost": stock["avgCost"],
        "operation_date": request["operation_date"],
        "warnings": preview["warnings"],
        "applied_at": timestamp,
        "position_change": preview["position_change"],
        "modified_fields": preview["fields_to_modify"],
    }


def verify_non_target_fields_unchanged(
    before: dict[str, Any],
    after: dict[str, Any],
    symbol: object,
) -> None:
    before_copy = copy.deepcopy(before)
    after_copy = copy.deepcopy(after)
    before_stock = find_stock(before_copy, symbol)
    after_stock = find_stock(after_copy, symbol)
    if before_stock is None or after_stock is None:
        raise ValueError("target stock missing during boundary verification")
    for field in ("shares", "avgCost", "updatedAt"):
        before_stock.pop(field, None)
        after_stock.pop(field, None)
    if before_copy != after_copy:
        raise ValueError("non-target formal data changed during operation application")


def create_backup(path: Path, now: datetime | None = None) -> Path:
    stamp = (now or datetime.now()).strftime("%Y%m%d_%H%M%S")
    target = path.parent / "backups" / f"{path.stem}_before_operation_update_{stamp}{path.suffix}"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, target)
    load_json(target)
    return target


def restore_backup_atomic(backup_path: Path, formal_path: Path) -> None:
    data = backup_path.read_bytes()
    temp = formal_path.with_suffix(formal_path.suffix + ".tmp")
    try:
        with temp.open("wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        load_json(temp)
        os.replace(temp, formal_path)
        load_json(formal_path)
    except Exception:
        temp.unlink(missing_ok=True)
        raise


def write_operation_bridge(path: Path, audit: dict[str, Any] | None = None, *, error: str = "") -> None:
    applications = []
    if audit:
        applications.append(
            {
                "application_id": audit.get("application_id"),
                "audit_id": audit.get("application_id"),
                "source_type": audit.get("source_type"),
                "symbol": audit.get("symbol"),
                "status": audit.get("result"),
                "applied_at": audit.get("applied_at"),
                "previous_shares": audit.get("previous_shares"),
                "new_shares": audit.get("new_shares"),
                "previous_avg_cost": audit.get("previous_avg_cost"),
                "new_avg_cost": audit.get("new_avg_cost"),
                "error": error,
            }
        )
    payload = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "applications": applications,
        "error": error,
    }
    content = "window.OPERATION_APPLICATION_STATUS = " + json.dumps(
        payload, ensure_ascii=False, separators=(",", ":")
    ) + ";\n"
    temp = path.with_suffix(path.suffix + ".tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with temp.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        temp.read_text(encoding="utf-8")
        os.replace(temp, path)
    except Exception:
        temp.unlink(missing_ok=True)
        raise


def _canonical_position_value(value: object) -> object:
    if isinstance(value, bool) or value in (None, ""):
        return value
    try:
        number = float(value)
    except (TypeError, ValueError):
        return value
    return int(number) if number.is_integer() else number


def _integer(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _positive_number(value: object) -> float | int | None:
    if isinstance(value, bool) or value in (None, ""):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not (number > 0):
        return None
    return int(number) if number.is_integer() else number


def _numeric(value: object) -> float | None:
    if isinstance(value, bool) or value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _position_value_equal(left: object, right: object) -> bool:
    left_number = _numeric(left)
    right_number = _numeric(right)
    if left_number is not None and right_number is not None:
        return left_number == right_number
    return left == right


def _normalize_zero_position_cost(stock: dict[str, Any], value: object) -> tuple[bool, object]:
    formal = stock.get("avgCost")
    if isinstance(formal, str):
        return (value in ("", None, 0, 0.0, "0"), "")
    if formal is None:
        return (value in (None, "", 0, 0.0, "0"), None)
    return (value in (0, 0.0, "0", "", None), 0)


def _is_zero_position_cost(value: object) -> bool:
    return value in (0, 0.0, "0", "", None)


def _position_change(previous: int | None, current: int | None) -> str:
    if previous is None or current is None:
        return "unknown"
    if previous == current:
        return "unchanged"
    if current == 0:
        return "cleared"
    return "increased" if current > previous else "decreased"


def _valid_datetime(value: object) -> bool:
    try:
        datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return True
    except (TypeError, ValueError):
        return False


def _valid_date(value: object) -> date | None:
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None
