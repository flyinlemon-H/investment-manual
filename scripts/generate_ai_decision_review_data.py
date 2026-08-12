import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.decision.decision_integration import decision_outcome_to_operation_request
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
OPERATION_REQUEST_DIR = ROOT / "data" / "operation_requests"
OPERATION_APPLICATION_AUDIT_DIR = ROOT / "data" / "operation_audits"
TASK_RESOLUTION_DIR = ROOT / "data" / "task_resolutions"
DEFAULT_OUTPUT = ROOT / "data" / "ai_decision_review_data.js"

PUBLIC_PAYLOAD_FIELDS = (
    "generatedAt",
    "aiDrafts",
    "reviewTasks",
    "decisionOutcomes",
    "discussionRecords",
    "planUpdateRequests",
    "operationRequests",
    "planApplicationAudits",
    "operationApplicationAudits",
    "taskResolutions",
    "taskProjections",
    "homeTaskProjections",
    "historyProjections",
    "systemIssues",
)
PRIVATE_PATH_KEYS = {
    "_path",
    "_source_path",
    "ai_draft_path",
    "backup_path",
    "draft_path",
    "failure_path",
    "log_path",
    "output_path",
    "review_task_path",
}
_WINDOWS_ABSOLUTE_PATH = re.compile(r"^[A-Za-z]:[\\/]")


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


def read_review_tasks(directories: list[Path] | None = None) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    seen: set[str] = set()
    for directory in directories or REVIEW_DIRS:
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


def build_payload(
    root: Path | None = None,
    *,
    data_root: Path | None = None,
    review_dirs: list[Path] | None = None,
) -> dict[str, Any]:
    if data_root is not None:
        data_dir = Path(data_root)
        selected_review_dirs = review_dirs or [data_dir / "review_queue" / "pending"]
    elif root is not None:
        selected_root = Path(root)
        data_dir = selected_root / "data"
        selected_review_dirs = [selected_root / "review_queue" / "pending", data_dir / "review_queue" / "pending"]
    else:
        data_dir = ROOT / "data"
        selected_review_dirs = REVIEW_DIRS

    draft_dir = DRAFT_DIR if root is None and data_root is None else data_dir / "ai_drafts"
    decision_outcome_dir = DECISION_OUTCOME_DIR if root is None and data_root is None else data_dir / "decision_outcomes"
    discussion_dir = DISCUSSION_DIR if root is None and data_root is None else data_dir / "ai_discussions"
    plan_update_request_dir = PLAN_UPDATE_REQUEST_DIR if root is None and data_root is None else data_dir / "plan_update_requests"
    plan_application_audit_dir = PLAN_APPLICATION_AUDIT_DIR if root is None and data_root is None else data_dir / "plan_change_audits"
    operation_request_dir = OPERATION_REQUEST_DIR if root is None and data_root is None else data_dir / "operation_requests"
    operation_application_audit_dir = OPERATION_APPLICATION_AUDIT_DIR if root is None and data_root is None else data_dir / "operation_audits"
    task_resolution_dir = TASK_RESOLUTION_DIR if root is None and data_root is None else data_dir / "task_resolutions"

    ai_drafts = read_json_dir(draft_dir)
    review_tasks = [record for record in read_review_tasks(selected_review_dirs) if is_ai_decision_task(record)]
    decision_outcomes = read_json_dir(decision_outcome_dir)
    plan_update_requests = read_json_dir(plan_update_request_dir)
    operation_requests = read_json_dir(operation_request_dir)
    known_operation_decisions = {str(item.get("source_decision_id") or "") for item in operation_requests}
    for outcome in decision_outcomes:
        if outcome.get("outcome_type") != "operation_request":
            continue
        decision_id = str(outcome.get("decision_id") or "")
        if decision_id in known_operation_decisions:
            continue
        try:
            request = decision_outcome_to_operation_request(outcome)
        except ValueError:
            continue
        if request:
            request["source_review_id"] = outcome.get("source_review_id")
            operation_requests.append(request)
            known_operation_decisions.add(decision_id)
    plan_application_audits = read_json_dir(plan_application_audit_dir)
    operation_application_audits = read_json_dir(operation_application_audit_dir)
    existing_resolutions = read_json_dir(task_resolution_dir)
    projection = build_task_resolution_projection(
        ai_drafts,
        review_tasks,
        decision_outcomes,
        plan_update_requests,
        plan_application_audits,
        existing_resolutions,
        operation_application_audits=operation_application_audits,
    )
    written = write_new_resolutions(task_resolution_dir, projection["taskResolutions"])
    return {
        "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "aiDrafts": ai_drafts,
        "reviewTasks": review_tasks,
        "decisionOutcomes": decision_outcomes,
        "discussionRecords": read_json_dir(discussion_dir),
        "planUpdateRequests": plan_update_requests,
        "operationRequests": operation_requests,
        "planApplicationAudits": plan_application_audits,
        "operationApplicationAudits": operation_application_audits,
        **projection,
        "newResolutionFiles": [str(path) for path in written],
}


