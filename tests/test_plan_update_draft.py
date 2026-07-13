from __future__ import annotations

import copy
import unittest
from pathlib import Path

from src.plan_update import build_plan_update_prompt, compare_plan_draft, validate_plan_update_draft


class PlanUpdateDraftTests(unittest.TestCase):
    def setUp(self) -> None:
        self.request = {"request_id": "request-1", "source_decision_id": "decision-1", "symbol": "601138.SS", "task_type": "long_term_logic_review", "request_type": "plan_update", "reason": "支撑位变化", "current_plan_reference": {"symbol": "601138.SS", "active_plan_count": 2}, "requested_changes": ["更新支撑计划"], "created_at": "2026-07-13T09:00:00+08:00"}
        self.outcome = {"decision_id": "decision-1", "source_review_id": "review-1", "symbol": "601138.SS", "task_type": "long_term_logic_review", "outcome_type": "plan_update", "conclusion": "需要更新计划", "created_at": "2026-07-13T08:00:00+08:00"}
        self.stock = {"name": "测试标的", "code": "601138.SS", "shares": 1234, "avgCost": 12.34, "currentPrice": 66, "strategy": {"targetWeight": 10, "maxWeight": 12, "minTradeUnit": 100}, "plans": [{"id": "old-add", "action": "buy", "price": 65, "shares": 100, "status": "active", "note": "旧加仓"}, {"id": "old-sell", "action": "sell", "price": 80, "shares": 100, "status": "active", "note": "旧减仓"}], "longTermLogic": {"logicStatus": "valid"}, "technicalReview": {"finalTechnicalConclusion": "震荡"}}
        self.draft = {"draft_id": "draft-1", "source_request_id": "request-1", "source_decision_id": "decision-1", "symbol": "601138.SS", "draft_status": "draft", "summary": "更新计划", "plan_strategy": "支撑位分档复核", "proposed_plans": [self.plan("old-add", "add_review", 63, 100, 1), self.plan(None, "add_review", 60, None, 2), self.plan(None, "hold_review", 61.5, None, 3), self.plan("old-sell", "reduce_review", 80, 100, 4)], "plans_to_archive": [], "risk_flags": [], "notes": [], "created_at": "2026-07-13T09:30:00+08:00"}

    @staticmethod
    def plan(plan_id, action, price, quantity, priority):
        return {"plan_id": plan_id, "action_type": action, "trigger_price": price, "quantity": quantity, "status": "active", "priority": priority, "reason": "人工复核", "conditions": ["条件成立"], "invalidation_conditions": ["逻辑破坏"], "source": "ai_plan_update_draft", "valid_until": "2026-10-13"}

    def test_valid_draft_passes(self):
        result = validate_plan_update_draft(self.draft, self.request, self.stock)
        self.assertTrue(result["schema_valid"])
        self.assertTrue(result["business_valid"])

    def test_symbol_mismatch_is_rejected(self):
        draft = copy.deepcopy(self.draft); draft["symbol"] = "1810.HK"
        self.assertFalse(validate_plan_update_draft(draft, self.request, self.stock)["business_valid"])

    def test_quantity_must_respect_min_trade_unit(self):
        draft = copy.deepcopy(self.draft); draft["proposed_plans"][0]["quantity"] = 50
        result = validate_plan_update_draft(draft, self.request, self.stock)
        self.assertTrue(any("minTradeUnit" in error for error in result["errors"]))

    def test_invalid_trigger_price_is_rejected(self):
        draft = copy.deepcopy(self.draft); draft["proposed_plans"][0]["trigger_price"] = -1
        self.assertFalse(validate_plan_update_draft(draft, self.request, self.stock)["business_valid"])

    def test_duplicate_action_and_price_is_rejected(self):
        draft = copy.deepcopy(self.draft); draft["proposed_plans"][1]["trigger_price"] = 63
        self.assertTrue(any("duplicate" in error for error in validate_plan_update_draft(draft, self.request, self.stock)["errors"]))

    def test_unknown_archive_plan_is_rejected(self):
        draft = copy.deepcopy(self.draft); draft["plans_to_archive"] = ["not-found"]
        self.assertFalse(validate_plan_update_draft(draft, self.request, self.stock)["business_valid"])

    def test_diff_finds_modified_added_retained_and_archived(self):
        draft = copy.deepcopy(self.draft)
        draft["proposed_plans"] = [draft["proposed_plans"][0], self.plan(None, "hold_review", 61.5, None, 2)]
        draft["plans_to_archive"] = ["old-sell"]
        changes = [row["change"] for row in compare_plan_draft(self.stock["plans"], draft)]
        self.assertIn("修改", changes)
        self.assertIn("新增", changes)
        self.assertIn("归档", changes)
        retained = copy.deepcopy(self.stock["plans"][0]); retained.update({"plan_id": "old-add", "action_type": "buy", "trigger_price": 65, "quantity": 100, "reason": "旧加仓", "status": "active"})
        draft["proposed_plans"] = [retained]
        draft["plans_to_archive"] = ["old-sell"]
        self.assertIn("保留", [row["change"] for row in compare_plan_draft(self.stock["plans"], draft)])
        draft["plans_to_archive"] = []
        draft["plans_to_delete"] = ["old-sell"]
        self.assertIn("删除建议", [row["change"] for row in compare_plan_draft(self.stock["plans"], draft)])

    def test_prompt_contains_plan_position_analysis_and_constraints(self):
        text = build_plan_update_prompt(self.request, self.outcome, {"user_constraints": ["不追高"]}, self.stock, generated_at="2026-07-13T10:00:00+08:00")
        for expected in ("old-add", "1234", "technicalReview", "不追高", "requested_changes", "quantity=null", "minTradeUnit"):
            self.assertIn(expected, text)

    def test_validation_does_not_modify_formal_plans(self):
        before = copy.deepcopy(self.stock)
        validate_plan_update_draft(self.draft, self.request, self.stock)
        self.assertEqual(self.stock, before)

    def test_ui_only_shows_entry_for_plan_update_and_rebinds_actions(self):
        source = Path("src/ui-render.js").read_text(encoding="utf-8")
        self.assertIn("if(!record||record.outcomeType!=='plan_update')return ''", source)
        self.assertIn("生成计划更新Prompt", source)
        self.assertIn("导入计划草案", source)
        self.assertIn("查看计划差异", source)
        self.assertIn("mainEl.querySelectorAll('[data-detail-action]')", source)


if __name__ == "__main__":
    unittest.main()
