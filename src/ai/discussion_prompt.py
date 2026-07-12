from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


LOCAL_TZ = timezone(timedelta(hours=8))


def build_discussion_record(
    *,
    ai_draft: dict[str, Any],
    review_task: dict[str, Any] | None,
    stock_context: dict[str, Any] | None,
) -> dict[str, Any]:
    result = ai_result(ai_draft)
    review_id = str((review_task or {}).get("review_id") or ai_draft.get("draft_id") or "")
    symbol = str(ai_draft.get("symbol") or result.get("symbol") or (stock_context or {}).get("code") or "")
    task_type = str(ai_draft.get("task_type") or ai_draft.get("taskName") or (review_task or {}).get("task_type") or "")
    discussion_id = safe_id("discussion", review_id or symbol or task_type)
    prompt = build_discussion_prompt(
        ai_draft=ai_draft,
        review_task=review_task,
        stock_context=stock_context,
    )
    return {
        "discussion_id": discussion_id,
        "source_review_id": review_id,
        "symbol": symbol,
        "task_type": task_type,
        "prompt": prompt,
        "created_at": datetime.now(LOCAL_TZ).isoformat(),
    }


def build_discussion_prompt(
    *,
    ai_draft: dict[str, Any],
    review_task: dict[str, Any] | None,
    stock_context: dict[str, Any] | None,
) -> str:
    stock = stock_context or {}
    result = ai_result(ai_draft)
    symbol = first_text(ai_draft.get("symbol"), result.get("symbol"), stock.get("code"), stock.get("symbol"))
    name = first_text(stock.get("name"), stock.get("displayName"), "-")
    based_on = ai_draft.get("basedOn") or {}
    sections = [
        "# \u4e0eAI\u8ba8\u8bba\uff1a\u957f\u671f\u903b\u8f91\u590d\u6838",
        "",
        "## \u6807\u7684",
        f"- \u80a1\u7968\u4ee3\u7801\uff1a{symbol}",
        f"- \u80a1\u7968\u540d\u79f0\uff1a{name}",
        "",
        "## \u5f53\u524d\u6301\u4ed3",
        f"- \u6301\u4ed3\u6570\u91cf\uff1a{field_text(stock, 'shares')}",
        f"- \u6210\u672c\uff1a{field_text(stock, 'avgCost')}",
        f"- \u5f53\u524d\u4ef7\u683c\uff1a{field_text(stock, 'currentPrice')}",
        f"- \u5f53\u524d\u4ed3\u4f4d\uff1a{first_text(stock.get('currentWeight'), stock.get('currentPct'), stock.get('weight'), stock.get('targetPct'), '\u672a\u63d0\u4f9b')}",
        f"- \u76ee\u6807\u4ed3\u4f4d\uff1a{first_text(stock.get('targetWeight'), stock.get('targetPct'), '\u672a\u63d0\u4f9b')}",
        "",
        "## \u957f\u671f\u903b\u8f91",
        first_text(
            nested_text(stock, "longTermLogic", "summary"),
            nested_text(stock, "longTermLogic", "investmentThesis"),
            stock.get("thesis"),
            stock.get("notes"),
            "\u672a\u63d0\u4f9b",
        ),
        "",
        "## AI\u6700\u65b0\u5224\u65ad",
        f"- AI\u7ed3\u8bba\uff1a{first_text(result.get('summary'), '-')}",
        f"- logic_status\uff1a{first_text(result.get('logic_status'), '-')}",
        f"- confidence\uff1a{first_text(result.get('confidence'), '-')}",
        f"- investmentThesis\uff1a{first_text(result.get('investmentThesis'), '-')}",
        "",
        "## \u9a71\u52a8\u56e0\u7d20",
        format_items(result.get("coreDrivers")),
        "",
        "## \u98ce\u9669",
        format_items(result.get("longTermRisks")),
        "",
        "## notes",
        format_items(result.get("notes")),
        "",
        "## \u6570\u636e\u66f4\u65b0\u65f6\u95f4",
        f"- AI updatedAt\uff1a{first_text(result.get('updatedAt'), '\u672a\u63d0\u4f9b')}",
        f"- AI validUntil\uff1a{first_text(result.get('validUntil'), '\u672a\u63d0\u4f9b')}",
        f"- AI nextReviewDate\uff1a{first_text(result.get('nextReviewDate'), '\u672a\u63d0\u4f9b')}",
        f"- \u65e7\u957f\u671f\u903b\u8f91\uff1a{first_text(based_on.get('previousLongTermLogicUpdatedAt'), nested_text(stock, 'longTermLogic', 'updatedAt'), '\u672a\u66f4\u65b0')}",
        f"- \u6280\u672f\u9762\uff1a{first_text(based_on.get('technicalUpdatedAt'), nested_text(stock, 'technicalReview', 'updatedAt'), '\u672a\u66f4\u65b0')}",
        f"- \u65b0\u95fb\u50ac\u5316\uff1a{first_text(based_on.get('newsUpdatedAt'), nested_text(stock, 'recentCatalyst', 'updatedAt'), '\u672a\u66f4\u65b0')}",
        f"- \u57fa\u672c\u9762\uff1a{first_text(based_on.get('fundamentalUpdatedAt'), nested_text(stock, 'fundamentalReview', 'updatedAt'), '\u672a\u66f4\u65b0')}",
        f"- \u4f30\u503c\uff1a{first_text(based_on.get('valuationUpdatedAt'), nested_text(stock, 'valuationReview', 'updatedAt'), '\u672a\u66f4\u65b0')}",
        f"- \u914d\u7f6e\uff1a{first_text(based_on.get('allocationUpdatedAt'), nested_text(stock, 'allocationDecision', 'updatedAt'), '\u672a\u66f4\u65b0')}",
        "",
        "## \u8ba8\u8bba\u76ee\u6807",
        "\u8bf7\u5e2e\u52a9\u6211\u5224\u65ad\uff1a",
        "1. \u5f53\u524dAI\u7ed3\u8bba\u662f\u5426\u5408\u7406\uff1f",
        "2. \u957f\u671f\u903b\u8f91\u662f\u5426\u9700\u8981\u8c03\u6574\uff1f",
        "3. \u662f\u5426\u9700\u8981\u751f\u6210\u65b0\u8ba1\u5212\uff1f\u5982\u679c\u9700\u8981\uff0c\u53ea\u8bf4\u660e\u5e94\u8fdb\u5165\u8ba1\u5212\u5237\u65b0\uff0c\u4e0d\u76f4\u63a5\u8f93\u51fa\u4ea4\u6613\u6307\u4ee4\u3002",
        "4. \u662f\u5426\u9700\u8981\u8fdb\u5165\u4eba\u5de5\u64cd\u4f5c\u590d\u6838\uff1f",
        "",
        "## \u7ea6\u675f",
        "- \u4e0d\u8981\u8f93\u51fa\u786e\u5b9a\u6027\u4e70\u5356\u547d\u4ee4\u3002",
        "- \u4e0d\u8981\u66ff\u7528\u6237\u76f4\u63a5\u51b3\u5b9a\u4ea4\u6613\u3002",
        "- \u53ea\u63d0\u4f9b\u4f9b\u4eba\u5de5\u590d\u6838\u7684\u5224\u65ad\u3001\u7591\u70b9\u3001\u4e0b\u4e00\u6b65\u5efa\u8bae\u3002",
        "- \u5982\u4fe1\u606f\u4e0d\u8db3\uff0c\u8bf7\u660e\u786e\u6307\u51fa\u7f3a\u5931\u4fe1\u606f\u3002",
    ]
    return "\n".join(str(section) for section in sections)


