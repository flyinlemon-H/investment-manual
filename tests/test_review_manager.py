from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from src.queue.review_manager import approve_review_task, defer_review_task, reject_review_task
from src.queue.review_schema import validate_review_task


class ReviewManagerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        for name in ["pending", "approved", "rejected"]:
            (self.root / name).mkdir(parents=True, exist_ok=True)
        self.task = {
            "review_id": "review_1",
            "source_input_id": "input_1",
            "created_at": "2026-07-11T00:00:00+00:00",
            "symbol": "601138.SS",
            "task_type": "other",
            "priority": "low",
            "status": "pending",
            "summary": "test",
            "payload": {"content": "hello"},
            "available_actions": ["approve", "reject", "defer"],
        }
        (self.root / "pending" / "review_1.json").write_text(
            json.dumps(self.task, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def read_task(self, path: Path) -> dict:
        return json.loads(path.read_text(encoding="utf-8"))

    def test_approve_updates_task_and_moves_to_approved(self) -> None:
        path = approve_review_task("review_1", comment="ok", review_root=self.root)
        task = self.read_task(path)

        self.assertEqual(path.parent.name, "approved")
        self.assertFalse((self.root / "pending" / "review_1.json").exists())
        self.assertEqual(task["status"], "approved")
        self.assertEqual(task["review_action"], "approve")
        self.assertEqual(task["review_comment"], "ok")
        self.assertIn("reviewed_at", task)
        validate_review_task(task)

    def test_reject_updates_task_and_moves_to_rejected(self) -> None:
        path = reject_review_task("review_1", comment="bad", review_root=self.root)
        task = self.read_task(path)

        self.assertEqual(path.parent.name, "rejected")
        self.assertFalse((self.root / "pending" / "review_1.json").exists())
        self.assertEqual(task["status"], "rejected")
        self.assertEqual(task["review_action"], "reject")
        self.assertEqual(task["review_comment"], "bad")
        validate_review_task(task)

    def test_defer_updates_task_and_keeps_in_pending(self) -> None:
        path = defer_review_task("review_1", comment="later", review_root=self.root)
        task = self.read_task(path)

        self.assertEqual(path.parent.name, "pending")
        self.assertEqual(task["status"], "deferred")
        self.assertEqual(task["review_action"], "defer")
        self.assertEqual(task["review_comment"], "later")
        validate_review_task(task)

    def test_missing_review_task_has_clear_error(self) -> None:
        with self.assertRaisesRegex(FileNotFoundError, "review task not found"):
            approve_review_task("missing", review_root=self.root)


if __name__ == "__main__":
    unittest.main()
