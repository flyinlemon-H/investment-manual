from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol, runtime_checkable


Usage = dict[str, int]
AIResponse = dict[str, Any]

_SENSITIVE_KEY_PATTERN = re.compile(r"(api[_-]?key|secret|token|password|credential)", re.IGNORECASE)


@runtime_checkable
class AIProvider(Protocol):
    """Standard AI provider interface.

    Providers receive normalized requests and return normalized responses. They
    must not write investment data or make investment decisions.
    """

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
        ...


class AIProviderLookupError(LookupError):
    """Raised when a provider cannot be found in the registry."""


class AIProviderRegistrationError(ValueError):
    """Raised when a provider cannot be registered safely."""


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def standard_usage(
    *,
    input_tokens: int = 0,
    cached_input_tokens: int = 0,
    output_tokens: int = 0,
) -> Usage:
    return {
        "inputTokens": int(input_tokens or 0),
        "cachedInputTokens": int(cached_input_tokens or 0),
        "outputTokens": int(output_tokens or 0),
    }


def standard_success(
    *,
    provider: str,
    model: str,
    content: Any,
    usage: Usage | None = None,
    latency_ms: int = 0,
    request_id: str = "",
    metadata: dict[str, Any] | None = None,
) -> AIResponse:
    return {
        "ok": True,
        "provider": provider,
        "model": model,
        "content": content,
        "usage": usage or standard_usage(),
        "latencyMs": int(latency_ms or 0),
        "requestId": request_id,
        "error": None,
        "metadata": sanitize_metadata(metadata),
    }


def standard_failure(
    *,
    provider: str,
    model: str,
    error_type: str,
    message: str,
    retryable: bool = False,
    usage: Usage | None = None,
    latency_ms: int = 0,
    request_id: str = "",
    metadata: dict[str, Any] | None = None,
) -> AIResponse:
    return {
        "ok": False,
        "provider": provider,
        "model": model,
        "content": None,
        "usage": usage or standard_usage(),
        "latencyMs": int(latency_ms or 0),
        "requestId": request_id,
        "error": {
            "type": error_type,
            "message": redact_secrets(message),
            "retryable": bool(retryable),
        },
        "metadata": sanitize_metadata(metadata),
    }


def prompt_hash(system_prompt: str, user_prompt: str) -> str:
    digest = hashlib.sha256()
    digest.update(system_prompt.encode("utf-8"))
    digest.update(b"\0")
    digest.update(user_prompt.encode("utf-8"))
    return digest.hexdigest()


def redact_secrets(value: str) -> str:
    text = str(value)
    text = re.sub(r"sk-[A-Za-z0-9_-]{12,}", "[REDACTED_API_KEY]", text)
    text = re.sub(r"(?i)(api[_-]?key|token|secret)\s*[:=]\s*[^,\s]+", r"\1=[REDACTED]", text)
    return text


def sanitize_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
    if not metadata:
        return {}
    safe: dict[str, Any] = {}
    for key, value in metadata.items():
        key_text = str(key)
        if _SENSITIVE_KEY_PATTERN.search(key_text):
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            safe[key_text] = redact_secrets(value) if isinstance(value, str) else value
        elif isinstance(value, (list, tuple)):
            safe[key_text] = [
                redact_secrets(item) if isinstance(item, str) else item
                for item in value
                if isinstance(item, (str, int, float, bool)) or item is None
            ][:20]
        else:
            safe[key_text] = f"<{type(value).__name__}>"
    return safe


def ensure_ai_runtime_dirs(base_dir: str | Path | None = None) -> dict[str, Path]:
    root = Path(base_dir) if base_dir is not None else repo_root() / "data"
    paths = {
        "logs": root / "ai_logs",
        "drafts": root / "ai_drafts",
        "failures": root / "ai_failures",
    }
    for path in paths.values():
        path.mkdir(parents=True, exist_ok=True)
    return paths


def build_call_log_entry(
    *,
    task_name: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    result: AIResponse,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    usage = result.get("usage") or standard_usage()
    error = result.get("error") or {}
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "taskName": task_name,
        "provider": result.get("provider", ""),
        "model": result.get("model", model),
        "ok": bool(result.get("ok")),
        "latencyMs": int(result.get("latencyMs") or 0),
        "requestId": result.get("requestId", ""),
        "inputTokens": int(usage.get("inputTokens") or 0),
        "outputTokens": int(usage.get("outputTokens") or 0),
        "errorType": error.get("type"),
        "promptHash": prompt_hash(system_prompt, user_prompt),
        "promptLength": len(system_prompt) + len(user_prompt),
        "metadata": sanitize_metadata(metadata),
    }


def write_call_log(
    *,
    task_name: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    result: AIResponse,
    metadata: dict[str, Any] | None = None,
    log_dir: str | Path | None = None,
) -> Path:
    logs_path = Path(log_dir) if log_dir is not None else ensure_ai_runtime_dirs()["logs"]
    logs_path.mkdir(parents=True, exist_ok=True)
    log_path = logs_path / f"ai_calls_{datetime.now(timezone.utc).date().isoformat()}.jsonl"
    entry = build_call_log_entry(
        task_name=task_name,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        result=result,
        metadata=metadata,
    )
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False, sort_keys=True) + "\n")
    return log_path


def safe_ai_filename(*, task_name: str, symbol: str | None, request_id: str, suffix: str = ".json") -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    parts = [task_name, symbol or "unknown", timestamp, request_id or "no_request_id"]
    safe_parts = [re.sub(r"[^A-Za-z0-9_.-]+", "_", part).strip("_") or "unknown" for part in parts]
    return "_".join(safe_parts) + suffix


def write_ai_json_artifact(
    *,
    directory: str | Path,
    task_name: str,
    request_id: str,
    payload: dict[str, Any],
    symbol: str | None = None,
) -> Path:
    target_dir = Path(directory)
    target_dir.mkdir(parents=True, exist_ok=True)
    file_path = target_dir / safe_ai_filename(task_name=task_name, symbol=symbol, request_id=request_id)
    file_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    return file_path

