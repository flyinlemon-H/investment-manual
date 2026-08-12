from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HKD_CNY = 0.92
NEAR_LEVEL1_PCT = 3.0
NEAR_LEVEL2_PCT = 1.5
BUY_VALID_TRIGGER_MAX_PCT = 5.0
STALE_PRICE_DAYS = 7
FRESHNESS_LIMIT_DAYS = {
    "technicalUpdatedAt": 7,
    "valuationUpdatedAt": 30,
    "newsUpdatedAt": 30,
    "financialUpdatedAt": 30,
}
ALLOWED_ACTIONS = {"observe", "wait", "review", "risk_review", "reduce_review", "add_review", "plan_validity_review"}


@dataclass
class QuoteResult:
    price: float | None
    change_pct: float | None
    source: str
    updated_at: str
    errors: list[str]


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    root = Path(args.root).resolve()
    report_date = args.date or date.today().isoformat()
    state, state_source, load_warnings = load_portfolio_state(root, args.input)
    stocks = normalize_stocks(state)
    quotes = fetch_latest_quotes(stocks, timeout=args.timeout, delay=args.delay, offline=args.no_network, mode=args.mode)
    brief = build_brief(state, stocks, quotes, report_date, state_source, load_warnings, args.mode)

    if os.environ.get("OPENAI_API_KEY") and not args.no_ai:
        ai_summary = generate_openai_summary(brief, timeout=args.timeout)
        if ai_summary:
            brief["ai"] = ai_summary
        else:
            brief["warnings"].append("OPENAI_API_KEY exists, but AI summary generation failed; kept offline rule brief.")
    else:
        brief["ai"] = {
            "enabled": False,
            "today_summary": "未配置 OPENAI_API_KEY，已生成离线规则版每日简报。",
            "priority_review": [],
        }

    text = render_markdown(brief)
    print(text, end="")
    if args.save:
        output_dir = root / args.output_dir
        json_path, md_path = write_reports(output_dir, report_date, brief)
        print(f"\nSaved daily brief JSON: {json_path}")
        print(f"Saved daily brief Markdown: {md_path}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate a daily portfolio review brief from local manual data and latest quotes.")
    parser.add_argument("--input", help="Portfolio manual export JSON. If omitted, the script searches local candidate files.")
    parser.add_argument("--mode", choices=("premarket", "intraday"), default="premarket", help="Brief mode. Defaults to premarket.")
    parser.add_argument("--save", action="store_true", help="Save Markdown and JSON reports. By default the brief is only printed to stdout.")
    parser.add_argument("--root", default=str(ROOT), help="Project root. Defaults to this repository.")
    parser.add_argument("--date", help="Report date in YYYY-MM-DD. Defaults to today.")
    parser.add_argument("--output-dir", default="reports/daily", help="Output directory relative to project root.")
    parser.add_argument("--timeout", type=float, default=8.0, help="HTTP timeout seconds for market data and OpenAI calls.")
    parser.add_argument("--delay", type=float, default=0.35, help="Delay seconds between quote requests.")
    parser.add_argument("--no-network", action="store_true", help="Skip quote fetching and use local stored prices only.")
    parser.add_argument("--no-ai", action="store_true", help="Do not call OpenAI even when OPENAI_API_KEY is configured.")
    return parser


def load_portfolio_state(root: Path, input_path: str | None) -> tuple[dict[str, Any], str, list[str]]:
    warnings: list[str] = []
    if input_path:
        path = resolve_path(root, input_path)
        return read_state_json(path), str(path), warnings

    candidates = [
        root / "portfolio_state.json",
        root / "data" / "portfolio_state.json",
        root / "state.json",
    ]
    candidates.extend(sorted((root / "backups").glob("**/*.json"), key=lambda p: p.stat().st_mtime if p.exists() else 0, reverse=True))

    for path in candidates:
        if not path.exists():
            continue
        try:
            payload = read_state_json(path)
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(payload.get("stocks"), list):
            return payload, str(path), warnings

    watchlist_path = root / "watchlist.json"
    if watchlist_path.exists():
        warnings.append("未找到包含 stocks 的手册导出 JSON，已降级读取 watchlist.json；仓位、计划和事件会显示为缺失。")
        return watchlist_to_state(read_state_json(watchlist_path)), str(watchlist_path), warnings

    warnings.append("未找到本地持仓文件；生成空简报。建议用 --input 指向手册导出的 JSON。")
    return {"stocks": []}, "none", warnings


def resolve_path(root: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else root / path


def read_state_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    if isinstance(payload, list):
        return {"stocks": payload}
    if isinstance(payload, dict):
        return payload
    raise ValueError(f"{path} must contain a JSON object or array.")


def watchlist_to_state(payload: dict[str, Any]) -> dict[str, Any]:
    stocks = []
    for item in payload.get("watchlist", []) if isinstance(payload.get("watchlist"), list) else []:
        if not isinstance(item, dict):
            continue
        stocks.append(
            {
                "id": str(item.get("symbol") or item.get("company") or ""),
                "name": item.get("company") or item.get("symbol") or "",
                "code": item.get("symbol") or "",
                "type": "watching",
                "shares": 0,
                "plans": [],
                "events": [],
            }
        )
    return {"stocks": stocks, "source": "watchlist"}


def normalize_stocks(state: dict[str, Any]) -> list[dict[str, Any]]:
    stocks = state.get("stocks")
    if not isinstance(stocks, list):
        return []
    return [stock for stock in stocks if isinstance(stock, dict)]


def fetch_latest_quotes(stocks: list[dict[str, Any]], timeout: float, delay: float, offline: bool, mode: str) -> dict[str, QuoteResult]:
    results: dict[str, QuoteResult] = {}
    for stock in stocks:
        key = stock_key(stock)
        if is_cash_row(stock):
            results[key] = QuoteResult(None, None, "cash-row", "", [])
            continue
        code = normalize_quote_code(stock.get("code") or stock.get("symbol"))
        if not code:
            results[key] = QuoteResult(None, None, "missing-code", today(), ["缺少行情代码"])
            continue
        if is_cash_row(stock):
            results[key] = QuoteResult(None, None, "cash-row", today(), ["现金行不抓取行情"])
            continue
        if offline:
            results[key] = QuoteResult(None, None, "offline", today(), ["--no-network enabled"])
            continue
        errors: list[str] = []
        try:
            results[key] = fetch_from_eastmoney(code, timeout, mode)
        except Exception as exc:  # noqa: BLE001 - collect source diagnostics.
            errors.append(f"东方财富: {exc}")
            try:
                results[key] = fetch_from_yahoo(code, timeout, mode)
            except Exception as yahoo_exc:  # noqa: BLE001
                errors.append(f"Yahoo: {yahoo_exc}")
                results[key] = QuoteResult(None, None, "failed", today(), errors)
        if delay > 0:
            time.sleep(delay)
    return results


def normalize_quote_code(code: Any) -> str:
    return str(code or "").strip().upper()


def to_eastmoney_code(code: str) -> str | None:
    clean = normalize_quote_code(code)
    if not clean:
        return None
    if clean.endswith(".SS"):
        return "1." + clean[:-3]
    if clean.endswith(".SZ"):
        return "0." + clean[:-3]
    if clean.endswith(".HK"):
        return "116." + clean[:-3].zfill(5)
    if re.fullmatch(r"[A-Z]+", clean):
        return "105." + clean
    if re.match(r"^[56]", clean):
        return "1." + clean
    if re.match(r"^(0|1|3|159|16)", clean):
        return "0." + clean
    return None


def fetch_from_eastmoney(code: str, timeout: float, mode: str) -> QuoteResult:
    em_code = to_eastmoney_code(code)
    if not em_code:
        raise ValueError("代码格式无法识别为东方财富 secid")
    query = urllib.parse.urlencode(
        {
            "secid": em_code,
            "fields": "f43,f44,f45,f46,f47,f48,f57,f58,f60,f168,f170",
            "fltt": "2",
            "invt": "2",
            "ut": "fa5fd1943c7b386f172d6893dbfba10b",
        }
    )
    url = f"https://push2.eastmoney.com/api/qt/stock/get?{query}"
    data = fetch_json(url, timeout)
    detail = data.get("data") if isinstance(data, dict) else None
    if not isinstance(detail, dict):
        raise ValueError("响应缺少 data")
    if mode == "premarket":
        raw = detail.get("f60")
        source = "东方财富-最新收盘"
        if not number_positive(raw):
            raw = detail.get("f43")
            source = "东方财富-可用最新价"
    else:
        raw = detail.get("f43")
        source = "东方财富-盘中最新"
        if not number_positive(raw):
            raw = detail.get("f60")
            source = "东方财富-最新收盘"
    if not number_positive(raw):
        raise ValueError("响应没有有效价格")
    change = detail.get("f170")
    return QuoteResult(float(raw), float(change) if is_number(change) else None, source, today(), [])


def fetch_from_yahoo(code: str, timeout: float, mode: str) -> QuoteResult:
    clean = normalize_quote_code(code)
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(clean)}?interval=1d&range=1d"
    data = fetch_json(url, timeout)
    result = (((data.get("chart") or {}).get("result") or [None])[0] or {}) if isinstance(data, dict) else {}
    meta = result.get("meta") or {}
    quote = (((result.get("indicators") or {}).get("quote") or [None])[0] or {})
    closes = [float(v) for v in quote.get("close", []) if is_number(v)] if isinstance(quote, dict) else []
    if mode == "premarket":
        price = meta.get("previousClose") or meta.get("chartPreviousClose") or (closes[-1] if closes else None) or meta.get("regularMarketPrice")
        source = "Yahoo-最新收盘"
    else:
        price = meta.get("regularMarketPrice") or (closes[-1] if closes else None) or meta.get("previousClose")
        source = "Yahoo-盘中最新"
    if not number_positive(price):
        raise ValueError("未获取到有效价格")
    prev = meta.get("chartPreviousClose") or meta.get("previousClose")
    change = ((float(price) - float(prev)) / float(prev) * 100) if number_positive(prev) else None
    return QuoteResult(float(price), round(change, 2) if change is not None else None, source, today(), [])


def fetch_json(url: str, timeout: float) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 daily-brief"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(str(exc.reason)) from exc


