from __future__ import annotations

import re


BULLISH_KEYWORDS = {
    "bullish",
    "buy",
    "long",
    "moon",
    "breakout",
    "beat",
    "upgrade",
    "positive",
    "upside",
    "看多",
    "买入",
    "上涨",
    "利好",
    "利多",
    "突破",
    "超预期",
    "景气",
    "受益",
    "支撑",
    "改善",
}

BEARISH_KEYWORDS = {
    "bearish",
    "sell",
    "short",
    "dump",
    "miss",
    "downgrade",
    "negative",
    "downside",
    "risk",
    "看空",
    "卖出",
    "下跌",
    "利空",
    "跌破",
    "不及预期",
    "风险",
    "放缓",
    "不确定",
    "回落",
}


def classify_sentiment(text: str) -> str:
    bullish_score = _keyword_score(text, BULLISH_KEYWORDS)
    bearish_score = _keyword_score(text, BEARISH_KEYWORDS)

    if bullish_score > bearish_score:
        return "bullish"
    if bearish_score > bullish_score:
        return "bearish"
    return "neutral"


def _keyword_score(text: str, keywords: set[str]) -> int:
    score = 0
    for keyword in keywords:
        if keyword.isascii():
            pattern = rf"(?<![A-Za-z]){re.escape(keyword)}(?![A-Za-z])"
            score += len(re.findall(pattern, text, flags=re.IGNORECASE))
        else:
            score += text.count(keyword)
    return score
