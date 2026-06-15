from __future__ import annotations

import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterator


USER_AGENT = "social_collector/1.0 (+local investment manual webpage reader)"
SKIP_TAGS = {"script", "style", "noscript", "nav", "footer", "header", "aside", "form", "svg"}
# TODO(V6.6): add class/id filtering and text-density scoring for cookie banners,
# related-news blocks, ads, and sidebars. V6.5.2 keeps extraction conservative.
BLOCK_TAGS = {
    "article",
    "section",
    "main",
    "p",
    "br",
    "div",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
}


class WebpageSourceError(ValueError):
    pass


@dataclass
class WebpageStat:
    url: str
    success: bool = False
    error: str = ""


class WebpageSocialPostSource:
    source_name = "webpage"

    def __init__(self, urls_path: Path, timeout_seconds: int = 15) -> None:
        self.urls_path = urls_path
        self.timeout_seconds = timeout_seconds
        self.urls = load_urls(urls_path)
        self.stats: list[WebpageStat] = []

    @property
    def total_count(self) -> int:
        return len(self.urls)

    @property
    def success_count(self) -> int:
        return sum(1 for stat in self.stats if stat.success)

    def collect(self) -> Iterator[dict[str, str]]:
        for url in self.urls:
            stat = WebpageStat(url=url)
            self.stats.append(stat)
            fetched_at = datetime.now(timezone.utc).isoformat()
            try:
                html_text = self._fetch(url)
                parsed = parse_webpage(html_text)
                stat.success = True
                yield {
                    "platform": "webpage",
                    "symbol": "",
                    "company": "",
                    "post_time": parsed.post_time or fetched_at,
                    "content": parsed.content,
                    "url": url,
                    "likes": "0",
                    "comments": "0",
                    "summary": parsed.title,
                    "risk_points": "",
                    "_source": "webpage",
                    "_source_name": "urls",
                    "_source_url": url,
                }
            except Exception as exc:  # A bad URL should not stop the whole batch.
                stat.error = str(exc)

    def _fetch(self, url: str) -> str:
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                body = response.read()
                charset = response.headers.get_content_charset()
                return _decode_html(body, charset)
        except urllib.error.URLError as exc:
            raise WebpageSourceError(f"Fetch failed: {exc}") from exc


@dataclass(frozen=True)
class ParsedWebpage:
    title: str
    content: str
    post_time: str


def load_urls(path: Path) -> list[str]:
    if not path.exists():
        raise FileNotFoundError(f"URL list file not found: {path}")

    urls: list[str] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), start=1):
        url = line.strip()
        if not url or url.startswith("#"):
            continue
        if not url.startswith(("http://", "https://", "file://")):
            raise WebpageSourceError(f"Invalid URL at {path}:{line_number}: {url}")
        urls.append(url)

    if not urls:
        raise WebpageSourceError(f"URL list is empty: {path}")
    return urls


def parse_webpage(html_text: str) -> ParsedWebpage:
    parser = _ReadableHtmlParser()
    parser.feed(html_text)
    parser.close()
    title = _compact_text(parser.title)
    body = _compact_text(" ".join(parser.text_parts))
    content = _trim_content(" ".join(part for part in (title, body) if part))
    return ParsedWebpage(title=title, content=content, post_time=parser.post_time)


def _compact_text(value: str) -> str:
    return re.sub(r"\s+", " ", unescape(value or "")).strip()


def _trim_content(value: str, limit: int = 6000) -> str:
    text = _compact_text(value)
    return text[:limit].strip()


def _decode_html(body: bytes, header_charset: str | None) -> str:
    charset = (header_charset or "").strip().lower()
    if charset and charset not in {"iso-8859-1", "latin-1", "windows-1252"}:
        return body.decode(charset, errors="replace")

    meta_charset = _detect_meta_charset(body)
    if meta_charset:
        return body.decode(meta_charset, errors="replace")

    try:
        return body.decode("utf-8")
    except UnicodeDecodeError:
        fallback = charset or "utf-8"
        return body.decode(fallback, errors="replace")


def _detect_meta_charset(body: bytes) -> str:
    head = body[:4096].decode("ascii", errors="ignore")
    match = re.search(r"<meta[^>]+charset=[\"']?([A-Za-z0-9._-]+)", head, flags=re.IGNORECASE)
    return match.group(1).strip() if match else ""


class _ReadableHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.post_time = ""
        self.text_parts: list[str] = []
        self._skip_depth = 0
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag_name = tag.casefold()
        attrs_dict = {key.casefold(): (value or "") for key, value in attrs}
        if tag_name in SKIP_TAGS:
            self._skip_depth += 1
            return
        if tag_name == "title":
            self._in_title = True
        if tag_name == "meta":
            self._read_meta_time(attrs_dict)
        if tag_name == "time" and not self.post_time:
            self.post_time = attrs_dict.get("datetime", "").strip()
        if tag_name in BLOCK_TAGS:
            self.text_parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        tag_name = tag.casefold()
        if tag_name in SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1
            return
        if tag_name == "title":
            self._in_title = False
        if tag_name in BLOCK_TAGS:
            self.text_parts.append(" ")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        text = data.strip()
        if not text:
            return
        if self._in_title:
            self.title += " " + text
            return
        self.text_parts.append(text)

    def _read_meta_time(self, attrs: dict[str, str]) -> None:
        if self.post_time:
            return
        name = (attrs.get("name") or attrs.get("property") or attrs.get("itemprop") or "").casefold()
        if name in {"article:published_time", "pubdate", "publishdate", "datepublished", "date", "dc.date"}:
            self.post_time = attrs.get("content", "").strip()
