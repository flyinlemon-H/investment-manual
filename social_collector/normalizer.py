from __future__ import annotations

from .sentiment import classify_sentiment


FIELD_ALIASES = {
    "id": ("id", "post_id", "tweet_id", "status_id"),
    "platform": ("platform", "source_platform", "network"),
    "author": ("author", "user", "username", "screen_name", "account"),
    "symbol": ("symbol", "ticker", "stock", "asset"),
    "company": ("company", "company_name", "issuer", "name"),
    "content": ("content", "text", "body", "message", "post"),
    "url": ("url", "link", "permalink"),
    "post_time": ("post_time", "posted_at", "created_at", "published_at", "timestamp", "date", "time"),
    "likes": ("likes", "like_count", "favorites", "favorite_count"),
    "comments": ("comments", "comment_count", "replies", "reply_count"),
    "tags": ("tags", "tag", "keywords", "matched_keywords"),
    "summary": ("summary", "brief", "abstract"),
    "risk_points": ("risk_points", "risks", "risk"),
}


def normalize_post(raw_post: dict[str, str]) -> dict[str, object]:
    content = _first_value(raw_post, FIELD_ALIASES["content"])

    return {
        "platform": _first_value(raw_post, FIELD_ALIASES["platform"]) or "csv",
        "symbol": _first_value(raw_post, FIELD_ALIASES["symbol"]),
        "company": _first_value(raw_post, FIELD_ALIASES["company"]),
        "post_time": _first_value(raw_post, FIELD_ALIASES["post_time"]),
        "content": content,
        "url": _first_value(raw_post, FIELD_ALIASES["url"]) or "",
        "likes": _to_int(_first_value(raw_post, FIELD_ALIASES["likes"])),
        "comments": _to_int(_first_value(raw_post, FIELD_ALIASES["comments"])),
        "sentiment": classify_sentiment(content),
        "tags": _to_list(_first_value(raw_post, FIELD_ALIASES["tags"])),
        "matched_keywords": [],
        "summary": _first_value(raw_post, FIELD_ALIASES["summary"]) or "",
        "risk_points": _to_list(_first_value(raw_post, FIELD_ALIASES["risk_points"])),
    }


def _first_value(row: dict[str, str], aliases: tuple[str, ...]) -> str:
    lowered = {key.casefold(): value for key, value in row.items()}
    for alias in aliases:
        value = lowered.get(alias.casefold(), "")
        if value:
            return value
    return ""


def _fallback_id(row: dict[str, str]) -> str:
    source_file = row.get("_source_file", "unknown")
    row_number = row.get("_row_number", "unknown")
    return f"{source_file}:{row_number}"


def _to_int(value: str) -> int:
    if not value:
        return 0
    try:
        return int(float(value.replace(",", "")))
    except ValueError:
        return 0


def _to_list(value: str) -> list[str]:
    if not value:
        return []
    normalized = value.replace("，", ";").replace(",", ";").replace("|", ";")
    return [item.strip() for item in normalized.split(";") if item.strip()]

