import json
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.decision.task_resolution import build_task_resolution_projection, write_new_resolutions


DRAFT_DIR = ROOT / "data" / "ai_drafts"
REVIEW_DIRS = [
    ROOT / "review_queue" / "pending",
    ROOT / "data" / "review_queue" / "pending",
]
DECISION_OUTCOME_DIR = ROOT / "data" / "decision_outcomes"
DISCUSSION_DIR = ROOT / "data" / "ai_discussions"
PLAN_UPDATE_REQUEST_DIR = ROOT / "data" / "plan_update_requests"
PLAN_APPLICATION_AUDIT_DIR = ROOT / "data" / "plan_change_audits"
TASK_RESOLUTION_DIR = ROOT / "data" / "task_resolutions"
DEFAULT_OUTPUT = ROOT / "data" / "ai_decision_review_data.js"


def read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"_read_error": str(exc), "_path": str(path)}
    return data if isinstance(data, dict) else {"_read_error": "JSON root is not an object", "_path": str(path)}


def read_json_dir(directory: Path) -> list[dict[str, Any]]:
    if not directory.exists():
        return []
    records: list[dict[str, Any]] = []
    for path in sorted(directory.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True):
        record = read_json(path)
        record["_source_path"] = str(path)
        records.append(record)
    return records


def read_review_tasks() -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    seen: set[str] = set()
    for directory in REVIEW_DIRS:
        for record in read_json_dir(directory):
            review_id = str(record.get("review_id") or record.get("_source_path") or "")
            if review_id in seen:
                continue
            seen.add(review_id)
            records.append(record)
    return records


def is_ai_decision_task(record: dict[str, Any]) -> bool:
    payload = record.get("payload") if isinstance(record.get("payload"), dict) else {}
    task_type = str(record.get("task_type") or "")
    source_id = str(record.get("source_input_id") or "")
    return (
        task_type == "long_term_logic_review"
        or source_id.startswith("draft_")
        or bool(payload.get("ai_draft_path") or payload.get("draft_id"))
    )


def build_payload() -> dict[str, Any]:
    ai_drafts = read_json_dir(DRAFT_DIR)
    review_tasks = [record for record in read_review_tasks() if is_ai_decision_task(record)]
    decision_outcomes = read_json_dir(DECISION_OUTCOME_DIR)
    plan_update_requests = read_json_dir(PLAN_UPDATE_REQUEST_DIR)
    plan_application_audits = read_json_dir(PLAN_APPLICATION_AUDIT_DIR)
    existing_resolutions = read_json_dir(TASK_RESOLUTION_DIR)
    projection = build_task_resolution_projection(
        ai_drafts,
        review_tasks,
        decision_outcomes,
        plan_update_requests,
        plan_application_audits,
        existing_resolutions,
    )
    written = write_new_resolutions(TASK_RESOLUTION_DIR, projection["taskResolutions"])
    return {
        "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "aiDrafts": ai_drafts,
        "reviewTasks": review_tasks,
        "decisionOutcomes": decision_outcomes,
        "discussionRecords": read_json_dir(DISCUSSION_DIR),
        "planUpdateRequests": plan_update_requests,
        "planApplicationAudits": plan_application_audits,
        **projection,
        "newResolutionFiles": [str(path) for path in written],
    }


def render_js(payload: dict[str, Any]) -> str:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return "window.AI_DECISION_REVIEW_DATA = " + body + ";\n"


def main() -> int:
    DEFAULT_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = build_payload()
    temp = DEFAULT_OUTPUT.with_suffix(DEFAULT_OUTPUT.suffix + ".tmp")
    try:
        with temp.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(render_js(payload))
            handle.flush()
            os.fsync(handle.fileno())
        temp.read_text(encoding="utf-8")
        os.replace(temp, DEFAULT_OUTPUT)
    except Exception:
        temp.unlink(missing_ok=True)
        raise
    print(f"generated: {DEFAULT_OUTPUT}")
    print(f"aiDrafts: {len(payload['aiDrafts'])}")
    print(f"reviewTasks: {len(payload['reviewTasks'])}")
    print(f"decisionOutcomes: {len(payload['decisionOutcomes'])}")
    print(f"discussionRecords: {len(payload['discussionRecords'])}")
    print(f"planUpdateRequests: {len(payload['planUpdateRequests'])}")
    print(f"taskResolutions: {len(payload['taskResolutions'])}")
    print(f"homeTasks: {len(payload['homeTaskProjections'])}")
    print(f"historyTasks: {len(payload['historyProjections'])}")
    print(f"newResolutions: {len(payload['newResolutionFiles'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
