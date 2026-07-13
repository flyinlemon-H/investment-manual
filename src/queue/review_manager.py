from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .review_schema import validate_review_task


ROOT = Path(__file__).resolve().parents[2]
REVIEW_ROOT = ROOT / "review_queue"
PENDING_DIR = REVIEW_ROOT / "pending"
APPROVED_DIR = REVIEW_ROOT / "approved"
REJECTED_DIR = REVIEW_ROOT / "rejected"
REVIEW_DIRS = [PENDING_DIR, APPROVED_DIR, REJECTED_DIR]


def approve_review_task(review_id: str, *, comment: str = "", review_root: str | Path | None = None) -> Path:
    return _transition_review_task(
        review_id,
        status="approved",
        action="approve",
        comment=comment,
        target_dir_name="approved",
        review_root=review_root,
    )


def reject_review_task(review_id: str, *, comment: str = "", review_root: str | Path | None = None) -> Path:
    return _transition_review_task(
        review_id,
        status="rejected",
        action="reject",
        comment=comment,
        target_dir_name="rejected",
        review_root=review_root,
    )


def defer_review_task(review_id: str, *, comment: str = "", review_root: str | Path | None = None) -> Path:
    return _transition_review_task(
        review_id,
        status="deferred",
        action="defer",
        comment=comment,
        target_dir_name="pending",
        review_root=review_root,
    )


def _transition_review_task(
    review_id: str,
    *,
    status: str,
    action: str,
    comment: str,
    target_dir_name: str,
    review_root: str | Path | None,
) -> Path:
    root = Path(review_root) if review_root is not None else REVIEW_ROOT
    ensure_review_dirs(root)
    source_path = find_review_task_path(review_id, review_root=root)
    task = load_review_task(source_path)
    task["status"] = status
    task["reviewed_at"] = datetime.now(timezone.utc).isoformat()
    task["review_action"] = action
    task["review_comment"] = comment
    validate_review_task(task)

    target_path = root / target_dir_name / f"{task['review_id']}.json"
    target_path.write_text(json.dumps(task, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    if source_path.resolve() != target_path.resolve() and source_path.exists():
        source_path.unlink()
    return target_path


def ensure_review_dirs(review_root: str | Path | None = None) -> None:
    root = Path(review_root) if review_root is not None else REVIEW_ROOT
    for name in ["pending", "approved", "rejected"]:
        (root / name).mkdir(parents=True, exist_ok=True)


def find_review_task_path(review_id: str, *, review_root: str | Path | None = None) -> Path:
    root = Path(review_root) if review_root is not None else REVIEW_ROOT
    file_name = f"{review_id}.json"
    for name in ["pending", "approved", "rejected"]:
        candidate = root / name / file_name
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"review task not found: {review_id}")


def load_review_task(path: str | Path) -> dict[str, Any]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError("review task file must contain a JSON object")
    validate_review_task(data)
    return data
