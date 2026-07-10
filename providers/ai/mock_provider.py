from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from .base import (
    AIResponse,
    standard_failure,
    standard_success,
    standard_usage,
    write_call_log,
)


class MockAIProvider:
    """Deterministic AI provider for local foundation tests.

    It never reads API keys and never performs network access.
    """

    def __init__(
        self,
        *,
        provider_name: str = "mock",
        default_content: dict[str, Any] | None = None,
        simulate_failure: bool = False,
        log_dir: str | Path | None = None,
        enable_logging: bool = True,
    ) -> None:
        self.provider_name = provider_name
        self.default_content = default_content or {"mock": True, "status": "ok"}
        self.simulate_failure = simulate_failure
        self.log_dir = Path(log_dir) if log_dir is not None else None
        self.enable_logging = enable_logging

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
        started = time.perf_counter()
        usage = self._usage(metadata)
        request_id = str(metadata.get("requestId") or f"mock-{task_name}-{model}")
        latency_ms = int(metadata.get("simulateLatencyMs") or 0)
        if latency_ms <= 0:
            latency_ms = int((time.perf_counter() - started) * 1000)

        if self.simulate_failure or bool(metadata.get("simulateFailure")):
            result = standard_failure(
                provider=self.provider_name,
                model=model,
                error_type=str(metadata.get("simulateErrorType") or "provider_error"),
                message=str(metadata.get("simulateErrorMessage") or "Mock provider simulated failure."),
                retryable=bool(metadata.get("simulateRetryable") or False),
                usage=usage,
                latency_ms=latency_ms,
                request_id=request_id,
                metadata=metadata,
            )
        else:
            result = standard_success(
                provider=self.provider_name,
                model=model,
                content=self._content(task_name, response_schema, metadata),
                usage=usage,
                latency_ms=latency_ms,
                request_id=request_id,
                metadata=metadata,
            )

        if self.enable_logging:
            write_call_log(
                task_name=task_name,
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                result=result,
                metadata=metadata,
                log_dir=self.log_dir,
            )
        return result

    def _content(
        self,
        task_name: str,
        response_schema: dict[str, Any] | None,
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        if isinstance(metadata.get("mockContent"), dict):
            return dict(metadata["mockContent"])
        content = dict(self.default_content)
        content.update(
            {
                "taskName": task_name,
                "schemaProvided": response_schema is not None,
            }
        )
        return content

    @staticmethod
    def _usage(metadata: dict[str, Any]) -> dict[str, int]:
        usage = metadata.get("simulateUsage") if isinstance(metadata, dict) else None
        if isinstance(usage, dict):
            return standard_usage(
                input_tokens=int(usage.get("inputTokens") or 0),
                cached_input_tokens=int(usage.get("cachedInputTokens") or 0),
                output_tokens=int(usage.get("outputTokens") or 0),
            )
        return standard_usage(input_tokens=0, cached_input_tokens=0, output_tokens=0)