def write_discussion_record(record: dict[str, Any], output_dir: str | Path) -> tuple[Path, Path]:
    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)
    discussion_id = safe_id(str(record.get("discussion_id") or "discussion"))
    json_path = directory / f"{discussion_id}.json"
    prompt_path = directory / f"{discussion_id}.txt"
    json_path.write_text(json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    prompt_path.write_text(str(record.get("prompt") or ""), encoding="utf-8")
    return json_path, prompt_path


def ai_result(ai_draft: dict[str, Any]) -> dict[str, Any]:
    result = ai_draft.get("result") or ai_draft.get("draft") or {}
    return result if isinstance(result, dict) else {}


def find_stock(stocks_data: dict[str, Any], symbol: str) -> dict[str, Any] | None:
    stocks = stocks_data.get("stocks") or []
    for stock in stocks:
        if not isinstance(stock, dict):
            continue
        values = {str(stock.get("code") or ""), str(stock.get("symbol") or ""), str(stock.get("id") or "")}
        if symbol in values:
            return stock
    return None


def load_stocks(path: str | Path) -> dict[str, Any]:
    source = Path(path)
    if not source.exists():
        return {"stocks": []}
    try:
        data = json.loads(source.read_text(encoding="utf-8"))
    except Exception:
        return {"stocks": []}
    return data if isinstance(data, dict) else {"stocks": []}


def format_items(value: Any) -> str:
    if value is None:
        return "- \u672a\u63d0\u4f9b"
    values = value if isinstance(value, list) else [value]
    if not values:
        return "- \u672a\u63d0\u4f9b"
    return "\n".join(f"- {item}" for item in values)


def first_text(*values: Any) -> str:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def field_text(stock: dict[str, Any], key: str) -> str:
    return first_text(stock.get(key), "\u672a\u63d0\u4f9b")


def nested_text(source: dict[str, Any], key: str, nested_key: str) -> str:
    value = source.get(key)
    if isinstance(value, dict):
        return first_text(value.get(nested_key))
    return ""


def safe_id(*parts: str) -> str:
    raw = "_".join(str(part or "") for part in parts)
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", raw).strip("_") or "discussion"
