from __future__ import annotations

import json
import math
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .provider import DailyBar, ProviderChain
from .symbols import normalize_symbol


def update_market_data(state: dict[str, Any], *, symbols: set[str] | None = None, start: date | None = None, end: date | None = None, provider_chain: ProviderChain | None = None) -> list[dict[str, Any]]:
    chain = provider_chain or ProviderChain()
    results = []
    for stock in state.get("stocks") or []:
        code = str(stock.get("code") or stock.get("symbol") or "").strip().upper()
        if not code or stock.get("role") == "现金" or stock.get("theme") == "现金":
            continue
        if symbols and code not in symbols:
            continue
        result = {"symbol": code, "name": stock.get("name") or code, "success": False, "added": 0, "provider": "", "current_last_date": "", "latest_trade_date": "", "error": "", "technical_analysis_stale": False, "replaced_legacy_history": False}
        try:
            info = normalize_symbol(code)
            existing = stock.get("priceHistory") if isinstance(stock.get("priceHistory"), list) else []
            latest = max((str(row.get("date") or "") for row in existing if isinstance(row, dict)), default="")
            has_legacy_basis = any(isinstance(row, dict) and row.get("date") and row.get("adjustment") not in {"qfq"} for row in existing)
            result["current_last_date"] = latest
            result["replaced_legacy_history"] = has_legacy_basis
            fetch_start = start or (date.today() - timedelta(days=550) if has_legacy_basis or not latest else date.fromisoformat(latest) - timedelta(days=7))
            fetch_end = end or date.today()
            bars, provider, provider_errors = chain.fetch_daily(info, fetch_start, fetch_end)
            merged, added = merge_price_history(existing, bars)
            stock["priceHistory"] = merged
            complete = [row for row in merged if row.get("is_complete_bar")]
            latest_complete = complete[-1] if complete else None
            indicators = calculate_indicators(complete)
            stock["technicalIndicators"] = indicators
            technical_date = technical_analysis_date(stock)
            stale = bool(latest_complete and (not technical_date or latest_complete["date"] > technical_date))
            freshness = {
                "last_trade_date": latest_complete["date"] if latest_complete else "",
                "fetched_at": bars[-1].fetched_at if bars else datetime.now(timezone.utc).isoformat(),
                "provider": provider,
                "is_complete_bar": bool(latest_complete),
                "kline_status": "current" if latest_complete else "stale",
                "technical_analysis_updated_at": technical_date,
                "technical_analysis_stale": stale,
                "provider_errors": provider_errors,
            }
            stock["marketDataFreshness"] = freshness
            result.update(success=True, added=added, provider=provider, latest_trade_date=freshness["last_trade_date"], technical_analysis_stale=stale)
        except Exception as exc:  # noqa: BLE001 - continue updating other symbols.
            stock["marketDataFreshness"] = {**(stock.get("marketDataFreshness") or {}), "fetched_at": datetime.now(timezone.utc).isoformat(), "kline_status": "failed", "technical_analysis_stale": True, "error": str(exc)}
            result["error"] = str(exc)
        results.append(result)
    return results


def merge_price_history(existing: list[dict], bars: list[DailyBar]) -> tuple[list[dict], int]:
    by_date = {str(row.get("date")): dict(row) for row in existing if isinstance(row, dict) and row.get("date")}
    if bars and all(bar.adjustment == "qfq" and bar.price_basis == "adjusted" for bar in bars):
        by_date = {key: row for key, row in by_date.items() if row.get("adjustment") == "qfq" and row.get("price_basis") == "adjusted"}
    before = set(by_date)
    for bar in bars:
        row = bar.to_dict()
        old = by_date.get(bar.date)
        if old and not row["is_complete_bar"] and old.get("is_complete_bar"):
            continue
        by_date[bar.date] = {**(old or {}), **row}
    return [by_date[key] for key in sorted(by_date)], len(set(by_date) - before)


def technical_analysis_date(stock: dict[str, Any]) -> str:
    review = stock.get("technicalReview") or {}
    short = review.get("shortTermTechnical") or {}
    freshness = stock.get("dataFreshness") or {}
    values = [short.get("priceUpdatedAt"), review.get("updatedAt"), freshness.get("technicalUpdatedAt")]
    return max((str(value)[:10] for value in values if value), default="")


def calculate_indicators(rows: list[dict]) -> dict[str, Any]:
    closes = [float(row["close"]) for row in rows if _finite(row.get("close"))]
    volumes = [float(row.get("volume") or 0) for row in rows if _finite(row.get("close"))]
    def ma(window: int):
        return round(sum(closes[-window:]) / window, 6) if len(closes) >= window else None
    ema12 = _ema(closes, 12)
    ema26 = _ema(closes, 26)
    dif = [a - b for a, b in zip(ema12[-len(ema26):], ema26)] if ema26 else []
    dea = _ema(dif, 9)
    macd = (dif[-1] - dea[-1]) * 2 if dif and dea else None
    recent_volume = sum(volumes[-5:]) / 5 if len(volumes) >= 5 else None
    prior_volume = sum(volumes[-10:-5]) / 5 if len(volumes) >= 10 else None
    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "last_trade_date": rows[-1]["date"] if rows else "",
        "ma5": ma(5), "ma10": ma(10), "ma20": ma(20), "ma60": ma(60),
        "macd": {"dif": round(dif[-1], 6) if dif else None, "dea": round(dea[-1], 6) if dea else None, "histogram": round(macd, 6) if macd is not None else None},
        "volume_change": {"recent_5d_average": round(recent_volume, 2) if recent_volume is not None else None, "previous_5d_average": round(prior_volume, 2) if prior_volume is not None else None, "change_pct": round((recent_volume / prior_volume - 1) * 100, 2) if recent_volume is not None and prior_volume else None},
    }


def write_bridge(state: dict[str, Any], path: Path) -> None:
    rows = []
    for stock in state.get("stocks") or []:
        code = stock.get("code") or stock.get("symbol")
        if code and (stock.get("priceHistory") or stock.get("marketDataFreshness")):
            rows.append({"symbol": code, "priceHistory": stock.get("priceHistory") or [], "marketDataFreshness": stock.get("marketDataFreshness") or {}, "technicalIndicators": stock.get("technicalIndicators") or {}})
    payload = {"generatedAt": datetime.now(timezone.utc).isoformat(), "stocks": rows}
    path.parent.mkdir(parents=True, exist_ok=True)
    content = "window.MARKET_DATA_BRIDGE = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
    temp = path.with_suffix(path.suffix + ".tmp")
    try:
        with temp.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
            handle.flush()
            import os
            os.fsync(handle.fileno())
        if not temp.read_text(encoding="utf-8").startswith("window.MARKET_DATA_BRIDGE = {"):
            raise ValueError("bridge validation failed")
        temp.replace(path)
    except Exception:
        temp.unlink(missing_ok=True)
        raise


def _ema(values: list[float], window: int) -> list[float]:
    if not values:
        return []
    factor = 2 / (window + 1)
    out = [values[0]]
    for value in values[1:]:
        out.append(value * factor + out[-1] * (1 - factor))
    return out


def _finite(value: object) -> bool:
    try:
        return math.isfinite(float(value)) and float(value) > 0
    except (TypeError, ValueError):
        return False
