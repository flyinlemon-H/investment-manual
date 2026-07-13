from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv
from supabase import create_client as supabase_create_client


ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT / ".env"


def create_client():
    """Create a Supabase client from local environment variables.

    This helper intentionally does not print or log the Supabase key.
    """

    load_dotenv(ENV_PATH, override=False)
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    missing = []
    if not supabase_url:
        missing.append("SUPABASE_URL")
    if not supabase_key:
        missing.append("SUPABASE_KEY")
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")
    return supabase_create_client(supabase_url, supabase_key)


def describe_config() -> dict[str, str]:
    """Return non-sensitive Supabase config diagnostics."""

    load_dotenv(ENV_PATH, override=False)
    supabase_url = os.getenv("SUPABASE_URL") or ""
    parsed = urlparse(supabase_url)
    return {
        "host": parsed.netloc or "unknown",
        "keyConfigured": "yes" if os.getenv("SUPABASE_KEY") else "no",
    }
