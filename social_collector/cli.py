from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .csv_source import CsvSocialPostSource, CsvSourceError
from .matcher import (
    build_watchlist,
    load_watchlist,
    make_stock_record,
    match_watchlist_items,
    post_matches_watchlist,
)
from .normalizer import normalize_post
from .sources.news import DEFAULT_NEWS_CONFIG, NewsSocialPostSource, NewsSourceError
from .sources.rss import DEFAULT_RSS_CONFIG, RssSocialPostSource, RssSourceError
from .sources.webpage import WebpageSocialPostSource, WebpageSourceError
from .summary import build_social_summary


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="social_collector",
        description="Import social/news posts and export social_posts.json plus social_summary.json.",
    )
    parser.add_argument(
        "--source",
        choices=("csv", "rss", "webpage", "news"),
        default="csv",
        help="Data source to collect from. Defaults to csv.",
    )
    parser.add_argument(
        "--input",
        help="Path to the input CSV file.",
    )
    parser.add_argument(
        "--watchlist",
        help="Path to watchlist JSON with symbol, company, aliases, and keywords.",
    )
    parser.add_argument(
        "--rss-config",
        default=str(DEFAULT_RSS_CONFIG),
        help="Path to RSS source config JSON. Defaults to config/rss_sources.json.",
    )
    parser.add_argument(
        "--news-config",
        default=str(DEFAULT_NEWS_CONFIG),
        help="Path to news RSS/Atom source config JSON. Defaults to config/news_sources.json.",
    )
    parser.add_argument(
        "--urls",
        help="Path to urls.txt for webpage source. One URL per line.",
    )
    parser.add_argument(
        "--csv",
        dest="csv_paths",
        action="append",
        default=[],
        help="Path to a CSV file. Can be provided multiple times.",
    )
    parser.add_argument(
        "--symbol",
        action="append",
        default=[],
        help="Stock symbol keyword to match, for example 1810.HK. Can be repeated or comma-separated.",
    )
    parser.add_argument(
        "--company",
        action="append",
        default=[],
        help="Company keyword to match, for example 小米集团. Can be repeated or comma-separated.",
    )
    parser.add_argument(
        "--keyword",
        action="append",
        default=[],
        help="Extra keyword to match. Can be repeated or comma-separated.",
    )
    parser.add_argument(
        "--output",
        default="social_posts.json",
        help="Output JSON path. Defaults to social_posts.json.",
    )
    parser.add_argument(
        "--summary-output",
        "--summary",
        dest="summary_output",
        default="social_summary.json",
        help="Output summary JSON path. Defaults to social_summary.json.",
    )
    parser.add_argument(
        "--include-unmatched",
        action="store_true",
        help="Export every row even when it does not match the requested keywords.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    warnings: list[str] = []
    errors: list[str] = []
    log_details: list[str] = []
    fetch_counts: Counter[str] = Counter()
    match_counts: Counter[str] = Counter()

    try:
        structured_watchlist = load_watchlist(Path(args.watchlist)) if args.watchlist else []
    except (FileNotFoundError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    keyword_watchlist = build_watchlist(
        symbols=args.symbol,
        companies=args.company,
        extra_keywords=args.keyword,
    )

    try:
        raw_posts = _collect_raw_posts(args, fetch_counts, errors, log_details)
    except (FileNotFoundError, CsvSourceError, RssSourceError, NewsSourceError, WebpageSourceError, ValueError) as exc:
        _write_collector_log(fetch_counts, match_counts, errors + [str(exc)], log_details)
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    normalized_posts = _normalize_and_match_posts(
        raw_posts=raw_posts,
        structured_watchlist=structured_watchlist,
        keyword_watchlist=keyword_watchlist,
        include_unmatched=args.include_unmatched,
        warnings=warnings,
        match_counts=match_counts,
    )
    normalized_posts = _dedupe_by_url_symbol(normalized_posts)
    match_counts.clear()
    match_counts.update(_source_match_counts(normalized_posts))
    normalized_posts = _strip_internal_fields(normalized_posts)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps({"social_posts": normalized_posts}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    summary = build_social_summary(normalized_posts)
    summary_output_path = Path(args.summary_output)
    summary_output_path.parent.mkdir(parents=True, exist_ok=True)
    summary_output_path.write_text(
        json.dumps({"social_summary": summary}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    _write_collector_log(fetch_counts, match_counts, errors, log_details)
    for warning in warnings:
        print(f"Warning: {warning}", file=sys.stderr)
    for error in errors:
        print(f"Warning: {error}", file=sys.stderr)
    print(f"Wrote {len(normalized_posts)} posts to {output_path}")
    print(f"Wrote {len(summary)} summary rows to {summary_output_path}")
    return 0


def _collect_raw_posts(
    args: argparse.Namespace,
    fetch_counts: Counter[str],
    errors: list[str],
    log_details: list[str],
) -> list[dict[str, str]]:
    if args.source == "rss":
        source = RssSocialPostSource(Path(args.rss_config))
        posts = list(source.collect())
        for stat in source.stats:
            key = f"{stat.platform}:{stat.name}"
            fetch_counts[key] += stat.fetched_count
            if stat.error:
                errors.append(f"{key} {stat.url}: {stat.error}")
        if source.stats and not posts and all(stat.error for stat in source.stats):
            raise RssSourceError("all RSS sources failed; no social posts generated")
        return posts

    if args.source == "news":
        source = NewsSocialPostSource(Path(args.news_config))
        posts = list(source.collect())
        for stat in source.stats:
            key = f"news:{stat.name}"
            fetch_counts[key] += stat.fetched_count
            if stat.error:
                errors.append(f"{key} {stat.url}: {stat.error}")
        if source.stats and not posts and all(stat.error for stat in source.stats):
            raise NewsSourceError("all news sources failed; no social posts generated")
        return posts

    if args.source == "webpage":
        if not args.urls:
            raise ValueError("provide --urls urls.txt when --source webpage")
        source = WebpageSocialPostSource(Path(args.urls))
        posts = list(source.collect())
        key = "webpage:urls"
        fetch_counts[key] += source.success_count
        log_details.append(
            f"webpage_urls_file={args.urls} webpage_urls={source.total_count} webpage_success={source.success_count}"
        )
        for stat in source.stats:
            if stat.error:
                errors.append(f"webpage failed {stat.url}: {stat.error}")
        if source.stats and not posts and all(stat.error for stat in source.stats):
            raise WebpageSourceError("all webpage URLs failed; no social posts generated")
        return posts

    csv_paths = list(args.csv_paths)
    if args.input:
        csv_paths.append(args.input)
    if not csv_paths:
        raise ValueError("provide --input sample_posts.csv or --csv posts.csv")

    posts: list[dict[str, str]] = []
    for csv_path in csv_paths:
        source = CsvSocialPostSource(Path(csv_path))
        source_posts = list(source.collect())
        fetch_counts[f"csv:{csv_path}"] += len(source_posts)
        posts.extend(source_posts)
    return posts


def _normalize_and_match_posts(
    raw_posts: list[dict[str, str]],
    structured_watchlist: list[dict[str, Any]],
    keyword_watchlist: list[str],
    include_unmatched: bool,
    warnings: list[str],
    match_counts: Counter[str],
) -> list[dict[str, object]]:
    normalized_posts: list[dict[str, object]] = []
    for raw_post in raw_posts:
        normalized = normalize_post(raw_post)
        row_label = _row_label(raw_post)
        if not normalized["content"]:
            warnings.append(f"Skipped {row_label}: content is empty.")
            continue
        if not normalized["post_time"]:
            warnings.append(f"Skipped {row_label}: time field is empty.")
            continue

        source_label = _source_label(raw_post)
        if structured_watchlist:
            matches = match_watchlist_items(normalized, structured_watchlist)
            if not matches and not include_unmatched:
                continue
            if matches:
                for match in matches:
                    stock_record = make_stock_record(normalized, match)
                    stock_record["_collector_source"] = source_label
                    normalized_posts.append(stock_record)
                    match_counts[source_label] += 1
            else:
                normalized["_collector_source"] = source_label
                normalized_posts.append(normalized)
            continue

        matched_keywords = post_matches_watchlist(normalized, keyword_watchlist)
        if not include_unmatched and keyword_watchlist and not matched_keywords:
            continue

        normalized["matched_keywords"] = matched_keywords
        normalized["_collector_source"] = source_label
        normalized_posts.append(normalized)
        if matched_keywords:
            match_counts[source_label] += 1

    return normalized_posts


def _dedupe_by_url_symbol(posts: list[dict[str, object]]) -> list[dict[str, object]]:
    deduped: list[dict[str, object]] = []
    seen: set[tuple[str, str, str, str]] = set()
    for post in posts:
        platform = str(post.get("platform", "") or "").strip().casefold()
        url = str(post.get("url", "") or "").strip()
        symbol = str(post.get("symbol", "") or "").strip().upper()
        post_time = str(post.get("post_time", "") or "").strip()
        content = str(post.get("content", "") or "")
        if not symbol:
            deduped.append(post)
            continue
        if url:
            key = (platform, symbol, "url", url)
        else:
            content_hash = hashlib.sha256(content.encode("utf-8", errors="replace")).hexdigest()
            key = (platform, symbol, post_time, content_hash)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(post)
    return deduped


def _source_match_counts(posts: list[dict[str, object]]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for post in posts:
        source = str(post.get("_collector_source", "unknown") or "unknown")
        matched_keywords = post.get("matched_keywords", [])
        symbol = str(post.get("symbol", "") or "")
        if symbol or matched_keywords:
            counts[source] += 1
    return counts


def _strip_internal_fields(posts: list[dict[str, object]]) -> list[dict[str, object]]:
    cleaned_posts: list[dict[str, object]] = []
    for post in posts:
        cleaned = dict(post)
        for key in list(cleaned):
            if key.startswith("_collector_"):
                del cleaned[key]
        cleaned_posts.append(cleaned)
    return cleaned_posts


def _write_collector_log(
    fetch_counts: Counter[str],
    match_counts: Counter[str],
    errors: list[str],
    log_details: list[str] | None = None,
) -> None:
    log_dir = Path("logs")
    log_dir.mkdir(parents=True, exist_ok=True)
    lines = [f"[{datetime.now(timezone.utc).isoformat()}] collector run"]
    sources = sorted(set(fetch_counts) | set(match_counts))
    if not sources:
        lines.append("source=<none> fetched=0 matched=0")
    for detail in log_details or []:
        lines.append(detail)
    for source in sources:
        lines.append(f"source={source} fetched={fetch_counts[source]} matched={match_counts[source]}")
    for error in errors:
        lines.append(f"error={error}")
    with Path(log_dir, "collector.log").open("a", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")


def _row_label(raw_post: dict[str, str]) -> str:
    if raw_post.get("_source") == "news":
        return f"{raw_post.get('_source_name', 'news')} item {raw_post.get('url', '?')}"
    if raw_post.get("_source") == "rss":
        return f"{raw_post.get('_source_name', 'rss')} item {raw_post.get('url', '?')}"
    if raw_post.get("_source") == "webpage":
        return f"webpage {raw_post.get('_source_url', raw_post.get('url', '?'))}"
    return f"{raw_post.get('_source_file', 'csv')} row {raw_post.get('_row_number', '?')}"


def _source_label(raw_post: dict[str, str]) -> str:
    if raw_post.get("_source") == "news":
        return f"news:{raw_post.get('_source_name', 'unknown')}"
    if raw_post.get("_source") == "rss":
        return f"rss:{raw_post.get('_source_name', 'unknown')}"
    if raw_post.get("_source") == "webpage":
        return "webpage:urls"
    return f"csv:{raw_post.get('_source_file', 'unknown')}"
