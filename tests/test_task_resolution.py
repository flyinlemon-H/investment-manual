from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from src.decision.task_resolution import build_task_resolution_projection, write_new_resolutions


class TaskResolutionTests(unittest.TestCase):
    now = datetime(2026, 7, 13, 12, 0, tzinfo=timezone.utc)

    def draft(self, status: str, *, draft_id: str = "draft-1", created_at: str = "2026-07-12T12:00:00+00:00", validation: str = "passed") -> dict:
        return {
            "draft_id": draft_id,
            "symbol": "601138.SS",
            "task_type": "long_term_logic_review",
            "provider": "deepseek",
            "model": "deepseek-v4-flash",
            "validation_status": validation,
            "created_at": created_at,
            "result": {"logic_status": status, "summary": f"summary-{status}"},
        }

    def task(self, *, draft_id: str = "draft-1", review_id: str = "review-1", created_at: str = "2026-07-12T12:00:00+00:00") -> dict:
        return {
            "review_id": review_id,
            "source_input_id": draft_id,
            "symbol": "601138.SS",
            "task_type": "long_term_logic_review",
            "status": "pending",
            "created_at": created_at,
            "payload": {},
        }

    def build(self, status: str, **kwargs) -> dict:
        return build_task_resolution_projection(
            kwargs.get("drafts", [self.draft(status)]),
            kwargs.get("tasks", [self.task()]),
            kwargs.get("outcomes", []),
            kwargs.get("requests", []),
            kwargs.get("audits", []),
            kwargs.get("resolutions", []),
            now=self.now,
        )

    def test_valid_auto_resolves_and_is_not_home_action(self) -> None:
        result = self.build("valid")
        projection = result["taskProjections"][0]
        self.assertFalse(projection["actionable"])
        self.assertTrue(projection["resolved"])
        self.assertEqual(projection["resolutionType"], "no_action_required")
        self.assertEqual(projection["reviewIntervalDays"], 90)
        self.assertEqual(projection["nextReviewDue"], "2026-10-10")
        self.assertEqual(result["homeTaskProjections"], [])

    def test_weakened_is_actionable_with_thirty_day_review(self) -> None:
        result = self.build("weakened")
        projection = result["homeTaskProjections"][0]
        self.assertTrue(projection["actionable"])
        self.assertEqual(projection["reviewIntervalDays"], 30)
        self.assertEqual(projection["nextReviewDue"], "2026-08-11")
        self.assertIn("弱化", projection["userSummary"])

    def test_invalid_is_urgent_and_insufficient_information_is_actionable(self) -> None:
        invalid = self.build("invalid")["homeTaskProjections"][0]
        insufficient = self.build("insufficient_information")["homeTaskProjections"][0]
        self.assertEqual(invalid["priority"], "urgent")
        self.assertEqual(invalid["reviewDueStatus"], "action_required")
        self.assertEqual(insufficient["reviewDueStatus"], "awaiting_information")
        self.assertTrue(insufficient["actionable"])

    def test_failed_schema_is_system_issue_not_investment_task(self) -> None:
        result = self.build("weakened", drafts=[self.draft("weakened", validation="failed")])
        self.assertEqual(result["homeTaskProjections"], [])
        self.assertEqual(len(result["systemIssues"]), 1)

    def test_plan_application_audit_resolves_source_review(self) -> None:
        outcome = {"decision_id": "decision-1", "source_review_id": "review-1", "outcome_type": "plan_update"}
        request = {"request_id": "request-1", "source_decision_id": "decision-1"}
        audit = {
            "application_id": "application-1",
            "source_decision_id": "decision-1",
            "source_request_id": "request-1",
            "result": "applied",
            "applied_at": "2026-07-13T10:00:00+00:00",
            "archived_plan_ids": ["old-1", "old-2"],
            "created_plan_ids": ["new-1"],
        }
        result = self.build("weakened", outcomes=[outcome], requests=[request], audits=[audit])
        projection = result["taskProjections"][0]
        resolution = next(item for item in result["taskResolutions"] if item["resolution_type"] == "plan_applied")
        self.assertTrue(projection["resolved"])
        self.assertFalse(projection["actionable"])
        self.assertEqual(resolution["source_application_id"], "application-1")
        self.assertEqual(resolution["source_decision_id"], "decision-1")
        self.assertEqual(projection["archivedPlanCount"], 2)
        self.assertEqual(projection["createdPlanCount"], 1)
        self.assertEqual(result["homeTaskProjections"], [])

    def test_older_unresolved_task_is_superseded(self) -> None:
        drafts = [
            self.draft("weakened", draft_id="old", created_at="2026-07-01T12:00:00+00:00"),
            self.draft("weakened", draft_id="new", created_at="2026-07-12T12:00:00+00:00"),
        ]
        tasks = [
            self.task(draft_id="old", review_id="review-old", created_at="2026-07-01T12:00:00+00:00"),
            self.task(draft_id="new", review_id="review-new", created_at="2026-07-12T12:00:00+00:00"),
        ]
        result = self.build("weakened", drafts=drafts, tasks=tasks)
        old = next(item for item in result["taskProjections"] if item["reviewId"] == "review-old")
        self.assertEqual(old["resolutionType"], "superseded")
        self.assertEqual([item["reviewId"] for item in result["homeTaskProjections"]], ["review-new"])

    def test_resolution_files_are_immutable_and_idempotent(self) -> None:
        result = self.build("valid")
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            first = write_new_resolutions(directory, result["taskResolutions"])
            original = first[0].read_bytes()
            second = write_new_resolutions(directory, result["taskResolutions"])
            self.assertEqual(len(first), 1)
            self.assertEqual(second, [])
            self.assertEqual(first[0].read_bytes(), original)
            self.assertEqual(json.loads(original)["resolution_type"], "no_action_required")

    def test_frontend_uses_projection_and_hides_internal_home_fields(self) -> None:
        reader = Path("src/ai-decision-review.js").read_text(encoding="utf-8")
        ui = Path("src/ui-render.js").read_text(encoding="utf-8")
        self.assertIn("record.actionable&&record.isCurrent", reader)
        self.assertIn("AI处理历史", ui)
        self.assertIn("最近复核时间", ui)
        self.assertNotIn("AI决策复核待处理任务", ui)


if __name__ == "__main__":
    unittest.main()
