from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


POST_REQUIRED_FIELDS = {
    "platform": str,
    "symbol": str,
    "company": str,
    "post_time": str,
    "content": str,
    "url": str,
    "likes": int,
    "comments": int,
    "sentiment": str,
    "matched_keywords": list,
    "summary": str,
    "risk_points": list,
}

SUMMARY_REQUIRED_FIELDS = {
    "symbol": str,
    "company": str,
    "today_heat": int,
    "post_count": int,
    "bullish_count": int,
    "bearish_count": int,
    "neutral_count": int,
    "sentiment_score": (int, float),
    "hot_keywords": list,
    "risk_points": list,
    "updated_at": str,
}

VALID_SENTIMENTS = {"bullish", "bearish", "neutral"}
SUMMARY_OPTIONAL_FIELDS = {
    "ai_brief": str,
    "bullish_points": list,
    "bearish_points": list,
    "risk_points": list,
    "review_flags": list,
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate social_posts.json and social_summary.json for the investment manual.")
    parser.add_argument("--posts", help="Path to social_posts.json.")
    parser.add_argument("--summary", help="Path to social_summary.json.")
    parser.add_argument("--watchlist", help="Path to watchlist.json.")
    parser.add_argument(
        "--mode",
        choices=("strict", "frontend"),
        default="strict",
        help="strict validates collector standard output; frontend validates files readable by the HTML app.",
    )
    args = parser.parse_args(argv)

    errors: list[str] = []
    warnings: list[str] = []
    if not args.posts and not args.summary and not args.watchlist:
        args.posts = "social_posts.json"
        args.summary = "social_summary.json"

    posts = _load_root_array(Path(args.posts), "social_posts", errors, warnings, args.mode) if args.posts else None
    summary = _load_root_array(Path(args.summary), "social_summary", errors, warnings, args.mode) if args.summary else None
    watchlist = _load_root_array(Path(args.watchlist), "watchlist", errors, warnings, args.mode) if args.watchlist else None

    if posts is not None:
        _validate_posts(posts, errors, args.mode)
    if summary is not None:
        _validate_summary(summary, errors, args.mode)
    if watchlist is not None:
        _validate_watchlist(watchlist, errors)

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    for warning in warnings:
        print(f"WARNING: {warning}", file=sys.stderr)
    parts = []
    if posts is not None:
        parts.append(f"{len(posts)} social posts")
    if summary is not None:
        parts.append(f"{len(summary)} summary rows")
    if watchlist is not None:
        parts.append(f"{len(watchlist)} watchlist rows")
    print(f"OK: {', '.join(parts)} are valid.")
    return 0


def _load_root_array(
    path: Path,
    key: str,
    errors: list[str],
    warnings: list[str],
    mode: str,
) -> list[dict[str, Any]] | None:
    if not path.exists():
        errors.append(f"{path} does not exist.")
        return None

    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:
        errors.append(f"{path} is not valid JSON: {exc}")
        return None

    if isinstance(payload, list):
        rows = payload
        if mode == "strict":
            warnings.append(f"{path} is a bare array; collector standard output should be an object with root key {key!r}.")
    elif isinstance(payload, dict):
        rows = payload.get(key)
    else:
        errors.append(f"{path} must be a bare array or an object with root key {key!r}.")
        return None
    if not isinstance(rows, list):
        errors.append(f"{path} root key {key!r} must be a list.")
        return None
    if not all(isinstance(row, dict) for row in rows):
        errors.append(f"{path} {key!r} must contain only objects.")
        return None
    return rows


def _validate_posts(posts: list[dict[str, Any]], errors: list[str], mode: str) -> None:
    seen_keys: set[tuple[str, str, str, str]] = set()
    for index, post in enumerate(posts, start=1):
        prefix = f"social_posts[{index}]"
        required_fields = {key: value for key, value in POST_REQUIRED_FIELDS.items() if key not in {"likes", "comments"}}
        _check_fields(prefix, post, required_fields, errors)
        if mode == "strict":
            _check_forbidden_fields(prefix, post, {"alias"}, errors)
        _check_number_field(prefix, post, "likes", mode, errors)
        _check_number_field(prefix, post, "comments", mode, errors)
        if post.get("sentiment") not in VALID_SENTIMENTS:
            errors.append(f"{prefix}.sentiment must be one of {sorted(VALID_SENTIMENTS)}.")
        if not str(post.get("symbol", "")).strip():
            errors.append(f"{prefix}.symbol must not be empty.")
        if not str(post.get("content", "")).strip():
            errors.append(f"{prefix}.content must not be empty.")
        if not str(post.get("post_time", "")).strip():
            errors.append(f"{prefix}.post_time must not be empty.")
        if any(not isinstance(item, str) for item in post.get("matched_keywords", [])):
            errors.append(f"{prefix}.matched_keywords must contain only strings.")
        if any(not isinstance(item, str) for item in post.get("risk_points", [])):
            errors.append(f"{prefix}.risk_points must contain only strings.")
        if "tags" in post:
            if not isinstance(post["tags"], list):
                errors.append(f"{prefix}.tags must be a list when present.")
            elif any(not isinstance(item, str) for item in post["tags"]):
                errors.append(f"{prefix}.tags must contain only strings.")
        if "aliases" in post:
            if not isinstance(post["aliases"], list):
                errors.append(f"{prefix}.aliases must be a list when present.")
            elif any(not isinstance(item, str) for item in post["aliases"]):
                errors.append(f"{prefix}.aliases must contain only strings.")

        url = str(post.get("url", "") or "").strip()
        symbol = str(post.get("symbol", "") or "").strip().upper()
        platform = str(post.get("platform", "") or "").strip().casefold()
        post_time = str(post.get("post_time", "") or "").strip()
        content = str(post.get("content", "") or "")
        if symbol:
            if url:
                key = (platform, symbol, "url", url)
            else:
                content_hash = hashlib.sha256(content.encode("utf-8", errors="replace")).hexdigest()
                key = (platform, symbol, post_time, content_hash)
            if key in seen_keys:
                errors.append(f"{prefix} duplicates collector key: platform={platform} symbol={symbol} url={url or '<empty>'}.")
            seen_keys.add(key)


def _validate_summary(summary: list[dict[str, Any]], errors: list[str], mode: str) -> None:
    for index, row in enumerate(summary, start=1):
        prefix = f"social_summary[{index}]"
        _check_fields(prefix, row, SUMMARY_REQUIRED_FIELDS, errors)
        if mode == "strict":
            _check_forbidden_fields(prefix, row, {"alias", "hot_topics"}, errors)
        if not str(row.get("symbol", "")).strip():
            errors.append(f"{prefix}.symbol must not be empty.")
        if row.get("post_count", 0) < 0:
            errors.append(f"{prefix}.post_count must be non-negative.")
        if not -1 <= float(row.get("sentiment_score", 0)) <= 1:
            errors.append(f"{prefix}.sentiment_score must be between -1 and 1.")
        if not _looks_like_datetime(str(row.get("updated_at", ""))):
            errors.append(f"{prefix}.updated_at must be an ISO-like datetime string.")
        if any(not isinstance(item, str) for item in row.get("risk_points", [])):
            errors.append(f"{prefix}.risk_points must contain only strings.")
        _check_optional_summary_fields(prefix, row, errors)
        if "aliases" in row:
            if not isinstance(row["aliases"], list):
                errors.append(f"{prefix}.aliases must be a list when present.")
            elif any(not isinstance(item, str) for item in row["aliases"]):
                errors.append(f"{prefix}.aliases must contain only strings.")
        for topic_index, topic in enumerate(row.get("hot_keywords", []), start=1):
            if not isinstance(topic, dict):
                errors.append(f"{prefix}.hot_keywords[{topic_index}] must be an object.")
                continue
            if not isinstance(topic.get("keyword"), str) or not topic.get("keyword"):
                errors.append(f"{prefix}.hot_keywords[{topic_index}].keyword must be a non-empty string.")
            if not isinstance(topic.get("count"), int):
                errors.append(f"{prefix}.hot_keywords[{topic_index}].count must be an integer.")


def _check_optional_summary_fields(prefix: str, row: dict[str, Any], errors: list[str]) -> None:
    for field, expected_type in SUMMARY_OPTIONAL_FIELDS.items():
        if field not in row:
            continue
        if not isinstance(row[field], expected_type):
            errors.append(f"{prefix}.{field} must be {expected_type} when present.")
            continue
        if expected_type is list and any(not isinstance(item, str) for item in row[field]):
            errors.append(f"{prefix}.{field} must contain only strings when present.")


def _validate_watchlist(watchlist: list[dict[str, Any]], errors: list[str]) -> None:
    required = {
        "symbol": str,
        "company": str,
        "aliases": list,
        "keywords": list,
    }
    for index, row in enumerate(watchlist, start=1):
        prefix = f"watchlist[{index}]"
        _check_fields(prefix, row, required, errors)
        _check_forbidden_fields(prefix, row, {"alias"}, errors)
        if not str(row.get("symbol", "")).strip():
            errors.append(f"{prefix}.symbol must not be empty.")
        if not str(row.get("company", "")).strip():
            errors.append(f"{prefix}.company must not be empty.")
        for field in ("aliases", "keywords"):
            values = row.get(field, [])
            if isinstance(values, list) and any(not isinstance(item, str) or not item.strip() for item in values):
                errors.append(f"{prefix}.{field} must contain only non-empty strings.")


def _check_fields(prefix: str, row: dict[str, Any], required: dict[str, Any], errors: list[str]) -> None:
    for field, expected_type in required.items():
        if field not in row:
            errors.append(f"{prefix}.{field} is missing.")
            continue
        if not isinstance(row[field], expected_type):
            errors.append(f"{prefix}.{field} must be {expected_type}.")


def _check_forbidden_fields(prefix: str, row: dict[str, Any], forbidden: set[str], errors: list[str]) -> None:
    for field in sorted(forbidden):
        if field in row:
            errors.append(f"{prefix}.{field} is a legacy compatibility field and is not allowed in standard data.")


def _check_number_field(prefix: str, row: dict[str, Any], field: str, mode: str, errors: list[str]) -> None:
    value = row.get(field)
    if mode == "strict":
        if not isinstance(value, int) or isinstance(value, bool):
            errors.append(f"{prefix}.{field} must be an integer in strict mode.")
        return
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return
    if isinstance(value, str):
        try:
            float(value.replace(",", ""))
            return
        except ValueError:
            pass
    errors.append(f"{prefix}.{field} must be numeric or a numeric string in frontend mode.")


def _looks_like_datetime(value: str) -> bool:
    if not value:
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


if __name__ == "__main__":
    raise SystemExit(main())