def build_brief(
    state: dict[str, Any],
    stocks: list[dict[str, Any]],
    quotes: dict[str, QuoteResult],
    report_date: str,
    state_source: str,
    load_warnings: list[str],
    mode: str,
) -> dict[str, Any]:
    fx = fx_rate(state)
    rows: list[dict[str, Any]] = []
    warnings = list(load_warnings)
    total_assets = estimate_total_assets(stocks, quotes, fx)
    for stock in stocks:
        quote = quotes.get(stock_key(stock), QuoteResult(None, None, "not-fetched", today(), []))
        row = build_stock_row(stock, quote, fx, total_assets, state, mode)
        row["brief_layer"] = classify_brief_layer(row)
        rows.append(row)
        warnings.extend([f"{row['name']}: {warning}" for warning in row["data_warnings"]])

    priority = sorted(rows, key=priority_sort_key)
    triggered = [row for row in rows if row["price"].get("can_trigger") and any(plan["stage"] == "triggered" for plan in row["plans"])]
    plan_validity = [row for row in rows if row["price"].get("can_trigger") and any(plan["stage"] == "plan_validity_review" for plan in row["plans"])]
    approaching = [row for row in rows if row["price"].get("can_check_near") and any(plan["stage"] in {"level1", "level2"} for plan in row["plans"])]
    position_deviation = [row for row in rows if row["position"]["deviation_pct"] is not None and abs(row["position"]["deviation_pct"]) >= 5]
    event_rows = [row for row in rows if row["pending_events"]]
    stale_rows = [row for row in rows if row["data_warnings"]]
    risk_rows = [row for row in rows if is_intraday_risk_row(row, triggered, approaching)]
    before_close_rows = unique_rows(sorted(triggered + approaching + plan_validity + risk_rows, key=priority_sort_key))
    summary = {
        "stocks_count": len(rows),
        "with_latest_price": sum(1 for row in rows if row["price"].get("can_trigger")),
        "triggered_count": len(triggered),
        "plan_validity_review_count": len(plan_validity),
        "approaching_count": len(approaching),
        "risk_review_count": sum(1 for row in rows if row["review_action"] == "risk_review"),
        "pending_events_count": sum(len(row["pending_events"]) for row in rows),
        "missing_or_stale_count": sum(1 for row in rows if row["data_warnings"]),
        "estimated_total_assets_cny": round(total_assets, 2) if total_assets else None,
    }
    if mode == "premarket":
        sections = build_premarket_sections(rows, approaching, plan_validity, position_deviation, risk_rows, stale_rows)
    else:
        sections = build_intraday_sections(rows, triggered, approaching, plan_validity, position_deviation, risk_rows, stale_rows)
    displayed_rows = displayed_section_rows(sections)
    summary.update(
        {
            "daily_focus_stock_count": sum(1 for row in displayed_rows if is_daily_stock(row)),
            "conditional_etf_count": sum(1 for row in displayed_rows if is_conditional_asset(row)),
            "hidden_conditional_count": len(sections.get("hidden_conditional", [])),
            "body_near_plan_count": len(sections.get("near_plan_price", sections.get("near_plan_zone", []))),
            "body_plan_validity_count": len(sections.get("plan_validity_reviews", [])),
            "body_risk_data_count": len(sections.get("risk_and_data", [])),
        }
    )
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "report_date": report_date,
        "mode": mode,
        "source": {"state": state_source, "quote_logic": "src/price-refresh.js compatible: EastMoney first, Yahoo fallback"},
        "fx": {"hkdcny": fx, "source": (state.get("fx") or {}).get("source", "default") if isinstance(state.get("fx"), dict) else "default"},
        "summary": summary,
        "priority_reviews": [compact_priority(row) for row in priority[:12] if row["review_action"] != "wait" or row["data_warnings"]],
        "sections": sections,
        "stocks": rows,
        "warnings": unique_strings(warnings),
        "disclaimer": "仅用于每日人工复核；不输出确定性买卖指令。",
    }


def build_stock_row(stock: dict[str, Any], quote: QuoteResult, fx: float, total_assets: float, state: dict[str, Any] | None = None, mode: str = "premarket") -> dict[str, Any]:
    cash = is_cash_row(stock)
    local_price, local_date = local_current_price(stock)
    latest_price = quote.price if quote.price is not None else local_price
    price_source = quote.source if quote.price is not None else "local-stored"
    price_status = build_price_status(stock, quote, latest_price, local_date)
    market_value = calc_market_value(stock, latest_price, fx)
    strategy = stock.get("strategy") if isinstance(stock.get("strategy"), dict) else {}
    target_pct = first_number(stock.get("targetPct"), strategy.get("targetWeight"))
    actual_pct = market_value / total_assets * 100 if market_value is not None and total_assets > 0 else None
    deviation = actual_pct - target_pct if actual_pct is not None and target_pct is not None else None
    plan_rows = [] if cash else build_plan_rows(stock, latest_price, price_status["can_trigger"])
    pending_events = get_pending_events(stock)
    risks = get_active_risks(stock)
    data_warnings = data_quality_warnings(stock, quote, latest_price, local_date, price_status)
    review_action = classify_review_action(plan_rows, pending_events, risks, deviation, data_warnings, mode)
    return {
        "id": stock.get("id") or stock.get("code") or stock.get("symbol") or "",
        "name": stock.get("name") or stock.get("company") or stock.get("code") or stock.get("symbol") or "",
        "code": normalize_quote_code(stock.get("code") or stock.get("symbol")),
        "type": stock.get("type") or "holding",
        "role": stock.get("role") or "",
        "theme": stock.get("theme") or "",
        "price": {
            "current": round(latest_price, 4) if latest_price is not None else None,
            "source": price_source,
            "updated_at": quote.updated_at if quote.price is not None else local_date,
            "daily_change_pct": quote.change_pct,
            "quote_errors": quote.errors,
            **price_status,
        },
        "position": {
            "shares": number_or_none(stock.get("shares")),
            "market_value_cny": round(market_value, 2) if market_value is not None else None,
            "target_pct": target_pct,
            "actual_pct": round(actual_pct, 2) if actual_pct is not None else None,
            "deviation_pct": round(deviation, 2) if deviation is not None else None,
        },
        "plans": plan_rows,
        "pending_events": pending_events,
        "risk_state": risks,
        "module_summary": extract_module_summary(stock),
        "review_state": extract_review_state(stock, state or {}),
        "data_warnings": unique_strings(data_warnings),
        "review_action": review_action,
    }


def local_current_price(stock: dict[str, Any]) -> tuple[float | None, str]:
    if str(stock.get("type") or "").lower() == "etf":
        unit = number_or_none(stock.get("lastUnitPrice"))
        if unit:
            return unit, str(stock.get("priceUpdatedAt") or stock.get("valueUpdatedAt") or "")
        value = number_or_none(stock.get("currentValue"))
        shares = number_or_none(stock.get("shares"))
        if value and shares:
            return value / shares, str(stock.get("valueUpdatedAt") or "")
        return None, ""
    return number_or_none(stock.get("currentPrice") or stock.get("price")), str(stock.get("priceUpdatedAt") or "")


def build_price_status(stock: dict[str, Any], quote: QuoteResult, price: float | None, local_date: str) -> dict[str, Any]:
    if is_cash_row(stock):
        return {
            "status": "cash",
            "stale_price": False,
            "can_trigger": False,
            "can_check_near": False,
            "price_age_days": None,
        }
    age = days_since(local_date) if local_date else None
    quote_ok = quote.price is not None
    stale_local = (not quote_ok) and (age is None or age > STALE_PRICE_DAYS)
    has_price = price is not None
    can_use = has_price and (quote_ok or not stale_local)
    status = "latest" if quote_ok else ("stale_price" if stale_local else ("local_recent" if has_price else "missing_price"))
    return {
        "status": status,
        "stale_price": stale_local,
        "can_trigger": can_use,
        "can_check_near": can_use,
        "price_age_days": age,
    }


def calc_market_value(stock: dict[str, Any], price: float | None, fx: float) -> float | None:
    if is_cash_row(stock):
        value = number_or_none(stock.get("currentValue") or stock.get("marketValue"))
        return value
    if str(stock.get("type") or "").lower() == "etf":
        value = number_or_none(stock.get("currentValue"))
        if value is None:
            shares = number_or_none(stock.get("shares"))
            value = price * shares if price is not None and shares is not None else None
    else:
        shares = number_or_none(stock.get("shares"))
        value = price * shares if price is not None and shares is not None else None
    if value is None:
        return None
    return value * fx if get_currency(stock) == "HKD" else value


def estimate_total_assets(stocks: list[dict[str, Any]], quotes: dict[str, QuoteResult], fx: float) -> float:
    invested = 0.0
    for stock in stocks:
        quote = quotes.get(stock_key(stock))
        local_price, _ = local_current_price(stock)
        price = quote.price if quote and quote.price is not None else local_price
        value = calc_market_value(stock, price, fx)
        if value:
            invested += value
    if invested <= 0:
        return 0.0
    has_cash = any(is_cash_row(stock) for stock in stocks)
    if has_cash:
        return invested
    target_sum = sum(number_or_none(stock.get("targetPct")) or 0 for stock in stocks)
    reserve_pct = max(0.0, 100.0 - target_sum)
    if reserve_pct <= 0 or reserve_pct >= 100:
        return invested
    return invested / (1 - reserve_pct / 100)


def build_plan_rows(stock: dict[str, Any], current_price: float | None, can_trigger: bool = True) -> list[dict[str, Any]]:
    plans = []
    raw_plans = []
    if isinstance(stock.get("plans"), list):
        raw_plans.extend(stock["plans"])
    core = stock.get("coreModel")
    if isinstance(core, dict) and isinstance(core.get("plans"), list):
        raw_plans.extend(core["plans"])
    seen: set[str] = set()
    for index, plan in enumerate(raw_plans):
        if not isinstance(plan, dict):
            continue
        plan_id = str(plan.get("id") or f"plan-{index}")
        if plan_id in seen:
            continue
        seen.add(plan_id)
        trigger_price = number_or_none(plan.get("triggerPrice") or plan.get("price"))
        direction = plan_direction(plan)
        action = plan_action(plan, direction)
        distance_pct = abs(current_price - trigger_price) / trigger_price * 100 if current_price and trigger_price else None
        stage = plan_stage(current_price, trigger_price, direction, can_trigger, action)
        flag = plan_flag(current_price, trigger_price, action, stage, can_trigger)
        plans.append(
            {
                "id": plan_id,
                "action": action,
                "review_hint": plan_review_hint(action),
                "trigger_price": trigger_price,
                "trigger_direction": direction,
                "distance_pct": round(distance_pct, 2) if distance_pct is not None else None,
                "stage": stage,
                "flag": flag,
                "summary": str(plan.get("summary") or plan.get("note") or ""),
                "version_status": str(plan.get("versionStatus") or plan.get("status") or "active"),
            }
        )
    return [plan for plan in plans if plan["version_status"] != "archived"]


def plan_direction(plan: dict[str, Any]) -> str:
    explicit = str(plan.get("triggerDirection") or plan.get("triggerOn") or "").lower()
    if explicit in {"above", "gte", "up", "sell_above"}:
        return "above"
    if explicit in {"below", "lte", "down", "buy_below"}:
        return "below"
    plan_type = str(plan.get("planType") or "").lower()
    action = str(plan.get("action") or "").lower()
    if action in {"sell", "reduce"} or plan_type in {"profit_take", "take_profit", "position_control"}:
        return "above"
    if action in {"stop_loss", "risk"} or plan_type in {"stop_loss", "risk", "trend_defense"}:
        return "below"
    return "below"


