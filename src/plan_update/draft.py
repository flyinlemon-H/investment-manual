from __future__ import annotations

import json
from datetime import datetime
from typing import Any


REQUIRED_FIELDS = {"draft_id", "source_request_id", "source_decision_id", "symbol", "draft_status", "summary", "plan_strategy", "proposed_plans", "plans_to_archive", "risk_flags", "notes", "created_at"}
PLAN_REQUIRED_FIELDS = {"action_type", "trigger_price", "quantity", "status", "priority", "reason", "conditions", "invalidation_conditions", "source", "valid_until"}
ACTION_TYPES = {"add_review", "add", "buy", "reduce_review", "reduce", "sell", "take_profit", "hold_review", "hold", "observe", "risk_review", "stop_loss", "risk"}
PLAN_STATUSES = {"active", "draft", "pending_review"}


def resolve_min_trade_unit(stock: dict[str, Any]) -> dict[str, Any]:
    strategy = stock.get("strategy") if isinstance(stock.get("strategy"), dict) else {}
    configured = _number(strategy.get("minTradeUnit"))
    explicit = bool(strategy.get("minTradeUnitConfirmed") is True or str(strategy.get("minTradeUnitSource") or "").strip())
    if configured and configured >= 1 and (configured > 1 or explicit):
        return {"value": int(configured), "source": "stock_config", "reliable": True}
    code = str(stock.get("code") or stock.get("symbol") or "").strip().upper()
    if code.endswith((".SS", ".SZ", ".SH")):
        return {"value": 100, "source": "cn_market_default", "reliable": True}
    if code.endswith(".HK"):
        return {"value": None, "source": "unknown_hk_board_lot", "reliable": False}
    return {"value": None, "source": "unknown", "reliable": False}


