from __future__ import annotations

import json
import socket
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from providers.ai.base import ensure_ai_runtime_dirs, write_ai_json_artifact
from providers.ai.mock_provider import MockAIProvider
from providers.ai.registry import ProviderRegistry


class AIProviderFoundationTests(unittest.TestCase):
    def test_mock_provider_success_returns_standard_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            provider = MockAIProvider(log_dir=tmp_dir)
            result = provider.generate(
                task_name="long_term_logic_review",
                model="mock-model",
                system_prompt="system",
                user_prompt="user",
                response_schema={},
                metadata={"simulateUsage": {"inputTokens": 3, "outputTokens": 5}},
            )

        self.assertTrue(result["ok"])
        self.assertEqual(result["provider"], "mock")
        self.assertEqual(result["model"], "mock-model")
        self.assertIsInstance(result["content"], dict)
        self.assertEqual(result["usage"]["inputTokens"], 3)
        self.assertEqual(result["usage"]["cachedInputTokens"], 0)
        self.assertEqual(result["usage"]["outputTokens"], 5)
        self.assertIn("latencyMs", result)
        self.assertIn("requestId", result)
        self.assertIsNone(result["error"])
        self.assertIn("metadata", result)

    def test_mock_provider_failure_returns_standard_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            provider = MockAIProvider(log_dir=tmp_dir)
            result = provider.generate(
                task_name="test_failure",
                model="mock-model",
                system_prompt="system",
                user_prompt="user",
                metadata={"simulateFailure": True, "simulateErrorMessage": "network failed"},
            )

        self.assertFalse(result["ok"])
        self.assertIsNone(result["content"])
        self.assertEqual(result["error"]["type"], "provider_error")
        self.assertEqual(result["error"]["message"], "network failed")
        self.assertFalse(result["error"]["retryable"])
        self.assertIn("usage", result)

    def test_registry_registers_and_gets_provider(self) -> None:
        provider = MockAIProvider(enable_logging=False)
        registry = ProviderRegistry()
        registry.register("mock", provider)

        self.assertIs(registry.get("mock"), provider)
        self.assertEqual(registry.list_available(), ["mock"])

    def test_registry_default_provider(self) -> None:
        provider = MockAIProvider(enable_logging=False)
        registry = ProviderRegistry()
        registry.register("mock", provider, default=True)

        self.assertIs(registry.get_default(), provider)

    def test_registry_rejects_duplicate_provider(self) -> None:
        registry = ProviderRegistry()
        registry.register("mock", MockAIProvider(enable_logging=False))

        with self.assertRaisesRegex(ValueError, "already registered"):
            registry.register("mock", MockAIProvider(enable_logging=False))

    def test_registry_missing_provider_has_clear_error(self) -> None:
        registry = ProviderRegistry()

        with self.assertRaisesRegex(LookupError, "not registered"):
            registry.get("missing")

    def test_usage_and_error_fields_always_exist(self) -> None:
        provider = MockAIProvider(enable_logging=False)
        success = provider.generate(
            task_name="success",
            model="mock-model",
            system_prompt="system",
            user_prompt="user",
        )
        failure = provider.generate(
            task_name="failure",
            model="mock-model",
            system_prompt="system",
            user_prompt="user",
            metadata={"simulateFailure": True},
        )

        for result in [success, failure]:
            self.assertIn("usage", result)
            self.assertIn("error", result)
            self.assertEqual(set(result["usage"].keys()), {"inputTokens", "cachedInputTokens", "outputTokens"})

    def test_log_does_not_include_api_key_or_full_prompts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            provider = MockAIProvider(log_dir=tmp_dir)
            provider.generate(
                task_name="safe_log",
                model="mock-model",
                system_prompt="secret system prompt",
                user_prompt="secret user prompt",
                metadata={
                    "apiKey": "sk-test-should-not-appear",
                    "symbol": "601138.SS",
                    "note": "safe summary",
                },
            )
            log_files = list(Path(tmp_dir).glob("ai_calls_*.jsonl"))
            self.assertEqual(len(log_files), 1)
            log_text = log_files[0].read_text(encoding="utf-8")

        self.assertNotIn("sk-test-should-not-appear", log_text)
        self.assertNotIn("secret system prompt", log_text)
        self.assertNotIn("secret user prompt", log_text)
        self.assertIn("promptHash", log_text)
        self.assertIn("promptLength", log_text)
        self.assertIn("601138.SS", log_text)

    def test_mock_provider_does_not_use_network(self) -> None:
        provider = MockAIProvider(enable_logging=False)
        with patch.object(socket, "create_connection", side_effect=AssertionError("network should not be used")):
            result = provider.generate(
                task_name="no_network",
                model="mock-model",
                system_prompt="system",
                user_prompt="user",
            )
        self.assertTrue(result["ok"])

    def test_runtime_and_draft_directories_can_be_created_safely(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            paths = ensure_ai_runtime_dirs(tmp_dir)
            for path in paths.values():
                self.assertTrue(path.exists())
                self.assertTrue(path.is_dir())
            draft_path = write_ai_json_artifact(
                directory=paths["drafts"],
                task_name="draft_test",
                symbol="601138.SS",
                request_id="mock-request",
                payload={"ok": True},
            )

            self.assertTrue(draft_path.exists())
            self.assertEqual(json.loads(draft_path.read_text(encoding="utf-8")), {"ok": True})

    def test_mock_output_is_json_serializable(self) -> None:
        provider = MockAIProvider(enable_logging=False)
        result = provider.generate(
            task_name="json_test",
            model="mock-model",
            system_prompt="system",
            user_prompt="user",
            metadata={"mockContent": {"answer": "ok"}},
        )

        encoded = json.dumps(result, ensure_ascii=False)
        self.assertIn('"answer": "ok"', encoded)


if __name__ == "__main__":
    unittest.main()

