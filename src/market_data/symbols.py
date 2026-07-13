from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class SymbolInfo:
    canonical: str
    market: str
    eastmoney_secid: str
    yahoo_symbol: str


def normalize_symbol(value: object) -> SymbolInfo:
    symbol = str(value or "").strip().upper()
    if re.fullmatch(r"\d{6}\.(SS|SH)", symbol):
        code = symbol[:6]
        return SymbolInfo(f"{code}.SS", "CN", f"1.{code}", f"{code}.SS")
    if re.fullmatch(r"\d{6}\.SZ", symbol):
        code = symbol[:6]
        return SymbolInfo(symbol, "CN", f"0.{code}", symbol)
    if re.fullmatch(r"\d{1,5}\.HK", symbol):
        code = symbol.split(".", 1)[0].zfill(4)
        canonical = f"{code}.HK"
        return SymbolInfo(canonical, "HK", f"116.{code.zfill(5)}", canonical)
    raise ValueError(f"unsupported symbol format: {symbol or '<empty>'}")
