from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from social_collector.cli import _dedupe_by_url_symbol, main as collector_main
from social_collector.matcher import load_watchlist, match_watchlist_items
from social_collector.normalizer import normalize_post
from social_collector.sentiment import classify_sentiment
from social_collector.sources.news import NewsSocialPostSource
from social_collector.sources.rss import RssSocialPostSource
from social_collector.sources.webpage import WebpageSocialPostSource
from social_collector.summary import build_social_summary
from validate_output import main as validate_main


ROOT = Path(__file__).resolve().parents[1]
TEST_DATA = ROOT / "test_data"
FIXED_UPDATED_AT = "2026-06-13T00:00:00+00:00"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def file_url(path: Path) -> str:
    return path.resolve().as_uri()


class SocialCollectorTests(unittest.TestCase):
    def test_csv_import_matches_expected_posts_and_validates_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            posts_path = tmp / "social_posts.json"
            summary_path = tmp / "social_summary.json"

            exit_code = collector_main(
                [
                    "--source",
                    "csv",
                    "--input",
                    str(TEST_DATA / "sample_posts.csv"),
                    "--watchlist",
                    str(TEST_DATA / "watchlist.json"),
                    "--output",
                    str(posts_path),
                    "--summary",
                    str(summary_path),
                ]
            )

            self.assertEqual(exit_code, 0)
            self.assertEqual(load_json(posts_path), load_json(TEST_DATA / "expected_social_posts.json"))
            self.assertEqual(validate_main(["--posts", str(posts_path), "--summary", str(summary_path)]), 0)

    def test_chinese_fixture_matches_symbols_aliases_and_sentiment(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            posts_path = tmp / "social_posts.json"
            summary_path = tmp / "social_summary.json"

            exit_code = collector_main(
                [
                    "--source",
                    "csv",
                    "--input",
                    str(TEST_DATA / "chinese_posts.csv"),
                    "--watchlist",
                    str(TEST_DATA / "chinese_watchlist.json"),
                    "--output",
                    str(posts_path),
                    "--summary",
                    str(summary_path),
                ]
            )

            self.assertEqual(exit_code, 0)
            posts = load_json(posts_path)["social_posts"]
            expected_posts = load_json(TEST_DATA / "expected_zh_social_posts.json")
            expected_summary = load_json(TEST_DATA / "expected_zh_social_summary.json")
            actual_summary = {"social_summary": build_social_summary(posts, updated_at=FIXED_UPDATED_AT)}

            self.assertEqual(load_json(posts_path), expected_posts)
            self.assertEqual(actual_summary, expected_summary)
            self.assertEqual(validate_main(["--mode", "strict", "--posts", str(posts_path), "--summary", str(summary_path)]), 0)
            self.assertEqual(validate_main(["--mode", "strict", "--watchlist", str(TEST_DATA / "chinese_watchlist.json")]), 0)

    def test_rss_source_maps_feed_items_to_raw_posts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            config_path = Path(tmp_dir) / "rss_sources.json"
            config_path.write_text(
                json.dumps(
                    [
                        {
                            "name": "local-rss",
                            "url": file_url(TEST_DATA / "sample_feed.xml"),
                            "platform": "rss",
                        }
                    ]
                ),
                encoding="utf-8",
            )

            source = RssSocialPostSource(config_path)
            posts = list(source.collect())

            self.assertEqual(len(posts), 1)
            self.assertEqual(posts[0]["platform"], "rss")
            self.assertEqual(posts[0]["url"], "https://example.test/rss-alpha")
            self.assertIn("Alpha Robotics", posts[0]["content"])
            self.assertEqual(source.stats[0].fetched_count, 1)

    def test_news_source_reads_rss_and_atom_as_news_posts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            config_path = Path(tmp_dir) / "news_sources.json"
            config_path.write_text(
                json.dumps(
                    [
                        {
                            "name": "local-news-rss",
                            "url": file_url(TEST_DATA / "sample_feed.xml"),
                            "platform": "ignored",
                        },
                        {
                            "name": "local-news-atom",
                            "url": file_url(TEST_DATA / "sample_atom.xml"),
                            "platform": "rss",
                        },
                    ]
                ),
                encoding="utf-8",
            )

            source = NewsSocialPostSource(config_path)
            posts = list(source.collect())

            self.assertEqual(len(posts), 2)
            self.assertTrue(all(post["platform"] == "news" for post in posts))
            self.assertEqual(posts[0]["_source"], "news")
            self.assertEqual(posts[1]["url"], "https://example.test/atom-beta")
            self.assertIn("Beta Energy", posts[1]["content"])

    def test_news_collector_outputs_standard_social_posts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            config_path = tmp / "news_sources.json"
            posts_path = tmp / "social_posts.json"
            summary_path = tmp / "social_summary.json"
            config_path.write_text(
                json.dumps(
                    [
                        {
                            "name": "local-news-rss",
                            "url": file_url(TEST_DATA / "sample_feed.xml"),
                            "platform": "news",
                        },
                        {
                            "name": "local-news-atom",
                            "url": file_url(TEST_DATA / "sample_atom.xml"),
                            "platform": "news",
                        },
                    ]
                ),
                encoding="utf-8",
            )

            exit_code = collector_main(
                [
                    "--source",
                    "news",
                    "--news-config",
                    str(config_path),
                    "--watchlist",
                    str(TEST_DATA / "watchlist.json"),
                    "--output",
                    str(posts_path),
                    "--summary",
                    str(summary_path),
                ]
            )

            self.assertEqual(exit_code, 0)
            posts = load_json(posts_path)["social_posts"]
            summary = load_json(summary_path)["social_summary"]
            self.assertEqual({post["platform"] for post in posts}, {"news"})
            self.assertEqual({post["symbol"] for post in posts}, {"ALPHA.HK", "BETA.SS"})
            self.assertTrue(all(post["matched_keywords"] for post in posts))
            self.assertTrue(all(post["tags"] for post in posts))
            self.assertTrue(all(post["sentiment"] in {"bullish", "bearish", "neutral"} for post in posts))
            self.assertTrue(all("review_flags" in row for row in summary))
            self.assertEqual(validate_main(["--posts", str(posts_path), "--summary", str(summary_path)]), 0)

    def test_webpage_source_extracts_title_and_readable_body(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            urls_path = Path(tmp_dir) / "urls.txt"
            urls_path.write_text(file_url(TEST_DATA / "sample_page.html"), encoding="utf-8")

            source = WebpageSocialPostSource(urls_path)
            posts = list(source.collect())

            self.assertEqual(len(posts), 1)
            self.assertEqual(posts[0]["platform"], "webpage")
            self.assertEqual(posts[0]["summary"], "Beta Energy battery risk")
            self.assertIn("BETA.SS", posts[0]["content"])
            self.assertNotIn("Navigation text", posts[0]["content"])
            self.assertNotIn("Footer text", posts[0]["content"])
            self.assertEqual(posts[0]["post_time"], "2026-06-13T11:00:00+08:00")

    def test_stock_keyword_matching_uses_symbol_company_alias_and_keywords(self) -> None:
        watchlist = load_watchlist(TEST_DATA / "watchlist.json")
        post = normalize_post(
            {
                "platform": "test",
                "content": "Alpha Robotics ALPHA.HK AlphaBot delivery remains bullish.",
                "post_time": "2026-06-13T09:00:00+08:00",
            }
        )

        matches = match_watchlist_items(post, watchlist)

        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["symbol"], "ALPHA.HK")
        self.assertEqual(matches[0]["matched_keywords"], ["ALPHA.HK", "ALPHA", "Alpha Robotics", "AlphaBot", "delivery"])

    def test_sentiment_classifier(self) -> None:
        self.assertEqual(classify_sentiment("delivery beat and bullish upside"), "bullish")
        self.assertEqual(classify_sentiment("battery risk and downside"), "bearish")
        self.assertEqual(classify_sentiment("plain operating update"), "neutral")
        self.assertEqual(classify_sentiment("交付超预期，市场看多"), "bullish")
        self.assertEqual(classify_sentiment("订单不及预期，存在回落风险"), "bearish")
        self.assertEqual(classify_sentiment("订单正常推进，暂无明显方向"), "neutral")

    def test_dedupe_by_platform_url_symbol_and_no_url_hash(self) -> None:
        rows = [
            {"platform": "rss", "url": "https://example.test/a", "symbol": "ALPHA.HK", "content": "first"},
            {"platform": "rss", "url": "https://example.test/a", "symbol": "ALPHA.HK", "content": "duplicate"},
            {"platform": "webpage", "url": "https://example.test/a", "symbol": "ALPHA.HK", "content": "same url other platform"},
            {"platform": "rss", "url": "https://example.test/a", "symbol": "BETA.SS", "content": "other symbol"},
            {"platform": "rss", "url": "", "symbol": "BETA.SS", "post_time": "2026-06-13T00:00:00+08:00", "content": "no url"},
            {"platform": "rss", "url": "", "symbol": "BETA.SS", "post_time": "2026-06-13T00:00:00+08:00", "content": "no url"},
        ]

        deduped = _dedupe_by_url_symbol(rows)

        self.assertEqual(len(deduped), 4)
        self.assertEqual(deduped[0]["content"], "first")
        self.assertEqual(deduped[1]["platform"], "webpage")
        self.assertEqual(deduped[2]["symbol"], "BETA.SS")

    def test_validate_output_frontend_accepts_numeric_strings_and_bare_arrays(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            posts_path = tmp / "posts.json"
            summary_path = tmp / "summary.json"
            posts = load_json(TEST_DATA / "expected_social_posts.json")["social_posts"]
            summary = load_json(TEST_DATA / "expected_social_summary.json")["social_summary"]
            posts[0]["likes"] = "10"
            posts[0]["comments"] = "2"
            posts_path.write_text(json.dumps(posts), encoding="utf-8")
            summary_path.write_text(json.dumps(summary), encoding="utf-8")

            self.assertEqual(validate_main(["--mode", "frontend", "--posts", str(posts_path), "--summary", str(summary_path)]), 0)
            self.assertEqual(validate_main(["--mode", "strict", "--posts", str(posts_path), "--summary", str(summary_path)]), 1)

    def test_validate_watchlist_requires_standard_aliases(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "watchlist.json"
            path.write_text(
                json.dumps(
                    {
                        "watchlist": [
                            {
                                "symbol": "1810.HK",
                                "company": "小米集团",
                                "alias": ["小米"],
                                "keywords": ["1810"],
                            }
                        ]
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            self.assertEqual(validate_main(["--watchlist", str(path)]), 1)

    def test_webpage_all_sources_failed_returns_nonzero(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            urls_path = tmp / "urls.txt"
            urls_path.write_text((tmp / "missing.html").resolve().as_uri(), encoding="utf-8")
            exit_code = collector_main(
                [
                    "--source",
                    "webpage",
                    "--urls",
                    str(urls_path),
                    "--watchlist",
                    str(TEST_DATA / "watchlist.json"),
                    "--output",
                    str(tmp / "posts.json"),
                    "--summary",
                    str(tmp / "summary.json"),
                ]
            )

            self.assertNotEqual(exit_code, 0)

    def test_rss_all_sources_failed_returns_nonzero(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            config_path = tmp / "rss_sources.json"
            config_path.write_text(
                json.dumps(
                    [
                        {
                            "name": "missing-rss",
                            "url": (tmp / "missing.xml").resolve().as_uri(),
                            "platform": "rss",
                        }
                    ]
                ),
                encoding="utf-8",
            )
            exit_code = collector_main(
                [
                    "--source",
                    "rss",
                    "--rss-config",
                    str(config_path),
                    "--watchlist",
                    str(TEST_DATA / "watchlist.json"),
                    "--output",
                    str(tmp / "posts.json"),
                    "--summary",
                    str(tmp / "summary.json"),
                ]
            )

            self.assertNotEqual(exit_code, 0)

    def test_summary_aggregation_matches_expected_fixture(self) -> None:
        posts = load_json(TEST_DATA / "expected_social_posts.json")["social_posts"]
        expected = load_json(TEST_DATA / "expected_social_summary.json")

        actual = {"social_summary": build_social_summary(posts, updated_at=FIXED_UPDATED_AT)}

        self.assertEqual(actual, expected)


if __name__ == "__main__":
    unittest.main()
