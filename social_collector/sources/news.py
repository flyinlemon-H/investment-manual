from __future__ import annotations

from pathlib import Path

from .rss import RssSocialPostSource, RssSourceError


DEFAULT_NEWS_CONFIG = Path("config/news_sources.json")


class NewsSourceError(RssSourceError):
    pass


class NewsSocialPostSource(RssSocialPostSource):
    source_name = "news"

    def __init__(self, config_path: Path = DEFAULT_NEWS_CONFIG, timeout_seconds: int = 15) -> None:
        super().__init__(
            config_path=config_path,
            timeout_seconds=timeout_seconds,
            forced_platform="news",
            source_name="news",
        )
