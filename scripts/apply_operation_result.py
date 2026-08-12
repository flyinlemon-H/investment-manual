from __future__ import annotations

import argparse
import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.generate_ai_decision_review_data import refresh_bridge as refresh_ai_decision_review_bridge
from src.decision.task_resolution import operation_resolution_from_audit, write_new_resolutions
from src.operation_entry.application import (
    apply_operation_result,
    atomic_write_json,
    build_application_preview,
    create_backup,
    load_json,
    restore_backup_atomic,
    verify_non_target_fields_unchanged,
    write_operation_bridge,
)


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    request_path = resolve(args.request)
    formal_path = resolve(args.input or "data/latest_export.json")
    audit_dir = resolve(args.audit_dir or "data/operation_audits")
    resolution_dir = resolve(args.resolution_dir or "data/task_resolutions")
    bridge_path = resolve(args.bridge or "data/operation_application_status_bridge.js")
    request = load_json(request_path)
    application_id = str(request.get("application_id") or "")
    if not application_id:
        print("result: rejected")
        print("error: missing application_id")
        return 1
    audit_path = audit_dir / f"{application_id}.json"
    if audit_path.exists():
        print("result: already_applied")
        print(f"auditPath: {audit_path}")
        return 0

    state = load_json(formal_path)
    preview = build_application_preview(request, state)
    print(f"mode: {'apply' if args.apply else 'dry-run'}")
    print(f"applicationId: {application_id}")
    print(f"sourceType: {request.get('source_type') or ''}")
    print(f"symbol: {request.get('symbol') or ''}")
    print(f"positionChange: {preview.get('position_change') or 'unknown'}")
    print(f"previousShares: {preview.get('previous_shares')}")
    print(f"newShares: {preview.get('new_shares')}")
    print(f"previousAvgCost: {preview.get('previous_avg_cost')}")
    print(f"newAvgCost: {preview.get('new_avg_cost')}")
    print(f"beforeSnapshotHash: {preview.get('before_snapshot_hash') or ''}")
    print("fieldsToModify: " + ", ".join(preview.get("fields_to_modify") or []))
    print("fieldsUnchanged: " + ", ".join(preview.get("fields_unchanged") or []))
    for warning in preview.get("warnings") or []:
        print(f"warning: {warning}")
    if not preview.get("valid"):
        for error in preview.get("errors") or []:
            print(f"error: {error}")
        print("result: rejected")
        return 1
    if not args.apply:
        print("result: dry_run_valid")
        print("writeStatus: not_written")
        print("auditStatus: not_written")
        print("resolutionStatus: not_written")
        print("bridgeStatus: not_written")
        return 0

    before = copy.deepcopy(state)
    updated = copy.deepcopy(state)
    result = apply_operation_result(request, updated)
    verify_non_target_fields_unchanged(before, updated, request["symbol"])
    backup_path = create_backup(formal_path)
    audit = {
        "application_id": application_id,
        "draft_id": request["draft_id"],
        "source_type": request["source_type"],
        "source_request_id": request["source_request_id"],
        "source_decision_id": request["source_decision_id"],
        "source_review_id": request["source_review_id"],
        "symbol": request["symbol"],
        "task_type": request.get("task_type") or "long_term_logic_review",
        "applied_at": result["applied_at"],
        "operation_date": result["operation_date"],
        "backup_path": str(backup_path),
        "before_snapshot_hash": result["before_snapshot_hash"],
        "after_snapshot_hash": result["after_snapshot_hash"],
        "previous_shares": result["previous_shares"],
        "new_shares": result["new_shares"],
        "previous_avg_cost": result["previous_avg_cost"],
        "new_avg_cost": result["new_avg_cost"],
        "modified_fields": result["modified_fields"],
        "warnings": result["warnings"],
        "result": "applied",
        "schema_version": request.get("schema_version") or "1.0",
    }
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    resolution_path: Path | None = None
    resolution_status = "not_created_manual_operation"
    try:
        atomic_write_json(formal_path, updated)
        verify_non_target_fields_unchanged(before, load_json(formal_path), request["symbol"])
        atomic_write_json(audit_path, audit)
        if request["source_type"] == "operation_request":
            resolution = operation_resolution_from_audit(audit)
            written = write_new_resolutions(resolution_dir, [resolution])
            resolution_path = written[0] if written else resolution_dir / f"{resolution['resolution_id']}.json"
            resolution_status = "success"
    except Exception:
        restore_backup_atomic(backup_path, formal_path)
        audit_path.unlink(missing_ok=True)
        if resolution_path:
            resolution_path.unlink(missing_ok=True)
        raise

    bridge_status = "success"
    try:
        write_operation_bridge(bridge_path, audit)
    except Exception as exc:
        bridge_status = f"failed ({exc})"

    decision_bridge_status = "skipped_non_formal_output"
    if (
        audit_dir.resolve() == (ROOT / "data" / "operation_audits").resolve()
        and resolution_dir.resolve() == (ROOT / "data" / "task_resolutions").resolve()
    ):
        try:
            refresh_ai_decision_review_bridge()
            decision_bridge_status = "success"
        except Exception as exc:
            decision_bridge_status = f"failed ({exc})"

    print("result: applied")
    print(f"backupPath: {backup_path}")
    print(f"auditPath: {audit_path}")
    print(f"resolutionStatus: {resolution_status}")
    print(f"resolutionPath: {resolution_path or ''}")
    print(f"afterSnapshotHash: {result['after_snapshot_hash']}")
    print(f"bridgeStatus: {bridge_status}")
    print(f"decisionBridgeStatus: {decision_bridge_status}")
    print(
        "rollbackCommand: powershell -Command "
        f"\"Copy-Item -LiteralPath '{backup_path}' -Destination '{formal_path}' -Force\""
    )
    return 0


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(
        description="Safely apply a user-confirmed Operation Application Request."
    )
    value.add_argument("--request", required=True)
    mode = value.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    value.add_argument("--input")
    value.add_argument("--audit-dir")
    value.add_argument("--resolution-dir")
    value.add_argument("--bridge")
    return value


def resolve(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


if __name__ == "__main__":
    raise SystemExit(main())
