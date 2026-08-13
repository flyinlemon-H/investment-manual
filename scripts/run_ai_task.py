from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ai_tasks.registry import create_default_task_registry
from ai_tasks.runner import INPUT_ERROR_EXIT, create_live_provider_registry, create_mock_provider_registry, run_ai_task
from providers.ai.deepseek_provider import DEEPSEEK_DEFAULT_MODEL
from scripts.generate_ai_decision_review_data import DEFAULT_OUTPUT, refresh_bridge


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run a local AI task through the provider foundation.")
    parser.add_argument("task_arg", nargs="?")
    parser.add_argument("--task", default=None)
    parser.add_argument("--input", default=str(ROOT / "data" / "latest_export.json"))
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--provider", default=None)
    parser.add_argument("--model", default=None)
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--output-dir", default=None)
    args = parser.parse_args(argv)

    try:
        task_name = args.task or args.task_arg
        if not task_name:
            raise ValueError("AI task name is required.")
        input_path = Path(args.input)
        data = json.loads(input_path.read_text(encoding="utf-8"))
        stock = find_stock(data, args.symbol)
        output_dir = Path(args.output_dir) if args.output_dir else ROOT / "data"
        provider_name = args.provider or ("deepseek" if args.live else "mock")
        metadata = {"cli": True, "symbol": args.symbol, "live": bool(args.live)}
        if provider_name != "mock" and not args.live:
            raise ValueError("Live provider calls require explicit --live.")
        if args.live:
            provider_registry = create_live_provider_registry(provider_name=provider_name, log_dir=output_dir / "ai_logs")
        else:
            provider_registry = create_mock_provider_registry(log_dir=output_dir / "ai_logs", metadata=metadata)
        model_name = args.model
        if provider_name == "deepseek" and model_name is None:
            model_name = DEEPSEEK_DEFAULT_MODEL
        result = run_ai_task(
            task_name=task_name,
            stock=stock,
            provider_name=provider_name,
            model_name=model_name,
            task_registry=create_default_task_registry(),
            provider_registry=provider_registry,
            root_dir=ROOT,
            output_data_dir=output_dir,
            metadata=metadata,
            context_forbidden_values=other_stock_identity_values(data, stock),
        )
    except Exception as exc:
        print(f"AI task input error: {exc}")
        return INPUT_ERROR_EXIT

    print(f"ok: {result['ok']}")
    print(f"provider: {result.get('provider')}")
    print(f"model: {result.get('model')}")
    print(f"requestId: {result.get('requestId')}")
    print(f"validation: {result.get('validation')}")
    if result.get("draftPath"):
        print(f"draftPath: {result['draftPath']}")
    if result.get("reviewTaskPath"):
        print(f"reviewTaskPath: {result['reviewTaskPath']}")
    if result.get("failurePath"):
        print(f"failurePath: {result['failurePath']}")
    if result.get("ok"):
        bridge_output_dir = Path(args.output_dir) if args.output_dir else None
        bridge_ok, bridge_message, bridge_path = refresh_bridge_data(bridge_output_dir)
        print(f"bridgeData: {'success' if bridge_ok else 'failed'}")
        print(f"bridgeDataPath: {bridge_path}")
        if bridge_message:
            print(f"bridgeDataMessage: {bridge_message}")
        print("nextStep: 刷新或重新打开 index.html 查看 AI决策复核结果。")
    else:
        print("bridgeData: skipped")
        print("bridgeDataMessage: AI调用或校验失败，未刷新桥接数据；请检查 failurePath。")
    usage = result.get("usage") or {}
    print(f"inputTokens: {usage.get('inputTokens', 0)}")
    print(f"cachedTokens: {usage.get('cachedInputTokens', 0)}")
    print(f"outputTokens: {usage.get('outputTokens', 0)}")
    print(f"durationMs: {result.get('durationMs', 0)}")
    print(f"estimatedCost: {result.get('estimatedCost')}")
    return int(result.get("exitCode") or 0)


def refresh_bridge_data(output_data_dir: Path | None = None) -> tuple[bool, str, Path]:
    bridge_path = DEFAULT_OUTPUT if output_data_dir is None else output_data_dir / "ai_decision_review_data.js"
    try:
        if output_data_dir is None:
            exit_code = refresh_bridge()
        else:
            exit_code = refresh_bridge(
                data_root=output_data_dir,
                review_dirs=[output_data_dir / "review_queue" / "pending"],
                output=bridge_path,
            )
        if exit_code == 0:
            return True, "AI 决策复核桥接数据已刷新。", bridge_path
        return False, f"generate_ai_decision_review_data exited with {exit_code}", bridge_path
    except Exception as exc:
        return False, str(exc), bridge_path


def find_stock(data: dict[str, Any], symbol: str) -> dict[str, Any]:
    stocks = data.get("stocks")
    if not isinstance(stocks, list):
        stocks = (data.get("portfolio") or {}).get("stocks")
    if not isinstance(stocks, list):
        raise ValueError("Input JSON does not contain a stocks array.")
    query = str(symbol or "").strip()
    query_identity = query.upper()
    valid_stocks = [stock for stock in stocks if isinstance(stock, dict)]

    symbol_matches = [
        stock
        for stock in valid_stocks
        if query_identity in {
            str(stock.get("symbol") or "").strip().upper(),
            str(stock.get("code") or "").strip().upper(),
        }
    ]
    if len(symbol_matches) > 1:
        raise ValueError(f"Symbol '{query}' is duplicated in input JSON.")
    if symbol_matches:
        return symbol_matches[0]

    id_matches = [stock for stock in valid_stocks if str(stock.get("id") or "").strip() == query]
    if len(id_matches) > 1:
        raise ValueError(f"Identifier '{query}' is duplicated in input JSON.")
    if id_matches:
        return id_matches[0]

    normalized_name = query.casefold()
    name_matches = [stock for stock in valid_stocks if str(stock.get("name") or "").strip().casefold() == normalized_name]
    if len(name_matches) > 1:
        raise ValueError(f"Name '{query}' is ambiguous in input JSON.")
    if name_matches:
        return name_matches[0]
    raise ValueError(f"Symbol '{symbol}' was not found in input JSON.")


def other_stock_identity_values(data: dict[str, Any], target: dict[str, Any]) -> list[str]:
    stocks = data.get("stocks")
    if not isinstance(stocks, list):
        stocks = (data.get("portfolio") or {}).get("stocks")
    if not isinstance(stocks, list):
        return []
    target_symbol = str(target.get("symbol") or target.get("code") or target.get("id") or "").strip().upper()
    values: set[str] = set()
    for stock in stocks:
        if not isinstance(stock, dict):
            continue
        symbol = str(stock.get("symbol") or stock.get("code") or stock.get("id") or "").strip()
        if symbol.upper() == target_symbol:
            continue
        for value in (stock.get("symbol"), stock.get("code"), stock.get("name"), stock.get("displayName")):
            text = str(value or "").strip()
            if len(text) >= 2:
                values.add(text)
        aliases = stock.get("aliases") or stock.get("alias") or []
        if not isinstance(aliases, list):
            aliases = [aliases]
        for value in aliases:
            text = str(value or "").strip()
            if len(text) >= 2:
                values.add(text)
    return sorted(values)


if __name__ == "__main__":
    raise SystemExit(main())
