from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from social_collector.csv_source import CsvSocialPostSource
from social_collector.matcher import load_watchlist, match_watchlist_items
from social_collector.normalizer import normalize_post
from social_collector.sources.news import DEFAULT_NEWS_CONFIG, NewsSocialPostSource
from social_collector.sources.rss import RssSocialPostSource
from social_collector.sources.webpage import WebpageSocialPostSource
from social_collector.summary import build_social_summary


DEFAULT_CONFIG = Path("config/app_config.json")
DEFAULT_RSS_CONFIG = Path("config/rss_sources.json")
DEFAULT_NEWS_CONFIG = Path("config/news_sources.json")
DEFAULT_MANUAL_FILENAME = "投资作战手册_V13.0-B.1.html"
LATEST_MANUAL_FILENAME = "投资作战手册_latest.html"


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    root = Path(__file__).resolve().parent
    config = _load_config(root / args.config)

    source = args.source
    watchlist_path = _resolve(root, args.watchlist or config["watchlist_path"])
    output_dir = _resolve(root, args.output_dir or config["output_dir"])
    manual_dist_dir = _resolve(root, args.manual_dist_dir or config["manual_dist_dir"])
    log_dir = _resolve(root, config["log_dir"])
    posts_path = output_dir / config["posts_filename"]
    summary_path = output_dir / config["summary_filename"]
    run_timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    warnings: list[str] = []
    errors: list[str] = []
    denoise_stats = _empty_denoise_stats()

    backup_dir = _backup_existing_files(
        root=root,
        output_dir=output_dir,
        manual_dist_dir=manual_dist_dir,
        posts_filename=config["posts_filename"],
        summary_filename=config["summary_filename"],
        include_manual=not args.dry_run,
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    manual_dist_dir.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)

    collector_cmd = _build_collector_cmd(
        root=root,
        args=args,
        source=source,
        watchlist_path=watchlist_path,
        posts_path=posts_path,
        summary_path=summary_path,
        config=config,
    )
    raw_count = _estimate_raw_count(root, args, source)
    collector_result = _run_command(collector_cmd, root)
    if collector_result.returncode != 0:
        _print_process_output(collector_result)
        errors.extend(_extract_diagnostics(collector_result.stderr, "error"))
        warnings.extend(_extract_diagnostics(collector_result.stderr, "warning"))
        report_path = _write_report(
            log_dir=log_dir,
            timestamp=run_timestamp,
            source=source,
            inputs=_input_paths(root, args, source),
            watchlist_path=watchlist_path,
            posts_path=posts_path,
            summary_path=summary_path,
            posts_count=0,
            symbols_count=0,
            validation_status="not_run",
            copied=False,
            dry_run=args.dry_run,
            allow_empty=args.allow_empty,
            errors=errors,
            warnings=warnings,
            unmatched_watchlist=[],
            unmatched_posts=[],
            denoise_stats=denoise_stats,
        )
        _print_summary(
            source=source,
            raw_count=raw_count if raw_count is not None else _latest_logged_fetched_count(log_dir / "collector.log"),
            matched_count=0,
            covered_count=0,
            validation_status="not_run",
            copied=False,
            backup_dir=backup_dir,
            dry_run=args.dry_run,
            report_path=report_path,
            warnings=warnings,
            unmatched_watchlist=[],
            unmatched_posts=[],
            denoise_stats=denoise_stats,
        )
        return collector_result.returncode

    posts = _load_posts(posts_path) if posts_path.exists() else []
    if source == "news" and posts_path.exists():
        fetched_count = raw_count if raw_count is not None else _latest_logged_fetched_count(log_dir / "collector.log")
        posts, denoise_stats = _denoise_news_posts(posts, config, warnings, fetched_count)
        _write_posts_and_summary(posts_path, summary_path, posts)
    validate_cmd = [
        sys.executable,
        "validate_output.py",
        "--posts",
        str(posts_path),
        "--summary",
        str(summary_path),
        "--watchlist",
        str(watchlist_path),
    ]
    validate_result = _run_command(validate_cmd, root)
    validation_passed = validate_result.returncode == 0
    symbols = sorted({str(post.get("symbol", "")).strip() for post in posts if str(post.get("symbol", "")).strip()})
    coverage = _analyze_coverage(root, args, source, watchlist_path, posts, warnings)
    errors.extend(_extract_diagnostics(collector_result.stderr, "error"))
    errors.extend(_extract_diagnostics(validate_result.stderr, "error"))
    warnings.extend(_extract_diagnostics(collector_result.stderr, "warning"))
    warnings.extend(_extract_diagnostics(validate_result.stderr, "warning"))

    copied = False
    if validation_passed and not posts and not args.allow_empty:
        warnings.append("posts_count is 0; skipped copying to manual dist. Use --allow-empty to override.")
    elif validation_passed and args.dry_run:
        warnings.append("dry-run enabled; skipped copying to manual dist.")
    elif validation_passed:
        shutil.copy2(posts_path, manual_dist_dir / config["posts_filename"])
        shutil.copy2(summary_path, manual_dist_dir / config["summary_filename"])
        copied = True
        _copy_latest_manual(manual_dist_dir, warnings)
        if args.open_manual:
            _open_manual(manual_dist_dir / DEFAULT_MANUAL_FILENAME, warnings)

    validation_status = "passed" if validation_passed else "failed"
    report_path = _write_report(
        log_dir=log_dir,
        timestamp=run_timestamp,
        source=source,
        inputs=_input_paths(root, args, source),
        watchlist_path=watchlist_path,
        posts_path=posts_path,
        summary_path=summary_path,
        posts_count=len(posts),
        symbols_count=len(symbols),
        validation_status=validation_status,
        copied=copied,
        dry_run=args.dry_run,
        allow_empty=args.allow_empty,
        errors=errors,
        warnings=warnings,
        unmatched_watchlist=coverage["unmatched_watchlist"],
        unmatched_posts=coverage["unmatched_posts"],
        denoise_stats=denoise_stats,
    )

    _print_process_output(collector_result)
    _print_process_output(validate_result)
    _print_summary(
        source=source,
        raw_count=raw_count if raw_count is not None else _latest_logged_fetched_count(log_dir / "collector.log"),
        matched_count=len(posts),
        covered_count=len(symbols),
        validation_status=validation_status,
        copied=copied,
        backup_dir=backup_dir,
        dry_run=args.dry_run,
        report_path=report_path,
        warnings=warnings,
        unmatched_watchlist=coverage["unmatched_watchlist"],
        unmatched_posts=coverage["unmatched_posts"],
        denoise_stats=denoise_stats,
    )
    if args.dry_run:
        return 0 if validation_passed else 1
    return 0 if validation_passed and copied else 1


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run social_collector, validate output, and deliver files to the manual dist folder.")
    parser.add_argument("--source", choices=("csv", "rss", "webpage", "news"), required=True)
    parser.add_argument("--input", help="CSV input path. Required for --source csv unless --csv is used.")
    parser.add_argument("--csv", dest="csv_paths", action="append", default=[], help="CSV input path. Can be repeated.")
    parser.add_argument("--urls", help="urls.txt path for --source webpage.")
    parser.add_argument("--rss-config", default=str(DEFAULT_RSS_CONFIG), help="RSS source config path.")
    parser.add_argument("--news-config", default=str(DEFAULT_NEWS_CONFIG), help="News RSS/Atom source config path.")
    parser.add_argument("--watchlist", help="Override watchlist path from config/app_config.json.")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG), help="Pipeline config path.")
    parser.add_argument("--output-dir", help="Override output_dir from config/app_config.json.")
    parser.add_argument("--manual-dist-dir", help="Override manual_dist_dir from config/app_config.json.")
    parser.add_argument("--dry-run", action="store_true", help="Collect and validate, but do not copy files to the manual dist folder.")
    parser.add_argument("--allow-empty", action="store_true", help="Allow copying when the generated social_posts.json has zero posts.")
    parser.add_argument("--open-manual", action="store_true", help="Open dist/投资作战手册_V13.0-B.1.html after validation and copy succeed.")
    return parser


