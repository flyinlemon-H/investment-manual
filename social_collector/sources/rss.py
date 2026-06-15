from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Iterator


DEFAULT_RSS_CONFIG = Path("config/rss_sources.json")
USER_AGENT = "social_collector/1.0 (+local investment manual RSS reader)"


class RssSourceError(ValueError):
    pass


@dataclass(frozen=True)
class RssFeedConfig:
    name: str
    url: str
    platform: str = "rss"


@dataclass
class RssFeedStat:
    name: str
    url: str
    platform: str
    fetched_count: int = 0
    error: str = ""


def load_rss_sources(path: Path = DEFAULT_RSS_CONFIG) -> list[RssFeedConfig]:
    if not path.exists():
        raise FileNotFoundError(f"RSS config file not found: {path}")

    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise RssSourceError(f"Invalid RSS config JSON: {path}: {exc}") from exc

    if not isinstance(payload, list):
        raise RssSourceError("RSS config must be a list of source objects.")

    sources: list[RssFeedConfig] = []
    for index, item in enumerate(payload, start=1):
        if not isinstance(item, dict):
            raise RssSourceError(f"RSS source #{index} must be an object.")

        name = str(item.get("name", "")).strip()
        url = str(item.get("url", "")).strip()
        platform = str(item.get("platform", "rss") or "rss").strip()
        if not name or not url:
            raise RssSourceError(f"RSS source #{index} must include name and url.")
        if not url.startswith(("http://", "https://", "file://")):
            raise RssSourceError(f"RSS source #{index} url must start with http://, https://, or file://.")

        sources.append(RssFeedConfig(name=name, url=url, platform=platform))

    return sources


class RssSocialPostSource:
    source_name = "rss"

    def __init__(
        self,
        config_path: Path = DEFAULT_RSS_CONFIG,
        timeout_seconds: int = 15,
        forced_platform: str | None = None,
        source_name: str = "rss",
    ) -> None:
        self.config_path = config_path
        self.timeout_seconds = timeout_seconds
        self.forced_platform = forced_platform
        self.source_name = source_name
        self.sources = load_rss_sources(config_path)
        self.stats: list[RssFeedStat] = []

    def collect(self) -> Iterator[dict[str, str]]:
        for source in self.sources:
            if self.forced_platform:
                source = RssFeedConfig(name=source.name, url=source.url, platform=self.forced_platform)
            stat = RssFeedStat(name=source.name, url=source.url, platform=source.platform)
            self.stats.append(stat)
            try:
                xml_text = self._fetch(source.url)
                posts = list(_parse_feed(xml_text, source))
                for post in posts:
                    post["_source"] = self.source_name
                stat.fetched_count = len(posts)
                yield from posts
            except Exception as exc:  # Keep other feeds usable when one RSS endpoint fails.
                stat.error = str(exc)

    def _fetch(self, url: str) -> str:
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                return response.read().decode(charset, errors="replace")
        except urllib.error.URLError as exc:
            raise RssSourceError(f"Fetch failed: {exc}") from exc


def _parse_feed(xml_text: str, source: RssFeedConfig) -> Iterator[dict[str, str]]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise RssSourceError(f"RSS XML parse failed: {exc}") from exc

    rss_items = root.findall(".//item")
    atom_entries = root.findall(".//{*}entry")
    for item in rss_items:
        yield _rss_item_to_post(item, source)
    for entry in atom_entries:
        yield _atom_entry_to_post(entry, source)


def _rss_item_to_post(item: ET.Element, source: RssFeedConfig) -> dict[str, str]:
    title = _find_text(item, "title")
    description = _find_text(item, "description")
    content = _strip_html(" ".join(part for part in (title, description) if part))
    url = _find_text(item, "link") or _find_text(item, "guid")
    post_time = _normalize_time(_find_text(item, "pubDate") or _find_text(item, "date"))
    return _post_dict(source, content=content, url=url, post_time=post_time, summary=title)


def _atom_entry_to_post(entry: ET.Element, source: RssFeedConfig) -> dict[str, str]:
    title = _find_text(entry, "title")
    summary = _find_text(entry, "summary") or _find_text(entry, "content")
    content = _strip_html(" ".join(part for part in (title, summary) if part))
    url = _atom_link(entry) or _find_text(entry, "id")
    post_time = _normalize_time(_find_text(entry, "published") or _find_text(entry, "updated"))
    return _post_dict(source, content=content, url=url, post_time=post_time, summary=title)


def _post_dict(source: RssFeedConfig, content: str, url: str, post_time: str, summary: str) -> dict[str, str]:
    return {
        "platform": source.platform,
        "source_name": source.name,
        "symbol": "",
        "company": "",
        "post_time": post_time,
        "content": content,
        "url": url,
        "likes": "0",
        "comments": "0",
        "summary": summary,
        "risk_points": "",
        "_source": "rss",
        "_source_name": source.name,
    }


def _find_text(element: ET.Element, local_name: str) -> str:
    for child in element.iter():
        if _local_name(child.tag) == local_name:
            return (child.text or "").strip()
    return ""


def _atom_link(entry: ET.Element) -> str:
    for child in entry:
        if _local_name(child.tag) != "link":
            continue
        href = child.attrib.get("href", "").strip()
        rel = child.attrib.get("rel", "alternate")
        if href and rel == "alternate":
            return href
    return ""


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", text).strip()


def _normalize_time(value: str) -> str:
    text = (value or "").strip()
    if not text:
        return ""
    try:
        return parsedate_to_datetime(text).isoformat()
    except (TypeError, ValueError, IndexError):
        return text
