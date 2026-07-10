from __future__ import annotations

import json
from typing import Any


FORBIDDEN_CONTEXT_FIELDS = {
    "shares",
    "avgCost",
    "tradeHistory",
    "positionSnapshots",
    "activePlans",
    "cash",
    "execute",
    "order",
}


def build_long_term_logic_context(stock: dict[str, Any], metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    metadata = metadata or {}
    symbol = _stock_symbol(stock)
    context = {
        "taskName": "long_term_logic_review",
        "symbol": symbol,
        "stock": {
            "name": stock.get("name"),
            "symbol": symbol,
            "type": stock.get("type"),
            "role": stock.get("role"),
            "theme": stock.get("theme"),
            "investmentStyle": _first_non_empty(stock, ["investmentStyle", "strategy", "portfolioRuleTag"]),
        },
        "currentLongTermLogic": _safe_object(stock.get("longTermLogic") or stock.get("thesis")),
        "fundamentalSummary": _safe_object(stock.get("fundamentalReview") or stock.get("financialData")),
        "valuationSummary": _safe_object(stock.get("valuationReview") or stock.get("valuationData")),
        "recentCatalystSummary": _safe_object(stock.get("recentCatalyst") or stock.get("shortTermSentiment")),
        "allocationSummary": _safe_object(stock.get("allocationDecision")),
        "informationCompleteness": _safe_object(stock.get("informationCompleteness")),
        "dataFreshness": _safe_object(stock.get("dataFreshness")),
        "missingFields": [],
        "basedOn": {
            "fundamentalUpdatedAt": _updated_at(stock.get("fundamentalReview") or stock.get("financialData")),
            "valuationUpdatedAt": _updated_at(stock.get("valuationReview") or stock.get("valuationData")),
            "newsUpdatedAt": _updated_at(stock.get("recentCatalyst") or stock.get("shortTermSentiment")),
            "allocationUpdatedAt": _updated_at(stock.get("allocationDecision")),
            "previousLongTermLogicUpdatedAt": _updated_at(stock.get("longTermLogic") or stock.get("thesis")),
        },
        "metadata": _safe_metadata(metadata),
    }
    context["missingFields"] = _missing_fields(context)
    _assert_json_serializable(context)
    return context


def _stock_symbol(stock: dict[str, Any]) -> str:
    return str(stock.get("symbol") or stock.get("code") or stock.get("id") or "").strip()


def _first_non_empty(stock: dict[str, Any], keys: list[str]) -> Any:
    for key in keys:
        value = stock.get(key)
        if value not in (None, "", [], {}):
            return value
    return None


def _safe_object(value: Any) -> Any:
    if value in (None, ""):
        return {}
    if isinstance(value, dict):
        return {key: _safe_object(item) for key, item in value.items() if key not in FORBIDDEN_CONTEXT_FIELDS}
    if isinstance(value, list):
        return [_safe_object(item) for item in value[:20]]
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _updated_at(value: Any) -> Any:
    if isinstance(value, dict):
        return value.get("updatedAt") or value.get("date") or value.get("asOf") or value.get("createdAt")
    return None


def _safe_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
    safe = {}
    for key, value in metadata.items():
        if key.lower() in {"apikey", "api_key", "secret", "token", "password"}:
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            safe[key] = value
    return safe


def _missing_fields(context: dict[str, Any]) -> list[str]:
    missing = []
    if not context["stock"].get("name"):
        missing.append("stock.name")
    if not context["symbol"]:
        missing.append("stock.symbol")
    checks = {
        "currentLongTermLogic": context["currentLongTermLogic"],
        "fundamentalSummary": context["fundamentalSummary"],
        "valuationSummary": context["valuationSummary"],
        "recentCatalystSummary": context["recentCatalystSummary"],
        "allocationSummary": context["allocationSummary"],
    }
    for key, value in checks.items():
        if value in ({}, [], None, ""):
            missing.append(key)
    return missing


def _assert_json_serializable(context: dict[str, Any]) -> None:
    json.dumps(context, ensure_ascii=False)