def _load_config(path: Path) -> dict[str, Any]:
    defaults: dict[str, Any] = {
        "watchlist_path": "watchlist.json",
        "output_dir": "output",
        "manual_dist_dir": "dist",
        "posts_filename": "social_posts.json",
        "summary_filename": "social_summary.json",
        "log_dir": "logs",
        "max_posts_per_symbol": 30,
        "news_days_limit": 14,
        "disabled_news_sources": [],
        "preferred_news_sources": [],
    }
    if not path.exists():
        return defaults
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(data, dict):
        raise SystemExit(f"{path} must be a JSON object.")
    string_fields = {"watchlist_path", "output_dir", "manual_dist_dir", "posts_filename", "summary_filename", "log_dir"}
    int_fields = {"max_posts_per_symbol", "news_days_limit"}
    list_fields = {"disabled_news_sources", "preferred_news_sources"}
    for key in defaults:
        value = data.get(key, defaults[key])
        if key in string_fields and (not isinstance(value, str) or not value.strip()):
            raise SystemExit(f"{path} field {key!r} must be a non-empty string.")
        if key in int_fields and (not isinstance(value, int) or isinstance(value, bool) or value < 0):
            raise SystemExit(f"{path} field {key!r} must be a non-negative integer.")
        if key in list_fields and (
            not isinstance(value, list) or any(not isinstance(item, str) or not item.strip() for item in value)
        ):
            raise SystemExit(f"{path} field {key!r} must be a list of non-empty strings.")
        defaults[key] = value
    return defaults


