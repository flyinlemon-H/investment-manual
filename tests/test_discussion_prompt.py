from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from src.ai.discussion_prompt import build_discussion_record, build_discussion_prompt, write_discussion_record


class DiscussionPromptTests(unittest.TestCase):
    def ai_draft(self) -> dict:
        return {
            "draft_id": "draft-001",
            "symbol": "601138.SS",
            "task_type": "long_term_logic_review",
            "basedOn": {
                "previousLongTermLogicUpdatedAt": "2026-07-09",
                "allocationUpdatedAt": "2026-07-02",
            },
            "result": {
                "summary": "\u957f\u671f\u903b\u8f91\u4ecd\u6709\u6548",
                "logic_status": "valid",
                "confidence": "high",
                "coreDrivers": ["AI\u670d\u52a1\u5668\u9700\u6c42\u589e\u957f"],
                "longTermRisks": ["AI\u8d44\u672c\u5f00\u652f\u653e\u7f13"],
                "notes": ["\u4ecd\u9700\u4eba\u5de5\u590d\u6838\u6280\u672f\u6761\u4ef6"],
                "updatedAt": "2026-07-11",
                "validUntil": "2027-06-30",
                "nextReviewDate": "2026-08-31",
            },
        }

    def review_task(self) -> dict:
        return {
            "review_id": "review-001",
            "source_input_id": "draft-001",
            "task_type": "long_term_logic_review",
            "status": "pending",
        }

    def stock_context(self) -> dict:
        return {
            "code": "601138.SS",
            "name": "\u5de5\u4e1a\u5bcc\u8054",
            "shares": 1000,
            "avgCost": 55.5,
            "currentPrice": 63.59,
            "targetPct": 10,
            "longTermLogic": {
                "summary": "\u7b97\u529b\u57fa\u7840\u8bbe\u65bd\u957f\u671f\u6210\u957f",
                "updatedAt": "2026-07-09",
            },
        }

    def test_prompt_contains_required_discussion_context(self) -> None:
        prompt = build_discussion_prompt(
            ai_draft=self.ai_draft(),
            review_task=self.review_task(),
            stock_context=self.stock_context(),
        )

        self.assertIn("601138.SS", prompt)
        self.assertIn("\u6301\u4ed3\u6570\u91cf\uff1a1000", prompt)
        self.assertIn("\u6210\u672c\uff1a55.5", prompt)
        self.assertIn("\u7b97\u529b\u57fa\u7840\u8bbe\u65bd\u957f\u671f\u6210\u957f", prompt)
        self.assertIn("logic_status\uff1avalid", prompt)
        self.assertIn("AI\u670d\u52a1\u5668\u9700\u6c42\u589e\u957f", prompt)
        self.assertIn("AI\u8d44\u672c\u5f00\u652f\u653e\u7f13", prompt)
        self.assertIn("\u4ecd\u9700\u4eba\u5de5\u590d\u6838\u6280\u672f\u6761\u4ef6", prompt)
        self.assertIn("\u5f53\u524dAI\u7ed3\u8bba\u662f\u5426\u5408\u7406", prompt)
        self.assertIn("\u4e0d\u8981\u8f93\u51fa\u786e\u5b9a\u6027\u4e70\u5356\u547d\u4ee4", prompt)

    def test_discussion_record_has_required_fields_and_can_be_saved(self) -> None:
        record = build_discussion_record(
            ai_draft=self.ai_draft(),
            review_task=self.review_task(),
            stock_context=self.stock_context(),
        )

        self.assertEqual(record["source_review_id"], "review-001")
        self.assertEqual(record["symbol"], "601138.SS")
        self.assertEqual(record["task_type"], "long_term_logic_review")
        self.assertIn("discussion_id", record)
        self.assertIn("prompt", record)
        self.assertIn("created_at", record)

        with tempfile.TemporaryDirectory() as tmp_dir:
            json_path, prompt_path = write_discussion_record(record, tmp_dir)
            saved = json.loads(Path(json_path).read_text(encoding="utf-8"))
            prompt = Path(prompt_path).read_text(encoding="utf-8")

        self.assertEqual(saved["discussion_id"], record["discussion_id"])
        self.assertIn("601138.SS", prompt)


if __name__ == "__main__":
    unittest.main()
