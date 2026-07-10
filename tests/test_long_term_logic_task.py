from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from ai_tasks.registry import create_default_task_registry
from ai_tasks.runner import create_mock_provider_registry, run_ai_task
from providers.ai.mock_provider import MockAIProvider
from providers.ai.registry import ProviderRegistry


ROOT = Path(__file__).resolve().parents[1]


class LongTermLogicTaskTests(unittest.TestCase):
    def stock(self) -> dict:
        return {
            "id": "s1",
            "code": "601138.SS",
            "name": "工业富联",
            "type": "holding",
            "role": "成长仓",
            "theme": "AI科技",
            "strategy": "growth",
            "longTermLogic": {"updatedAt": "2026-07-01", "summary": "old thesis"},
            "fundamentalReview": {"updatedAt": "2026-07-02", "summary": "fundamental"},
            "valuationReview": {"updatedAt": "2026-07-03", "summary": "valuation"},
            "recentCatalyst": {"updatedAt": "2026-07-04", "summary": "news"},
            "allocationDecision": {"updatedAt": "2026-07-05", "summary": "allocation"},
        }

    def run_task(self, tmp_dir: str, *, provider_registry: ProviderRegistry | None = None, metadata: dict | None = None) -> dict:
        return run_ai_task(
            task_name="long_term_logic_review",
            stock=self.stock(),
            task_registry=create_default_task_registry(),
            provider_registry=provider_registry or create_mock_provider_registry(log_dir=Path(tmp_dir) / "ai_logs"),
            root_dir=ROOT,
            output_data_dir=tmp_dir,
            metadata=metadata or {"symbol": "601138.SS"},
        )

    def test_mock_success_output_passes_schema(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            result = self.run_task(tmp_dir)

        self.assertTrue(result["ok"])
        self.assertTrue(result["validation"]["schemaValid"])
        self.assertTrue(result["validation"]["businessValid"])

    def test_generates_pending_review_draft(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            result = self.run_task(tmp_dir)
            draft = json.loads(Path(result["draftPath"]).read_text(encoding="utf-8"))

        self.assertEqual(draft["status"], "pending_review")
        self.assertTrue(draft["requiresHumanApproval"])
        self.assertEqual(draft["draft"]["status"], "needs_review")

    def test_does_not_write_to_stock_long_term_logic(self) -> None:
        stock = self.stock()
        original = dict(stock["longTermLogic"])
        with tempfile.TemporaryDirectory() as tmp_dir:
            run_ai_task(
                task_name="long_term_logic_review",
                stock=stock,
                task_registry=create_default_task_registry(),
                provider_registry=create_mock_provider_registry(log_dir=Path(tmp_dir) / "ai_logs"),
                root_dir=ROOT,
                output_data_dir=tmp_dir,
                metadata={"symbol": "601138.SS"},
            )

        self.assertEqual(stock["longTermLogic"], original)

    def test_provider_failure_goes_to_failures(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            provider_registry = create_mock_provider_registry(
                log_dir=Path(tmp_dir) / "ai_logs",
                metadata={"simulateFailure": True},
            )
            result = self.run_task(tmp_dir, provider_registry=provider_registry, metadata={"simulateFailure": True})
            self.assertFalse(result["ok"])
            self.assertEqual(result["exitCode"], 3)
            self.assertTrue(Path(result["failurePath"]).exists())

    def test_schema_failure_goes_to_failures(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            result = self.run_task(tmp_dir, metadata={"simulateSchemaFailure": True})
            self.assertFalse(result["ok"])
            self.assertEqual(result["exitCode"], 2)
            self.assertTrue(Path(result["failurePath"]).exists())

    def test_forbidden_field_is_rejected_by_business_validation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            provider_registry = ProviderRegistry(default_name="mock")
            provider_registry.register(
                "mock",
                MockAIProvider(
                    log_dir=Path(tmp_dir) / "ai_logs",
                    default_content={},
                ),
                default=True,
            )
            content = {
                "updatedAt": "2026-07-10",
                "validUntil": "2027-01-10",
                "status": "needs_review",
                "confidence": "medium",
                "investmentThesis": "test",
                "coreDrivers": [],
                "fundamentalSupport": [],
                "valuationView": "",
                "longTermRisks": [],
                "invalidationConditions": [],
                "nextReviewDate": "2026-10-10",
                "informationGaps": [],
                "notes": [],
                "shares": 100,
            }
            result = self.run_task(tmp_dir, provider_registry=provider_registry, metadata={"mockContent": content})

        self.assertFalse(result["ok"])
        self.assertEqual(result["exitCode"], 2)

    def test_draft_filename_contains_task_symbol_and_request(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            result = self.run_task(tmp_dir, metadata={"requestId": "req-123"})

        name = Path(result["draftPath"]).name
        self.assertIn("long_term_logic_review", name)
        self.assertIn("601138.SS", name)
        self.assertIn("req-123", name)

    def test_log_does_not_include_full_prompt_or_api_key(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            self.run_task(tmp_dir, metadata={"apiKey": "sk-test-should-not-log", "symbol": "601138.SS"})
            logs = list((Path(tmp_dir) / "ai_logs").glob("ai_calls_*.jsonl"))
            self.assertEqual(len(logs), 1)
            text = logs[0].read_text(encoding="utf-8")

        self.assertIn("promptHash", text)
        self.assertNotIn("谨慎的长期投资逻辑整理助手", text)
        self.assertNotIn("sk-test-should-not-log", text)

    def test_cli_success_returns_zero(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_path = Path(tmp_dir) / "latest_export.json"
            input_path.write_text(json.dumps({"stocks": [self.stock()]}, ensure_ascii=False), encoding="utf-8")
            completed = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts" / "run_ai_task.py"),
                    "--task",
                    "long_term_logic_review",
                    "--input",
                    str(input_path),
                    "--symbol",
                    "601138.SS",
                    "--provider",
                    "mock",
                    "--output-dir",
                    tmp_dir,
                ],
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn("draftPath:", completed.stdout)
        self.assertNotIn("谨慎的长期投资逻辑整理助手", completed.stdout)

    def test_cli_input_error_returns_four(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_path = Path(tmp_dir) / "latest_export.json"
            input_path.write_text(json.dumps({"stocks": []}), encoding="utf-8")
            completed = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts" / "run_ai_task.py"),
                    "--task",
                    "long_term_logic_review",
                    "--input",
                    str(input_path),
                    "--symbol",
                    "missing",
                    "--output-dir",
                    tmp_dir,
                ],
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(completed.returncode, 4)
        self.assertIn("input error", completed.stdout)


if __name__ == "__main__":
    unittest.main()
