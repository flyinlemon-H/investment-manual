from __future__ import annotations

import json
import re
from typing import Any


TASK_TYPE = "long_term_logic_review"
DEFAULT_SCHEMA_VERSION = "1.0.0"

INVESTMENT_STYLE_FIELDS = {
    "investmentStyle",
    "convictionLevel",
    "buyAggressiveness",
}
LONG_TERM_LOGIC_FIELDS = {
    "summary",
    "sourceSummary",
    "investmentThesis",
    "coreDrivers",
    "companyDrivers",
    "industryDrivers",
    "fundamentalSupport",
    "longTermRisks",
    "logicStatus",
    "status",
    "confidence",
    "updatedAt",
    "validUntil",
    "nextReviewDate",
}
FUNDAMENTAL_SUMMARY_FIELDS = {
    "summary",
    "revenueTrend",
    "profitTrend",
    "growthQuality",
    "marginTrend",
    "cashFlowTrend",
    "debtRisk",
    "positivePoints",
    "negativePoints",
    "riskPoints",
    "confidence",
    "financialNote",
    "reportPeriod",
    "dataDate",
    "updatedAt",
    "lastUpdated",
}
VALUATION_SUMMARY_FIELDS = {
    "summary",
    "positivePoints",
    "negativePoints",
    "riskFlags",
    "valuationConclusion",
    "valuationNote",
    "peerComparison",
    "confidence",
    "reportPeriod",
    "dataDate",
    "updatedAt",
    "lastUpdated",
}
CATALYST_SUMMARY_FIELDS = {
    "summary",
    "todayCatalyst",
    "weeklyCatalysts",
    "monthlyCatalysts",
    "recentEvents",
    "riskFlags",
    "confidence",
    "analysisDate",
    "latestSourceDate",
    "freshnessStatus",
    "freshnessDays",
    "catalystCoverage",
    "missingData",
    "updatedAt",
}
ALLOCATION_SUMMARY_FIELDS = {
    "summary",
    "conclusion",
    "allocationReasons",
    "capitalAllocationView",
    "keyRisks",
    "notes",
    "recommendedRole",
    "confidence",
    "updatedAt",
}
COMPLETENESS_FIELDS = {
    "overall",
    "warning",
    "missingItems",
    "fundamentals",
    "valuation",
    "catalyst",
    "news",
    "longTermLogic",
}
FRESHNESS_FIELDS = {
    "financialUpdatedAt",
    "valuationUpdatedAt",
    "newsUpdatedAt",
    "comprehensiveReviewUpdatedAt",
    "priceUpdatedAt",
    "updatedAt",
    "asOf",
}
ANALYSIS_METADATA_FIELDS = {"dataDate", "freshness", "updatedAt", "completeness"}

FORBIDDEN_CONTEXT_KEYS = {
    "shares",
    "targetshares",
    "currentshares",
    "quantity",
    "tradequantity",
    "positionsize",
    "avgcost",
    "cost",
    "marketvalue",
    "cash",
    "tradehistory",
    "trades",
    "plans",
    "planprice",
    "targetprice",
    "buyprice",
    "sellprice",
    "portfolio",
    "portfoliototal",
    "apikey",
    "authorization",
    "secret",
    "password",
    "env",
    "path",
    "sourcepath",
    "runtimepath",
    "localpath",
    "cli",
    "live",
    "command",
    "debug",
    "logs",
    "auditpath",
    "backuppath",
}

_SECRET_PATTERN = re.compile(
    r"(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]{12,}|DEEPSEEK_API_KEY|Authorization)",
    re.IGNORECASE,
)


class ContextPrivacyError(ValueError):
    """Raised before provider dispatch when an outbound context is unsafe."""


def build_long_term_logic_context(
    stock: dict[str, Any],
    metadata: dict[str, Any] | None = None,
    *,
    task_type: str = TASK_TYPE,
    schema_version: str = DEFAULT_SCHEMA_VERSION,
) -> dict[str, Any]:
    metadata = metadata or {}
    symbol = _stock_symbol(stock)
    fundamental_source = stock.get("fundamentalReview") or stock.get("financialReview") or stock.get("financialData")
    valuation_source = stock.get("valuationReview") or stock.get("valuationData")
    catalyst_source = stock.get("recentCatalyst") or stock.get("shortTermSentiment")
    long_term_source = stock.get("longTermLogic") or stock.get("thesis")
    allocation_source = stock.get("allocationDecision")

    task_metadata: dict[str, Any] = {
        "taskType": str(task_type),
        "schemaVersion": str(schema_version),
    }
    for key in ANALYSIS_METADATA_FIELDS:
        if key in metadata and _is_scalar(metadata[key]):
            task_metadata[key] = metadata[key]

    context = {
        "taskMetadata": task_metadata,
        "symbol": symbol,
        "stock": {
            "name": _scalar_or_none(stock.get("name")),
            "symbol": symbol,
            "type": _scalar_or_none(stock.get("type")),
            "role": _scalar_or_none(stock.get("role")),
            "theme": _scalar_or_none(stock.get("theme")),
            "investmentStyle": _project_investment_style(stock),
        },
        "currentLongTermLogic": _project_section(long_term_source, LONG_TERM_LOGIC_FIELDS),
        "fundamentalSummary": _project_section(fundamental_source, FUNDAMENTAL_SUMMARY_FIELDS),
        "valuationSummary": _project_section(valuation_source, VALUATION_SUMMARY_FIELDS),
        "recentCatalystSummary": _project_section(catalyst_source, CATALYST_SUMMARY_FIELDS),
        "allocationSummary": _project_section(allocation_source, ALLOCATION_SUMMARY_FIELDS),
        "informationCompleteness": _project_section(stock.get("informationCompleteness"), COMPLETENESS_FIELDS),
        "dataFreshness": _project_section(stock.get("dataFreshness"), FRESHNESS_FIELDS),
        "missingFields": [],
        "basedOn": {
            "fundamentalUpdatedAt": _first_updated_at(stock.get("fundamentalReview"), stock.get("financialReview"), stock.get("financialData")),
            "valuationUpdatedAt": _first_updated_at(stock.get("valuationReview"), stock.get("valuationData")),
            "newsUpdatedAt": _first_updated_at(catalyst_source),
            "allocationUpdatedAt": _first_updated_at(allocation_source),
            "previousLongTermLogicUpdatedAt": _first_updated_at(long_term_source),
        },
    }
    context["missingFields"] = _missing_fields(context)
    _assert_json_serializable(context)
    return context


