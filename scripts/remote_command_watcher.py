from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any


ALLOWED_COMMANDS = {"update-news", "update-all", "build-html", "update-technical"}
VALID_COMMANDS = ALLOWED_COMMANDS
COMMAND_FILE = Path("remote_commands") / "command.json"
REPORT_FILE = Path("logs") / "remote_command_report.json"
SECRET_FILE = Path("config") / "remote_secret.txt"
RUNTIME_LOG_FILE = Path("logs") / "watcher_runtime.log"
SEEN_IDS_FILE = Path("logs") / "remote_command_seen_ids.json"


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    root = Path(__file__).resolve().parents[1]
    command_path = root / args.command_file
    report_path = root / args.report_file
    runtime_log_path = root / RUNTIME_LOG_FILE
    seen_ids_path = root / SEEN_IDS_FILE
    command_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    runtime_log_path.parent.mkdir(parents=True, exist_ok=True)
    ensure_command_file(command_path)

    print(f"remote watcher started: {command_path}")
    print(f"poll interval: {args.interval}s")
    print(f"sync git: {'on' if args.sync_git else 'off'}")
    last_seen_key = ""

    while True:
        loop_time = datetime.now().isoformat(timespec="seconds")
        git_pull_ok: bool | None = None
        current_command = "unknown"
        did_execute = False
        result_text = "idle"
        try:
            if args.sync_git:
                pull_result = git_pull(root)
                git_pull_ok = pull_result.returncode == 0
                if pull_result.returncode != 0:
                    result_text = "git pull failed"
                    write_report(
                        report_path,
                        command="git pull",
                        success=False,
                        error=process_error(pull_result),
                        command_file=str(command_path),
                        output_file_paths=[],
                        stdout=pull_result.stdout,
                        stderr=pull_result.stderr,
                    )
                    print("git pull failed; skipped this check cycle.")
                    append_runtime_log(runtime_log_path, loop_time, git_pull_ok, current_command, did_execute, result_text)
                    if args.once:
                        break
                    time.sleep(args.interval)
                    continue
            payload = read_json(command_path)
            command = str(payload.get("command", "none")).strip()
            current_command = command
            created_at = str(payload.get("created_at", "")).strip()
            command_id = str(payload.get("command_id", "")).strip()
            key = f"{command}|{created_at}"
            if command in VALID_COMMANDS and key != last_seen_key:
                last_seen_key = key
                if command_id and is_seen_command_id(seen_ids_path, command_id):
                    result_text = "duplicate command_id skipped"
                    handle_duplicate_command(root, command_path, report_path, payload, command, command_id, sync_git=args.sync_git)
                    append_runtime_log(runtime_log_path, loop_time, git_pull_ok, current_command, did_execute, result_text)
                    if args.once:
                        break
                    time.sleep(args.interval)
                    continue
                if not is_valid_secret(root, payload):
                    result_text = "rejected invalid secret"
                    reject_remote_command(root, command_path, report_path, payload, command, "invalid secret", sync_git=args.sync_git)
                else:
                    if command_id:
                        remember_command_id(seen_ids_path, command_id)
                    did_execute = True
                    run_remote_command(root, command_path, report_path, payload, command, sync_git=args.sync_git)
                    result_text = "executed"
            elif command not in ("none", *VALID_COMMANDS):
                result_text = "unsupported command"
                write_report(
                    report_path,
                    command=command,
                    success=False,
                    error=f"Unsupported command: {command}",
                    command_file=str(command_path),
                    output_file_paths=[],
                )
                write_command(command_path, {"command": "none", "created_at": created_at, "status": "failed", "secret": "", "command_id": command_id, "updated_at": datetime.now().isoformat(timespec="seconds")})
            append_runtime_log(runtime_log_path, loop_time, git_pull_ok, current_command, did_execute, result_text)
        except Exception as exc:
            result_text = f"exception: {exc}"
            write_report(
                report_path,
                command="watcher-loop",
                success=False,
                error=str(exc),
                command_file=str(command_path),
                output_file_paths=[],
            )
            append_runtime_log(runtime_log_path, loop_time, git_pull_ok, current_command, did_execute, result_text)
        if args.once:
            break
        time.sleep(args.interval)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Watch remote_commands/command.json and trigger local mobile actions.")
    parser.add_argument("--interval", type=float, default=60.0, help="Polling interval in seconds.")
    parser.add_argument("--once", action="store_true", help="Read and process at most one command, then exit.")
    parser.add_argument("--sync-git", action="store_true", help="Run git pull before each check, then commit and push command/report/dist after execution.")
    parser.add_argument("--command-file", default=str(COMMAND_FILE), help="Command JSON path.")
    parser.add_argument("--report-file", default=str(REPORT_FILE), help="Report JSON path.")
    return parser


