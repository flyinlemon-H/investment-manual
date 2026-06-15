from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, TypedDict


class WatchlistItem(TypedDict):
    symbol: str
    company: str
    aliases: list[str]
    keywords: list[str]


class WatchlistError(ValueError):
    pass


def _split_values(values: list[str]) -> list[str]:
    keywords: list[str] = []
    for value in values:
        for item in value.split(","):
            item = item.strip()
            if item:
                keywords.append(item)
    return keywords


def build_watchlist(
    symbols: list[str] | None = None,
    companies: list[str] | None = None,
    extra_keywords: list[str] | None = None,
) -> list[str]:
    seen: set[str] = set()
    watchlist: list[str] = []
    for keyword in _split_values((symbols or []) + (companies or []) + (extra_keywords or [])):
        key = keyword.casefold()
        if key not in seen:
            seen.add(key)
            watchlist.append(keyword)
    return watchlist


def compatible_symbol_keywords(symbol: str) -> list[str]:
    """Return symbol forms used by the HTML app and local social data."""
    clean_symbol = symbol.strip().upper()
    if not clean_symbol:
        return []

    forms = [clean_symbol]
    base_symbol = re.sub(r"\.(HK|SS|SZ|SH)$", "", clean_symbol, flags=re.IGNORECASE)
    if base_symbol != clean_symbol:
        forms.append(base_symbol)
        stripped = base_symbol.lstrip("0")
        if stripped:
            forms.append(stripped)
    return build_watchlist(forms)


def _read_string_list(value: object, field_name: str, item_index: int) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        return _split_values([value])
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    raise WatchlistError(f"Watchlist item #{item_index} {field_name} must be a list or string.")


def load_watchlist(path: Path) -> list[WatchlistItem]:
    if not path.exists():
        raise FileNotFoundError(f"Watchlist file not found: {path}")

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise WatchlistError(f"Invalid watchlist JSON: {path}: {exc}") from exc

    if isinstance(payload, dict):
        raw_items = payload.get("watchlist") or payload.get("stocks") or payload.get("items")
    else:
        raw_items = payload

    if not isinstance(raw_items, list):
        raise WatchlistError("Watchlist must be a list, or an object with a watchlist/stocks/items list.")

    watchlist: list[WatchlistItem] = []
    for index, item in enumerate(raw_items, start=1):
        if not isinstance(item, dict):
            raise WatchlistError(f"Watchlist item #{index} must be an object.")

        symbol = str(item.get("symbol", "")).strip()
        company = str(item.get("company", "")).strip()
        keywords = _read_string_list(item.get("keywords", []), "keywords", index)
        aliases = _read_string_list(item.get("aliases") or item.get("alias"), "aliases", index)

        if not symbol and not company and not keywords and not aliases:
            raise WatchlistError(f"Watchlist item #{index} must include symbol, company, or keywords.")

        symbol_forms = compatible_symbol_keywords(symbol)
        merged_keywords = build_watchlist(symbol_forms, [company] if company else [], aliases + keywords)
        watchlist.append({"symbol": symbol, "company": company, "aliases": aliases, "keywords": merged_keywords})

    return watchlist


def match_watchlist_items(post: dict[str, object], watchlist: list[WatchlistItem]) -> list[dict[str, object]]:
    matches: list[dict[str, object]] = []
    for item in watchlist:
        matched_keywords = post_matches_watchlist(post, item["keywords"])
        if matched_keywords:
            matches.append(
                {
                    "symbol": item["symbol"],
                    "company": item["company"],
                    "aliases": item["aliases"],
                    "matched_keywords": matched_keywords,
                }
            )
    return matches


def make_stock_record(post: dict[str, object], match: dict[str, object]) -> dict[str, object]:
    stock_post = dict(post)
    symbol = str(match.get("symbol", "") or post.get("symbol", ""))
    company = str(match.get("company", "") or post.get("company", ""))
    stock_post["symbol"] = symbol
    stock_post["company"] = company
    stock_post["aliases"] = match.get("aliases", [])
    stock_post["matched_keywords"] = match.get("matched_keywords", [])
    stock_post["tags"] = build_watchlist(
        extra_keywords=list(stock_post.get("tags", []) or []) + list(stock_post["matched_keywords"])
    )
    return stock_post


def post_matches_watchlist(post: dict[str, object], watchlist: list[str]) -> list[str]:
    if not watchlist:
        return []

    searchable_text = " ".join(
        str(post.get(field, "") or "")
        for field in ("symbol", "company", "content", "author", "platform", "summary")
    )
    matches: list[str] = []
    for keyword in watchlist:
        if _keyword_matches(searchable_text, keyword):
            matches.append(keyword)
    return matches


def _keyword_matches(text: str, keyword: str) -> bool:
    if not keyword:
        return False

    if keyword.isascii() and re.fullmatch(r"[A-Za-z0-9._-]+", keyword):
        pattern = rf"(?<![A-Za-z0-9._-]){re.escape(keyword)}(?![A-Za-z0-9._-])"
        return re.search(pattern, text, flags=re.IGNORECASE) is not None

    return keyword.casefold() in text.casefold()