def inspect_context_privacy(
    context: dict[str, Any],
    *,
    forbidden_values: list[str] | tuple[str, ...] | set[str] | None = None,
) -> dict[str, Any]:
    key_paths: list[str] = []
    string_values: list[str] = []

    def walk(value: Any, path: str = "") -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                item_path = f"{path}.{key}" if path else str(key)
                key_paths.append(item_path)
                walk(item, item_path)
        elif isinstance(value, list):
            for item in value:
                walk(item, f"{path}[]")
        elif isinstance(value, str):
            string_values.append(value)

    walk(context)
    forbidden_key_paths = [path for path in key_paths if _key_is_forbidden(path.rsplit(".", 1)[-1])]
    runtime_path_matches = sum(1 for value in string_values if _looks_like_private_path(value))
    secret_matches = sum(1 for value in string_values if _SECRET_PATTERN.search(value))
    candidates = {
        str(value).strip().casefold()
        for value in (forbidden_values or [])
        if isinstance(value, str) and len(str(value).strip()) >= 2
    }
    other_value_matches = sum(
        1
        for candidate in candidates
        if any(candidate in value.casefold() for value in string_values)
    )
    return {
        "keyPathCount": len(key_paths),
        "forbiddenKeyPaths": forbidden_key_paths,
        "runtimePathMatches": runtime_path_matches,
        "secretMatches": secret_matches,
        "otherValueMatches": other_value_matches,
    }


def validate_context_privacy(
    context: dict[str, Any],
    *,
    forbidden_values: list[str] | tuple[str, ...] | set[str] | None = None,
) -> dict[str, Any]:
    report = inspect_context_privacy(context, forbidden_values=forbidden_values)
    if report["forbiddenKeyPaths"]:
        raise ContextPrivacyError("Outbound context contains forbidden key paths.")
    if report["runtimePathMatches"]:
        raise ContextPrivacyError("Outbound context contains a local runtime path.")
    if report["secretMatches"]:
        raise ContextPrivacyError("Outbound context contains secret-like text.")
    if report["otherValueMatches"]:
        raise ContextPrivacyError("Outbound context contains another stock identity.")
    return report


def _stock_symbol(stock: dict[str, Any]) -> str:
    return str(stock.get("symbol") or stock.get("code") or stock.get("id") or "").strip()


def _project_investment_style(stock: dict[str, Any]) -> Any:
    value = stock.get("investmentStyle")
    if value in (None, "", [], {}):
        value = stock.get("strategy")
    if value in (None, "", [], {}):
        value = stock.get("portfolioRuleTag")
    if isinstance(value, dict):
        return _project_section(value, INVESTMENT_STYLE_FIELDS)
    return _scalar_or_none(value)


def _project_section(value: Any, allowed_fields: set[str]) -> dict[str, Any]:
    if value in (None, ""):
        return {}
    if not isinstance(value, dict):
        scalar = _scalar_or_none(value)
        return {"summary": scalar} if scalar is not None else {}
    projected: dict[str, Any] = {}
    for key in allowed_fields:
        if key not in value:
            continue
        item = _summary_value(value[key])
        if item not in (None, "", [], {}):
            projected[key] = item
    return projected


def _summary_value(value: Any) -> Any:
    if _is_scalar(value):
        return value
    if isinstance(value, list):
        return [item for item in value[:20] if _is_scalar(item)]
    return None


def _is_scalar(value: Any) -> bool:
    return isinstance(value, (str, int, float, bool)) or value is None


def _scalar_or_none(value: Any) -> Any:
    return value if _is_scalar(value) else None


def _first_updated_at(*values: Any) -> Any:
    for value in values:
        updated_at = _updated_at(value)
        if updated_at not in (None, ""):
            return updated_at
    return None


def _updated_at(value: Any) -> Any:
    if isinstance(value, dict):
        for key in ("updatedAt", "lastUpdated", "date", "asOf", "createdAt", "analysisDate", "latestSourceDate", "reportPeriod"):
            if value.get(key) not in (None, ""):
                return value[key]
    return None


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


def _key_is_forbidden(key: str) -> bool:
    normalized = re.sub(r"[^a-z0-9]", "", str(key).lower())
    return normalized in FORBIDDEN_CONTEXT_KEYS


def _looks_like_private_path(value: str) -> bool:
    normalized = str(value).strip().replace("\\", "/")
    lowered = normalized.lower()
    return bool(
        re.match(r"^[a-z]:/", lowered)
        or lowered.startswith("/users/")
        or lowered.startswith("/home/")
        or lowered.startswith("users/")
        or "onedrive/" in lowered
        or "投资分析程序" in normalized
        or ".env" in lowered
        or "data/ai_drafts" in lowered
        or "data/review_queue" in lowered
    )


def _assert_json_serializable(context: dict[str, Any]) -> None:
    json.dumps(context, ensure_ascii=False)
