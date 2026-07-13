from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime, time, timezone
from typing import Protocol
from zoneinfo import ZoneInfo

import requests

from .symbols import SymbolInfo


SHANGHAI = ZoneInfo("Asia/Shanghai")
HONG_KONG = ZoneInfo("Asia/Hong_Kong")
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
    "Accept": "application/json,text/plain,*/*",
}


@dataclass
class DailyBar:
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float | None
    amount: float | None
    adjustment: str
    price_basis: str
    provider: str
    fetched_at: str
    is_complete_bar: bool

    def to_dict(self) -> dict:
        return asdict(self)


class MarketDataProvider(Protocol):
    name: str

    def fetch_daily(self, symbol: SymbolInfo, start: date, end: date) -> list[DailyBar]: ...


def is_complete_trade_date(value: date, market: str, now: datetime | None = None) -> bool:
    market_tz = HONG_KONG if market == "HK" else SHANGHAI
    local_now = (now or datetime.now(market_tz)).astimezone(market_tz)
    if value < local_now.date():
        return True
    if value > local_now.date() or value.weekday() >= 5:
        return False
    close_time = time(16, 10) if market == "HK" else time(15, 10)
    return local_now.time() >= close_time


class EastMoneyDailyProvider:
    name = "eastmoney"

    def __init__(self, timeout: float = 15.0):
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({**DEFAULT_HEADERS, "Referer": "https://quote.eastmoney.com/"})

    def fetch_daily(self, symbol: SymbolInfo, start: date, end: date) -> list[DailyBar]:
        params = {
            "secid": symbol.eastmoney_secid,
            "klt": "101",
            "fqt": "1",
            "beg": start.strftime("%Y%m%d"),
            "end": end.strftime("%Y%m%d"),
            "fields1": "f1,f2,f3,f4,f5,f6",
            "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
        }
        response = self.session.get("https://push2his.eastmoney.com/api/qt/stock/kline/get", params=params, timeout=self.timeout)
        response.raise_for_status()
        rows = ((response.json().get("data") or {}).get("klines") or [])
        fetched_at = datetime.now(timezone.utc).isoformat()
        result = []
        for raw in rows:
            parts = str(raw).split(",")
            if len(parts) < 7:
                continue
            trade_date = date.fromisoformat(parts[0])
            result.append(DailyBar(parts[0], float(parts[1]), float(parts[3]), float(parts[4]), float(parts[2]), _number(parts[5]), _number(parts[6]), "qfq", "adjusted", self.name, fetched_at, is_complete_trade_date(trade_date, symbol.market)))
        return result


class YahooDailyProvider:
    name = "yahoo"

    def __init__(self, timeout: float = 15.0):
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)

    def fetch_daily(self, symbol: SymbolInfo, start: date, end: date) -> list[DailyBar]:
        period1 = int(datetime.combine(start, time.min, tzinfo=SHANGHAI).timestamp())
        period2 = int(datetime.combine(end, time.max, tzinfo=SHANGHAI).timestamp())
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol.yahoo_symbol}"
        response = self.session.get(url, params={"interval": "1d", "period1": period1, "period2": period2, "events": "history"}, timeout=self.timeout)
        response.raise_for_status()
        chart = response.json().get("chart") or {}
        if chart.get("error"):
            raise RuntimeError(str(chart["error"]))
        result = (chart.get("result") or [None])[0]
        if not result:
            return []
        quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
        adjusted = ((result.get("indicators") or {}).get("adjclose") or [{}])[0].get("adjclose") or []
        fetched_at = datetime.now(timezone.utc).isoformat()
        bars = []
        for index, stamp in enumerate(result.get("timestamp") or []):
            values = {key: _at(quote.get(key), index) for key in ("open", "high", "low", "close", "volume")}
            if any(values[key] is None for key in ("open", "high", "low", "close")):
                continue
            raw_close = float(values["close"])
            adj_close = _at(adjusted, index)
            factor = float(adj_close) / raw_close if adj_close is not None and raw_close else 1.0
            trade_date = datetime.fromtimestamp(stamp, SHANGHAI).date()
            bars.append(DailyBar(trade_date.isoformat(), round(float(values["open"]) * factor, 6), round(float(values["high"]) * factor, 6), round(float(values["low"]) * factor, 6), round(raw_close * factor, 6), _number(values["volume"]), None, "qfq", "adjusted", self.name, fetched_at, is_complete_trade_date(trade_date, symbol.market)))
        return bars


class ProviderChain:
    def __init__(self, providers: list[MarketDataProvider] | None = None):
        self.providers = providers or [EastMoneyDailyProvider(), YahooDailyProvider()]

    def fetch_daily(self, symbol: SymbolInfo, start: date, end: date) -> tuple[list[DailyBar], str, list[str]]:
        errors = []
        for provider in self.providers:
            try:
                bars = provider.fetch_daily(symbol, start, end)
                if bars:
                    return bars, provider.name, errors
                errors.append(f"{provider.name}: no daily bars returned")
            except Exception as exc:  # noqa: BLE001 - provider fallback must continue.
                errors.append(f"{provider.name}: {exc}")
        raise RuntimeError("; ".join(errors) or "all providers failed")


def _at(values: object, index: int):
    return values[index] if isinstance(values, list) and index < len(values) else None


def _number(value):
    if value is None or value == "":
        return None
    return float(value)
