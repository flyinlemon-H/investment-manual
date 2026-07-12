import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DRAFT_DIR = ROOT / "data" / "ai_drafts"
REVIEW_DIRS = [
    ROOT / "review_queue" / "pending",
    ROOT / "data" / "review_queue" / "pending",
]
DECISION_OUTCOME_DIR = ROOT / "data" / "decision_outcomes"
DISCUSSION_DIR = ROOT / "data" / "ai_discussions"
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
    return {
        "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "aiDrafts": read_json_dir(DRAFT_DIR),
        "reviewTasks": [record for record in read_review_tasks() if is_ai_decision_task(record)],
        "decisionOutcomes": read_json_dir(DECISION_OUTCOME_DIR),
        "discussionRecords": read_json_dir(DISCUSSION_DIR),
    }


def render_js(payload: dict[str, Any]) -> str:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return "window.AI_DECISION_REVIEW_DATA = " + body + ";\n"


def main() -> int:
    DEFAULT_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = build_payload()
    DEFAULT_OUTPUT.write_text(render_js(payload), encoding="utf-8")
    print(f"generated: {DEFAULT_OUTPUT}")
    print(f"aiDrafts: {len(payload['aiDrafts'])}")
    print(f"reviewTasks: {len(payload['reviewTasks'])}")
    print(f"decisionOutcomes: {len(payload['decisionOutcomes'])}")
    print(f"discussionRecords: {len(payload['discussionRecords'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
