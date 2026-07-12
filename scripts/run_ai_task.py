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
from scripts.generate_ai_decision_review_data import DEFAULT_OUTPUT, main as generate_ai_decision_review_data


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
        bridge_ok, bridge_message = refresh_bridge_data()
        print(f"bridgeData: {'success' if bridge_ok else 'failed'}")
        print(f"bridgeDataPath: {DEFAULT_OUTPUT}")
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


def refresh_bridge_data() -> tuple[bool, str]:
    try:
        exit_code = generate_ai_decision_review_data()
        if exit_code == 0:
            return True, "AI 决策复核桥接数据已刷新。"
        return False, f"generate_ai_decision_review_data exited with {exit_code}"
    except Exception as exc:
        return False, str(exc)


def find_stock(data: dict[str, Any], symbol: str) -> dict[str, Any]:
    stocks = data.get("stocks")
    if not isinstance(stocks, list):
        stocks = (data.get("portfolio") or {}).get("stocks")
    if not isinstance(stocks, list):
        raise ValueError("Input JSON does not contain a stocks array.")
    for stock in stocks:
        if not isinstance(stock, dict):
            continue
        candidates = {
            str(stock.get("symbol") or ""),
            str(stock.get("code") or ""),
            str(stock.get("id") or ""),
            str(stock.get("name") or ""),
        }
        if symbol in candidates:
            return stock
    raise ValueError(f"Symbol '{symbol}' was not found in input JSON.")


if __name__ == "__main__":
    raise SystemExit(main())
