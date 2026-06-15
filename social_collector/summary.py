from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Any


def _as_int(value: object) -> int:
    try:
        return int(float(str(value or "0").replace(",", "")))
    except ValueError:
        return 0


def _sentiment_bucket(value: object) -> str:
    sentiment = str(value or "neutral").strip().casefold()
    # positive/negative are accepted only for legacy input compatibility.
    # Collector standard JSON output remains bullish/bearish/neutral.
    if sentiment in {"bullish", "positive", "利多", "正面"}:
        return "bullish"
    if sentiment in {"bearish", "negative", "利空", "负面"}:
        return "bearish"
    return "neutral"


def _post_date(value: object) -> str:
    text = str(value or "").strip()
    return text[:10] if len(text) >= 10 else ""


def _extend_unique(target: list[str], values: object, limit: int = 8) -> None:
    if not isinstance(values, list):
        return
    seen = {item.casefold() for item in target}
    for value in values:
        text = str(value).strip()
        key = text.casefold()
        if text and key not in seen:
            target.append(text)
            seen.add(key)
        if len(target) >= limit:
            return


def _post_point(post: dict[str, Any]) -> str:
    text = str(post.get("summary") or post.get("content") or "").strip()
    return " ".join(text.split())


def _unique_post_points(posts: list[dict[str, Any]], sentiment: str, limit: int = 3) -> list[str]:
    points: list[str] = []
    seen: set[str] = set()
    for post in posts:
        if _sentiment_bucket(post.get("sentiment")) != sentiment:
            continue
        text = _post_point(post)
        key = text.casefold()
        if text and key not in seen:
            points.append(text)
            seen.add(key)
        if len(points) >= limit:
            break
    return points


def _review_flags(item: dict[str, Any], post_count: int) -> list[str]:
    flags: list[str] = []
    bullish_count = int(item["bullish_count"])
    bearish_count = int(item["bearish_count"])
    if post_count >= 5:
        flags.append("high_heat")
    if post_count >= 4 and abs(bullish_count - bearish_count) <= 1 and bullish_count and bearish_count:
        flags.append("sentiment_divergence")
    if item["risk_points"]:
        flags.append("negative_risk")
    if post_count:
        flags.append("price_action_check")
        flags.append("position_size_check")
    return flags


def _ai_brief(item: dict[str, Any], post_count: int) -> str:
    company = str(item.get("company") or item.get("symbol") or "该标的")
    bullish_count = int(item["bullish_count"])
    bearish_count = int(item["bearish_count"])
    if not post_count:
        return f"{company} 暂无可聚合舆情，需等待更多数据。"
    if bullish_count >= bearish_count + 2:
        tone = "舆情暂偏利多"
    elif bearish_count >= bullish_count + 2:
        tone = "舆情暂偏利空"
    elif post_count >= 4 and bullish_count and bearish_count:
        tone = "多空观点分歧较大"
    else:
        tone = "舆情整体中性"
    return f"{company} 近端共 {post_count} 条社媒/新闻记录，{tone}，仅用于投资复核。"


def build_social_summary(posts: list[dict[str, Any]], updated_at: str | None = None) -> list[dict[str, Any]]:
    updated_at = updated_at or datetime.now(timezone.utc).isoformat()
    grouped: dict[str, dict[str, Any]] = {}

    for post in posts:
        symbol = str(post.get("symbol", "") or "").strip()
        if not symbol:
            continue

        item = grouped.setdefault(
            symbol,
            {
                "symbol": symbol,
                "company": str(post.get("company", "") or ""),
                "post_count": 0,
                "bullish_count": 0,
                "bearish_count": 0,
                "neutral_count": 0,
                "aliases": [],
                "risk_points": [],
                "_keywords": Counter(),
                "_posts": [],
            },
        )

        if not item["company"] and post.get("company"):
            item["company"] = str(post["company"])

        item["post_count"] += 1
        sentiment = _sentiment_bucket(post.get("sentiment", "neutral"))
        if sentiment == "bullish":
            item["bullish_count"] += 1
        elif sentiment == "bearish":
            item["bearish_count"] += 1
        else:
            item["neutral_count"] += 1

        _extend_unique(item["aliases"], post.get("aliases", []))
        _extend_unique(item["risk_points"], post.get("risk_points", []))
        item["_posts"].append(post)

        keywords = list(post.get("matched_keywords", []) or []) + list(post.get("tags", []) or [])
        for keyword in keywords:
            keyword_text = str(keyword).strip()
            if keyword_text:
                item["_keywords"][keyword_text] += 1

    summary = []
    for item in sorted(grouped.values(), key=lambda value: value["symbol"]):
        post_count = item["post_count"]
        sentiment_score = 0.0
        if post_count:
            sentiment_score = (item["bullish_count"] - item["bearish_count"]) / post_count

        post_dates = [_post_date(post.get("post_time")) for post in item["_posts"]]
        latest_post_date = max([date for date in post_dates if date], default="")
        today_heat = 0
        for post in item["_posts"]:
            if not latest_post_date or _post_date(post.get("post_time")) == latest_post_date:
                today_heat += _as_int(post.get("likes")) + _as_int(post.get("comments")) * 2

        bullish_points = _unique_post_points(item["_posts"], "bullish")
        bearish_points = _unique_post_points(item["_posts"], "bearish")
        summary.append(
            {
                "symbol": item["symbol"],
                "company": item["company"],
                "aliases": item["aliases"],
                "today_heat": today_heat,
                "post_count": post_count,
                "bullish_count": item["bullish_count"],
                "bearish_count": item["bearish_count"],
                "neutral_count": item["neutral_count"],
                "sentiment_score": round(sentiment_score, 4),
                "hot_keywords": [
                    {"keyword": keyword, "count": count}
                    for keyword, count in item["_keywords"].most_common(5)
                ],
                "ai_brief": _ai_brief(item, post_count),
                "bullish_points": bullish_points,
                "bearish_points": bearish_points,
                "risk_points": item["risk_points"],
                "review_flags": _review_flags(item, post_count),
                "updated_at": updated_at,
            }
        )

    return summary