def validate_plan_update_draft(draft: dict[str, Any], request: dict[str, Any], stock: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    missing = sorted(REQUIRED_FIELDS - set(draft))
    if missing:
        errors.append("missing fields: " + ", ".join(missing))
    for field in ("draft_id", "source_request_id", "source_decision_id", "symbol", "summary", "plan_strategy", "created_at"):
        if field in draft and (not isinstance(draft[field], str) or not draft[field].strip()):
            errors.append(f"{field} must be a non-empty string")
    if draft.get("draft_status") != "draft":
        errors.append("draft_status must be draft")
    if draft.get("source_request_id") != request.get("request_id"):
        errors.append("source_request_id does not match Plan Update Request")
    if draft.get("source_decision_id") != request.get("source_decision_id"):
        errors.append("source_decision_id does not match Plan Update Request")
    if _symbol(draft.get("symbol")) != _symbol(request.get("symbol")):
        errors.append("symbol does not match Plan Update Request")
    proposed = draft.get("proposed_plans")
    if not isinstance(proposed, list) or not proposed:
        errors.append("proposed_plans must be a non-empty array")
        proposed = []
    archives = draft.get("plans_to_archive")
    if not isinstance(archives, list):
        errors.append("plans_to_archive must be an array")
        archives = []
    deletes = draft.get("plans_to_delete", [])
    if not isinstance(deletes, list):
        errors.append("plans_to_delete must be an array")
        deletes = []
    for field in ("risk_flags", "notes"):
        if not isinstance(draft.get(field), list):
            errors.append(f"{field} must be an array")
    current_price = _number(stock.get("currentPrice")) or _number(stock.get("lastUnitPrice"))
    unit_info = resolve_min_trade_unit(stock)
    min_unit = unit_info["value"]
    seen: set[tuple[str, float | None]] = set()
    for index, plan in enumerate(proposed):
        prefix = f"proposed_plans[{index}]"
        if not isinstance(plan, dict):
            errors.append(f"{prefix} must be an object")
            continue
        missing_plan = sorted(PLAN_REQUIRED_FIELDS - set(plan))
        if missing_plan:
            errors.append(f"{prefix} missing fields: {', '.join(missing_plan)}")
        action = str(plan.get("action_type") or "")
        if action not in ACTION_TYPES:
            errors.append(f"{prefix}.action_type is invalid")
        status = str(plan.get("status") or "")
        if status not in PLAN_STATUSES:
            errors.append(f"{prefix}.status is invalid")
        price = plan.get("trigger_price")
        if price is not None and (_number(price) is None or float(price) <= 0):
            errors.append(f"{prefix}.trigger_price must be positive or null")
        price_number = float(price) if _number(price) is not None else None
        quantity = plan.get("quantity")
        if quantity is not None:
            number = _number(quantity)
            if number is None or number <= 0 or int(number) != number:
                errors.append(f"{prefix}.quantity must be a positive integer or null")
            elif min_unit and int(number) % min_unit:
                errors.append(f"{prefix}.quantity must respect minTradeUnit {min_unit}")
            elif not min_unit:
                warnings.append(f"{prefix}: minTradeUnit is unknown; quantity compliance requires user confirmation")
        if not _valid_date(plan.get("valid_until")):
            errors.append(f"{prefix}.valid_until must be a valid date")
        for field in ("conditions", "invalidation_conditions"):
            if not isinstance(plan.get(field), list):
                errors.append(f"{prefix}.{field} must be an array")
        duplicate_key = (action, price_number)
        if duplicate_key in seen:
            errors.append(f"duplicate action_type + trigger_price at {prefix}")
        seen.add(duplicate_key)
        if current_price and price_number:
            if action in {"add_review", "add", "buy"} and price_number > current_price * 1.1:
                warnings.append(f"{prefix}: add trigger is materially above current price")
            if action in {"reduce_review", "reduce", "sell", "take_profit"} and price_number < current_price * 0.9:
                warnings.append(f"{prefix}: reduce trigger is materially below current price")
    if proposed and not 4 <= len([plan for plan in proposed if isinstance(plan, dict) and plan.get("status") == "active"]) <= 6:
        warnings.append("active plan count is outside the preferred range of 4-6")
    current_ids = {_plan_id(plan) for plan in stock.get("plans") or []}
    for plan_id in archives:
        if not isinstance(plan_id, str) or plan_id not in current_ids:
            errors.append(f"plans_to_archive references unknown plan: {plan_id}")
    for plan_id in deletes:
        if not isinstance(plan_id, str) or plan_id not in current_ids:
            errors.append(f"plans_to_delete references unknown plan: {plan_id}")
    return {"schema_valid": not any(error.startswith("missing fields") or "must be" in error for error in errors), "business_valid": not errors, "warnings": warnings, "errors": errors}


def compare_plan_draft(current_plans: list[dict[str, Any]], draft: dict[str, Any]) -> list[dict[str, Any]]:
    current = {_plan_id(plan): plan for plan in current_plans}
    proposed = draft.get("proposed_plans") if isinstance(draft.get("proposed_plans"), list) else []
    archive_ids = set(draft.get("plans_to_archive") or [])
    delete_ids = set(draft.get("plans_to_delete") or [])
    rows: list[dict[str, Any]] = []
    proposed_ids: set[str] = set()
    for plan in proposed:
        plan_id = str(plan.get("plan_id") or "")
        if plan_id and plan_id in current:
            proposed_ids.add(plan_id)
            change = "保留" if _comparable(current[plan_id]) == _comparable(plan) else "修改"
            rows.append({"change": change, "plan_id": plan_id, "current": current[plan_id], "proposed": plan})
        else:
            rows.append({"change": "新增", "plan_id": plan_id, "current": None, "proposed": plan})
    for plan_id, plan in current.items():
        if plan_id in delete_ids:
            rows.append({"change": "删除建议", "plan_id": plan_id, "current": plan, "proposed": None})
        elif plan_id in archive_ids:
            rows.append({"change": "归档", "plan_id": plan_id, "current": plan, "proposed": None})
        elif plan_id not in proposed_ids:
            rows.append({"change": "保留", "plan_id": plan_id, "current": plan, "proposed": plan})
    return rows


def build_plan_update_prompt(request: dict[str, Any], outcome: dict[str, Any], discussion: dict[str, Any] | None, stock: dict[str, Any], *, generated_at: str) -> str:
    context = {
        "stock": stock,
        "min_trade_unit_resolution": resolve_min_trade_unit(stock),
        "decision_outcome": outcome,
        "discussion_result": discussion or {},
        "plan_update_request": request,
    }
    schema = {"draft_id": "", "source_request_id": request.get("request_id"), "source_decision_id": request.get("source_decision_id"), "symbol": request.get("symbol"), "draft_status": "draft", "summary": "", "plan_strategy": "", "proposed_plans": [{"plan_id": None, "action_type": "add_review", "trigger_price": None, "quantity": None, "status": "active", "priority": 1, "reason": "", "conditions": [], "invalidation_conditions": [], "source": "ai_plan_update_draft", "valid_until": "YYYY-MM-DD"}], "plans_to_archive": [], "plans_to_delete": [], "risk_flags": [], "notes": [], "created_at": generated_at}
    return "\n".join(["你是一名谨慎的投资计划草案助手。", "只生成供人工确认的计划更新草案，不输出确定性买卖命令，不自动执行交易，不修改持仓。", "数量不确定时 quantity=null；triggerPrice无明确依据时为null；尊重minTradeUnit。", "避免距离现价过远且无复核价值的计划；优先保留4到6条真正有效的active plans。", "所有JSON引号必须使用英文双引号。只输出严格可解析JSON，不要Markdown。", "", "当前上下文：", json.dumps(context, ensure_ascii=False, indent=2), "", "输出Schema：", json.dumps(schema, ensure_ascii=False, indent=2)])


def _plan_id(plan: dict[str, Any]) -> str:
    return str(plan.get("plan_id") or plan.get("id") or "")


def _symbol(value: object) -> str:
    return str(value or "").strip().upper()


def _number(value: object) -> float | None:
    try:
        number = float(value)
        return number if number == number else None
    except (TypeError, ValueError):
        return None


def _valid_date(value: object) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def _comparable(plan: dict[str, Any]) -> dict[str, Any]:
    return {"action": plan.get("action_type", plan.get("type", plan.get("action"))), "price": plan.get("trigger_price", plan.get("triggerPrice", plan.get("price"))), "quantity": plan.get("quantity", plan.get("shares")), "status": plan.get("status", "active"), "reason": plan.get("reason", plan.get("summary", plan.get("note", "")))}
