from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
TABLE_NAME = "input_queue"

TEST_RECORD = {
    "source": "pc",
    "input_type": "note",
    "symbol": "601138.SS",
    "payload": {
        "content": "Python写入测试",
        "test": True,
    },
    "client_request_id": "pc-test-001",
    "schema_version": "1.0",
}


def main() -> int:
    load_dotenv(ENV_PATH, override=False)

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    missing = []
    if not supabase_url:
        missing.append("SUPABASE_URL")
    if not supabase_key:
        missing.append("SUPABASE_KEY")
    if missing:
        print(f"Missing required environment variables: {', '.join(missing)}")
        return 2

    try:
        client = create_client(supabase_url, supabase_key)
        response = client.table(TABLE_NAME).insert(TEST_RECORD).execute()
    except Exception as exc:
        print(f"Supabase insert failed: {type(exc).__name__}: {exc}")
        return 1

    rows = getattr(response, "data", None)
    if not rows:
        print("Supabase insert failed: response did not include inserted row data.")
        return 1

    record = rows[0] if isinstance(rows, list) else rows
    record_id = _safe_field(record, "id")
    created_at = _safe_field(record, "created_at")

    print("insert success")
    print(f"id: {record_id}")
    print(f"created_at: {created_at}")
    return 0


def _safe_field(record: Any, field_name: str) -> Any:
    if isinstance(record, dict):
        return record.get(field_name)
    return None


if __name__ == "__main__":
    raise SystemExit(main())
