from __future__ import annotations

import argparse
import copy
import json
import os
import shutil
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.market_data.updater import update_market_data, write_bridge


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    input_path = Path(args.input) if args.input else ROOT / "data" / "latest_export.json"
    bridge_path = Path(args.bridge) if args.bridge else ROOT / "data" / "market_data_bridge.js"
    if not input_path.is_absolute():
        input_path = ROOT / input_path
    if not bridge_path.is_absolute():
        bridge_path = ROOT / bridge_path
    state = _load_and_validate_state(input_path)
    working_state = copy.deepcopy(state)
    symbols = None if args.all else {args.symbol.strip().upper()}
    results = update_market_data(working_state, symbols=symbols, start=_date(args.start), end=_date(args.end))
    if not results:
        print("symbols: 0\nsuccess: 0\nfailed: 0")
        return 1
    success = sum(1 for row in results if row["success"])
    failed = len(results) - success
    backup_path = None
    write_status = "dry-run"
    bridge_status = "dry-run"
    if not args.dry_run:
        try:
            backup_path = _create_backup(input_path)
            _atomic_write_json(input_path, working_state)
            write_status = "success"
        except Exception as exc:
            print(f"backupPath: {backup_path or ''}")
            print(f"formalDataPath: {input_path}")
            print(f"writeStatus: failed ({exc})")
            print("bridgeStatus: skipped")
            return 1
        try:
            write_bridge(working_state, bridge_path)
            bridge_status = "success"
        except Exception as exc:
            bridge_status = f"failed ({exc})"
    print(f"symbols: {len(results)}")
    print(f"success: {success}")
    print(f"failed: {failed}")
    for row in results:
        suffix = f"error={row['error']}" if row["error"] else f"current={row['current_last_date'] or '-'} projected={row['latest_trade_date'] or '-'} added={row['added']} provider={row['provider']} technical_stale={str(row['technical_analysis_stale']).lower()} replacedLegacyHistory={str(row['replaced_legacy_history']).lower()}"
        print(f"{row['symbol']}: {suffix}")
    print(f"backupPath: {backup_path or ''}")
    print(f"formalDataPath: {input_path}")
    print(f"writeStatus: {write_status}")
    print(f"bridgePath: {bridge_path}")
    print(f"bridgeStatus: {bridge_status}")
    print("nextStep: 刷新或重新打开 index.html 查看日K新鲜度。")
    if write_status == "success" and not bridge_status.startswith("success"):
        print("warning: 正式数据已更新，但桥接刷新失败；请重新生成 data/market_data_bridge.js。")
    return 0 if not failed else 2


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Update existing stock.priceHistory with post-market daily bars.")
    group = result.add_mutually_exclusive_group(required=True)
    group.add_argument("--all", action="store_true")
    group.add_argument("--symbol")
    result.add_argument("--start", help="YYYY-MM-DD")
    result.add_argument("--end", help="YYYY-MM-DD")
    result.add_argument("--input", help="Formal portfolio export JSON; defaults to data/latest_export.json")
    result.add_argument("--bridge", help="Browser bridge output; defaults to data/market_data_bridge.js")
    result.add_argument("--dry-run", action="store_true", help="Fetch and calculate changes without writing formal or bridge data")
    return result


def _date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def _load_and_validate_state(path: Path) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    _validate_state(payload)
    return payload


def _validate_state(payload: object) -> None:
    if not isinstance(payload, dict):
        raise ValueError("formal data must be a JSON object")
    if not isinstance(payload.get("stocks"), list):
        raise ValueError("formal data stocks must be an array")


def _create_backup(path: Path, now: datetime | None = None) -> Path:
    timestamp = (now or datetime.now()).strftime("%Y%m%d_%H%M%S")
    backup_dir = path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / f"{path.stem}_before_market_update_{timestamp}{path.suffix}"
    shutil.copy2(path, backup_path)
    _load_and_validate_state(backup_path)
    return backup_path


def _atomic_write_json(path: Path, payload: dict) -> None:
    _validate_state(payload)
    temp = path.with_suffix(path.suffix + ".tmp")
    try:
        with temp.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        _load_and_validate_state(temp)
        os.replace(temp, path)
        _load_and_validate_state(path)
    except Exception:
        temp.unlink(missing_ok=True)
        raise


if __name__ == "__main__":
    raise SystemExit(main())