def ensure_command_file(path: Path) -> None:
    if not path.exists():
        write_command(path, {"command": "none", "created_at": "", "status": "idle", "secret": "", "command_id": ""})


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8-sig") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a JSON object.")
    return data


def write_command(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def append_runtime_log(path: Path, loop_time: str, git_pull_ok: bool | None, command: str, executed: bool, result: str) -> None:
    git_text = "not_used" if git_pull_ok is None else ("success" if git_pull_ok else "failed")
    line = f"{loop_time} | git_pull={git_text} | command={command} | executed={executed} | result={result}\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(line)


def load_seen_command_ids(path: Path) -> list[str]:
    if not path.exists():
        return []
    try:
        data = read_json(path)
    except Exception:
        return []
    ids = data.get("command_ids", [])
    if not isinstance(ids, list):
        return []
    return [str(x) for x in ids if str(x).strip()]


def is_seen_command_id(path: Path, command_id: str) -> bool:
    return command_id in set(load_seen_command_ids(path))


def remember_command_id(path: Path, command_id: str) -> None:
    ids = load_seen_command_ids(path)
    if command_id not in ids:
        ids.append(command_id)
    ids = ids[-200:]
    payload = {"updated_at": datetime.now().isoformat(timespec="seconds"), "command_ids": ids}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def read_local_secret(root: Path) -> str:
    path = root / SECRET_FILE
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8-sig").strip()


def is_valid_secret(root: Path, payload: dict[str, Any]) -> bool:
    local_secret = read_local_secret(root)
    incoming_secret = str(payload.get("secret", "")).strip()
    return bool(local_secret) and incoming_secret == local_secret


def reject_remote_command(
    root: Path,
    command_path: Path,
    report_path: Path,
    payload: dict[str, Any],
    command: str,
    reason: str,
    *,
    sync_git: bool = False,
) -> None:
    updated_at = datetime.now().isoformat(timespec="seconds")
    write_report(
        report_path,
        command=command,
        success=False,
        error=reason,
        command_file=str(command_path),
        output_file_paths=[],
    )
    write_command(
        command_path,
        {
            "command": "none",
            "created_at": str(payload.get("created_at", "")),
            "status": "rejected",
            "secret": "",
            "command_id": str(payload.get("command_id", "")),
            "last_command": command,
            "updated_at": updated_at,
        },
    )
    if sync_git:
        git_sync = git_add_commit_push(root, command)
        write_report(
            report_path,
            command=command,
            success=False,
            error=reason,
            command_file=str(command_path),
            output_file_paths=[],
            git_sync=git_sync,
        )
    print(f"rejected remote command: {command} -> {reason}")


def handle_duplicate_command(
    root: Path,
    command_path: Path,
    report_path: Path,
    payload: dict[str, Any],
    command: str,
    command_id: str,
    *,
    sync_git: bool = False,
) -> None:
    updated_at = datetime.now().isoformat(timespec="seconds")
    reason = f"duplicate command_id skipped: {command_id}"
    write_report(
        report_path,
        command=command,
        success=True,
        error="",
        command_file=str(command_path),
        output_file_paths=[],
        stdout=reason,
    )
    write_command(
        command_path,
        {
            "command": "none",
            "created_at": str(payload.get("created_at", "")),
            "status": "ignored_duplicate",
            "secret": "",
            "command_id": command_id,
            "last_command": command,
            "updated_at": updated_at,
        },
    )
    if sync_git:
        git_sync = git_add_commit_push(root, command)
        write_report(
            report_path,
            command=command,
            success=True,
            error="",
            command_file=str(command_path),
            output_file_paths=[],
            stdout=reason,
            git_sync=git_sync,
        )
    print(reason)


def run_remote_command(root: Path, command_path: Path, report_path: Path, payload: dict[str, Any], command: str, *, sync_git: bool = False) -> None:
    running_payload = dict(payload)
    running_payload["status"] = "running"
    write_command(command_path, running_payload)

    started_at = datetime.now().isoformat(timespec="seconds")
    cmd = [sys.executable, "scripts/mobile_trigger.py", command]
    result = subprocess.run(cmd, cwd=root, text=True, capture_output=True)
    mobile_report = read_mobile_report(root)
    success = result.returncode == 0
    error = "" if success else ((result.stderr or result.stdout or "").strip()[-4000:] or f"Command failed with exit code {result.returncode}.")
    output_paths = mobile_report.get("output_file_paths", []) if isinstance(mobile_report, dict) else []

    write_report(
        report_path,
        command=command,
        success=success,
        error=error,
        command_file=str(command_path),
        output_file_paths=output_paths,
        started_at=started_at,
        stdout=result.stdout,
        stderr=result.stderr,
    )
    write_command(
        command_path,
        {
            "command": "none",
            "created_at": str(payload.get("created_at", "")),
            "status": "success" if success else "failed",
            "secret": "",
            "command_id": str(payload.get("command_id", "")),
            "last_command": command,
            "finished_at": datetime.now().isoformat(timespec="seconds"),
            "updated_at": datetime.now().isoformat(timespec="seconds"),
        },
    )
    git_sync = {"enabled": sync_git, "success": None, "message": ""}
    if sync_git:
        git_sync = git_add_commit_push(root, command)
        write_report(
            report_path,
            command=command,
            success=success,
            error=error,
            command_file=str(command_path),
            output_file_paths=output_paths,
            started_at=started_at,
            stdout=result.stdout,
            stderr=result.stderr,
            git_sync=git_sync,
        )
    print(f"executed remote command: {command} -> {'success' if success else 'failed'}")


def read_mobile_report(root: Path) -> dict[str, Any]:
    path = root / "logs" / "mobile_trigger_report.json"
    if not path.exists():
        return {}
    try:
        return read_json(path)
    except Exception:
        return {}


def write_report(
    path: Path,
    *,
    command: str,
    success: bool,
    error: str,
    command_file: str,
    output_file_paths: list[Any],
    started_at: str | None = None,
    stdout: str = "",
    stderr: str = "",
    git_sync: dict[str, Any] | None = None,
) -> None:
    report = {
        "executed_at": started_at or datetime.now().isoformat(timespec="seconds"),
        "command": command,
        "success": success,
        "error": error,
        "command_file": command_file,
        "output_file_paths": output_file_paths,
        "stdout_tail": stdout[-4000:] if stdout else "",
        "stderr_tail": stderr[-4000:] if stderr else "",
    }
    if git_sync is not None:
        report["git_sync"] = git_sync
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def run_git(root: Path, args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], cwd=root, text=True, capture_output=True)


