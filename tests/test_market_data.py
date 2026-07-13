from __future__ import annotations

import copy
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import date, datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

from src.market_data.provider import DailyBar, ProviderChain, is_complete_trade_date
from src.market_data.symbols import normalize_symbol
from pathlib import Path

from src.market_data.updater import merge_price_history, update_market_data, write_bridge
from scripts import update_daily_kline


def bar(day: str, *, complete: bool = True, provider: str = "test") -> DailyBar:
    return DailyBar(day, 10, 12, 9, 11, 1000, 11000, "qfq", "adjusted", provider, "2026-07-12T08:00:00+00:00", complete)


class StaticProvider:
    def __init__(self, name: str, bars=None, error: str = ""):
        self.name = name
        self.bars = bars or []
        self.error = error

    def fetch_daily(self, symbol, start, end):
        if self.error:
            raise RuntimeError(self.error)
        return self.bars


class MarketDataTests(unittest.TestCase):
    def test_symbol_mapping_supports_a_hk_and_etf(self):
        self.assertEqual(normalize_symbol("601138.SS").eastmoney_secid, "1.601138")
        self.assertEqual(normalize_symbol("1810.HK").yahoo_symbol, "1810.HK")
        self.assertEqual(normalize_symbol("159300.SZ").eastmoney_secid, "0.159300")

    def test_provider_failure_uses_fallback(self):
        chain = ProviderChain([StaticProvider("primary", error="offline"), StaticProvider("fallback", [bar("2026-07-10")])])
        rows, provider, errors = chain.fetch_daily(normalize_symbol("601138.SS"), date(2026, 7, 1), date(2026, 7, 12))
        self.assertEqual(provider, "fallback")
        self.assertEqual(len(rows), 1)
        self.assertIn("primary: offline", errors)

    def test_duplicate_run_does_not_add_duplicate_date(self):
        existing = [bar("2026-07-10").to_dict()]
        merged, added = merge_price_history(existing, [bar("2026-07-10")])
        self.assertEqual(len(merged), 1)
        self.assertEqual(added, 0)

    def test_legacy_history_is_not_mixed_with_qfq_series(self):
        existing = [{"date": "2026-07-09", "close": 10}]
        merged, added = merge_price_history(existing, [bar("2026-07-10")])
        self.assertEqual([row["date"] for row in merged], ["2026-07-10"])
        self.assertEqual(added, 1)
        self.assertTrue(all(row["adjustment"] == "qfq" and row["price_basis"] == "adjusted" for row in merged))

    def test_incomplete_intraday_bar_is_not_complete(self):
        tz = ZoneInfo("Asia/Shanghai")
        now = datetime(2026, 7, 13, 14, 30, tzinfo=tz)
        self.assertFalse(is_complete_trade_date(date(2026, 7, 13), "CN", now))
        self.assertTrue(is_complete_trade_date(date(2026, 7, 10), "CN", now))

    def test_hong_kong_close_uses_hong_kong_timezone(self):
        hk = ZoneInfo("Asia/Hong_Kong")
        self.assertFalse(is_complete_trade_date(date(2026, 7, 13), "HK", datetime(2026, 7, 13, 15, 59, tzinfo=hk)))
        self.assertTrue(is_complete_trade_date(date(2026, 7, 13), "HK", datetime(2026, 7, 13, 16, 11, tzinfo=hk)))

    def test_new_complete_bar_marks_technical_analysis_stale_without_business_changes(self):
        stock = {
            "name": "测试标的", "code": "601138.SS", "type": "holding", "shares": 1234,
            "avgCost": 12.34, "plans": [{"price": 65}], "tradeHistory": [{"id": "trade-1"}],
            "longTermLogic": {"summary": "保持"}, "dataFreshness": {"technicalUpdatedAt": "2026-07-09"},
            "priceHistory": [bar("2026-07-09").to_dict()],
        }
        protected = {key: copy.deepcopy(stock[key]) for key in ("shares", "avgCost", "plans", "tradeHistory", "longTermLogic")}
        state = {"stocks": [stock], "cash": 1000}
        results = update_market_data(state, provider_chain=ProviderChain([StaticProvider("test", [bar("2026-07-10")])]))
        self.assertTrue(results[0]["success"])
        self.assertTrue(stock["marketDataFreshness"]["technical_analysis_stale"])
        self.assertEqual(stock["marketDataFreshness"]["last_trade_date"], "2026-07-10")
        for key, value in protected.items():
            self.assertEqual(stock[key], value)
        self.assertEqual(state["cash"], 1000)

    def test_a_hk_and_etf_each_update_existing_price_history(self):
        stocks = [
            {"name": "A", "code": "601138.SS", "type": "holding", "priceHistory": []},
            {"name": "HK", "code": "1810.HK", "type": "holding", "priceHistory": []},
            {"name": "ETF", "code": "159300.SZ", "type": "etf", "priceHistory": []},
        ]
        results = update_market_data({"stocks": stocks}, provider_chain=ProviderChain([StaticProvider("test", [bar("2026-07-10")])]))
        self.assertEqual(sum(row["success"] for row in results), 3)
        self.assertTrue(all(len(stock["priceHistory"]) == 1 for stock in stocks))
        self.assertTrue(all(stock["priceHistory"][0]["adjustment"] == "qfq" for stock in stocks))

    def test_bridge_contains_only_market_data_projection(self):
        state = {"stocks": [{"code": "601138.SS", "shares": 1234, "plans": [{"price": 65}], "priceHistory": [bar("2026-07-10").to_dict()], "marketDataFreshness": {"kline_status": "current"}, "technicalIndicators": {"ma5": 10}}]}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "bridge.js"
            write_bridge(state, path)
            text = path.read_text(encoding="utf-8")
        self.assertIn("MARKET_DATA_BRIDGE", text)
        self.assertIn("601138.SS", text)
        self.assertNotIn('"shares"', text)
        self.assertNotIn('"plans"', text)

    def test_dry_run_does_not_write_formal_or_bridge(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            formal = root / "latest_export.json"
            bridge = root / "bridge.js"
            original = {"stocks": [{"code": "601138.SS", "priceHistory": [], "shares": 3}]}
            formal.write_text(json.dumps(original), encoding="utf-8")
            bridge.write_text("original bridge", encoding="utf-8")
            def fake_update(state, **kwargs):
                state["stocks"][0]["priceHistory"] = [bar("2026-07-10").to_dict()]
                return [{"symbol": "601138.SS", "success": True, "added": 1, "provider": "test", "current_last_date": "", "latest_trade_date": "2026-07-10", "error": "", "technical_analysis_stale": True, "replaced_legacy_history": True}]
            with patch.object(update_daily_kline, "update_market_data", side_effect=fake_update):
                code = update_daily_kline.main(["--all", "--dry-run", "--input", str(formal), "--bridge", str(bridge)])
            self.assertEqual(code, 0)
            self.assertEqual(json.loads(formal.read_text(encoding="utf-8")), original)
            self.assertEqual(bridge.read_text(encoding="utf-8"), "original bridge")
            self.assertFalse((root / "backups").exists())

    def test_backup_and_atomic_write_preserve_valid_json(self):
        with tempfile.TemporaryDirectory() as folder:
            formal = Path(folder) / "latest_export.json"
            original = {"stocks": [{"code": "601138.SS", "shares": 3}]}
            updated = {"stocks": [{"code": "601138.SS", "shares": 3, "priceHistory": [bar("2026-07-10").to_dict()]}]}
            formal.write_text(json.dumps(original), encoding="utf-8")
            backup = update_daily_kline._create_backup(formal, datetime(2026, 7, 13, 18, 0, 0))
            update_daily_kline._atomic_write_json(formal, updated)
            self.assertEqual(json.loads(backup.read_text(encoding="utf-8")), original)
            self.assertEqual(json.loads(formal.read_text(encoding="utf-8")), updated)
            self.assertFalse(formal.with_suffix(".json.tmp").exists())

    def test_atomic_write_failure_keeps_original_and_removes_temp(self):
        with tempfile.TemporaryDirectory() as folder:
            formal = Path(folder) / "latest_export.json"
            original = {"stocks": [{"code": "601138.SS"}]}
            formal.write_text(json.dumps(original), encoding="utf-8")
            with patch.object(update_daily_kline.os, "replace", side_effect=OSError("replace failed")):
                with self.assertRaises(OSError):
                    update_daily_kline._atomic_write_json(formal, {"stocks": []})
            self.assertEqual(json.loads(formal.read_text(encoding="utf-8")), original)
            self.assertFalse(formal.with_suffix(".json.tmp").exists())

    def test_formal_write_precedes_bridge_refresh(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            formal = root / "latest_export.json"
            bridge = root / "bridge.js"
            formal.write_text(json.dumps({"stocks": [{"code": "601138.SS"}]}), encoding="utf-8")
            order = []
            result = [{"symbol": "601138.SS", "success": True, "added": 0, "provider": "test", "current_last_date": "2026-07-10", "latest_trade_date": "2026-07-10", "error": "", "technical_analysis_stale": False, "replaced_legacy_history": False}]
            with patch.object(update_daily_kline, "update_market_data", return_value=result), patch.object(update_daily_kline, "_atomic_write_json", side_effect=lambda path, state: order.append("formal")), patch.object(update_daily_kline, "write_bridge", side_effect=lambda state, path: order.append("bridge")):
                code = update_daily_kline.main(["--all", "--input", str(formal), "--bridge", str(bridge)])
            self.assertEqual(code, 0)
            self.assertEqual(order, ["formal", "bridge"])


if __name__ == "__main__":
    unittest.main()
