from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
TABLE_NAME = "input_queue"


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
        response = client.table(TABLE_NAME).select("*").limit(5).execute()
    except Exception as exc:
        print(f"Supabase connection test failed: {type(exc).__name__}: {exc}")
        return 1

    rows = getattr(response, "data", None)
    if rows is None:
        print("Supabase connection succeeded, but response did not include data.")
        return 1

    print("Supabase connection succeeded.")
    print(f"Table: public.{TABLE_NAME}")
    print(f"Rows read: {len(rows)}")
    print(json.dumps(_safe_rows(rows), ensure_ascii=False, indent=2))
    return 0


def _safe_rows(rows: Any) -> Any:
    if isinstance(rows, list):
        return [_safe_value(row) for row in rows]
    return _safe_value(rows)


def _safe_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _safe_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_safe_value(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


if __name__ == "__main__":
    raise SystemExit(main())
