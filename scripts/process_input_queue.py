from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.queue.review_schema import (
    DEFAULT_AVAILABLE_ACTIONS,
    default_priority,
    normalize_task_type,
    validate_review_task,
)

INCOMING_DIR = ROOT / "input_queue" / "incoming"
REVIEW_ROOT = ROOT / "review_queue"
PENDING_DIR = REVIEW_ROOT / "pending"
APPROVED_DIR = REVIEW_ROOT / "approved"
REJECTED_DIR = REVIEW_ROOT / "rejected"

def main() -> int:
    ensure_review_dirs()
    incoming_files = sorted(INCOMING_DIR.glob("*.json"))
    created_files = []
    for input_path in incoming_files:
        try:
            record = load_record(input_path)
            task = build_review_task(record, input_path)
            validate_review_task(task)
            output_path = PENDING_DIR / f"{task['review_id']}.json"
            output_path.write_text(json.dumps(task, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
            created_files.append(str(output_path))
        except Exception as exc:
            print(f"process failed: {input_path}: {type(exc).__name__}: {exc}")
            return 1

    print(f"processed incoming: {len(incoming_files)}")
    print(f"review tasks created: {len(created_files)}")
    print("created files:")
    for file_path in created_files:
        print(f"- {file_path}")
    return 0


def ensure_review_dirs() -> None:
    for directory in [PENDING_DIR, APPROVED_DIR, REJECTED_DIR]:
        directory.mkdir(parents=True, exist_ok=True)


def load_record(input_path: Path) -> dict[str, Any]:
    data = json.loads(input_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError("input queue file must contain a JSON object.")
    return data


def build_review_task(record: dict[str, Any], input_path: Path) -> dict[str, Any]:
    record_id = str(record.get("id") or input_path.stem)
    task_type = normalize_task_type(record.get("input_type"))
    now = datetime.now(timezone.utc).isoformat()
    payload = record.get("payload")
    return {
        "review_id": f"review_{record_id}",
        "source_input_id": record_id,
        "created_at": now,
        "symbol": record.get("symbol"),
        "task_type": task_type,
        "priority": default_priority(task_type),
        "status": "pending",
        "summary": build_summary(record, payload, task_type),
        "payload": payload,
        "available_actions": list(DEFAULT_AVAILABLE_ACTIONS),
        "metadata": {
            "source_file": str(input_path),
            "source": record.get("source"),
            "client_request_id": record.get("client_request_id"),
            "schema_version": record.get("schema_version"),
        },
        "raw_input": record,
    }


def build_summary(record: dict[str, Any], payload: Any, task_type: str) -> str:
    symbol = record.get("symbol") or "unknown"
    if isinstance(payload, dict):
        content = payload.get("content") or payload.get("summary") or payload.get("title")
        if content:
            return f"{symbol} {task_type}: {str(content)[:120]}"
    return f"{symbol} {task_type} review required"


if __name__ == "__main__":
    raise SystemExit(main())
