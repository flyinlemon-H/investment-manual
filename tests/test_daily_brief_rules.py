import unittest

from scripts.generate_daily_brief import (
    QuoteResult,
    build_brief,
    build_stock_row,
    is_cash_row,
    render_markdown,
)


class DailyBriefRuleTests(unittest.TestCase):
    def row(self, price, trigger, action="buy", quote_ok=True, updated_at="2026-07-08"):
        stock = {
            "id": "demo",
            "name": "Demo",
            "code": "000001.SZ",
            "shares": 100,
            "targetPct": 10,
            "plans": [{"id": "p1", "action": action, "price": trigger}],
            "currentPrice": price,
            "priceUpdatedAt": updated_at,
        }
        quote = QuoteResult(price if quote_ok else None, None, "test" if quote_ok else "failed", "2026-07-08" if quote_ok else "", [] if quote_ok else ["failed"])
        return build_stock_row(stock, quote, 1, 10000, {}, "intraday")

    def stock(self, stock_id, name, code, price, trigger, action="buy", stock_type="stock", target_pct=10):
        return {
            "id": stock_id,
            "name": name,
            "code": code,
            "type": stock_type,
            "shares": 100,
            "targetPct": target_pct,
            "currentPrice": price,
            "priceUpdatedAt": "2026-07-10",
            "plans": [{"id": "p1", "action": action, "price": trigger}],
        }

    def brief(self, stocks, mode="premarket"):
        quotes = {stock["id"]: QuoteResult(stock["currentPrice"], None, "test", "2026-07-10", []) for stock in stocks}
        return build_brief({}, stocks, quotes, "2026-07-10", "test", [], mode)

    def visible_names(self, brief):
        names = []
        for key, items in brief["sections"].items():
            if key == "hidden_conditional":
                continue
            for item in items:
                names.append(item["name"])
        return names

    def test_buy_trigger_direction(self):
        row = self.row(5.13, 5.4, "buy")
        self.assertEqual(row["plans"][0]["stage"], "triggered")
        self.assertEqual(row["review_action"], "add_review")

    def test_deep_below_buy_is_flagged(self):
        row = self.row(1.75, 2.5, "buy")
        self.assertEqual(row["plans"][0]["stage"], "plan_validity_review")
        self.assertEqual(row["plans"][0]["flag"], "stale_plan_or_deep_below_plan")
        self.assertEqual(row["review_action"], "plan_validity_review")
        self.assertNotEqual(row["review_action"], "add_review")

    def test_sell_trigger_direction(self):
        row = self.row(1.29, 1.2, "sell")
        self.assertEqual(row["plans"][0]["stage"], "triggered")
        self.assertEqual(row["review_action"], "reduce_review")

    def test_near_threshold_is_three_percent(self):
        near = self.row(5.5, 5.4, "buy")
        far = self.row(5.6, 5.4, "buy")
        self.assertIn(near["plans"][0]["stage"], {"level1", "level2"})
        self.assertEqual(far["plans"][0]["stage"], "none")

    def test_failed_quote_stale_local_price_does_not_trigger(self):
        row = self.row(5.13, 5.4, "buy", quote_ok=False, updated_at="2026-06-11")
        self.assertEqual(row["price"]["status"], "stale_price")
        self.assertEqual(row["plans"][0]["stage"], "no_valid_price")
        self.assertNotEqual(row["review_action"], "add_review")

    def test_cash_has_no_price_warnings_or_plan_trigger(self):
        stock = {"id": "cash", "name": "现金(手动维护)", "type": "cash", "currentValue": 1000, "targetPct": 10}
        self.assertTrue(is_cash_row(stock))
        row = build_stock_row(stock, QuoteResult(None, None, "cash-row", "", []), 1, 1000, {}, "intraday")
        self.assertEqual(row["plans"], [])
        self.assertEqual(row["data_warnings"], [])


    def test_premarket_sections_are_deduped_and_focus_limited(self):
        stocks = []
        quotes = {}
        for index in range(7):
            stock = {
                "id": f"s{index}",
                "name": f"Stock{index}",
                "code": f"00000{index}.SZ",
                "shares": 100,
                "targetPct": 10,
                "currentPrice": 10,
                "priceUpdatedAt": "2026-07-09",
                "plans": [{"id": "p1", "action": "buy", "price": 10.2}],
                "events": [{"id": "e1", "phase": "decision", "title": "same stock event"}],
            }
            stocks.append(stock)
            quotes[stock["id"]] = QuoteResult(10, None, "test", "2026-07-09", [])
        stocks[0]["riskState"] = [{"id": "r1", "phase": "decision", "summary": "risk"}]
        stocks[0]["targetPct"] = 50
        brief = build_brief({}, stocks, quotes, "2026-07-09", "test", [], "premarket")
        self.assertLessEqual(len(brief["sections"]["today_focus"]), 5)
        risk_names = [item["name"] for item in brief["sections"]["risk_and_data"]]
        self.assertEqual(len(risk_names), len(set(risk_names)))

    def test_premarket_output_hides_internal_fields(self):
        stock = {
            "id": "near",
            "name": "NearStock",
            "code": "000001.SZ",
            "shares": 100,
            "targetPct": 10,
            "currentPrice": 10,
            "priceUpdatedAt": "2026-07-09",
            "plans": [{"id": "p1", "action": "buy", "price": 10.2}],
        }
        brief = build_brief({}, [stock], {"near": QuoteResult(10, None, "test", "2026-07-09", [])}, "2026-07-09", "test", [], "premarket")
        text = render_markdown(brief)
        for forbidden in ["triggered", "stale_price", "near_trigger_zone", "risk_review", "level1", "level2", "direction_triggered"]:
            self.assertNotIn(forbidden, text)

    def test_premarket_near_plan_only_within_three_percent(self):
        near = {
            "id": "near",
            "name": "NearStock",
            "code": "000001.SZ",
            "shares": 100,
            "targetPct": 10,
            "currentPrice": 10,
            "priceUpdatedAt": "2026-07-09",
            "plans": [{"id": "p1", "action": "buy", "price": 10.2}],
        }
        far = {
            "id": "far",
            "name": "FarStock",
            "code": "000002.SZ",
            "shares": 100,
            "targetPct": 10,
            "currentPrice": 10,
            "priceUpdatedAt": "2026-07-09",
            "plans": [{"id": "p1", "action": "buy", "price": 11}],
        }
        brief = build_brief(
            {},
            [near, far],
            {
                "near": QuoteResult(10, None, "test", "2026-07-09", []),
                "far": QuoteResult(10, None, "test", "2026-07-09", []),
            },
            "2026-07-09",
            "test",
            [],
            "premarket",
        )
        names = [item["name"] for item in brief["sections"]["near_plan_price"]]
        self.assertIn("NearStock", names)
        self.assertNotIn("FarStock", names)

    def test_intraday_output_hides_internal_fields_and_old_risk_section(self):
        stock = {
            "id": "buy",
            "name": "BuyStock",
            "code": "000001.SZ",
            "shares": 100,
            "targetPct": 10,
            "currentPrice": 10,
            "priceUpdatedAt": "2026-07-09",
            "plans": [{"id": "p1", "action": "buy", "price": 10.2}],
        }
        brief = build_brief({}, [stock], {"buy": QuoteResult(10, None, "test", "2026-07-09", [])}, "2026-07-09", "test", [], "intraday")
        text = render_markdown(brief)
        self.assertNotIn("## 盘中风险", text)
        for forbidden in [
            "add_review",
            "reduce_review",
            "risk_review",
            "plan_validity_review",
            "triggered",
            "direction_triggered",
            "level1",
            "level2",
            "none",
            "near_trigger_zone",
            "far_from_plan",
            "stale_price",
            "invalid_price",
            "no_valid_price",
        ]:
            self.assertNotIn(forbidden, text)

    def test_intraday_close_focus_is_limited_to_five(self):
        stocks = []
        quotes = {}
        for index in range(7):
            stock = {
                "id": f"focus{index}",
                "name": f"Focus{index}",
                "code": f"00001{index}.SZ",
                "shares": 100,
                "targetPct": 10,
                "currentPrice": 10,
                "priceUpdatedAt": "2026-07-09",
                "plans": [{"id": "p1", "action": "buy", "price": 10.2}],
            }
            stocks.append(stock)
            quotes[stock["id"]] = QuoteResult(10, None, "test", "2026-07-09", [])
        brief = build_brief({}, stocks, quotes, "2026-07-09", "test", [], "intraday")
        self.assertLessEqual(len(brief["sections"]["close_focus"]), 5)

    def test_intraday_risk_data_dedupes_stale_red_etf(self):
        stock = {
            "id": "red",
            "name": "红利ETF",
            "code": "512890.SS",
            "shares": 100,
            "targetPct": 10,
            "currentPrice": 1.5,
            "priceUpdatedAt": "2026-06-11",
            "plans": [{"id": "p1", "action": "buy", "price": 1.5}],
        }
        brief = build_brief({}, [stock], {"red": QuoteResult(None, None, "failed", "", ["failed"])}, "2026-07-09", "test", [], "intraday")
        text = render_markdown(brief)
        risk_section = text.split("## 风险与数据提醒", 1)[1].split("## 收盘前重点确认", 1)[0]
        self.assertEqual(risk_section.count("红利ETF"), 1)

    def test_intraday_sell_far_beyond_plan_goes_to_validity_review(self):
        stock = {
            "id": "sell",
            "name": "SellStock",
            "code": "000002.SZ",
            "shares": 100,
            "targetPct": 10,
            "currentPrice": 1.29,
            "priceUpdatedAt": "2026-07-09",
            "plans": [{"id": "p1", "action": "sell", "price": 1.2}],
        }
        brief = build_brief({}, [stock], {"sell": QuoteResult(1.29, None, "test", "2026-07-09", [])}, "2026-07-09", "test", [], "intraday")
        review_names = [item["name"] for item in brief["sections"]["review_zone"]]
        validity_names = [item["name"] for item in brief["sections"]["plan_validity_reviews"]]
        self.assertNotIn("SellStock", review_names)
        self.assertIn("SellStock", validity_names)

    def test_plain_etf_without_signal_is_hidden_from_body(self):
        etf = self.stock("etf", "PlainETF", "510300.SS", 10, 12, "buy", "etf")
        brief = self.brief([etf], "premarket")
        self.assertNotIn("PlainETF", self.visible_names(brief))
        self.assertIn("PlainETF", [item["name"] for item in brief["sections"]["hidden_conditional"]])

    def test_etf_near_two_percent_can_enter_near_plan_zone(self):
        etf = self.stock("etf", "NearETF", "510300.SS", 10.15, 10, "buy", "etf")
        brief = self.brief([etf], "premarket")
        self.assertIn("NearETF", [item["name"] for item in brief["sections"]["near_plan_price"]])

    def test_etf_position_deviation_can_enter_risk_data(self):
        etf = self.stock("etf", "DeviationETF", "510300.SS", 10, 9, "buy", "etf", target_pct=106)
        brief = self.brief([etf], "premarket")
        self.assertIn("DeviationETF", [item["name"] for item in brief["sections"]["risk_and_data"]])

    def test_etf_deep_old_buy_plan_is_hidden_from_validity_review(self):
        etf = self.stock("etf", "OldPlanETF", "512400.SS", 1.75, 2.5, "buy", "etf")
        brief = self.brief([etf], "premarket")
        self.assertNotIn("OldPlanETF", [item["name"] for item in brief["sections"]["plan_validity_reviews"]])
        self.assertIn("OldPlanETF", [item["name"] for item in brief["sections"]["hidden_conditional"]])

    def test_stocks_sort_before_non_forced_etf_focus(self):
        stock = self.stock("stock", "DailyStock", "000001.SZ", 10.15, 10, "buy", "stock")
        etf = self.stock("etf", "NearETF", "510300.SS", 10.15, 10, "buy", "etf")
        brief = self.brief([etf, stock], "premarket")
        self.assertEqual(brief["sections"]["today_focus"][0]["name"], "DailyStock")

    def test_watchlist_is_limited_to_six(self):
        stocks = [self.stock(f"s{i}", f"Stock{i}", f"0000{i}.SZ", 10.15, 10, "buy", "stock") for i in range(8)]
        brief = self.brief(stocks, "premarket")
        self.assertLessEqual(len(brief["sections"]["watchlist"]), 6)

    def test_summary_counts_match_body_sections(self):
        stock = self.stock("stock", "DailyStock", "000001.SZ", 10.15, 10, "buy", "stock")
        etf = self.stock("etf", "NearETF", "510300.SS", 10.15, 10, "buy", "etf")
        hidden = self.stock("hidden", "HiddenETF", "512400.SS", 1.75, 2.5, "buy", "etf")
        brief = self.brief([stock, etf, hidden], "premarket")
        self.assertEqual(brief["summary"]["body_near_plan_count"], len(brief["sections"]["near_plan_price"]))
        self.assertEqual(brief["summary"]["body_plan_validity_count"], len(brief["sections"]["plan_validity_reviews"]))
        self.assertEqual(brief["summary"]["body_risk_data_count"], len(brief["sections"]["risk_and_data"]))
        self.assertEqual(brief["summary"]["hidden_conditional_count"], len(brief["sections"]["hidden_conditional"]))

    def test_body_hides_common_internal_enums(self):
        stock = self.stock("stock", "DailyStock", "000001.SZ", 10, 10.2, "buy", "stock")
        stock["events"] = [{"id": "e1", "phase": "decision", "title": "add_review 10.2 review observe risk_review"}]
        brief = self.brief([stock], "intraday")
        text = render_markdown(brief)
        for forbidden in ["add_review", "risk_review", "observe", " review ", "level1", "level2", "triggered", "stale_plan_or_deep_below_plan"]:
            self.assertNotIn(forbidden, text)

    def test_low_frequency_named_etfs_do_not_default_into_body(self):
        consume = self.stock("consume", "消费ETF", "159928.SZ", 0.62, 1.25, "buy", "etf")
        metal = self.stock("metal", "有色ETF", "512400.SS", 1.75, 2.5, "buy", "etf")
        brief = self.brief([consume, metal], "premarket")
        names = self.visible_names(brief)
        self.assertNotIn("消费ETF", names)
        self.assertNotIn("有色ETF", names)


if __name__ == "__main__":
    unittest.main()
