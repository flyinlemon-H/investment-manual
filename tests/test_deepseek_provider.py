from __future__ import annotations

import io
import json
import os
import tempfile
import unittest
from unittest.mock import patch

import providers.ai.deepseek_provider as deepseek_module
from providers.ai.deepseek_provider import DeepSeekProvider, normalize_deepseek_model


class FakeHTTPResponse:
    def __init__(self, payload: dict) -> None:
        self.payload = payload

    def __enter__(self) -> "FakeHTTPResponse":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


class DeepSeekProviderTests(unittest.TestCase):
    def test_allowed_models(self) -> None:
        self.assertEqual(normalize_deepseek_model(None), "deepseek-v4-flash")
        self.assertEqual(normalize_deepseek_model("deepseek-v4-pro"), "deepseek-v4-pro")

    def test_forbidden_deprecated_models_are_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "forbidden"):
            normalize_deepseek_model("deepseek-chat")
        with self.assertRaisesRegex(ValueError, "forbidden"):
            normalize_deepseek_model("deepseek-reasoner")

    def test_missing_api_key_returns_standard_failure_without_network(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            missing_env_path = __import__("pathlib").Path(tmp_dir) / "missing.env"
            with patch.object(deepseek_module, "ROOT_ENV_PATH", missing_env_path):
                provider = DeepSeekProvider(log_dir=tmp_dir)
            with patch.object(deepseek_module, "ROOT_ENV_PATH", missing_env_path), patch.dict(os.environ, {}, clear=True), patch("urllib.request.urlopen") as urlopen:
                result = provider.generate(
                    task_name="long_term_logic_review",
                    model="deepseek-v4-flash",
                    system_prompt="system",
                    user_prompt="user",
                )

            urlopen.assert_not_called()

        self.assertFalse(result["ok"])
        self.assertEqual(result["provider"], "deepseek")
        self.assertEqual(result["error"]["type"], "missing_api_key")
        self.assertIn("usage", result)
        self.assertEqual(list(__import__("pathlib").Path(tmp_dir).glob("*.jsonl")), [])

    def test_loads_project_env_before_reading_key(self) -> None:
        response_payload = {
            "id": "ds-request-env",
            "model": "deepseek-v4-flash",
            "choices": [{"message": {"content": "{\"updatedAt\":\"2026-07-10\"}"}}],
            "usage": {},
        }
        with tempfile.TemporaryDirectory() as tmp_dir:
            env_path = __import__("pathlib").Path(tmp_dir) / ".env"
            env_path.write_text("DEEPSEEK_API_KEY=loaded-from-dotenv\n", encoding="utf-8")
            with patch.object(deepseek_module, "ROOT_ENV_PATH", env_path), patch.dict(os.environ, {}, clear=True), patch(
                "urllib.request.urlopen",
                return_value=FakeHTTPResponse(response_payload),
            ) as urlopen:
                provider = DeepSeekProvider(enable_logging=False)
                result = provider.generate(
                    task_name="long_term_logic_review",
                    model="deepseek-v4-flash",
                    system_prompt="system",
                    user_prompt="user",
                )
            request = urlopen.call_args.args[0]

        self.assertTrue(result["ok"])
        self.assertEqual(request.headers["Authorization"], "Bearer loaded-from-dotenv")

    def test_success_maps_deepseek_response_to_standard_shape(self) -> None:
        response_payload = {
            "id": "ds-request-1",
            "model": "deepseek-v4-flash",
            "choices": [{"message": {"content": "{\"updatedAt\":\"2026-07-10\"}"}}],
            "usage": {
                "prompt_tokens": 10,
                "prompt_cache_hit_tokens": 2,
                "completion_tokens": 5,
            },
        }
        with tempfile.TemporaryDirectory() as tmp_dir:
            provider = DeepSeekProvider(log_dir=tmp_dir)
            with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "test-key"}, clear=True), patch(
                "urllib.request.urlopen",
                return_value=FakeHTTPResponse(response_payload),
            ) as urlopen:
                result = provider.generate(
                    task_name="long_term_logic_review",
                    model="deepseek-v4-flash",
                    system_prompt="system",
                    user_prompt="user",
                    response_schema={},
                )

            request = urlopen.call_args.args[0]
            request_body = json.loads(request.data.decode("utf-8"))
            log_files = list(__import__("pathlib").Path(tmp_dir).glob("*.jsonl"))

        self.assertTrue(result["ok"])
        self.assertEqual(result["content"], "{\"updatedAt\":\"2026-07-10\"}")
        self.assertEqual(result["usage"]["inputTokens"], 10)
        self.assertEqual(result["usage"]["cachedInputTokens"], 2)
        self.assertEqual(result["usage"]["outputTokens"], 5)
        self.assertEqual(request_body["response_format"], {"type": "json_object"})
        self.assertEqual(log_files, [])

    def test_http_error_is_standard_failure_and_redacted(self) -> None:
        error = __import__("urllib.error").error.HTTPError(
            url="https://api.deepseek.com/chat/completions",
            code=401,
            msg="Unauthorized",
            hdrs=None,
            fp=io.BytesIO(b'{"error":"bad apiKey=secret-value"}'),
        )
        provider = DeepSeekProvider(enable_logging=False)
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "test-key"}, clear=True), patch(
            "urllib.request.urlopen",
            side_effect=error,
        ):
            result = provider.generate(
                task_name="long_term_logic_review",
                model="deepseek-v4-flash",
                system_prompt="system",
                user_prompt="user",
            )

        self.assertFalse(result["ok"])
        self.assertEqual(result["error"]["type"], "provider_http_error")
        self.assertNotIn("secret-value", result["error"]["message"])


if __name__ == "__main__":
    unittest.main()
