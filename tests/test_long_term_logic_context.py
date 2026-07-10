from __future__ import annotations

import json
import unittest

from ai_context.long_term_logic_context import build_long_term_logic_context


class LongTermLogicContextTests(unittest.TestCase):
    def stock(self) -> dict:
        return {
            "id": "s1",
            "code": "601138.SS",
            "name": "工业富联",
            "type": "holding",
            "role": "成长仓",
            "theme": "AI科技",
            "strategy": "growth",
            "shares": 100,
            "avgCost": 60,
            "cash": 1000,
            "longTermLogic": {"updatedAt": "2026-07-01", "summary": "old thesis"},
            "fundamentalReview": {"updatedAt": "2026-07-02", "summary": "fundamental"},
            "valuationReview": {"updatedAt": "2026-07-03", "summary": "valuation"},
            "recentCatalyst": {"updatedAt": "2026-07-04", "summary": "news"},
            "allocationDecision": {"updatedAt": "2026-07-05", "summary": "allocation"},
            "informationCompleteness": {"level": "partial"},
            "dataFreshness": {"price": "fresh"},
        }

    def test_builds_stable_context_from_stock(self) -> None:
        context = build_long_term_logic_context(self.stock())

        self.assertEqual(context["taskName"], "long_term_logic_review")
        self.assertEqual(context["symbol"], "601138.SS")
        self.assertEqual(context["stock"]["name"], "工业富联")
        self.assertIn("fundamentalSummary", context)

    def test_missing_fields_are_listed(self) -> None:
        context = build_long_term_logic_context({"code": "601138.SS", "name": "工业富联"})

        self.assertIn("currentLongTermLogic", context["missingFields"])
        self.assertIn("fundamentalSummary", context["missingFields"])

    def test_based_on_dates_are_extracted(self) -> None:
        context = build_long_term_logic_context(self.stock())

        self.assertEqual(context["basedOn"]["fundamentalUpdatedAt"], "2026-07-02")
        self.assertEqual(context["basedOn"]["valuationUpdatedAt"], "2026-07-03")
        self.assertEqual(context["basedOn"]["newsUpdatedAt"], "2026-07-04")
        self.assertEqual(context["basedOn"]["allocationUpdatedAt"], "2026-07-05")
        self.assertEqual(context["basedOn"]["previousLongTermLogicUpdatedAt"], "2026-07-01")

    def test_context_does_not_include_forbidden_sensitive_fields(self) -> None:
        context_text = json.dumps(build_long_term_logic_context(self.stock()), ensure_ascii=False)

        for forbidden in ["shares", "avgCost", "cash", "tradeHistory", "activePlans"]:
            self.assertNotIn(forbidden, context_text)

    def test_context_is_json_serializable(self) -> None:
        encoded = json.dumps(build_long_term_logic_context(self.stock()), ensure_ascii=False)

        self.assertIn("工业富联", encoded)


if __name__ == "__main__":
    unittest.main()

