from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from ai_tasks.runner import create_mock_provider_registry, run_ai_task
from ai_tasks.registry import create_default_task_registry
from src.decision.decision_integration import (
    create_discussion_result,
    decision_outcome_to_operation_request,
    decision_outcome_to_plan_update_request,
    discussion_result_to_decision_outcome,
)
from src.decision.decision_schema import (
    validate_decision_result,
    validate_discussion_result,
    validate_operation_request,
    validate_plan_update_request,
)


class DecisionIntegrationTests(unittest.TestCase):
    def stock(self) -> dict:
        return {
            "id": "s1",
            "code": "601138.SS",
            "name": "\u5de5\u4e1a\u5bcc\u8054",
            "type": "holding",
            "shares": 1000,
            "avgCost": 55.5,
            "longTermLogic": {"updatedAt": "2026-07-09", "summary": "old thesis"},
        }

    def test_discussion_result_schema_accepts_required_fields(self) -> None:
        result = create_discussion_result(
            discussion_id="discussion-1",
            source_review_id="review-1",
            symbol="601138.SS",
            final_conclusion="\u957f\u671f\u903b\u8f91\u4ecd\u7136\u6709\u6548\uff0c\u6682\u4e0d\u9700\u8981\u6539\u53d8\u3002",
            user_constraints=["\u4e0d\u81ea\u52a8\u4ea4\u6613"],
            change_required=False,
            created_at="2026-07-12T16:00:00+08:00",
        )

        validate_discussion_result(result)

    def test_discussion_result_to_no_change_decision_outcome(self) -> None:
        discussion = create_discussion_result(
            discussion_id="discussion-1",
            source_review_id="review-1",
            symbol="601138.SS",
            final_conclusion="\u7ee7\u7eed\u89c2\u5bdf\uff0c\u6682\u4e0d\u8c03\u6574\u8ba1\u5212\u3002",
            user_constraints=["\u4e0d\u81ea\u52a8\u4ea4\u6613"],
            change_required=False,
            created_at="2026-07-12T16:00:00+08:00",
        )

        outcome = discussion_result_to_decision_outcome(
            discussion,
            task_type="long_term_logic_review",
            created_at="2026-07-12T16:01:00+08:00",
        )

        self.assertEqual(outcome["outcome_type"], "no_change")
        self.assertEqual(outcome["source_review_id"], "review-1")
        self.assertEqual(outcome["symbol"], "601138.SS")
        validate_decision_result(outcome)

    def test_discussion_result_to_plan_update_decision_outcome(self) -> None:
        discussion = create_discussion_result(
            discussion_id="discussion-2",
            source_review_id="review-2",
            symbol="601138.SS",
            final_conclusion="\u9700\u8981\u5237\u65b0\u8ba1\u5212\uff0c\u4f46\u4e0d\u8fdb\u884c\u4ea4\u6613\u6267\u884c\u3002",
            user_constraints=[],
            change_required=True,
            created_at="2026-07-12T16:00:00+08:00",
        )

        outcome = discussion_result_to_decision_outcome(discussion, task_type="long_term_logic_review")

        self.assertEqual(outcome["outcome_type"], "plan_update")
        validate_decision_result(outcome)

    def test_discussion_result_to_operation_request_decision_outcome(self) -> None:
        discussion = create_discussion_result(
            discussion_id="discussion-3",
            source_review_id="review-3",
            symbol="601138.SS",
            final_conclusion="\u9700\u8981\u8bb0\u5f55\u64cd\u4f5c\u7ed3\u679c\uff0c\u4e0d\u7531\u7a0b\u5e8f\u6267\u884c\u4ea4\u6613\u3002",
            user_constraints=["record_operation_result"],
            change_required=True,
            created_at="2026-07-12T16:00:00+08:00",
        )

        outcome = discussion_result_to_decision_outcome(discussion, task_type="long_term_logic_review")

        self.assertEqual(outcome["outcome_type"], "operation_request")
        validate_decision_result(outcome)

    def test_plan_update_outcome_generates_plan_update_request(self) -> None:
        discussion = create_discussion_result(
            discussion_id="discussion-plan-update",
            source_review_id="review-plan-update",
            symbol="601138.SS",
            final_conclusion="\u9700\u8981\u5237\u65b0\u8ba1\u5212\uff0c\u4f46\u4e0d\u6267\u884c\u4ea4\u6613\u3002",
            user_constraints=["\u4ec5\u751f\u6210\u8ba1\u5212\u66f4\u65b0\u8bf7\u6c42"],
            change_required=True,
            created_at="2026-07-12T16:00:00+08:00",
        )
        outcome = discussion_result_to_decision_outcome(
            discussion,
            task_type="long_term_logic_review",
            created_at="2026-07-12T16:01:00+08:00",
        )

        request = decision_outcome_to_plan_update_request(
            outcome,
            current_plan_reference={"symbol": "601138.SS", "active_plan_count": 2},
            requested_changes=["\u57fa\u4e8e\u957f\u671f\u903b\u8f91\u590d\u6838\u5237\u65b0\u8ba1\u5212"],
            created_at="2026-07-12T16:02:00+08:00",
        )

        self.assertIsNotNone(request)
        assert request is not None
        self.assertEqual(request["request_type"], "plan_update")
        self.assertEqual(request["source_decision_id"], outcome["decision_id"])
        self.assertEqual(request["symbol"], "601138.SS")
        self.assertEqual(request["task_type"], "long_term_logic_review")
        self.assertEqual(request["current_plan_reference"]["active_plan_count"], 2)
        validate_plan_update_request(request)

    def test_no_change_outcome_does_not_generate_plan_update_request(self) -> None:
        discussion = create_discussion_result(
            discussion_id="discussion-no-change",
            source_review_id="review-no-change",
            symbol="601138.SS",
            final_conclusion="\u7ee7\u7eed\u89c2\u5bdf\uff0c\u65e0\u9700\u6539\u53d8\u8ba1\u5212\u3002",
            user_constraints=[],
            change_required=False,
            created_at="2026-07-12T16:00:00+08:00",
        )
        outcome = discussion_result_to_decision_outcome(discussion, task_type="long_term_logic_review")

        request = decision_outcome_to_plan_update_request(outcome)

        self.assertIsNone(request)

    def test_operation_request_outcome_does_not_generate_plan_update_request(self) -> None:
        discussion = create_discussion_result(
            discussion_id="discussion-operation",
            source_review_id="review-operation",
            symbol="601138.SS",
            final_conclusion="\u9700\u8981\u8bb0\u5f55\u64cd\u4f5c\u7ed3\u679c\uff0c\u4e0d\u4fee\u6539\u8ba1\u5212\u3002",
            user_constraints=["record_operation_result"],
            change_required=True,
            created_at="2026-07-12T16:00:00+08:00",
        )
        outcome = discussion_result_to_decision_outcome(discussion, task_type="long_term_logic_review")

        request = decision_outcome_to_plan_update_request(outcome)

        self.assertIsNone(request)

    def test_operation_request_outcome_generates_operation_request(self) -> None:
        discussion = create_discussion_result(
            discussion_id="discussion-operation-request",
            source_review_id="review-operation-request",
            symbol="601138.SS",
            final_conclusion="\u9700\u8981\u8bb0\u5f55\u64cd\u4f5c\u7ed3\u679c\uff0c\u4e0d\u7531\u7a0b\u5e8f\u6267\u884c\u4ea4\u6613\u3002",
            user_constraints=["record_operation_result"],
            change_required=True,
            created_at="2026-07-12T16:00:00+08:00",
        )
        outcome = discussion_result_to_decision_outcome(
            discussion,
            task_type="long_term_logic_review",
            created_at="2026-07-12T16:01:00+08:00",
        )

        request = decision_outcome_to_operation_request(
            outcome,
            operation_type="record_operation_result",
            created_at="2026-07-12T16:02:00+08:00",
        )

        self.assertIsNotNone(request)
        assert request is not None
        self.assertEqual(request["operation_type"], "record_operation_result")
        self.assertEqual(request["source_decision_id"], outcome["decision_id"])
        self.assertEqual(request["symbol"], "601138.SS")
        self.assertEqual(request["task_type"], "long_term_logic_review")
        validate_operation_request(request)

    def test_no_change_outcome_does_not_generate_operation_request(self) -> None:
        discussion = create_discussion_result(
            discussion_id="discussion-no-operation",
            source_review_id="review-no-operation",
            symbol="601138.SS",
            final_conclusion="\u7ee7\u7eed\u89c2\u5bdf\uff0c\u65e0\u9700\u64cd\u4f5c\u3002",
            user_constraints=[],
            change_required=False,
            created_at="2026-07-12T16:00:00+08:00",
        )
        outcome = discussion_result_to_decision_outcome(discussion, task_type="long_term_logic_review")

        request = decision_outcome_to_operation_request(outcome)

        self.assertIsNone(request)

    def test_plan_update_outcome_does_not_generate_operation_request(self) -> None:
        discussion = create_discussion_result(
            discussion_id="discussion-plan-only",
            source_review_id="review-plan-only",
            symbol="601138.SS",
            final_conclusion="\u9700\u8981\u5237\u65b0\u8ba1\u5212\uff0c\u4ec5\u8fdb\u5165\u8ba1\u5212\u66f4\u65b0\u6d41\u7a0b\u3002",
            user_constraints=[],
            change_required=True,
            created_at="2026-07-12T16:00:00+08:00",
        )
        outcome = discussion_result_to_decision_outcome(discussion, task_type="long_term_logic_review")

        request = decision_outcome_to_operation_request(outcome)

        self.assertIsNone(request)

    def test_ai_draft_review_task_discussion_result_decision_outcome_flow(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            provider_registry = create_mock_provider_registry(log_dir=Path(tmp_dir) / "ai_logs")
            task_result = run_ai_task(
                task_name="long_term_logic_review",
                stock=self.stock(),
                task_registry=create_default_task_registry(),
                provider_registry=provider_registry,
                output_data_dir=tmp_dir,
                metadata={"symbol": "601138.SS"},
            )
        self.assertTrue(task_result["ok"])
        self.assertEqual(task_result["status"], "pending_review")
        self.assertIn("draftPath", task_result)
        self.assertIn("reviewTaskPath", task_result)

        discussion = create_discussion_result(
            discussion_id="discussion-flow-1",
            source_review_id="review-flow-1",
            symbol="601138.SS",
            final_conclusion="\u957f\u671f\u903b\u8f91\u4ecd\u6709\u6548\uff0c\u6682\u4e0d\u9700\u8981\u6539\u53d8\u3002",
            user_constraints=["\u4ec5\u4f9b\u4eba\u5de5\u590d\u6838"],
            change_required=False,
            created_at="2026-07-12T16:00:00+08:00",
        )
        outcome = discussion_result_to_decision_outcome(
            discussion,
            task_type="long_term_logic_review",
            created_at="2026-07-12T16:01:00+08:00",
        )

        self.assertEqual(outcome["outcome_type"], "no_change")
        self.assertEqual(outcome["conclusion"], discussion["final_conclusion"])
        validate_decision_result(outcome)


if __name__ == "__main__":
    unittest.main()
