from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.plan_update.application import apply_plan_update, atomic_write_json, build_application_preview, create_backup, load_json, write_application_bridge
from scripts.generate_ai_decision_review_data import main as refresh_ai_decision_review_bridge


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    request_path = resolve(args.request)
    formal_path = resolve(args.input or "data/latest_export.json")
    audit_dir = resolve(args.audit_dir or "data/plan_change_audits")
    bridge_path = resolve(args.bridge or "data/plan_application_status_bridge.js")
    request = load_json(request_path)
    application_id = str(request.get("application_id") or "")
    if not application_id:
        print("result: rejected\nerror: missing application_id")
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
    print(f"symbol: {request.get('symbol') or ''}")
    for row in preview.get("diff") or []:
        old = row.get("current") or {}; new = row.get("proposed") or {}
        print(f"diff: {row.get('change')} id={row.get('plan_id') or '-'} old={old.get('price', old.get('triggerPrice', '-'))} new={new.get('trigger_price', '-')}")
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
        return 0
    updated = copy.deepcopy(state)
    result = apply_plan_update(request, updated)
    backup_path = create_backup(formal_path)
    try:
        atomic_write_json(formal_path, updated)
        audit = {"application_id": application_id, "draft_id": request["draft_id"], "source_request_id": request["source_request_id"], "source_decision_id": request["source_decision_id"], "symbol": request["symbol"], "applied_at": result["applied_at"], "backup_path": str(backup_path), "before_snapshot_hash": result["before_snapshot_hash"], "after_snapshot_hash": result["after_snapshot_hash"], "retained_plan_ids": result["retained_plan_ids"], "archived_plan_ids": result["archived_plan_ids"], "created_plan_ids": result["created_plan_ids"], "warnings": result["warnings"], "result": "applied"}
        audit_dir.mkdir(parents=True, exist_ok=True)
        atomic_write_json(audit_path, audit)
    except Exception:
        atomic_write_json(formal_path, load_json(backup_path))
        audit_path.unlink(missing_ok=True)
        raise
    bridge_status = "success"
    try:
        write_application_bridge(bridge_path, audit)
    except Exception as exc:  # Formal data and audit remain authoritative.
        bridge_status = f"failed ({exc})"
    decision_bridge_status = "skipped_non_formal_audit_dir"
    if audit_dir.resolve() == (ROOT / "data" / "plan_change_audits").resolve():
        try:
            refresh_ai_decision_review_bridge()
            decision_bridge_status = "success"
        except Exception as exc:  # Formal data and audit remain authoritative.
            decision_bridge_status = f"failed ({exc})"
    print("result: applied")
    print(f"backupPath: {backup_path}")
    print(f"auditPath: {audit_path}")
    print(f"createdPlans: {len(result['created_plan_ids'])}")
    print(f"archivedPlans: {len(result['archived_plan_ids'])}")
    print(f"bridgeStatus: {bridge_status}")
    print(f"decisionBridgeStatus: {decision_bridge_status}")
    print(f"rollbackCommand: powershell -Command \"Copy-Item -LiteralPath '{backup_path}' -Destination '{formal_path}' -Force\"")
    return 0


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description="Safely apply a user-confirmed Plan Application Request.")
    value.add_argument("--request", required=True)
    mode = value.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    value.add_argument("--input")
    value.add_argument("--audit-dir")
    value.add_argument("--bridge")
    return value


def resolve(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


if __name__ == "__main__":
    raise SystemExit(main())