def _is_private_path_key(key: str) -> bool:
    normalized = str(key).strip().lower()
    collapsed = re.sub(r"[^a-z0-9]", "", normalized)
    return (
        normalized in PRIVATE_PATH_KEYS
        or normalized.endswith("_path")
        or normalized.endswith("_paths")
        or collapsed.endswith("path")
        or collapsed.endswith("paths")
    )


def _looks_like_private_path(value: str) -> bool:
    text = str(value).strip()
    normalized = text.replace("\\", "/")
    lowered = normalized.lower()
    return bool(
        _WINDOWS_ABSOLUTE_PATH.match(text)
        or text.startswith("\\\\")
        or lowered.startswith("/users/")
        or lowered.startswith("/home/")
        or lowered.startswith("users/")
        or lowered.startswith("home/")
        or lowered.startswith("onedrive/")
        or "/users/" in lowered
        or "/onedrive/" in lowered
        or lowered.startswith("data/ai_drafts/")
        or lowered.startswith("data/review_queue/")
        or "/data/ai_drafts/" in lowered
        or "/data/review_queue/" in lowered
        or lowered == ".env"
        or lowered.startswith(".env/")
        or lowered.endswith("/.env")
        or "投资分析程序" in normalized
    )


def public_projection(value: Any) -> Any:
    if isinstance(value, dict):
        projected: dict[str, Any] = {}
        for key, item in value.items():
            if _is_private_path_key(key):
                continue
            if isinstance(item, str) and _looks_like_private_path(item):
                continue
            projected[key] = public_projection(item)
        return projected
    if isinstance(value, list):
        return [public_projection(item) for item in value if not (isinstance(item, str) and _looks_like_private_path(item))]
    return value


def build_public_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        key: public_projection(payload[key])
        for key in PUBLIC_PAYLOAD_FIELDS
        if key in payload
    }


def render_js(payload: dict[str, Any]) -> str:
    body = json.dumps(build_public_payload(payload), ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return "window.AI_DECISION_REVIEW_DATA = " + body + ";\n"


def refresh_bridge(
    *,
    root: Path | None = None,
    data_root: Path | None = None,
    review_dirs: list[Path] | None = None,
    output: Path | None = None,
) -> int:
    target = Path(output) if output is not None else (Path(root) / "data" / "ai_decision_review_data.js" if root is not None else DEFAULT_OUTPUT)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = build_payload(root, data_root=data_root, review_dirs=review_dirs)
    public_payload = build_public_payload(payload)
    temp = target.with_suffix(target.suffix + ".tmp")
    try:
        with temp.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(render_js(payload))
            handle.flush()
            os.fsync(handle.fileno())
        temp.read_text(encoding="utf-8")
        os.replace(temp, target)
    except Exception:
        temp.unlink(missing_ok=True)
        raise
    print(f"generated: {target}")
    print(f"aiDrafts: {len(public_payload.get('aiDrafts') or [])}")
    print(f"reviewTasks: {len(public_payload.get('reviewTasks') or [])}")
    print(f"decisionOutcomes: {len(public_payload.get('decisionOutcomes') or [])}")
    print(f"discussionRecords: {len(public_payload.get('discussionRecords') or [])}")
    print(f"planUpdateRequests: {len(public_payload.get('planUpdateRequests') or [])}")
    print(f"operationRequests: {len(public_payload.get('operationRequests') or [])}")
    print(f"operationApplicationAudits: {len(public_payload.get('operationApplicationAudits') or [])}")
    print(f"taskResolutions: {len(public_payload.get('taskResolutions') or [])}")
    print(f"homeTasks: {len(public_payload.get('homeTaskProjections') or [])}")
    print(f"historyTasks: {len(public_payload.get('historyProjections') or [])}")
    print(f"newResolutions: {len(payload.get('newResolutionFiles') or [])}")
    return 0


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate the public AI decision review browser bridge.")
    commands = parser.add_subparsers(dest="command", required=True)
    refresh = commands.add_parser("refresh", help="Explicitly refresh the bridge projection.")
    refresh.add_argument("--root", type=Path, default=ROOT)
    refresh.add_argument("--output", type=Path, default=None)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = create_parser().parse_args(argv)
    if args.command == "refresh":
        return refresh_bridge(root=args.root, output=args.output)
    raise ValueError(f"Unsupported command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