def plan_action(plan: dict[str, Any], direction: str) -> str:
    action = str(plan.get("action") or "").lower()
    if action in {"sell", "reduce"}:
        return "sell"
    if action in {"stop_loss", "risk"}:
        return "risk"
    if action in {"take_profit", "profit_take"}:
        return "sell"
    if action in {"buy", "add", "build"}:
        return "buy"
    plan_type = str(plan.get("planType") or "").lower()
    if plan_type in {"stop_loss", "risk", "trend_defense"}:
        return "risk"
    if plan_type in {"take_profit", "profit_take", "position_control"}:
        return "sell"
    return "sell" if direction == "above" else "buy"


def plan_stage(current: float | None, trigger: float | None, direction: str, can_trigger: bool = True, action: str = "") -> str:
    if not can_trigger:
        return "no_valid_price"
    if not current or not trigger:
        return "unknown"
    if direction == "above" and current >= trigger:
        return "triggered"
    if direction == "below" and current <= trigger:
        distance_pct = abs(current - trigger) / trigger * 100
        if action == "buy" and distance_pct > BUY_VALID_TRIGGER_MAX_PCT + 1e-9:
            return "plan_validity_review"
        return "triggered"
    distance_pct = abs(current - trigger) / trigger * 100
    if distance_pct <= NEAR_LEVEL2_PCT:
        return "level2"
    if distance_pct <= NEAR_LEVEL1_PCT:
        return "level1"
    return "none"


def plan_review_hint(action: str) -> str:
    if action == "sell":
        return "reduce_review"
    if action == "risk":
        return "risk_review"
    return "add_review"


def plan_flag(current: float | None, trigger: float | None, action: str, stage: str, can_trigger: bool) -> str:
    if not can_trigger:
        return "invalid_price"
    if current is None or trigger is None or trigger <= 0:
        return "missing_price_or_plan"
    distance_pct = abs(current - trigger) / trigger * 100
    if stage == "plan_validity_review":
        return "stale_plan_or_deep_below_plan"
    if stage == "triggered":
        return "direction_triggered"
    if stage in {"level1", "level2"}:
        return "near_trigger_zone"
    return "far_from_plan"


def get_pending_events(stock: dict[str, Any]) -> list[dict[str, Any]]:
    raw_events = []
    if isinstance(stock.get("events"), list):
        raw_events.extend(stock["events"])
    core = stock.get("coreModel")
    if isinstance(core, dict) and isinstance(core.get("events"), list):
        raw_events.extend(core["events"])
    out = []
    seen: set[str] = set()
    for index, event in enumerate(raw_events):
        if not isinstance(event, dict):
            continue
        status = str(event.get("status") or "pending")
        if status == "archived":
            continue
        event_id = str(event.get("id") or f"event-{index}")
        if event_id in seen:
            continue
        seen.add(event_id)
        out.append(
            {
                "id": event_id,
                "phase": str(event.get("phase") or "info"),
                "status": status,
                "title": str(event.get("title") or ""),
                "summary": str(event.get("summary") or ""),
                "priority": number_or_none(event.get("priority")) or 0,
            }
        )
    return sorted(out, key=lambda e: (event_phase_rank(e["phase"]), e["priority"]), reverse=True)


def get_active_risks(stock: dict[str, Any]) -> list[dict[str, Any]]:
    raw = []
    for container in (stock.get("riskState"), (stock.get("coreModel") or {}).get("riskState") if isinstance(stock.get("coreModel"), dict) else None):
        if isinstance(container, dict) and isinstance(container.get("risks"), list):
            raw.extend(container["risks"])
    risk_management = stock.get("riskManagement")
    if isinstance(risk_management, dict) and risk_management.get("status") not in (None, "", "normal"):
        raw.append(
            {
                "riskType": "risk_management",
                "active": True,
                "phase": "decision" if str(risk_management.get("status")) != "observe" else "info",
                "summary": risk_management.get("summary") or risk_management.get("status") or "",
            }
        )
    out = []
    for risk in raw:
        if not isinstance(risk, dict):
            continue
        if str(risk.get("status") or risk.get("versionStatus") or "").lower() == "archived" or risk.get("archivedAt"):
            continue
        if risk.get("active") is False:
            continue
        out.append(
            {
                "risk_type": str(risk.get("riskType") or "trend_defense"),
                "phase": str(risk.get("phase") or "info"),
                "summary": str(risk.get("summary") or ""),
            }
        )
    return out


def extract_module_summary(stock: dict[str, Any]) -> dict[str, Any] | None:
    for key in ("moduleSummary", "moduleSummaries"):
        value = stock.get(key)
        if isinstance(value, dict):
            return value
    core = stock.get("coreModel")
    if isinstance(core, dict) and isinstance(core.get("moduleSummary"), dict):
        return core["moduleSummary"]
    return None


def extract_review_state(stock: dict[str, Any], state: dict[str, Any]) -> dict[str, Any] | None:
    direct = stock.get("reviewState")
    if isinstance(direct, dict):
        return direct
    direct_list = stock.get("reviewStates")
    if isinstance(direct_list, list):
        return {"source": "stock.reviewStates", "states": [item for item in direct_list if isinstance(item, dict)]}

    core = stock.get("coreModel")
    if isinstance(core, dict):
        core_state = core.get("reviewState")
        if isinstance(core_state, dict):
            return core_state
        core_states = core.get("reviewStates")
        if isinstance(core_states, list):
            return {"source": "coreModel.reviewStates", "states": [item for item in core_states if isinstance(item, dict)]}

    recommendation_ids = stock_recommendation_ids(stock)
    if not recommendation_ids:
        return None

    states = [
        item
        for item in state.get("decisionStates", [])
        if isinstance(item, dict) and str(item.get("recommendationId") or "") in recommendation_ids
    ] if isinstance(state.get("decisionStates"), list) else []
    records = [
        item
        for item in state.get("decisionRecords", [])
        if isinstance(item, dict) and str(item.get("recommendationId") or "") in recommendation_ids
    ] if isinstance(state.get("decisionRecords"), list) else []
    if not states and not records:
        return None
    return {
        "source": "top-level decisionStates/decisionRecords",
        "recommendation_ids": sorted(recommendation_ids),
        "states": states,
        "records": records,
    }


def stock_recommendation_ids(stock: dict[str, Any]) -> set[str]:
    ids: set[str] = set()
    core = stock.get("coreModel")
    if not isinstance(core, dict):
        return ids
    for key in ("recommendations", "primaryRecommendations", "secondaryRecommendations"):
        items = core.get(key)
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict) and item.get("id"):
                ids.add(str(item["id"]))
    return ids


def data_quality_warnings(stock: dict[str, Any], quote: QuoteResult, price: float | None, local_date: str, price_status: dict[str, Any]) -> list[str]:
    warnings = []
    if is_cash_row(stock):
        return warnings
    return data_quality_warnings_v2(stock, quote, price, local_date, price_status)
    if quote.price is None and quote.errors:
        warnings.append("最新行情获取失败，已使用本地旧价格或留空。")
    if price is None:
        warnings.append("缺少当前价格，无法计算市值、计划距离或仓位偏离。")
    date_value = quote.updated_at if quote.price is not None else local_date
    if not date_value:
        warnings.append("缺少价格更新时间。")
    elif days_since(date_value) is not None and days_since(date_value) > 7:
        warnings.append(f"价格数据超过 7 天未更新：{date_value}")
    freshness = stock.get("dataFreshness")
    if isinstance(freshness, dict):
        for key in ("valuationUpdatedAt", "newsUpdatedAt", "financialUpdatedAt", "technicalUpdatedAt"):
            value = str(freshness.get(key) or "")
            if not value:
                warnings.append(f"缺少 {key}")
            elif days_since(value) is not None and days_since(value) > 30:
                warnings.append(f"{key} 超过 30 天未更新：{value}")
    if not isinstance(stock.get("plans"), list) and not (isinstance(stock.get("coreModel"), dict) and isinstance(stock["coreModel"].get("plans"), list)):
        warnings.append("缺少计划数据。")
    return warnings