def _resolve(root: Path, value: str | Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else root / path


def _backup_existing_files(
    root: Path,
    output_dir: Path,
    manual_dist_dir: Path,
    posts_filename: str,
    summary_filename: str,
    include_manual: bool,
) -> Path | None:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = root / "backups" / "social" / timestamp
    candidates = [
        ("output", output_dir / posts_filename),
        ("output", output_dir / summary_filename),
    ]
    if include_manual:
        candidates.extend(
            [
                ("manual", manual_dist_dir / posts_filename),
                ("manual", manual_dist_dir / summary_filename),
            ]
        )
    copied_paths: set[Path] = set()
    for prefix, source_path in candidates:
        if not source_path.exists():
            continue
        resolved = source_path.resolve()
        if resolved in copied_paths:
            continue
        copied_paths.add(resolved)
        backup_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, backup_dir / f"{prefix}_{source_path.name}")
    return backup_dir if backup_dir.exists() else None


def _build_collector_cmd(
    root: Path,
    args: argparse.Namespace,
    source: str,
    watchlist_path: Path,
    posts_path: Path,
    summary_path: Path,
    config: dict[str, Any] | None = None,
) -> list[str]:
    cmd = [
        sys.executable,
        "main.py",
        "--source",
        source,
        "--watchlist",
        str(watchlist_path),
        "--output",
        str(posts_path),
        "--summary",
        str(summary_path),
    ]
    if source == "csv":
        csv_paths = list(args.csv_paths)
        if args.input:
            csv_paths.append(args.input)
        if not csv_paths:
            raise SystemExit("CSV source requires --input or --csv.")
        for csv_path in csv_paths:
            cmd.extend(["--csv", str(_resolve(root, csv_path))])
    elif source == "webpage":
        if not args.urls:
            raise SystemExit("Webpage source requires --urls urls.txt.")
        cmd.extend(["--urls", str(_resolve(root, args.urls))])
    elif source == "rss":
        cmd.extend(["--rss-config", str(_resolve(root, args.rss_config))])
    elif source == "news":
        news_config_path = _resolve(root, args.news_config)
        if config:
            news_config_path = _filtered_news_config(news_config_path, posts_path.parent, _config_list(config, "disabled_news_sources"))
        cmd.extend(["--news-config", str(news_config_path)])
    return cmd


def _estimate_raw_count(root: Path, args: argparse.Namespace, source: str) -> int | None:
    if source == "csv":
        paths = list(args.csv_paths)
        if args.input:
            paths.append(args.input)
        return sum(_count_csv_rows(_resolve(root, path)) for path in paths)
    if source == "webpage" and args.urls:
        return _count_urls(_resolve(root, args.urls))
    return None


