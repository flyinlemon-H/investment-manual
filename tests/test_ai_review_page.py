from __future__ import annotations

import unittest

from scripts.generate_ai_review_page import render_decision_outcome_viewer


class AIReviewPageTests(unittest.TestCase):
    def outcome(self, outcome_type: str) -> dict:
        return {
            "decision_id": f"decision-{outcome_type}",
            "source_review_id": "review-1",
            "symbol": "601138.SS",
            "task_type": "long_term_logic_review",
            "outcome_type": outcome_type,
            "conclusion": "\u7528\u6237\u8ba8\u8bba\u540e\u7684\u7ed3\u8bba",
            "created_at": "2026-07-12T16:00:00+08:00",
        }

    def test_no_change_viewer_shows_no_adjustment(self) -> None:
        html = render_decision_outcome_viewer(self.outcome("no_change"))

        self.assertIn("\u5f53\u524d\u7b56\u7565\u65e0\u9700\u8c03\u6574", html)
        self.assertNotIn("\u67e5\u770b\u8ba1\u5212\u66f4\u65b0\u8bf7\u6c42", html)
        self.assertNotIn("\u8fdb\u5165\u64cd\u4f5c\u5f55\u5165", html)

    def test_plan_update_viewer_shows_plan_update_entry(self) -> None:
        html = render_decision_outcome_viewer(self.outcome("plan_update"))

        self.assertIn("\u9700\u8981\u66f4\u65b0\u8ba1\u5212", html)
        self.assertIn("\u67e5\u770b\u8ba1\u5212\u66f4\u65b0\u8bf7\u6c42", html)
        self.assertNotIn("\u8fdb\u5165\u64cd\u4f5c\u5f55\u5165", html)

    def test_operation_request_viewer_shows_operation_entry(self) -> None:
        html = render_decision_outcome_viewer(self.outcome("operation_request"))

        self.assertIn("\u8fdb\u5165\u64cd\u4f5c\u6d41\u7a0b", html)
        self.assertIn("\u8fdb\u5165\u64cd\u4f5c\u5f55\u5165", html)
        self.assertNotIn("\u67e5\u770b\u8ba1\u5212\u66f4\u65b0\u8bf7\u6c42", html)


if __name__ == "__main__":
    unittest.main()