def data_quality_warnings_v2(stock: dict[str, Any], quote: QuoteResult, price: float | None, local_date: str, price_status: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    if quote.price is None and quote.errors:
        if price_status.get("stale_price"):
            warnings.append(f"行情获取失败，旧价格日期 {local_date or '无日期'}，需先更新价格")
        else:
            warnings.append("行情获取失败，已使用本地近期价格")
    if price is None:
        warnings.append("缺少当前价格，无法计算市值、计划距离或仓位偏离")
    date_value = quote.updated_at if quote.price is not None else local_date
    if not date_value:
        warnings.append("缺少价格更新时间")
    elif price_status.get("stale_price"):
        warnings.append(f"价格数据超过 {STALE_PRICE_DAYS} 天未更新：{date_value}")

    freshness = stock.get("dataFreshness")
    if isinstance(freshness, dict):
        labels = {
            "technicalUpdatedAt": "技术面数据",
            "valuationUpdatedAt": "估值数据",
            "newsUpdatedAt": "新闻数据",
            "financialUpdatedAt": "财务数据",
        }
        for key, limit in FRESHNESS_LIMIT_DAYS.items():
            value = str(freshness.get(key) or "")
            age = days_since(value) if value else None
            if value and age is not None and age > limit:
                warnings.append(f"{labels[key]}超过 {limit} 天未更新：{value}")

    if not isinstance(stock.get("plans"), list) and not (isinstance(stock.get("coreModel"), dict) and isinstance(stock["coreModel"].get("plans"), list)):
        warnings.append("缺少计划数据")
    return unique_strings(warnings)


def classify_review_action(
    plans: list[dict[str, Any]],
    events: list[dict[str, Any]],
    risks: list[dict[str, Any]],
    deviation: float | None,
    warnings: list[str],
    mode: str,
) -> str:
    triggered = [plan for plan in plans if plan["stage"] == "triggered"]
    plan_validity = [plan for plan in plans if plan["stage"] == "plan_validity_review"]
    if mode == "intraday":
        if any(plan["action"] == "risk" for plan in triggered):
            return "risk_review"
        if any(plan["action"] == "sell" for plan in triggered):
            return "reduce_review"
        if any(plan["action"] == "buy" for plan in triggered):
            return "add_review"
        if plan_validity:
            return "plan_validity_review"
    if any(risk.get("phase") in {"decision", "prepare"} for risk in risks):
        return "risk_review"
    if any(event.get("phase") in {"decision", "prepare"} for event in events):
        return "review"
    if deviation is not None and abs(deviation) >= 5:
        return "review"
    if any(plan["stage"] in {"triggered", "plan_validity_review", "level1", "level2"} for plan in plans):
        return "review"
    if warnings:
        return "review"
    return "wait"


def priority_sort_key(row: dict[str, Any]) -> tuple[int, int, float]:
    action_rank = {"reduce_review": 5, "add_review": 5, "risk_review": 4, "plan_validity_review": 4, "review": 3, "observe": 2, "wait": 1}
    nearest = min((plan["distance_pct"] for plan in row["plans"] if plan["distance_pct"] is not None), default=999.0)
    return (-action_rank.get(row["review_action"], 0), -len(row["pending_events"]), nearest)


def is_intraday_risk_row(row: dict[str, Any], triggered_rows: list[dict[str, Any]], approaching_rows: list[dict[str, Any]]) -> bool:
    if is_cash_like_values(row.get("name"), row.get("code"), row.get("type")):
        return False
    if row in triggered_rows or row in approaching_rows:
        return True
    if any(risk.get("phase") in {"decision", "prepare"} for risk in row.get("risk_state", [])):
        return True
    if row["price"].get("stale_price") and is_important_position(row):
        return True
    return False


def is_important_position(row: dict[str, Any]) -> bool:
    position = row.get("position") if isinstance(row.get("position"), dict) else {}
    target = number_or_none(position.get("target_pct")) or 0
    market_value = number_or_none(position.get("market_value_cny")) or 0
    actual = number_or_none(position.get("actual_pct")) or 0
    return target >= 2 or actual >= 2 or market_value >= 50000


def classify_brief_layer(row: dict[str, Any]) -> str:
    if is_cash_like_values(row.get("name"), row.get("code"), row.get("type")):
        return "hidden"
    if is_conditional_asset(row):
        return "conditional"
    if row.get("pending_events") or row.get("risk_state"):
        return "daily"
    return "daily"


def is_conditional_asset(row: dict[str, Any]) -> bool:
    if is_cash_like_values(row.get("name"), row.get("code"), row.get("type")):
        return False
    name_code = " ".join(str(row.get(key) or "") for key in ("name", "code")).lower()
    role_theme = " ".join(str(row.get(key) or "") for key in ("role", "theme")).lower()
    name_tokens = [
        "etf",
        "基金",
        "指数",
        "宽基",
        "红利etf",
        "黄金etf",
        "黄金股etf",
        "沪深300",
        "中证",
        "上证",
        "恒指",
        "科创50",
        "index",
        "fund",
    ]
    type_text = str(row.get("type") or "").lower()
    if type_text in {"etf", "fund", "index", "index_fund", "industry_fund", "allocation"}:
        return True
    if type_text in {"stock", "holding", "equity"} and not any(token.lower() in name_code for token in name_tokens):
        return False
    if any(token.lower() in name_code for token in name_tokens):
        return True
    return any(token in role_theme for token in ("etf", "基金", "指数基金", "配置型资产", "低频配置", "宽基"))


def is_daily_stock(row: dict[str, Any]) -> bool:
    return row.get("brief_layer") == "daily"


def should_show_in_daily_body(row: dict[str, Any]) -> bool:
    if is_cash_like_values(row.get("name"), row.get("code"), row.get("type")):
        return False
    if not is_conditional_asset(row):
        return True
    return etf_daily_display_reason(row) is not None


def etf_daily_display_reason(row: dict[str, Any]) -> str | None:
    if not is_conditional_asset(row):
        return "daily_stock"
    if row.get("data_warnings") or row.get("price", {}).get("stale_price"):
        return "data"
    if has_high_review_risk(row):
        return "risk"
    if has_high_priority_event(row):
        return "event"
    deviation = row.get("position", {}).get("deviation_pct")
    if deviation is not None and abs(deviation) >= 5:
        return "position"
    if any(is_normal_review_plan(plan) for plan in row.get("plans", [])):
        return "review_zone"
    if any(is_near_plan_for_body(row, plan) for plan in row.get("plans", [])):
        return "near"
    return None


def is_force_show_etf(row: dict[str, Any]) -> bool:
    if not is_conditional_asset(row):
        return True
    if row.get("data_warnings") or row.get("price", {}).get("stale_price"):
        return True
    if any(is_normal_review_plan(plan) for plan in row.get("plans", [])):
        return True
    deviation = row.get("position", {}).get("deviation_pct")
    if deviation is not None and abs(deviation) >= 8:
        return True
    return has_high_review_risk(row)


def has_high_priority_event(row: dict[str, Any]) -> bool:
    return any(str(event.get("phase") or "").lower() in {"decision", "review"} for event in row.get("pending_events", []))


def is_near_plan_for_body(row: dict[str, Any], plan: dict[str, Any]) -> bool:
    distance = plan.get("distance_pct")
    if distance is None or plan.get("stage") in {"no_valid_price", "unknown", "plan_validity_review"}:
        return False
    threshold = 2.0 if is_conditional_asset(row) else NEAR_LEVEL1_PCT
    return distance <= threshold


def is_plan_validity_visible(row: dict[str, Any], plan: dict[str, Any]) -> bool:
    if not is_plan_validity_plan(plan):
        return False
    if not is_conditional_asset(row):
        return True
    if plan.get("action") == "buy":
        return False
    return should_show_in_daily_body(row)


def build_premarket_sections(
    rows: list[dict[str, Any]],
    approaching: list[dict[str, Any]],
    plan_validity: list[dict[str, Any]],
    position_deviation: list[dict[str, Any]],
    risk_rows: list[dict[str, Any]],
    stale_rows: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    visible_rows = [row for row in rows if should_show_in_daily_body(row)]
    near_rows = unique_rows(sorted([row for row in visible_rows if is_premarket_near_plan_row(row)], key=priority_sort_key))
    validity_rows = unique_rows(sorted([row for row in visible_rows if any(is_plan_validity_visible(row, plan) for plan in row.get("plans", []))], key=priority_sort_key))
    premarket_risk_rows = [row for row in rows if has_high_review_risk(row)]
    risk_data_rows = unique_rows(
        sorted(
            [row for row in stale_rows + premarket_risk_rows + position_deviation if should_show_in_daily_body(row)],
            key=premarket_focus_sort_key,
        )
    )
    focus_candidates = unique_rows(sorted(visible_rows, key=premarket_focus_sort_key))
    focus_rows = [row for row in focus_candidates if premarket_focus_score(row) < 90][:5]
    observe_rows = unique_rows(sorted(focus_rows + near_rows + risk_data_rows, key=premarket_focus_sort_key))[:6]
    return {
        "today_focus": [compact_priority_by_plan(row, lambda plan, current_row=row: is_focus_plan(current_row, plan)) for row in focus_rows],
        "near_plan_price": [compact_priority(row, {"level1", "level2"}) for row in near_rows[:12]],
        "plan_validity_reviews": [compact_priority_by_plan(row, lambda plan, current_row=row: is_plan_validity_visible(current_row, plan)) for row in validity_rows[:12]],
        "risk_and_data": [compact_priority(row) for row in risk_data_rows[:12]],
        "watchlist": [compact_priority_by_plan(row, lambda plan, current_row=row: is_focus_plan(current_row, plan)) for row in observe_rows],
        "hidden_conditional": [compact_priority(row) for row in rows if is_conditional_asset(row) and not should_show_in_daily_body(row)],
    }


def build_intraday_sections(
    rows: list[dict[str, Any]],
    triggered: list[dict[str, Any]],
    approaching: list[dict[str, Any]],
    plan_validity: list[dict[str, Any]],
    position_deviation: list[dict[str, Any]],
    risk_rows: list[dict[str, Any]],
    stale_rows: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    visible_rows = [row for row in rows if should_show_in_daily_body(row)]
    review_rows = unique_rows(sorted([row for row in visible_rows if any(is_normal_review_plan(plan) for plan in row.get("plans", []))], key=priority_sort_key))
    near_rows = unique_rows(sorted([row for row in visible_rows if any(is_intraday_near_plan_for_body(row, plan) for plan in row.get("plans", []))], key=priority_sort_key))
    validity_rows = unique_rows(sorted([row for row in visible_rows if any(is_plan_validity_visible(row, plan) for plan in row.get("plans", []))], key=priority_sort_key))
    data_risk_rows = unique_rows(
        sorted(
            [row for row in stale_rows + [r for r in rows if has_high_review_risk(r)] + position_deviation if should_show_in_daily_body(row)],
            key=intraday_focus_sort_key,
        )
    )
    close_rows = unique_rows(sorted(visible_rows, key=intraday_focus_sort_key))
    close_rows = [row for row in close_rows if intraday_focus_score(row) < 90][:5]
    return {
        "review_zone": [compact_priority_by_plan(row, is_normal_review_plan) for row in review_rows[:12]],
        "near_plan_zone": [compact_priority_by_plan(row, lambda plan, current_row=row: is_intraday_near_plan_for_body(current_row, plan)) for row in near_rows[:12]],
        "plan_validity_reviews": [compact_priority_by_plan(row, lambda plan, current_row=row: is_plan_validity_visible(current_row, plan)) for row in validity_rows[:12]],
        "risk_and_data": [compact_priority(row) for row in data_risk_rows[:12]],
        "close_focus": [compact_priority_by_plan(row, lambda plan, current_row=row: is_focus_plan(current_row, plan)) for row in close_rows],
        "hidden_conditional": [compact_priority(row) for row in rows if is_conditional_asset(row) and not should_show_in_daily_body(row)],
    }


def is_focus_plan(row: dict[str, Any], plan: dict[str, Any]) -> bool:
    return is_normal_review_plan(plan) or is_intraday_near_plan_for_body(row, plan) or is_plan_validity_visible(row, plan)


def is_normal_review_plan(plan: dict[str, Any]) -> bool:
    distance = plan.get("distance_pct")
    if distance is None or distance > BUY_VALID_TRIGGER_MAX_PCT:
        return False
    if plan.get("stage") != "triggered":
        return False
    return plan.get("action") in {"buy", "sell", "risk"}


def is_plan_validity_plan(plan: dict[str, Any]) -> bool:
    distance = plan.get("distance_pct")
    if distance is None or distance <= BUY_VALID_TRIGGER_MAX_PCT:
        return False
    if plan.get("action") not in {"buy", "sell"}:
        return False
    return plan.get("stage") in {"triggered", "plan_validity_review"}


def is_intraday_near_plan(plan: dict[str, Any]) -> bool:
    distance = plan.get("distance_pct")
    return distance is not None and distance <= NEAR_LEVEL1_PCT and plan.get("stage") in {"level1", "level2"}


def is_intraday_near_plan_for_body(row: dict[str, Any], plan: dict[str, Any]) -> bool:
    if plan.get("stage") not in {"level1", "level2"}:
        return False
    return is_near_plan_for_body(row, plan)


def intraday_focus_sort_key(row: dict[str, Any]) -> tuple[int, float, str]:
    return (intraday_focus_score(row), nearest_plan_distance(row), str(row.get("name") or row.get("code") or ""))


def intraday_focus_score(row: dict[str, Any]) -> int:
    if is_cash_like_values(row.get("name"), row.get("code"), row.get("type")):
        return 99
    if is_conditional_asset(row) and not should_show_in_daily_body(row):
        return 99
    if not row.get("price", {}).get("can_trigger") and (row.get("plans") or is_important_position(row)):
        return 0 if is_daily_stock(row) or is_force_show_etf(row) else 20
    if any(is_normal_review_plan(plan) for plan in row.get("plans", [])):
        return 1 if is_daily_stock(row) or is_force_show_etf(row) else 20
    if any(is_intraday_near_plan_for_body(row, plan) for plan in row.get("plans", [])):
        return 2 if is_daily_stock(row) else 20
    if has_high_review_risk(row) or has_high_priority_event(row):
        return 3 if is_daily_stock(row) or is_force_show_etf(row) else 20
    deviation = row.get("position", {}).get("deviation_pct")
    if deviation is not None and abs(deviation) >= 3 and is_daily_stock(row):
        return 4
    if deviation is not None and abs(deviation) >= 5 and is_conditional_asset(row):
        return 4 if is_force_show_etf(row) else 20
    return 99


def premarket_focus_sort_key(row: dict[str, Any]) -> tuple[int, float, str]:
    return (premarket_focus_score(row), nearest_plan_distance(row), str(row.get("name") or row.get("code") or ""))


def premarket_focus_score(row: dict[str, Any]) -> int:
    if is_cash_like_values(row.get("name"), row.get("code"), row.get("type")):
        return 99
    if is_conditional_asset(row) and not should_show_in_daily_body(row):
        return 99
    if not row.get("price", {}).get("can_trigger") and (row.get("plans") or is_important_position(row)):
        return 0 if is_daily_stock(row) or is_force_show_etf(row) else 20
    if any(is_normal_review_plan(plan) for plan in row.get("plans", [])):
        return 1 if is_daily_stock(row) or is_force_show_etf(row) else 20
    if is_premarket_near_plan_row(row):
        return 2 if is_daily_stock(row) else 20
    if has_high_review_risk(row) or has_high_priority_event(row):
        return 3 if is_daily_stock(row) or is_force_show_etf(row) else 20
    deviation = row.get("position", {}).get("deviation_pct")
    if deviation is not None and abs(deviation) >= 3 and is_daily_stock(row):
        return 4
    if deviation is not None and abs(deviation) >= 5 and is_conditional_asset(row):
        return 4 if is_force_show_etf(row) else 20
    if row.get("data_warnings"):
        return 5
    return 99


def nearest_plan_distance(row: dict[str, Any]) -> float:
    return min((plan["distance_pct"] for plan in row.get("plans", []) if plan.get("distance_pct") is not None), default=999.0)


def is_premarket_near_plan_row(row: dict[str, Any]) -> bool:
    if not row.get("price", {}).get("can_check_near"):
        return False
    return any(is_near_plan_for_body(row, plan) for plan in row.get("plans", []))


def has_high_review_risk(row: dict[str, Any]) -> bool:
    for risk in row.get("risk_state", []):
        if risk.get("phase") not in {"decision", "prepare"}:
            continue
        risk_type = str(risk.get("risk_type") or "")
        summary = str(risk.get("summary") or "")
        if risk_type in {"trend_defense", "stop_loss", "risk"}:
            return True
        if risk_type == "risk_management" and ("趋势" in summary or "支撑" in summary or "风险" in summary) and "既定计划区" not in summary:
            return True
    return False


def compact_priority(row: dict[str, Any], plan_stages: set[str] | None = None) -> dict[str, Any]:
    plan_candidates = [plan for plan in row["plans"] if plan["distance_pct"] is not None]
    if plan_stages:
        filtered = [plan for plan in plan_candidates if plan.get("stage") in plan_stages]
        if filtered:
            plan_candidates = filtered
    return {
        "name": row["name"],
        "code": row["code"],
        "type": row.get("type"),
        "role": row.get("role"),
        "theme": row.get("theme"),
        "brief_layer": row.get("brief_layer"),
        "review_action": row["review_action"],
        "current_price": row["price"]["current"],
        "nearest_plan": min(plan_candidates, key=lambda p: p["distance_pct"], default=None),
        "position_deviation_pct": row["position"]["deviation_pct"],
        "pending_events": row["pending_events"][:3],
        "data_warnings": row["data_warnings"][:5],
        "price_status": row["price"].get("status"),
    }


def compact_priority_by_plan(row: dict[str, Any], predicate: Any) -> dict[str, Any]:
    item = compact_priority(row)
    candidates = [plan for plan in row.get("plans", []) if plan.get("distance_pct") is not None and predicate(plan)]
    item["nearest_plan"] = min(candidates, key=lambda p: p["distance_pct"], default=None)
    return item


def displayed_section_rows(sections: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    visible_keys = {
        "today_focus",
        "near_plan_price",
        "plan_validity_reviews",
        "risk_and_data",
        "watchlist",
        "review_zone",
        "near_plan_zone",
        "close_focus",
    }
    out = []
    seen: set[str] = set()
    for key in visible_keys:
        for item in sections.get(key, []):
            row_key = str(item.get("code") or item.get("name") or "")
            if not row_key or row_key in seen:
                continue
            seen.add(row_key)
            out.append(item)
    return out


def unique_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    seen = set()
    for row in rows:
        key = str(row.get("id") or row.get("code") or row.get("name") or "")
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def write_reports(output_dir: Path, report_date: str, brief: dict[str, Any]) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    mode = str(brief.get("mode") or "premarket")
    json_path = output_dir / f"{report_date}-{mode}.json"
    md_path = output_dir / f"{report_date}-{mode}.md"
    json_path.write_text(json.dumps(brief, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(brief), encoding="utf-8")
    return json_path, md_path


def render_markdown(brief: dict[str, Any]) -> str:
    summary = brief["summary"]
    ai = brief.get("ai") or {}
    mode = brief.get("mode") or "premarket"
    mode_title = "盘前简报" if mode == "premarket" else "盘中简报"
    focus_title = "今日需要关注什么" if mode == "premarket" else "是否已经接近或触发计划"
    lines = [
        f"# 每日股票复核简报 - {brief['report_date']} - {mode_title}",
        "",
        "> 仅用于每日人工复核；不构成确定性买卖指令。",
        "",
        "## 今日摘要",
        "",
        str(ai.get("today_summary") or "离线规则版：按已有持仓、计划、事件、风险状态和最新价格生成。"),
        "",
        f"## {focus_title}",
        "",
        mode_intro(brief),
        "",
        "## 总览",
        "",
        f"- 标的数量：{summary['stocks_count']}",
        f"- 可用价格：{summary['with_latest_price']}",
        f"- {'计划价内标的' if mode == 'premarket' else '已触发计划'}：{summary['triggered_count']}",
        f"- 接近触发区：{summary['approaching_count']}",
        f"- 风险复核：{summary['risk_review_count']}",
        f"- 待处理事件：{summary['pending_events_count']}",
        f"- 数据缺失或过期：{summary['missing_or_stale_count']}",
        f"- 估算总资产 CNY：{fmt_num(summary['estimated_total_assets_cny'])}",
    ]

    if mode == "premarket":
        add_compact_section(lines, "今日优先关注", brief["sections"].get("today_focus", []))
        add_compact_section(lines, "接近计划价", brief["sections"].get("near_plan_price", []))
        add_compact_section(lines, "仓位偏离", brief["sections"].get("position_deviation", []))
        add_compact_section(lines, "待复核事件", brief["sections"].get("pending_events", []))
        add_compact_section(lines, "数据缺失/过期", brief["sections"].get("data_gaps", []))
    else:
        add_compact_section(lines, "已触发计划", brief["sections"].get("triggered_plans", []))
        add_compact_section(lines, "接近触发区", brief["sections"].get("near_trigger_zone", []))
        add_compact_section(lines, "盘中风险", brief["sections"].get("intraday_risks", []))
        add_compact_section(lines, "收盘前复核事项", brief["sections"].get("before_close_review", []))

    ai_priority = ai.get("priority_review") if isinstance(ai, dict) else None
    if ai_priority:
        lines.extend(["", "## GPT 复核说明", ""])
        for item in ai_priority:
            lines.append(f"- {item}")
    lines.extend(["", "## 标的明细", ""])
    for row in brief["stocks"]:
        lines.append(f"### {row['name']} ({row['code']})")
        lines.append("")
        lines.append(f"- 复核提示：`{row['review_action']}`")
        lines.append(f"- 当前价格：{fmt_num(row['price']['current'])} · {row['price']['source']} · {row['price'].get('updated_at') or '无日期'}")
        lines.append(
            f"- 市值/仓位：{fmt_num(row['position']['market_value_cny'])} CNY；目标 {fmt_num(row['position']['target_pct'])}% / 实际 {fmt_num(row['position']['actual_pct'])}% / 偏离 {fmt_num(row['position']['deviation_pct'])}%"
        )
        if row["plans"]:
            lines.append("- 计划距离：")
            for plan in row["plans"][:6]:
                lines.append(
                    f"  - `{plan['review_hint']}` {plan['action']} {fmt_num(plan['trigger_price'])}，{plan['stage']}，距离 {fmt_num(plan['distance_pct'])}% {plan['summary']}".rstrip()
                )
        if row["pending_events"]:
            lines.append("- 待处理事件：")
            for event in row["pending_events"][:5]:
                lines.append(f"  - {event['phase']} · {event['title'] or event['summary']}")
        if row["data_warnings"]:
            lines.append("- 数据问题：")
            for warning in row["data_warnings"][:6]:
                lines.append(f"  - {warning}")
        lines.append("")
    if brief["warnings"]:
        lines.extend(["## 数据警告", ""])
        for warning in brief["warnings"]:
            lines.append(f"- {warning}")
    return "\n".join(lines).rstrip() + "\n"


def mode_intro(brief: dict[str, Any]) -> str:
    if brief.get("mode") == "intraday":
        return "盘中模式使用当日最新可得行情，重点检查既定计划是否已接近或触发，并把结论限制为人工复核提示。"
    return "盘前模式使用前一交易日收盘价或可获得的最新收盘价，只整理今日关注重点，不判断盘中实时触发。"


def add_compact_section(lines: list[str], title: str, items: list[dict[str, Any]]) -> None:
    lines.extend(["", f"## {title}", ""])
    if not items:
        lines.append("- 暂无。")
        return
    for item in items:
        nearest = item.get("nearest_plan") or {}
        line = f"- {item['name']} ({item['code']}): `{item['review_action']}`，价格 {fmt_num(item.get('current_price'))}"
        if nearest:
            line += f"，最近计划 {nearest.get('action')} {fmt_num(nearest.get('trigger_price'))}，{nearest.get('stage')}，距离 {fmt_num(nearest.get('distance_pct'))}%"
        if item.get("position_deviation_pct") is not None:
            line += f"，仓位偏离 {fmt_num(item.get('position_deviation_pct'))}%"
        lines.append(line)
        for event in item.get("pending_events", [])[:2]:
            lines.append(f"  - 事件：{event.get('phase')} · {event.get('title') or event.get('summary')}")
        for warning in item.get("data_warnings", [])[:2]:
            lines.append(f"  - 数据：{warning}")


def render_markdown(brief: dict[str, Any]) -> str:
    summary = brief["summary"]
    ai = brief.get("ai") or {}
    mode = brief.get("mode") or "premarket"
    mode_title = "盘前简报" if mode == "premarket" else "盘中简报"
    focus_title = "今日需要关注什么" if mode == "premarket" else "是否已经接近或触发计划"
    lines = [
        f"# 每日股票复核简报 - {brief['report_date']} - {mode_title}",
        "",
        "> 仅用于每日人工复核；不构成确定性买卖指令。",
        "",
        "## 今日摘要",
        "",
        str(ai.get("today_summary") or "未配置 OPENAI_API_KEY，已生成离线规则版每日简报。"),
        "",
        f"## {focus_title}",
        "",
        "盘中模式使用当日最新可得行情，重点检查既定计划是否已接近或触发。"
        if mode == "intraday"
        else "盘前模式使用前一交易日收盘价或可获得的最新收盘价，只整理今日关注重点，不判断盘中实时触发。",
        "",
        "## 总览",
        "",
        f"- 标的数量：{summary['stocks_count']}",
        f"- 可用价格：{summary['with_latest_price']}",
        f"- {'计划价内标的' if mode == 'premarket' else '已触发计划'}：{summary['triggered_count']}",
        f"- 接近触发区：{summary['approaching_count']}",
        f"- 风险复核：{summary['risk_review_count']}",
        f"- 待处理事件：{summary['pending_events_count']}",
        f"- 数据缺失或过期：{summary['missing_or_stale_count']}",
        f"- 估算总资产 CNY：{fmt_num(summary['estimated_total_assets_cny'])}",
    ]
    if mode == "premarket":
        add_brief_section(lines, "今日关注", brief["sections"].get("today_focus", []))
        add_brief_section(lines, "接近计划价", brief["sections"].get("near_plan_price", []))
        add_brief_section(lines, "风险复核", brief["sections"].get("risk_reviews", []))
        add_brief_section(lines, "数据更新提醒", brief["sections"].get("data_gaps", []))
    else:
        add_brief_section(lines, "已触发计划", brief["sections"].get("triggered_plans", []))
        add_brief_section(lines, "接近触发区", brief["sections"].get("near_trigger_zone", []))
        add_brief_section(lines, "盘中风险", brief["sections"].get("intraday_risks", []))
        add_brief_section(lines, "收盘前复核事项", brief["sections"].get("before_close_review", []))
    lines.extend(["", "## 数据警告", ""])
    if brief.get("warnings"):
        for warning in brief["warnings"]:
            lines.append(f"- {warning}")
    else:
        lines.append("- 暂无。")
    return "\n".join(lines).rstrip() + "\n"


def add_brief_section(lines: list[str], title: str, items: list[dict[str, Any]]) -> None:
    lines.extend(["", f"## {title}", ""])
    if not items:
        lines.append("- 暂无。")
        return
    for item in items:
        nearest = item.get("nearest_plan") or {}
        line = f"- {item['name']} ({item['code']}): `{item['review_action']}`，价格 {fmt_num(item.get('current_price'))}"
        if nearest:
            line += (
                f"，计划 {nearest.get('action')} {fmt_num(nearest.get('trigger_price'))}"
                f"，{nearest.get('stage')}，距离 {fmt_num(nearest.get('distance_pct'))}%"
            )
            if nearest.get("flag"):
                line += f"，标记 {nearest.get('flag')}"
        if item.get("position_deviation_pct") is not None:
            line += f"，仓位偏离 {fmt_num(item.get('position_deviation_pct'))}%"
        if item.get("price_status") == "stale_price":
            line += "，价格状态 stale_price"
        lines.append(line)
        for event in item.get("pending_events", [])[:2]:
            lines.append(f"  - 事件：{event.get('phase')} · {event.get('title') or event.get('summary')}")
        for warning in item.get("data_warnings", [])[:2]:
            lines.append(f"  - 数据：{warning}")


def render_markdown(brief: dict[str, Any]) -> str:
    summary = brief["summary"]
    ai = brief.get("ai") or {}
    mode = brief.get("mode") or "premarket"
    mode_title = "盘前简报" if mode == "premarket" else "盘中简报"
    focus_title = "今日需要关注什么" if mode == "premarket" else "是否已经接近或触发计划"
    lines = [
        f"# 每日股票复核简报 - {brief['report_date']} - {mode_title}",
        "",
        "> 仅用于每日人工复核；不构成确定性买卖指令。",
        "",
        "## 今日摘要",
        "",
        str(ai.get("today_summary") or "未配置 OPENAI_API_KEY，已生成离线规则版每日简报。"),
        "",
        f"## {focus_title}",
        "",
        (
            "盘中模式使用当日最新可得行情，重点检查既定计划是否已经接近或触发。"
            if mode == "intraday"
            else "盘前模式使用前一交易日收盘价或可获得的最新收盘价，只整理今日关注重点，不判断盘中实时触发。"
        ),
        "",
        "## 总览",
        "",
        f"- 标的数量：{summary['stocks_count']}",
        f"- 可用价格：{summary['with_latest_price']}",
        f"- {'计划价内标的' if mode == 'premarket' else '已触发计划'}：{summary['triggered_count']}",
        f"- 计划有效性复核：{summary.get('plan_validity_review_count', 0)}",
        f"- 接近触发区：{summary['approaching_count']}",
        f"- 风险复核：{summary['risk_review_count']}",
        f"- 待处理事件：{summary['pending_events_count']}",
        f"- 数据缺失或过期：{summary['missing_or_stale_count']}",
        f"- 估算总资产 CNY：{fmt_num(summary['estimated_total_assets_cny'])}",
    ]
    if mode == "premarket":
        add_brief_section(lines, "今日关注", brief["sections"].get("today_focus", []))
        add_brief_section(lines, "接近计划价", brief["sections"].get("near_plan_price", []))
        add_brief_section(lines, "风险复核", brief["sections"].get("risk_reviews", []))
        add_brief_section(lines, "数据更新提醒", brief["sections"].get("data_gaps", []))
    else:
        add_brief_section(lines, "已触发计划", brief["sections"].get("triggered_plans", []))
        lines.extend(["", "## 计划有效性复核", ""])
        lines.append("- 价格已明显低于原计划价，需人工确认该计划是否仍有效，不应直接视为正常加仓触发。")
        add_brief_section(lines, "计划有效性复核清单", brief["sections"].get("plan_validity_reviews", []))
        add_brief_section(lines, "接近触发区", brief["sections"].get("near_trigger_zone", []))
        add_brief_section(lines, "盘中风险", brief["sections"].get("intraday_risks", []))
        add_brief_section(lines, "收盘前复核事项", brief["sections"].get("before_close_review", []))
    lines.extend(["", "## 数据警告", ""])
    if brief.get("warnings"):
        for warning in brief["warnings"]:
            lines.append(f"- {warning}")
    else:
        lines.append("- 暂无。")
    return "\n".join(lines).rstrip() + "\n"


def add_brief_section(lines: list[str], title: str, items: list[dict[str, Any]]) -> None:
    lines.extend(["", f"## {title}", ""])
    if not items:
        lines.append("- 暂无。")
        return
    for item in items:
        nearest = item.get("nearest_plan") or {}
        line = f"- {item['name']} ({item['code']}): `{item['review_action']}`，价格 {fmt_num(item.get('current_price'))}"
        if nearest:
            line += (
                f"，计划 {nearest.get('action')} {fmt_num(nearest.get('trigger_price'))}"
                f"，{nearest.get('stage')}，距离 {fmt_num(nearest.get('distance_pct'))}%"
            )
            if nearest.get("flag"):
                line += f"，标记 {nearest.get('flag')}"
        if item.get("position_deviation_pct") is not None:
            line += f"，仓位偏离 {fmt_num(item.get('position_deviation_pct'))}%"
        if item.get("price_status") == "stale_price":
            line += "，价格状态 stale_price"
        lines.append(line)
        for event in item.get("pending_events", [])[:2]:
            lines.append(f"  - 事件：{event.get('phase')} / {event.get('title') or event.get('summary')}")
        for warning in item.get("data_warnings", [])[:2]:
            lines.append(f"  - 数据：{warning}")


def render_markdown(brief: dict[str, Any]) -> str:
    if (brief.get("mode") or "premarket") == "premarket":
        return render_premarket_markdown(brief)
    return render_intraday_markdown(brief)


def render_premarket_markdown(brief: dict[str, Any]) -> str:
    summary = brief["summary"]
    ai = brief.get("ai") or {}
    sections = brief.get("sections") or {}
    lines = [
        f"# 每日股票复核简报 - {brief['report_date']} - 盘前简报",
        "",
        "> 仅用于每日人工复核；不构成确定性买卖指令。",
        "",
        "## 今日摘要",
        "",
        str(ai.get("today_summary") or "未配置 OPENAI_API_KEY，已生成离线规则版每日简报。"),
        "",
        "## 总览",
        "",
        f"- 标的数量：{summary['stocks_count']}",
        f"- 可用价格：{summary['with_latest_price']}",
        f"- 接近计划区：{len(sections.get('near_plan_price', []))}",
        f"- 计划有效性复核：{summary.get('plan_validity_review_count', 0)}",
        f"- 待处理事件：{summary['pending_events_count']}",
        f"- 风险或数据提醒：{len(sections.get('risk_and_data', []))}",
        f"- 估算总资产 CNY：{fmt_num(summary['estimated_total_assets_cny'])}",
    ]
    add_premarket_section(lines, "今日重点关注", sections.get("today_focus", []), render_premarket_focus_item)
    add_premarket_section(lines, "接近计划价", sections.get("near_plan_price", []), render_near_plan_item)
    add_premarket_section(lines, "计划有效性复核", sections.get("plan_validity_reviews", []), render_plan_validity_item)
    add_premarket_section(lines, "风险与数据提醒", sections.get("risk_and_data", []), render_risk_data_item)
    add_premarket_section(lines, "今日观察清单", sections.get("watchlist", []), render_watch_item)
    return "\n".join(lines).rstrip() + "\n"


def render_intraday_markdown(brief: dict[str, Any]) -> str:
    summary = brief["summary"]
    ai = brief.get("ai") or {}
    lines = [
        f"# 每日股票复核简报 - {brief['report_date']} - 盘中简报",
        "",
        "> 仅用于每日人工复核；不构成确定性买卖指令。",
        "",
        "## 今日摘要",
        "",
        str(ai.get("today_summary") or "未配置 OPENAI_API_KEY，已生成离线规则版每日简报。"),
        "",
        "## 是否已经接近或触发计划",
        "",
        "盘中模式使用当日最新可得行情，重点检查既定计划是否已经接近或触发。",
        "",
        "## 总览",
        "",
        f"- 标的数量：{summary['stocks_count']}",
        f"- 可用价格：{summary['with_latest_price']}",
        f"- 已触发计划：{summary['triggered_count']}",
        f"- 计划有效性复核：{summary.get('plan_validity_review_count', 0)}",
        f"- 接近触发区：{summary['approaching_count']}",
        f"- 风险复核：{summary['risk_review_count']}",
        f"- 待处理事件：{summary['pending_events_count']}",
        f"- 数据缺失或过期：{summary['missing_or_stale_count']}",
        f"- 估算总资产 CNY：{fmt_num(summary['estimated_total_assets_cny'])}",
    ]
    add_brief_section(lines, "已触发计划", brief["sections"].get("triggered_plans", []))
    lines.extend(["", "## 计划有效性复核", ""])
    lines.append("- 价格已明显低于原计划价，需人工确认该计划是否仍有效，不应直接视为正常加仓触发。")
    add_brief_section(lines, "计划有效性复核清单", brief["sections"].get("plan_validity_reviews", []))
    add_brief_section(lines, "接近触发区", brief["sections"].get("near_trigger_zone", []))
    add_brief_section(lines, "盘中风险", brief["sections"].get("intraday_risks", []))
    add_brief_section(lines, "收盘前复核事项", brief["sections"].get("before_close_review", []))
    lines.extend(["", "## 数据警告", ""])
    if brief.get("warnings"):
        for warning in brief["warnings"]:
            lines.append(f"- {warning}")
    else:
        lines.append("- 暂无。")
    return "\n".join(lines).rstrip() + "\n"


def add_premarket_section(lines: list[str], title: str, items: list[dict[str, Any]], renderer: Any) -> None:
    lines.extend(["", f"## {title}", ""])
    if not items:
        lines.append("- 暂无。")
        return
    for item in unique_compact_items(items):
        lines.append(renderer(item))
        if title == "今日观察清单":
            continue
        for event in compact_events(item):
            lines.append(f"  - 事件：{event}")


def render_premarket_focus_item(item: dict[str, Any]) -> str:
    if item.get("price_status") == "stale_price" or item.get("data_warnings"):
        return f"- {item['name']}：行情或数据需先更新，今日不参与计划触发判断。"
    nearest = item.get("nearest_plan") or {}
    if nearest and nearest.get("distance_pct") is not None and nearest.get("distance_pct") <= NEAR_LEVEL1_PCT:
        return near_plan_sentence(item, "今日建议重点观察是否继续接近计划区")
    deviation = item.get("position_deviation_pct")
    if deviation is not None and abs(deviation) >= 5:
        return f"- {item['name']}：当前仓位偏离约 {fmt_num(deviation)}%，今日纳入仓位复核。"
    return f"- {item['name']}：存在待复核事项，今日保持观察。"


def render_near_plan_item(item: dict[str, Any]) -> str:
    return near_plan_sentence(item, "今日建议重点观察是否继续接近计划区")


def render_plan_validity_item(item: dict[str, Any]) -> str:
    nearest = item.get("nearest_plan") or {}
    return (
        f"- {item['name']}：昨收约 {fmt_num(item.get('current_price'))}，已明显低于原计划价 "
        f"{fmt_num(nearest.get('trigger_price'))}，偏离约 {fmt_num(nearest.get('distance_pct'))}%，"
        "需人工确认该计划是否仍有效。"
    )


def render_risk_data_item(item: dict[str, Any]) -> str:
    warnings = compact_warnings(item)
    if warnings:
        return f"- {item['name']}：{warnings[0]}"
    deviation = item.get("position_deviation_pct")
    if deviation is not None and abs(deviation) >= 5:
        return f"- {item['name']}：仓位偏离约 {fmt_num(deviation)}%，需要复核目标仓位与持仓状态。"
    return f"- {item['name']}：存在风险或事件事项，今日需要人工复核。"


def render_watch_item(item: dict[str, Any]) -> str:
    nearest = item.get("nearest_plan") or {}
    if item.get("price_status") == "stale_price" or item.get("data_warnings"):
        return f"- {item['name']}：先更新行情或确认标的代码。"
    if nearest and nearest.get("trigger_price") is not None:
        return f"- {item['name']}：观察 {fmt_num(nearest.get('trigger_price'))} 计划区附近变化。"
    return f"- {item['name']}：保持观察。"


def near_plan_sentence(item: dict[str, Any], suffix: str) -> str:
    nearest = item.get("nearest_plan") or {}
    plan_word = "计划"
    if nearest.get("action") == "buy":
        plan_word = "加仓复核价"
    elif nearest.get("action") == "sell":
        plan_word = "减仓复核价"
    elif nearest.get("action") == "risk":
        plan_word = "风险复核价"
    return (
        f"- {item['name']}：昨收约 {fmt_num(item.get('current_price'))}，距离 "
        f"{fmt_num(nearest.get('trigger_price'))} {plan_word}约 {fmt_num(nearest.get('distance_pct'))}%，{suffix}。"
    )


def unique_compact_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    seen: set[str] = set()
    for item in items:
        key = str(item.get("code") or item.get("name") or "")
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def compact_events(item: dict[str, Any]) -> list[str]:
    out = []
    seen: set[str] = set()
    for event in item.get("pending_events", [])[:5]:
        text = str(event.get("title") or event.get("summary") or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out[:3]


def compact_warnings(item: dict[str, Any]) -> list[str]:
    warnings = []
    for warning in item.get("data_warnings", [])[:5]:
        text = str(warning)
        old_date = re.search(r"\d{4}-\d{2}-\d{2}", text)
        if "行情获取失败" in text and old_date:
            text = f"行情获取失败，当前旧价格日期为 {old_date.group(0)}，今日不参与计划触发判断，需先更新价格。"
        elif "价格数据超过" in text:
            continue
        warnings.append(text.rstrip("。") + "。")
    return unique_strings(warnings)


def render_intraday_markdown(brief: dict[str, Any]) -> str:
    summary = brief["summary"]
    ai = brief.get("ai") or {}
    sections = brief.get("sections") or {}
    lines = [
        f"# 每日股票复核简报 - {brief['report_date']} - 盘中简报",
        "",
        "> 仅用于每日人工复核；不构成确定性买卖指令。",
        "",
        "## 今日摘要",
        "",
        str(ai.get("today_summary") or "未配置 OPENAI_API_KEY，已生成离线规则版每日简报。"),
        "",
        "## 总览",
        "",
        f"- 标的数量：{summary['stocks_count']}",
        f"- 可用价格：{summary['with_latest_price']}",
        f"- 已进入计划复核区：{len(sections.get('review_zone', []))}",
        f"- 接近计划区：{len(sections.get('near_plan_zone', []))}",
        f"- 计划有效性复核：{len(sections.get('plan_validity_reviews', []))}",
        f"- 风险或数据提醒：{len(sections.get('risk_and_data', []))}",
        f"- 收盘前重点确认：{len(sections.get('close_focus', []))}",
        f"- 估算总资产 CNY：{fmt_num(summary['estimated_total_assets_cny'])}",
    ]
    add_human_section(lines, "已进入计划复核区", sections.get("review_zone", []), "review_zone")
    add_human_section(lines, "接近计划区", sections.get("near_plan_zone", []), "near_plan")
    add_human_section(lines, "计划有效性复核", sections.get("plan_validity_reviews", []), "plan_validity")
    add_human_section(lines, "风险与数据提醒", sections.get("risk_and_data", []), "risk_data")
    add_human_section(lines, "收盘前重点确认", sections.get("close_focus", [])[:5], "close_focus")
    return "\n".join(lines).rstrip() + "\n"


def add_human_section(lines: list[str], title: str, items: list[dict[str, Any]], section: str) -> None:
    lines.extend(["", f"## {title}", ""])
    unique_items = unique_compact_items(items)
    if not unique_items:
        lines.append("- 暂无。")
        return
    for item in unique_items:
        lines.append(render_human_item(item, "intraday", section))
        for event in compact_events(item):
            lines.append(f"  - 事件：{event}")


def render_human_item(item: dict[str, Any], mode: str, section: str) -> str:
    warnings = compact_warnings(item)
    if section in {"risk_data", "close_focus"} and warnings:
        return f"- {item['name']}：{warnings[0]}"
    nearest = item.get("nearest_plan") or {}
    if section == "review_zone":
        return render_review_zone_item(item, nearest)
    if section == "near_plan":
        return render_near_intraday_item(item, nearest)
    if section == "plan_validity":
        return render_intraday_plan_validity_item(item, nearest)
    if section == "close_focus":
        if nearest and is_normal_review_plan(nearest):
            return render_review_zone_item(item, nearest)
        if nearest and is_intraday_near_plan(nearest):
            return render_near_intraday_item(item, nearest)
        if nearest and is_plan_validity_plan(nearest):
            return render_intraday_plan_validity_item(item, nearest)
        deviation = item.get("position_deviation_pct")
        if deviation is not None and abs(deviation) >= 5:
            return f"- {item['name']}：仓位偏离约 {fmt_num(deviation)}%，收盘前确认是否需要调整复核优先级。"
    return f"- {item['name']}：存在风险或待确认事项，收盘前需要人工复核。"


def render_review_zone_item(item: dict[str, Any], plan: dict[str, Any]) -> str:
    action_text = "计划"
    if plan.get("action") == "buy":
        action_text = "加仓复核区"
    elif plan.get("action") == "sell":
        action_text = "减仓复核区"
    elif plan.get("action") == "risk":
        action_text = "风险复核区"
    return (
        f"- {item['name']}：现价约 {fmt_num(item.get('current_price'))}，已进入 {fmt_num(plan.get('trigger_price'))} "
        f"{action_text}，距离计划价约 {fmt_num(plan.get('distance_pct'))}%。"
    )


def render_near_intraday_item(item: dict[str, Any], plan: dict[str, Any]) -> str:
    return (
        f"- {item['name']}：现价约 {fmt_num(item.get('current_price'))}，距离 {fmt_num(plan.get('trigger_price'))} "
        f"计划价约 {fmt_num(plan.get('distance_pct'))}%，尚未进入复核区。"
    )


def render_intraday_plan_validity_item(item: dict[str, Any], plan: dict[str, Any]) -> str:
    return (
        f"- {item['name']}：现价约 {fmt_num(item.get('current_price'))}，价格已明显越过原计划价 "
        f"{fmt_num(plan.get('trigger_price'))}，偏离约 {fmt_num(plan.get('distance_pct'))}%，需确认计划是否仍有效。"
    )


def render_markdown(brief: dict[str, Any]) -> str:
    if (brief.get("mode") or "premarket") == "intraday":
        return render_intraday_markdown(brief)
    return render_premarket_markdown(brief)


def render_premarket_markdown(brief: dict[str, Any]) -> str:
    summary = brief["summary"]
    sections = brief.get("sections") or {}
    ai = brief.get("ai") or {}
    lines = base_brief_header(brief, "盘前简报", ai)
    add_summary_lines(lines, summary, sections, include_review_zone=False)
    add_readable_section(lines, "今日重点关注", sections.get("today_focus", []), "focus")
    add_readable_section(lines, "接近计划价", sections.get("near_plan_price", []), "near")
    add_readable_section(lines, "计划有效性复核", sections.get("plan_validity_reviews", []), "validity")
    add_readable_section(lines, "风险与数据提醒", sections.get("risk_and_data", []), "risk_data")
    add_readable_section(lines, "今日观察清单", sections.get("watchlist", [])[:6], "watch", include_events=False)
    return "\n".join(lines).rstrip() + "\n"


def render_intraday_markdown(brief: dict[str, Any]) -> str:
    summary = brief["summary"]
    sections = brief.get("sections") or {}
    ai = brief.get("ai") or {}
    lines = base_brief_header(brief, "盘中简报", ai)
    add_summary_lines(lines, summary, sections, include_review_zone=True)
    add_readable_section(lines, "已进入计划复核区", sections.get("review_zone", []), "review_zone")
    add_readable_section(lines, "接近计划区", sections.get("near_plan_zone", []), "near")
    add_readable_section(lines, "计划有效性复核", sections.get("plan_validity_reviews", []), "validity")
    add_readable_section(lines, "风险与数据提醒", sections.get("risk_and_data", []), "risk_data")
    add_readable_section(lines, "收盘前重点确认", sections.get("close_focus", [])[:5], "close_focus")
    return "\n".join(lines).rstrip() + "\n"


def base_brief_header(brief: dict[str, Any], title: str, ai: dict[str, Any]) -> list[str]:
    return [
        f"# 每日股票复核简报 - {brief['report_date']} - {title}",
        "",
        "> 仅用于每日人工复核；不构成确定性买卖指令。",
        "",
        "## 今日摘要",
        "",
        str(ai.get("today_summary") or "未配置 OPENAI_API_KEY，已生成离线规则版每日简报。"),
    ]


def add_summary_lines(lines: list[str], summary: dict[str, Any], sections: dict[str, list[dict[str, Any]]], include_review_zone: bool) -> None:
    lines.extend(
        [
            "",
            "## 总览",
            "",
            f"- 标的数量：{summary['stocks_count']}",
            f"- 每日重点个股：{summary.get('daily_focus_stock_count', 0)}",
            f"- 条件显示 ETF：{summary.get('conditional_etf_count', 0)}",
            f"- 已隐藏低频 ETF：{summary.get('hidden_conditional_count', 0)}",
        ]
    )
    if include_review_zone:
        lines.append(f"- 已进入计划复核区：{len(sections.get('review_zone', []))}")
    lines.extend(
        [
            f"- 接近计划区：{summary.get('body_near_plan_count', 0)}",
            f"- 计划有效性复核：{summary.get('body_plan_validity_count', 0)}",
            f"- 风险或数据提醒：{summary.get('body_risk_data_count', 0)}",
            f"- 估算总资产 CNY：{fmt_num(summary['estimated_total_assets_cny'])}",
        ]
    )


def add_readable_section(
    lines: list[str],
    title: str,
    items: list[dict[str, Any]],
    section: str,
    include_events: bool = True,
) -> None:
    lines.extend(["", f"## {title}", ""])
    unique_items = unique_compact_items(items)
    if not unique_items:
        lines.append("- 暂无。")
        return
    for item in unique_items:
        lines.append(render_readable_item(item, section))
        if include_events:
            for event in readable_events(item):
                lines.append(f"  - 相关事项：{event}")


def render_readable_item(item: dict[str, Any], section: str) -> str:
    warnings = compact_warnings(item)
    if warnings:
        return f"- {item['name']}：{warnings[0]}"
    nearest = item.get("nearest_plan") or {}
    if section in {"review_zone", "close_focus"} and nearest and is_normal_review_plan(nearest):
        return render_review_zone_item(item, nearest)
    if section in {"focus", "watch"} and nearest and is_normal_review_plan(nearest):
        return render_review_zone_item(item, nearest)
    if section in {"near", "focus", "watch", "close_focus"} and nearest and is_near_plan_for_body(item, nearest):
        return render_near_readable_item(item, nearest)
    if section in {"validity", "close_focus"} and nearest and is_plan_validity_plan(nearest):
        return render_validity_readable_item(item, nearest)
    deviation = item.get("position_deviation_pct")
    if deviation is not None and abs(deviation) >= 3:
        return f"- {item['name']}：仓位偏离约 {fmt_num(deviation)}%，需要复核目标仓位与持仓状态。"
    return f"- {item['name']}：存在需要人工确认的事项，今日保持重点观察。"


def render_near_readable_item(item: dict[str, Any], plan: dict[str, Any]) -> str:
    word = "计划价"
    if plan.get("action") == "buy":
        word = "加仓复核价"
    elif plan.get("action") == "sell":
        word = "减仓复核价"
    elif plan.get("action") == "risk":
        word = "风险复核价"
    return (
        f"- {item['name']}：现价约 {fmt_num(item.get('current_price'))}，距离 {fmt_num(plan.get('trigger_price'))} "
        f"{word}约 {fmt_num(plan.get('distance_pct'))}%，今日重点观察。"
    )


def render_review_zone_item(item: dict[str, Any], plan: dict[str, Any]) -> str:
    zone = "计划复核区"
    if plan.get("action") == "buy":
        zone = "加仓复核区"
    elif plan.get("action") == "sell":
        zone = "减仓复核区"
    elif plan.get("action") == "risk":
        zone = "风险复核区"
    return (
        f"- {item['name']}：现价约 {fmt_num(item.get('current_price'))}，已进入 {fmt_num(plan.get('trigger_price'))} "
        f"{zone}，距离计划价约 {fmt_num(plan.get('distance_pct'))}%。"
    )


def render_validity_readable_item(item: dict[str, Any], plan: dict[str, Any]) -> str:
    return (
        f"- {item['name']}：现价约 {fmt_num(item.get('current_price'))}，价格已明显越过原计划价 "
        f"{fmt_num(plan.get('trigger_price'))}，偏离约 {fmt_num(plan.get('distance_pct'))}%，需人工确认计划是否仍有效。"
    )


def readable_events(item: dict[str, Any]) -> list[str]:
    events = []
    for text in compact_events(item):
        clean = sanitize_internal_text(text)
        if clean:
            events.append(clean)
    return unique_strings(events)[:3]


def sanitize_internal_text(text: str) -> str:
    replacements = {
        "add_review": "加仓计划进入人工复核流程",
        "reduce_review": "减仓计划进入人工复核流程",
        "risk_review": "风险事项进入人工复核流程",
        "plan_validity_review": "计划有效性需要人工确认",
        "observe": "观察",
        "review": "人工复核",
        "triggered": "进入复核区",
        "level1": "",
        "level2": "",
    }
    out = str(text)
    for old, new in replacements.items():
        out = out.replace(old, new)
    return re.sub(r"\s+", " ", out).strip(" ：:-")


def generate_openai_summary(brief: dict[str, Any], timeout: float) -> dict[str, Any] | None:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    model = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")
    compact = {
        "report_date": brief["report_date"],
        "mode": brief.get("mode", "premarket"),
        "summary": brief["summary"],
        "sections": brief.get("sections", {}),
        "priority_reviews": brief["priority_reviews"][:10],
        "warnings": brief["warnings"][:20],
        "allowed_actions": sorted(ALLOWED_ACTIONS),
        "constraint": "只能整理、归纳、润色程序已有判断；不得推翻程序判断；不得新增确定性买卖建议。",
    }
    prompt = (
        "你是每日投资复核简报整理助手。只允许基于输入 JSON 中的规则判断做摘要。"
        "如果 mode=premarket，重点整理今日需要关注什么，不判断盘中实时触发。"
        "如果 mode=intraday，重点整理是否已经接近或触发计划。"
        "不得输出买入、卖出、清仓、加仓等确定性指令；只能使用 observe / wait / review / risk_review / reduce_review / add_review 等人工复核提示。"
        "请返回 JSON，字段为 today_summary 字符串、priority_review 字符串数组。输入如下：\n"
        + json.dumps(compact, ensure_ascii=False)
    )
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You summarize existing rule outputs without making new trading decisions."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8", errors="replace"))
        content = payload["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        return {
            "enabled": True,
            "model": model,
            "today_summary": str(parsed.get("today_summary") or ""),
            "priority_review": [str(item) for item in parsed.get("priority_review", []) if str(item).strip()][:8],
            "constraint": "整理程序已有判断，不新增确定性买卖建议。",
        }
    except Exception:
        return None


def stock_key(stock: dict[str, Any]) -> str:
    return str(stock.get("id") or stock.get("code") or stock.get("symbol") or stock.get("name") or "")


def is_cash_row(stock: dict[str, Any]) -> bool:
    return str(stock.get("type") or "").lower() == "cash" or str(stock.get("id") or "") == "cash" or stock.get("theme") == "现金" or stock.get("role") == "现金"


def is_cash_like_values(*values: Any) -> bool:
    for raw in values:
        text = str(raw or "").strip().lower()
        if not text:
            continue
        if text in {"cash", "cny", "hkd", "usd", "现金", "人民币", "港币", "美元"}:
            return True
        if "现金" in text or "cash" in text:
            return True
    return False


def is_cash_row(stock: dict[str, Any]) -> bool:
    return is_cash_like_values(
        stock.get("name") or stock.get("company"),
        stock.get("code") or stock.get("symbol") or stock.get("id"),
        stock.get("type"),
        stock.get("theme"),
        stock.get("role"),
    )


def get_currency(stock: dict[str, Any]) -> str:
    currency = str(stock.get("currency") or "").upper()
    if currency in {"HKD", "CNY"}:
        return currency
    code = normalize_quote_code(stock.get("code") or stock.get("symbol"))
    return "HKD" if code.endswith(".HK") else "CNY"


def fx_rate(state: dict[str, Any]) -> float:
    fx = state.get("fx")
    if isinstance(fx, dict) and number_positive(fx.get("hkdcny")):
        return float(fx["hkdcny"])
    return DEFAULT_HKD_CNY


def event_phase_rank(phase: str) -> int:
    return {"decision": 3, "prepare": 2, "info": 1}.get(phase, 0)


def days_since(value: str) -> int | None:
    try:
        parsed = datetime.fromisoformat(str(value)[:10]).date()
    except ValueError:
        return None
    return (date.today() - parsed).days


def today() -> str:
    return date.today().isoformat()


def number_or_none(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not (number == number) or number in (float("inf"), float("-inf")):
        return None
    return number


def is_number(value: Any) -> bool:
    return number_or_none(value) is not None


def number_positive(value: Any) -> bool:
    number = number_or_none(value)
    return number is not None and number > 0


def first_number(*values: Any) -> float | None:
    for value in values:
        number = number_or_none(value)
        if number is not None:
            return number
    return None


def fmt_num(value: Any) -> str:
    number = number_or_none(value)
    if number is None:
        return "-"
    if abs(number) >= 10000:
        return f"{number:,.0f}"
    return f"{number:,.2f}".rstrip("0").rstrip(".")


def unique_strings(values: list[str]) -> list[str]:
    out = []
    seen = set()
    for value in values:
        text = str(value).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


if __name__ == "__main__":
    raise SystemExit(main())