def git_pull(root: Path) -> subprocess.CompletedProcess[str]:
    return run_git(root, ["pull"])


def git_add_commit_push(root: Path, command: str) -> dict[str, Any]:
    steps: list[dict[str, Any]] = []
    try:
        add_result = run_git(root, ["add", "remote_commands/command.json", "logs/remote_command_report.json", "dist"])
        steps.append(step_result("git add", add_result))
        if add_result.returncode != 0:
            return {"enabled": True, "success": False, "message": process_error(add_result), "steps": steps}

        commit_result = run_git(root, ["commit", "-m", f"remote command completed: {command}"])
        steps.append(step_result("git commit", commit_result))
        no_changes = is_no_git_changes(commit_result)
        if commit_result.returncode != 0 and not no_changes:
            return {"enabled": True, "success": False, "message": process_error(commit_result), "steps": steps}
        if no_changes:
            return {"enabled": True, "success": True, "message": "No git changes to commit.", "steps": steps}

        push_result = run_git(root, ["push"])
        steps.append(step_result("git push", push_result))
        if push_result.returncode != 0:
            return {"enabled": True, "success": False, "message": process_error(push_result), "steps": steps}
        return {"enabled": True, "success": True, "message": "Git sync completed.", "steps": steps}
    except FileNotFoundError as exc:
        return {"enabled": True, "success": False, "message": f"git not found: {exc}", "steps": steps}


def step_result(name: str, result: subprocess.CompletedProcess[str]) -> dict[str, Any]:
    return {
        "step": name,
        "returncode": result.returncode,
        "stdout_tail": (result.stdout or "")[-2000:],
        "stderr_tail": (result.stderr or "")[-2000:],
    }


def process_error(result: subprocess.CompletedProcess[str]) -> str:
    text = (result.stderr or result.stdout or "").strip()
    return text[-4000:] if text else f"Command failed with exit code {result.returncode}."


def is_no_git_changes(result: subprocess.CompletedProcess[str]) -> bool:
    text = ((result.stdout or "") + "\n" + (result.stderr or "")).lower()
    needles = (
        "nothing to commit",
        "no changes added to commit",
        "working tree clean",
        "nothing added to commit",
    )
    return any(item in text for item in needles)


if __name__ == "__main__":
    raise SystemExit(main())
