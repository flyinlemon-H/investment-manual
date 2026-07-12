from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:
    def load_dotenv(dotenv_path: str | Path | None = None, *, override: bool = False) -> bool:
        path = Path(dotenv_path or ".env")
        if not path.exists():
            return False
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if not key:
                continue
            value = value.strip().strip('"').strip("'")
            if override or key not in os.environ:
                os.environ[key] = value
        return True

from .base import AIResponse, standard_failure, standard_success, standard_usage


DEEPSEEK_PROVIDER_NAME = "deepseek"
DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash"
DEEPSEEK_ALLOWED_MODELS = {"deepseek-v4-flash", "deepseek-v4-pro"}
DEEPSEEK_FORBIDDEN_MODELS = {"deepseek-chat", "deepseek-reasoner"}
DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
ROOT_ENV_PATH = PROJECT_ROOT / ".env"


class DeepSeekProvider:
    """Live DeepSeek provider adapter behind the standard AIProvider interface."""

    def __init__(
        self,
        *,
        api_key_env: str = "DEEPSEEK_API_KEY",
        endpoint: str = DEEPSEEK_CHAT_COMPLETIONS_URL,
        timeout_seconds: int = 60,
        log_dir: str | Path | None = None,
        enable_logging: bool = False,
    ) -> None:
        self.api_key_env = api_key_env
        self.endpoint = endpoint
        self.timeout_seconds = int(timeout_seconds)
        self.log_dir = Path(log_dir) if log_dir is not None else None
        self.enable_logging = enable_logging
        load_project_env()

    def generate(
        self,
        *,
        task_name: str,
        model: str,
        system_prompt: str,
        user_prompt: str,
        response_schema: dict[str, Any] | None = None,
        temperature: float | None = None,
        max_output_tokens: int | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AIResponse:
        metadata = metadata or {}
        model_name = normalize_deepseek_model(model)
        started = time.perf_counter()
        load_project_env()
        api_key = os.getenv(self.api_key_env)
        if not api_key:
            result = standard_failure(
                provider=DEEPSEEK_PROVIDER_NAME,
                model=model_name,
                error_type="missing_api_key",
                message=f"{self.api_key_env} is not set.",
                retryable=False,
                latency_ms=_elapsed_ms(started),
                metadata=metadata,
            )
            return self._finalize(task_name, model_name, system_prompt, user_prompt, result, metadata)

        payload: dict[str, Any] = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
            "stream": False,
        }
        if temperature is not None:
            payload["temperature"] = temperature
        if max_output_tokens is not None:
            payload["max_tokens"] = max_output_tokens

        request = urllib.request.Request(
            self.endpoint,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                response_data = json.loads(response.read().decode("utf-8"))
            result = _deepseek_success_result(model_name, response_data, _elapsed_ms(started), metadata)
        except urllib.error.HTTPError as exc:
            result = standard_failure(
                provider=DEEPSEEK_PROVIDER_NAME,
                model=model_name,
                error_type="provider_http_error",
                message=_safe_http_error(exc),
                retryable=exc.code in {408, 409, 429, 500, 502, 503, 504},
                latency_ms=_elapsed_ms(started),
                metadata=metadata,
            )
        except urllib.error.URLError as exc:
            result = standard_failure(
                provider=DEEPSEEK_PROVIDER_NAME,
                model=model_name,
                error_type="provider_network_error",
                message=str(exc.reason),
                retryable=True,
                latency_ms=_elapsed_ms(started),
                metadata=metadata,
            )
        except Exception as exc:
            result = standard_failure(
                provider=DEEPSEEK_PROVIDER_NAME,
                model=model_name,
                error_type="provider_error",
                message=str(exc),
                retryable=False,
                latency_ms=_elapsed_ms(started),
                metadata=metadata,
            )
        return self._finalize(task_name, model_name, system_prompt, user_prompt, result, metadata)

    def _finalize(
        self,
        task_name: str,
        model: str,
        system_prompt: str,
        user_prompt: str,
        result: AIResponse,
        metadata: dict[str, Any],
    ) -> AIResponse:
        return result


def load_project_env() -> bool:
    return bool(load_dotenv(ROOT_ENV_PATH, override=False))


def normalize_deepseek_model(model: str | None) -> str:
    model_name = (model or DEEPSEEK_DEFAULT_MODEL).strip()
    if model_name in DEEPSEEK_FORBIDDEN_MODELS:
        raise ValueError(f"DeepSeek model '{model_name}' is forbidden for this project.")
    if model_name not in DEEPSEEK_ALLOWED_MODELS:
        raise ValueError("DeepSeek model must be one of: " + ", ".join(sorted(DEEPSEEK_ALLOWED_MODELS)) + ".")
    return model_name


def _deepseek_success_result(
    model: str,
    response_data: dict[str, Any],
    latency_ms: int,
    metadata: dict[str, Any],
) -> AIResponse:
    choices = response_data.get("choices") or []
    if not choices:
        raise ValueError("DeepSeek response has no choices.")
    message = (choices[0] or {}).get("message") or {}
    content = message.get("content")
    usage = response_data.get("usage") or {}
    return standard_success(
        provider=DEEPSEEK_PROVIDER_NAME,
        model=str(response_data.get("model") or model),
        content=content,
        usage=standard_usage(
            input_tokens=int(usage.get("prompt_tokens") or 0),
            cached_input_tokens=int(usage.get("prompt_cache_hit_tokens") or 0),
            output_tokens=int(usage.get("completion_tokens") or 0),
        ),
        latency_ms=latency_ms,
        request_id=str(response_data.get("id") or ""),
        metadata=metadata,
    )


def _safe_http_error(exc: urllib.error.HTTPError) -> str:
    try:
        body = exc.read().decode("utf-8", errors="replace")[:500]
    except Exception:
        body = ""
    return f"DeepSeek HTTP {exc.code}: {body or exc.reason}"


def _elapsed_ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)
