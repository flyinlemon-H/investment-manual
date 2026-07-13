from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.database.supabase_client import create_client, describe_config


QUEUE_ROOT = ROOT / "input_queue"
INCOMING_DIR = QUEUE_ROOT / "incoming"
RECEIVED_DIR = QUEUE_ROOT / "received"
PROCESSED_DIR = QUEUE_ROOT / "processed"
SCHEMA_NAME = "public"
TABLE_NAME = "input_queue"
INGESTION_PENDING = "pending"
ORDER_FIELD = "created_at"


def main() -> int:
    ensure_queue_dirs()

    try:
        print_client_config()
        client = create_client()
        rows = fetch_pending_rows(client)
        saved_files = save_rows(rows)
        updated_count = mark_rows_received(client, rows)
    except Exception as exc:
        print(f"Input queue sync failed: {type(exc).__name__}: {exc}")
        return 1

    print(f"synced: {len(rows)}")
    print("saved files:")
    for file_path in saved_files:
        print(f"- {file_path}")
    print(f"updated: {updated_count}")
    return 0


def ensure_queue_dirs() -> None:
    for directory in [INCOMING_DIR, RECEIVED_DIR, PROCESSED_DIR]:
        directory.mkdir(parents=True, exist_ok=True)


def fetch_pending_rows(client: Any) -> list[dict[str, Any]]:
    print(f"query table: {SCHEMA_NAME}.{TABLE_NAME}")
    print(f"query filter field repr: {'ingestion_status'!r}")
    print(f"query filter value repr: {INGESTION_PENDING!r}")
    print(f"query order: {ORDER_FIELD} asc")
    response = (
        table(client)
        .select("*")
        .eq("ingestion_status", INGESTION_PENDING)
        .order(ORDER_FIELD, desc=False)
        .execute()
    )
    data = getattr(response, "data", None)
    count = getattr(response, "count", None)
    print(f"response type: {type(response).__name__}")
    print(f"response count: {count!r}")
    print(f"response data type: {type(data).__name__}")
    if data is None:
        raise RuntimeError("Supabase response did not include data.")
    if not isinstance(data, list):
        raise RuntimeError("Supabase response data is not a list.")
    rows = [row for row in data if isinstance(row, dict)]
    print(f"query returned: {len(rows)}")
    return rows


def save_rows(rows: list[dict[str, Any]]) -> list[str]:
    saved_files = []
    for row in rows:
        row_id = row.get("id")
        if row_id in (None, ""):
            raise RuntimeError("Input queue row is missing id.")
        file_path = INCOMING_DIR / f"{row_id}.json"
        file_path.write_text(json.dumps(row, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
        saved_files.append(str(file_path))
    return saved_files


def mark_rows_received(client: Any, rows: list[dict[str, Any]]) -> int:
    updated_count = 0
    received_at = datetime.now(timezone.utc).isoformat()
    for row in rows:
        row_id = row.get("id")
        response = (
            table(client)
            .update(
                {
                    "ingestion_status": "received",
                    "received_at": received_at,
                }
            )
            .eq("id", row_id)
            .eq("ingestion_status", INGESTION_PENDING)
            .execute()
        )
        updated_rows = getattr(response, "data", None)
        if isinstance(updated_rows, list):
            updated_count += len(updated_rows)
        elif updated_rows:
            updated_count += 1
    return updated_count


def print_client_config() -> None:
    config = describe_config()
    print(f"supabase url host: {config['host']}")
    print(f"supabase key configured: {config['keyConfigured']}")


def table(client: Any) -> Any:
    if hasattr(client, "schema"):
        return client.schema(SCHEMA_NAME).table(TABLE_NAME)
    return client.table(TABLE_NAME)


if __name__ == "__main__":
    raise SystemExit(main())
