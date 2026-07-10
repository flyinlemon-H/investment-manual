from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import jsonschema

from ai_context.long_term_logic_context import build_long_term_logic_context
from providers.ai.base import AIResponse, repo_root, write_ai_json_artifact
from providers.ai.mock_provider import MockAIProvider
from providers.ai.registry import ProviderRegistry, create_default_registry

from .registry import AITaskDefinition, AITaskRegistry, create_default_task_registry


PROVIDER_FAILURE_EXIT = 3
INPUT_ERROR_EXIT = 4
VALIDATION_FAILURE_EXIT = 2
SUCCESS_EXIT = 0

FORBIDDEN_DRAFT_FIELDS = {
    "shares",
    "avgCost",
    "tradeHistory",
    "positionSnapshots",
    "activePlans",
    "cash",
    "execute",
    "order",
}

CONFIDENCE_VALUES = {"high", "medium", "low"}
LOCAL_TZ = timezone(timedelta(hours=8))


def run_ai_task(
    *,
    task_name: str,
    stock: dict[str, Any],
    provider_name: str | None = None,
    task_registry: AITaskRegistry | None = None,
    provider_registry: ProviderRegistry | None = None,
    root_dir: str | Path | None = None,
    output_data_dir: str | Path | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    root = Path(root_dir) if root_dir is not None else repo_root()
    data_root = Path(output_data_dir) if output_data_dir is not None else root / "data"
    tasks = task_registry or create_default_task_registry()
    providers = provider_registry or create_default_registry()
    task = tasks.get(task_name)
    provider = providers.get(provider_name or task.defaultProvider)

    prompt = _read_text(root / task.promptPath)
    schema = _read_json(root / task.schemaPath)
    context = _build_context(task, stock, metadata)
    user_prompt = json.dumps(context, ensure_ascii=False, sort_keys=True)
    provider_result = provider.generate(
        task_name=task.taskName,
        model=task.defaultModel,
        system_prompt=prompt,
        user_prompt=user_prompt,
        response_schema=schema,
        metadata=metadata or {},
    )

    if not _provider_response_shape_valid(provider_result) or not provider_result["ok"]:
        return _write_failure(
            task=task,
            stock_symbol=context["symbol"],
            provider_result=provider_result,
            context=context,
            reason="provider_failed",
            data_root=data_root,
        )

    try:
        draft = _parse_content(provider_result["content"])
        jsonschema.validate(instance=draft, schema=schema)
        warnings = _business_validate(task, draft, context)
    except Exception as exc:
        return _write_failure(
            task=task,
            stock_symbol=context["symbol"],
            provider_result=provider_result,
            context=context,
            reason="validation_failed",
            error_message=str(exc),
            data_root=data_root,
        )

    draft_package = _draft_package(task, context, provider_result, draft, warnings)
    draft_path = write_ai_json_artifact(
        directory=data_root / "ai_drafts",
        task_name=task.taskName,
        symbol=context["symbol"],
        request_id=provider_result.get("requestId") or "no_request_id",
        payload=draft_package,
    )
    return {
        "ok": True,
        "status": "pending_review",
        "exitCode": SUCCESS_EXIT,
        "draftPath": str(draft_path),
        "failurePath": None,
        "requestId": provider_result.get("requestId"),
        "provider": provider_result.get("provider"),
        "model": provider_result.get("model"),
        "validation": draft_package["validation"],
    }


def create_mock_provider_registry(*, log_dir: str | Path | None = None, metadata: dict[str, Any] | None = None) -> ProviderRegistry:
    registry = ProviderRegistry(default_name="mock")
    registry.register(
        "mock",
        MockAIProvider(
            log_dir=log_dir,
            simulate_failure=bool((metadata or {}).get("simulateFailure")),
        ),
        default=True,
    )
    return registry


def _build_context(task: AITaskDefinition, stock: dict[str, Any], metadata: dict[str, Any] | None) -> dict[str, Any]:
    if task.taskName == "long_term_logic_review":
        return build_long_term_logic_context(stock, metadata)
    raise ValueError(f"Unsupported AI task context builder: {task.taskName}")


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _provider_response_shape_valid(result: AIResponse) -> bool:
    required = {"ok", "provider", "model", "content", "usage", "latencyMs", "requestId", "error", "metadata"}
    return isinstance(result, dict) and required.issubset(result.keys())


def _parse_content(content: Any) -> dict[str, Any]:
    if isinstance(content, dict):
        return content
    if isinstance(content, str):
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return parsed
    raise ValueError("Provider content must be a JSON object.")


def _business_validate(task: AITaskDefinition, draft: dict[str, Any], context: dict[str, Any]) -> list[str]:
    if not task.requiresHumanApproval:
        raise ValueError("Task must require human approval.")
    forbidden = sorted(_find_forbidden_fields(draft))
    if forbidden:
        raise ValueError(f"Draft contains forbidden fields: {', '.join(forbidden)}.")
    if draft.get("confidence") not in CONFIDENCE_VALUES:
        raise ValueError("Draft confidence is not allowed.")
    if _date_less_than(draft.get("nextReviewDate"), draft.get("updatedAt")):
        raise ValueError("nextReviewDate must not be earlier than updatedAt.")
    if _date_less_than(draft.get("validUntil"), draft.get("updatedAt")):
        raise ValueError("validUntil must not be earlier than updatedAt.")
    text = json.dumps(draft, ensure_ascii=False).lower()
    if "approved" in text or "正式数据已写入" in text:
        raise ValueError("Draft must not claim approval or formal data write.")
    warnings = []
    if len(context.get("missingFields") or []) >= 3:
        warnings.append("Context has multiple missing fields; confidence should remain conservative.")
        if draft.get("confidence") == "high":
            raise ValueError("High confidence is not allowed when context has multiple missing fields.")
    return warnings


def _find_forbidden_fields(value: Any) -> set[str]:
    found: set[str] = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if key in FORBIDDEN_DRAFT_FIELDS:
                found.add(key)
            found.update(_find_forbidden_fields(item))
    elif isinstance(value, list):
        for item in value:
            found.update(_find_forbidden_fields(item))
    return found


def _date_less_than(left: Any, right: Any) -> bool:
    if not left or not right:
        return False
    return str(left) < str(right)


def _draft_package(
    task: AITaskDefinition,
    context: dict[str, Any],
    provider_result: AIResponse,
    draft: dict[str, Any],
    warnings: list[str],
) -> dict[str, Any]:
    return {
        "taskName": task.taskName,
        "taskVersion": task.version,
        "status": "pending_review",
        "requiresHumanApproval": True,
        "symbol": context["symbol"],
        "generatedAt": datetime.now(LOCAL_TZ).isoformat(),
        "provider": provider_result.get("provider"),
        "model": provider_result.get("model"),
        "requestId": provider_result.get("requestId"),
        "promptVersion": task.promptVersion,
        "schemaVersion": task.schemaVersion,
        "basedOn": context.get("basedOn") or {},
        "usage": provider_result.get("usage") or {},
        "latencyMs": provider_result.get("latencyMs") or 0,
        "draft": draft,
        "validation": {
            "schemaValid": True,
            "businessValid": True,
            "warnings": warnings,
        },
    }


def _write_failure(
    *,
    task: AITaskDefinition,
    stock_symbol: str,
    provider_result: AIResponse,
    context: dict[str, Any],
    reason: str,
    data_root: Path,
    error_message: str | None = None,
) -> dict[str, Any]:
    payload = {
        "taskName": task.taskName,
        "taskVersion": task.version,
        "status": "failed",
        "symbol": stock_symbol,
        "failedAt": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
        "requestId": provider_result.get("requestId"),
        "provider": provider_result.get("provider"),
        "model": provider_result.get("model"),
        "error": provider_result.get("error") or {"type": reason, "message": error_message, "retryable": False},
        "validation": {
            "schemaValid": reason != "validation_failed",
            "businessValid": False,
            "warnings": [error_message] if error_message else [],
        },
        "basedOn": context.get("basedOn") or {},
    }
    failure_path = write_ai_json_artifact(
        directory=data_root / "ai_failures",
        task_name=task.taskName,
        symbol=stock_symbol,
        request_id=provider_result.get("requestId") or "no_request_id",
        payload=payload,
    )
    exit_code = PROVIDER_FAILURE_EXIT if reason == "provider_failed" else VALIDATION_FAILURE_EXIT
    return {
        "ok": False,
        "status": "failed",
        "exitCode": exit_code,
        "draftPath": None,
        "failurePath": str(failure_path),
        "requestId": provider_result.get("requestId"),
        "provider": provider_result.get("provider"),
        "model": provider_result.get("model"),
        "validation": payload["validation"],
    }
