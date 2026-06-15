from __future__ import annotations

import argparse
import json
import random
import string
from datetime import datetime
from pathlib import Path


VALID_COMMANDS = ("update-news", "update-all", "build-html", "update-technical")
SECRET_FILE = Path("config") / "remote_secret.txt"


def main() -> int:
    parser = argparse.ArgumentParser(description="Write a local remote command for testing remote_command_watcher.py.")
    parser.add_argument("command", choices=VALID_COMMANDS)
    parser.add_argument("--command-file", default="remote_commands/command.json")
    parser.add_argument("--secret", default=None, help="Secret to write into command.json. Defaults to config/remote_secret.txt if present.")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    path = root / args.command_file
    secret = args.secret if args.secret is not None else read_secret(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "command": args.command,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "status": "pending",
        "secret": secret,
        "command_id": make_command_id(),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote remote command: {args.command}")
    print(f"file: {path}")
    return 0


def read_secret(root: Path) -> str:
    path = root / SECRET_FILE
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8-sig").strip()


def make_command_id() -> str:
    suffix = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(5))
    return "cmd-" + datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + suffix


if __name__ == "__main__":
    raise SystemExit(main())