def _count_csv_rows(path: Path) -> int:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return sum(1 for _ in csv.DictReader(handle))


def _count_urls(path: Path) -> int:
    total = 0
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        value = line.strip()
        if value and not value.startswith("#"):
            total += 1
    return total


def _config_int(config: dict[str, Any], key: str) -> int:
    value = config.get(key, 0)
    return int(value) if isinstance(value, int) and not isinstance(value, bool) else 0


def _config_list(config: dict[str, Any], key: str) -> list[str]:
    value = config.get(key, [])
    return [item.strip() for item in value if isinstance(item, str) and item.strip()] if isinstance(value, list) else []


def _filtered_news_config(config_path: Path, output_dir: Path, disabled_sources: list[str]) -> Path:
    if not disabled_sources:
        return config_path
    payload = json.loads(config_path.read_text(encoding="utf-8-sig"))
    if not isinstance(payload, list):
        return config_path
    disabled = {item.casefold() for item in disabled_sources}
    filtered = [
        item
        for item in payload
        if not isinstance(item, dict) or str(item.get("name", "") or "").strip().casefold() not in disabled
    ]
    output_dir.mkdir(parents=True, exist_ok=True)
    filtered_path = output_dir / "_filtered_news_sources.json"
    filtered_path.write_text(json.dumps(filtered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return filtered_path


def _empty_denoise_stats() -> dict[str, int]:
    return {
        "raw_count": 0,
        "matched_count": 0,
        "after_date_filter_count": 0,
        "after_dedup_count": 0,
        "final_count": 0,
        "removed_by_symbol_limit": 0,
        "removed_duplicates": 0,
    }


def _denoise_news_posts(
    posts: list[dict[str, Any]],
    config: dict[str, Any],
    warnings: list[str],
    raw_count: int | None,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    stats = _empty_denoise_stats()
    stats["raw_count"] = raw_count if raw_count is not None else len(posts)
    posts_count = len(posts)
    stats["matched_count"] = posts_count

    days_limit = _config_int(config, "news_days_limit") or 14
    max_per_symbol = _config_int(config, "max_posts_per_symbol") or 30
    preferred_sources = _config_list(config, "preferred_news_sources")
    cutoff = datetime.now(timezone.utc) - timedelta(days=days_limit)

    date_filtered: list[dict[str, Any]] = []
    for post in posts:
        parsed = _parse_post_time(post.get("post_time"))
        if parsed is None:
            warnings.append(f"news post has unparseable post_time and was kept: {post.get('symbol', '')} {post.get('summary', '')}")
            date_filtered.append(post)
            continue
        if parsed >= cutoff:
            date_filtered.append(post)
    stats["after_date_filter_count"] = len(date_filtered)

    groups: dict[str, list[dict[str, Any]]] = {}
    for post in date_filtered:
        symbol = str(post.get("symbol", "") or "").strip()
        groups.setdefault(symbol, []).append(post)

    deduped_all: list[dict[str, Any]] = []
    removed_duplicates = 0
    for symbol_posts in groups.values():
        deduped, removed = _dedupe_similar_news(symbol_posts)
        deduped_all.extend(deduped)
        removed_duplicates += removed
    stats["after_dedup_count"] = len(deduped_all)
    stats["removed_duplicates"] = removed_duplicates

    final_posts: list[dict[str, Any]] = []
    removed_by_limit = 0
    groups.clear()
    for post in deduped_all:
        symbol = str(post.get("symbol", "") or "").strip()
        groups.setdefault(symbol, []).append(post)
    for symbol in sorted(groups):
        ordered = sorted(groups[symbol], key=lambda post: _news_sort_key(post, preferred_sources))
        final_posts.extend(ordered[:max_per_symbol])
        removed_by_limit += max(0, len(ordered) - max_per_symbol)
    stats["final_count"] = len(final_posts)
    stats["removed_by_symbol_limit"] = removed_by_limit
    return final_posts, stats


def _parse_post_time(value: object) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _dedupe_similar_news(posts: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    kept: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()
    removed = 0
    for post in posts:
        url_key = str(post.get("url", "") or "").strip()
        title_key = _normalize_news_title(str(post.get("summary") or post.get("content") or ""))
        if url_key and url_key in seen_urls:
            removed += 1
            continue
        if title_key and title_key in seen_titles:
            removed += 1
            continue
        if url_key:
            seen_urls.add(url_key)
        if title_key:
            seen_titles.add(title_key)
        kept.append(post)
    return kept, removed


def _normalize_news_title(value: str) -> str:
    text = re.sub(r"\s+", " ", value or "").strip().casefold()
    text = re.sub(r"\s+[-|–—]\s+[^-|–—]{2,80}$", "", text).strip()
    return text


def _news_sort_key(post: dict[str, Any], preferred_sources: list[str]) -> tuple[int, float, int]:
    preferred = 0 if _is_preferred_news(post, preferred_sources) else 1
    parsed = _parse_post_time(post.get("post_time"))
    timestamp = parsed.timestamp() if parsed else 0.0
    matched_count = len(post.get("matched_keywords", []) or []) if isinstance(post.get("matched_keywords"), list) else 0
    return (preferred, -timestamp, -matched_count)


def _is_preferred_news(post: dict[str, Any], preferred_sources: list[str]) -> bool:
    if not preferred_sources:
        return False
    haystack = " ".join(
        str(post.get(field, "") or "")
        for field in ("summary", "content", "url", "platform")
    ).casefold()
    return any(source.casefold() in haystack for source in preferred_sources)


def _write_posts_and_summary(posts_path: Path, summary_path: Path, posts: list[dict[str, Any]]) -> None:
    posts_path.write_text(json.dumps({"social_posts": posts}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = build_social_summary(posts)
    summary_path.write_text(json.dumps({"social_summary": summary}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _run_command(cmd: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, text=True, encoding="utf-8", errors="replace", capture_output=True)


def _print_process_output(result: subprocess.CompletedProcess[str]) -> None:
    stdout = result.stdout or ""
    stderr = result.stderr or ""
    if stdout.strip():
        _safe_print(stdout.strip())
    if stderr.strip():
        _safe_print(stderr.strip(), file=sys.stderr)


def _safe_print(text: object, file: Any = sys.stdout) -> None:
    value = str(text)
    encoding = getattr(file, "encoding", None) or "utf-8"
    value = value.encode(encoding, errors="replace").decode(encoding, errors="replace")
    print(value, file=file)


def _load_posts(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    if isinstance(payload, dict) and isinstance(payload.get("social_posts"), list):
        return [post for post in payload["social_posts"] if isinstance(post, dict)]
    if isinstance(payload, list):
        return [post for post in payload if isinstance(post, dict)]
    return []


def _input_paths(root: Path, args: argparse.Namespace, source: str) -> list[str]:
    if source == "csv":
        paths = list(args.csv_paths)
        if args.input:
            paths.append(args.input)
        return [str(_resolve(root, path)) for path in paths]
    if source == "webpage" and args.urls:
        return [str(_resolve(root, args.urls))]
    if source == "rss":
        return [str(_resolve(root, args.rss_config))]
    if source == "news":
        return [str(_resolve(root, args.news_config))]
    return []


def _extract_diagnostics(text: str | None, level: str) -> list[str]:
    if not text:
        return []
    prefix = f"{level}:"
    return [line.strip() for line in text.splitlines() if line.strip().lower().startswith(prefix)]


def _write_report(
    log_dir: Path,
    timestamp: str,
    source: str,
    inputs: list[str],
    watchlist_path: Path,
    posts_path: Path,
    summary_path: Path,
    posts_count: int,
    symbols_count: int,
    validation_status: str,
    copied: bool,
    dry_run: bool,
    allow_empty: bool,
    errors: list[str],
    warnings: list[str],
    unmatched_watchlist: list[dict[str, str]],
    unmatched_posts: list[dict[str, str]],
    denoise_stats: dict[str, int],
) -> Path:
    log_dir.mkdir(parents=True, exist_ok=True)
    report_path = _unique_report_path(log_dir, timestamp)
    payload = {
        "source": source,
        "input": inputs,
        "watchlist": str(watchlist_path),
        "output": str(posts_path),
        "summary": str(summary_path),
        "posts_count": posts_count,
        "symbols_count": symbols_count,
        "validation_status": validation_status,
        "copied": copied,
        "dry_run": dry_run,
        "allow_empty": allow_empty,
        "errors": errors,
        "warnings": warnings,
        "unmatched_watchlist": unmatched_watchlist,
        "unmatched_posts": unmatched_posts,
        "denoise_stats": denoise_stats,
        **denoise_stats,
    }
    report_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return report_path


def _unique_report_path(log_dir: Path, timestamp: str) -> Path:
    base = log_dir / f"pipeline_report_{timestamp}.json"
    if not base.exists():
        return base
    index = 2
    while True:
        candidate = log_dir / f"pipeline_report_{timestamp}_{index}.json"
        if not candidate.exists():
            return candidate
        index += 1


def _analyze_coverage(
    root: Path,
    args: argparse.Namespace,
    source: str,
    watchlist_path: Path,
    posts: list[dict[str, Any]],
    warnings: list[str],
) -> dict[str, list[dict[str, str]]]:
    try:
        watchlist = load_watchlist(watchlist_path)
    except (FileNotFoundError, ValueError) as exc:
        warnings.append(f"coverage analysis skipped: {exc}")
        return {"unmatched_watchlist": [], "unmatched_posts": []}

    covered_symbols = {str(post.get("symbol", "") or "").strip() for post in posts}
    unmatched_watchlist = [
        {
            "symbol": str(item.get("symbol", "") or ""),
            "company": str(item.get("company", "") or ""),
        }
        for item in watchlist
        if str(item.get("symbol", "") or "").strip() not in covered_symbols
    ]

    unmatched_posts: list[dict[str, str]] = []
    try:
        raw_posts = _collect_raw_for_coverage(root, args, source)
    except Exception as exc:  # noqa: BLE001 - best-effort observability must not fail the pipeline.
        warnings.append(f"unmatched post analysis skipped: {exc}")
        return {"unmatched_watchlist": unmatched_watchlist, "unmatched_posts": unmatched_posts}

    for raw_post in raw_posts:
        normalized = normalize_post(raw_post)
        if not normalized.get("content") or not normalized.get("post_time"):
            continue
        if match_watchlist_items(normalized, watchlist):
            continue
        unmatched_posts.append(
            {
                "source": _coverage_source(raw_post),
                "time": str(normalized.get("post_time", "") or ""),
                "url": str(normalized.get("url", "") or ""),
                "summary": _shorten(str(normalized.get("summary") or normalized.get("content") or ""), 120),
            }
        )
    return {"unmatched_watchlist": unmatched_watchlist, "unmatched_posts": unmatched_posts}


def _collect_raw_for_coverage(root: Path, args: argparse.Namespace, source: str) -> list[dict[str, str]]:
    if source == "csv":
        paths = list(args.csv_paths)
        if args.input:
            paths.append(args.input)
        posts: list[dict[str, str]] = []
        for path in paths:
            posts.extend(CsvSocialPostSource(_resolve(root, path)).collect())
        return posts
    if source == "webpage":
        return list(WebpageSocialPostSource(_resolve(root, args.urls)).collect())
    if source == "rss":
        return list(RssSocialPostSource(_resolve(root, args.rss_config)).collect())
    if source == "news":
        return list(NewsSocialPostSource(_resolve(root, args.news_config)).collect())
    return []


def _coverage_source(raw_post: dict[str, str]) -> str:
    if raw_post.get("_source") == "news":
        return f"news:{raw_post.get('_source_name', 'unknown')}"
    if raw_post.get("_source") == "rss":
        return f"rss:{raw_post.get('_source_name', 'unknown')}"
    if raw_post.get("_source") == "webpage":
        return f"webpage:{raw_post.get('_source_url', raw_post.get('url', ''))}"
    return f"csv:{raw_post.get('_source_file', 'unknown')}:{raw_post.get('_row_number', '?')}"


def _shorten(value: str, limit: int) -> str:
    cleaned = " ".join(value.split())
    return cleaned if len(cleaned) <= limit else cleaned[: limit - 1] + "..."


def _copy_latest_manual(manual_dist_dir: Path, warnings: list[str]) -> None:
    source = manual_dist_dir / DEFAULT_MANUAL_FILENAME
    target = manual_dist_dir / LATEST_MANUAL_FILENAME
    if not source.exists():
        warnings.append(f"manual file not found, skipped latest copy: {source}")
        return
    try:
        shutil.copy2(source, target)
    except OSError as exc:
        warnings.append(f"failed to update latest manual: {exc}")


def _open_manual(path: Path, warnings: list[str]) -> None:
    if not path.exists():
        warnings.append(f"manual file not found, skipped open: {path}")
        return
    try:
        if os.name == "nt":
            os.startfile(path)  # type: ignore[attr-defined]
        else:
            subprocess.Popen([_platform_open_command(), str(path)])
    except OSError as exc:
        warnings.append(f"failed to open manual: {exc}")


def _platform_open_command() -> str:
    if sys.platform == "darwin":
        return "open"
    return "xdg-open"


def _latest_logged_fetched_count(log_path: Path) -> int | None:
    if not log_path.exists():
        return None
    lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    marker_index = None
    for index in range(len(lines) - 1, -1, -1):
        if "collector run" in lines[index]:
            marker_index = index
            break
    if marker_index is None:
        return None
    total = 0
    found = False
    for line in lines[marker_index + 1 :]:
        if "collector run" in line:
            break
        match = re.search(r"fetched=(\d+)", line)
        if match:
            total += int(match.group(1))
            found = True
    return total if found else None


def _print_summary(
    source: str,
    raw_count: int | None,
    matched_count: int,
    covered_count: int,
    validation_status: str,
    copied: bool,
    backup_dir: Path | None,
    dry_run: bool,
    report_path: Path,
    warnings: list[str],
    unmatched_watchlist: list[dict[str, str]],
    unmatched_posts: list[dict[str, str]],
    denoise_stats: dict[str, int],
) -> None:
    print("\nPipeline summary")
    print(f"- Source: {source}")
    print(f"- Raw records: {raw_count if raw_count is not None else 'unknown'}")
    print(f"- Matched posts: {matched_count}")
    print(f"- Covered symbols: {covered_count}")
    print(f"- Validation: {validation_status}")
    print(f"- Dry run: {'yes' if dry_run else 'no'}")
    print(f"- Copied to manual dist: {'yes' if copied else 'no'}")
    print(f"- Backup: {backup_dir if backup_dir else 'no existing files'}")
    print(f"- Report: {report_path}")
    if any(denoise_stats.values()):
        print("- Denoise:")
        print(f"  - raw_count: {denoise_stats.get('raw_count', 0)}")
        print(f"  - matched_count: {denoise_stats.get('matched_count', 0)}")
        print(f"  - after_date_filter_count: {denoise_stats.get('after_date_filter_count', 0)}")
        print(f"  - after_dedup_count: {denoise_stats.get('after_dedup_count', 0)}")
        print(f"  - final_count: {denoise_stats.get('final_count', 0)}")
        print(f"  - removed_by_symbol_limit: {denoise_stats.get('removed_by_symbol_limit', 0)}")
        print(f"  - removed_duplicates: {denoise_stats.get('removed_duplicates', 0)}")
    if warnings:
        print("- Warnings:")
        for warning in warnings[:10]:
            print(f"  - {warning}")
        if len(warnings) > 10:
            print(f"  - ... {len(warnings) - 10} more")
    if unmatched_watchlist:
        print("- Watchlist without matched posts:")
        for item in unmatched_watchlist[:20]:
            print(f"  - {item.get('symbol', '')} {item.get('company', '')}".rstrip())
        if len(unmatched_watchlist) > 20:
            print(f"  - ... {len(unmatched_watchlist) - 20} more")
    if unmatched_posts:
        print("- Posts without matched stocks:")
        for item in unmatched_posts[:20]:
            print(f"  - {item.get('source', '')} {item.get('summary', '')}".rstrip())
        if len(unmatched_posts) > 20:
            print(f"  - ... {len(unmatched_posts) - 20} more")


if __name__ == "__main__":
    raise SystemExit(main())
