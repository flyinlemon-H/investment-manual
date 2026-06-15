from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


REPORT_NAME = "mobile_trigger_report.json"


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    root = Path(__file__).resolve().parents[1]
    logs_dir = root / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    report_path = logs_dir / REPORT_NAME
    started_at = datetime.now().isoformat(timespec="seconds")
    command_text = trigger_command_text(args.command)
    output_paths: list[str] = []
    error_message = ""
    success = False

    try:
        if args.command == "update-news":
            result = run_pipeline(root, ["--source", "news"])
            success = result.returncode == 0
            error_message = process_error(result)
            output_paths = [
                str(root / "output" / "social_posts.json"),
                str(root / "output" / "social_summary.json"),
                str(root / "dist" / "social_posts.json"),
                str(root / "dist" / "social_summary.json"),
            ]
            print_process(result)
        elif args.command == "update-all":
            result = run_pipeline(root, ["--source", "news"])
            success = result.returncode == 0
            note = "update-all is reserved for future news/social/financial batch updates; current implementation runs news update."
            error_message = process_error(result)
            output_paths = [
                str(root / "output" / "social_posts.json"),
                str(root / "output" / "social_summary.json"),
                str(root / "dist" / "social_posts.json"),
                str(root / "dist" / "social_summary.json"),
            ]
            print(note)
            print_process(result)
        elif args.command == "build-html":
            output_paths = build_html(root)
            success = True
        elif args.command == "update-technical":
            success = True
            error_message = "not implemented yet: technical data update is reserved for future local automation."
            print(error_message)
        else:
            raise ValueError(f"Unsupported command: {args.command}")
    except Exception as exc:
        success = False
        error_message = str(exc)

    report = {
        "executed_at": started_at,
        "command": command_text,
        "success": success,
        "error": error_message,
        "output_file_paths": output_paths,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"report: {report_path}")
    return 0 if success else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Mobile-friendly local trigger for the investment manual project.")
    parser.add_argument(
        "command",
        choices=("update-news", "update-all", "build-html", "update-technical"),
        help="update-news runs run_pipeline.py --source news; update-all is reserved and currently runs news; build-html rebuilds latest dist HTML; update-technical is reserved.",
    )
    return parser


def trigger_command_text(command: str) -> str:
    if command == "update-news":
        return "python run_pipeline.py --source news"
    if command == "update-all":
        return "python run_pipeline.py --source news"
    if command == "build-html":
        return "build latest HTML from index.html and src/*.js"
    if command == "update-technical":
        return "update technical data (reserved; not implemented yet)"
    return command


def run_pipeline(root: Path, args: list[str]) -> subprocess.CompletedProcess[str]:
    cmd = [sys.executable, "run_pipeline.py", *args]
    return subprocess.run(cmd, cwd=root, text=True, capture_output=True)


def print_process(result: subprocess.CompletedProcess[str]) -> None:
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)


def process_error(result: subprocess.CompletedProcess[str]) -> str:
    if result.returncode == 0:
        return ""
    text = (result.stderr or result.stdout or "").strip()
    return text[-4000:] if text else f"Command failed with exit code {result.returncode}."


def build_html(root: Path) -> list[str]:
    index_path = root / "index.html"
    html = index_path.read_text(encoding="utf-8")
    version = detect_version(root, html)

    def inline_script(match: re.Match[str]) -> str:
        src = match.group(1)
        script_path = root / src
        return "<script>\n" + script_path.read_text(encoding="utf-8") + "\n</script>"

    html = re.sub(r'<script src="(src/[^"]+)"></script>', inline_script, html)
    dist_dir = root / "dist"
    dist_dir.mkdir(parents=True, exist_ok=True)
    output_path = dist_dir / f"投资作战手册_{version}.html"
    output_path.write_text(html, encoding="utf-8")
    print(f"built: {output_path}")
    return [str(output_path)]


def detect_version(root: Path, html: str) -> str:
    import_export = root / "src" / "import-export.js"
    if import_export.exists():
        text = import_export.read_text(encoding="utf-8")
        match = re.search(r"function\s+appVersion\(\)\s*\{\s*return\s+['\"]([^'\"]+)['\"]", text)
        if match:
            return match.group(1)
    match = re.search(r"投资作战手册\s+(V[0-9A-Za-z.\-_]+)", html)
    if match:
        return match.group(1)
    return "latest"


if __name__ == "__main__":
    raise SystemExit(main())
