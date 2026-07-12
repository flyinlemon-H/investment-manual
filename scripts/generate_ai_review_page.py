from __future__ import annotations

import argparse
import html
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.ai.discussion_prompt import build_discussion_record, find_stock, load_stocks, write_discussion_record


DEFAULT_OUTPUT = ROOT / "data" / "ai_review.html"
DRAFT_DIR = ROOT / "data" / "ai_drafts"
DISCUSSION_DIR = ROOT / "data" / "ai_discussions"
DECISION_OUTCOME_DIR = ROOT / "data" / "decision_outcomes"
STOCK_DATA_PATH = ROOT / "data" / "latest_export.json"
REVIEW_DIRS = [
    ROOT / "review_queue" / "pending",
    ROOT / "data" / "review_queue" / "pending",
]


@dataclass
class ReviewRecord:
    draft_path: Path
    draft: dict[str, Any]
    review_path: Path | None
    review_task: dict[str, Any] | None
    discussion_json_path: Path | None = None
    discussion_prompt_path: Path | None = None
    decision_outcome: dict[str, Any] | None = None
    decision_outcome_path: Path | None = None


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a read-only AI review validation page.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Output HTML path.")
    parser.add_argument("--stock-data", default=str(STOCK_DATA_PATH), help="Current stock export JSON path.")
    parser.add_argument("--discussion-dir", default=str(DISCUSSION_DIR), help="Discussion record output directory.")
    args = parser.parse_args()

    records = load_review_records(stock_data_path=Path(args.stock_data), discussion_dir=Path(args.discussion_dir))
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_page(records), encoding="utf-8")
    print(f"generated: {output_path}")
    print(f"records: {len(records)}")
    if records:
        print(f"latest_draft: {records[0].draft_path}")
        if records[0].review_path:
            print(f"latest_review_task: {records[0].review_path}")
        if records[0].discussion_prompt_path:
            print(f"latest_discussion_prompt: {records[0].discussion_prompt_path}")
    return 0


def load_review_records(*, stock_data_path: Path = STOCK_DATA_PATH, discussion_dir: Path = DISCUSSION_DIR) -> list[ReviewRecord]:
    drafts = sorted(DRAFT_DIR.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    review_tasks = load_review_tasks()
    decision_outcomes = load_decision_outcomes()
    stocks_data = load_stocks(stock_data_path)
    records: list[ReviewRecord] = []
    for draft_path in drafts:
        draft = read_json(draft_path)
        draft_id = str(draft.get("draft_id") or "")
        review_path, review_task = review_tasks.get(draft_id, (None, None))
        review_id = str((review_task or {}).get("review_id") or "")
        decision_outcome_path, decision_outcome = decision_outcomes.get(review_id, (None, None))
        symbol = str(draft.get("symbol") or "")
        stock = find_stock(stocks_data, symbol) or {}
        discussion_json_path = None
        discussion_prompt_path = None
        if draft_id:
            discussion = build_discussion_record(ai_draft=draft, review_task=review_task, stock_context=stock)
            discussion_json_path, discussion_prompt_path = write_discussion_record(discussion, discussion_dir)
        records.append(
            ReviewRecord(
                draft_path=draft_path,
                draft=draft,
                review_path=review_path,
                review_task=review_task,
                discussion_json_path=discussion_json_path,
                discussion_prompt_path=discussion_prompt_path,
                decision_outcome=decision_outcome,
                decision_outcome_path=decision_outcome_path,
            )
        )
    return records


def load_review_tasks() -> dict[str, tuple[Path, dict[str, Any]]]:
    tasks: dict[str, tuple[Path, dict[str, Any]]] = {}
    for directory in REVIEW_DIRS:
        if not directory.exists():
            continue
        for path in directory.glob("*.json"):
            task = read_json(path)
            source_id = str(task.get("source_input_id") or "")
            if source_id:
                tasks[source_id] = (path, task)
    return tasks


def load_decision_outcomes() -> dict[str, tuple[Path, dict[str, Any]]]:
    outcomes: dict[str, tuple[Path, dict[str, Any]]] = {}
    if not DECISION_OUTCOME_DIR.exists():
        return outcomes
    for path in DECISION_OUTCOME_DIR.glob("*.json"):
        outcome = read_json(path)
        source_review_id = str(outcome.get("source_review_id") or "")
        if source_review_id:
            outcomes[source_review_id] = (path, outcome)
    return outcomes


def read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"_read_error": str(exc), "_path": str(path)}
    return data if isinstance(data, dict) else {"_read_error": "JSON root is not an object", "_path": str(path)}


def render_page(records: list[ReviewRecord]) -> str:
    latest = records[0] if records else None
    cards = "\n".join(render_record(record, is_latest=index == 0) for index, record in enumerate(records[:20]))
    empty = '<section class="card"><h2>暂无 AI Draft</h2><p class="subtle">请先运行 AI task。</p></section>'
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Review 验收页</title>
  <style>{page_css()}</style>
</head>
<body>
  <header>
    <h1>AI Review 验收页</h1>
    <div class="subtle">只读页面。读取 AI Draft、Review Task 与 Decision Outcome；“与AI讨论”只生成讨论 Prompt，不调用 AI，不审批，不写正式投资数据。</div>
  </header>
  <main>
    {render_summary(latest, len(records))}
    {cards or empty}
  </main>
</body>
</html>
"""


def page_css() -> str:
    return """
:root{color-scheme:light;--bg:#f6f7f9;--panel:#fff;--text:#172033;--muted:#667085;--line:#d9dee8;--accent:#155eef;--good:#067647;--warn:#b54708}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5}
header{position:sticky;top:0;z-index:2;background:rgba(246,247,249,.96);border-bottom:1px solid var(--line);padding:16px;backdrop-filter:blur(12px)}
main{max-width:1040px;margin:0 auto;padding:16px}
h1{margin:0;font-size:24px} h2{margin:0 0 12px;font-size:20px} h3{margin:18px 0 8px;font-size:16px}
.subtle{color:var(--muted);font-size:13px}.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;margin:14px 0;padding:16px}
.latest{border-color:rgba(21,94,239,.45);box-shadow:0 6px 20px rgba(20,40,80,.08)}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.metric{border:1px solid var(--line);border-radius:8px;padding:10px;background:#fbfcfe;min-height:70px}
.label{color:var(--muted);font-size:12px;margin-bottom:4px}.value{font-weight:650;overflow-wrap:anywhere}
.badge{display:inline-flex;border-radius:999px;padding:3px 8px;font-size:12px;font-weight:650;background:#eef4ff;color:var(--accent);margin-right:6px}
.badge.good{background:#ecfdf3;color:var(--good)}.badge.warn{background:#fffaeb;color:var(--warn)}
.actions{margin:12px 0;display:flex;gap:8px;flex-wrap:wrap}.button{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--accent);border-radius:8px;background:var(--accent);color:#fff;min-height:40px;padding:0 14px;text-decoration:none;font-weight:650}
.button.secondary{background:#fff;color:var(--accent)}ul{padding-left:20px;margin:8px 0}li{margin:5px 0}
details{border-top:1px solid var(--line);margin-top:12px;padding-top:12px}summary{cursor:pointer;font-weight:650}
pre{overflow:auto;background:#101828;color:#f2f4f7;padding:12px;border-radius:8px;font-size:12px}
@media(max-width:760px){header{padding:12px}main{padding:10px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.card{padding:12px}.button{width:100%}}
"""


def render_summary(latest: ReviewRecord | None, count: int) -> str:
    if latest is None:
        return '<section class="card"><h2>最新 AI 任务</h2><p>未找到 AI Draft。</p></section>'
    draft = latest.draft
    result = result_payload(draft)
    schema_valid = (draft.get("validation") or {}).get("schemaValid")
    return f"""<section class="card latest">
  <h2>最新 AI 任务</h2>
  <div>
    {badge('最新', 'good')}
    {badge(escape(str(draft.get('validation_status') or 'unknown')))}
    {badge(escape(str(schema_valid)), 'good' if schema_valid else 'warn')}
  </div>
  <div class="grid">
    {metric('股票', draft.get('symbol'))}
    {metric('任务类型', draft.get('task_type') or draft.get('taskName'))}
    {metric('AI结论', result.get('summary'))}
    {metric('业务状态', result.get('logic_status'))}
  </div>
  <p class="subtle">共读取 {count} 个 AI Draft。页面生成时间仅代表本地 HTML 生成时间，不写入任何投资数据。</p>
</section>"""


def render_record(record: ReviewRecord, *, is_latest: bool) -> str:
    draft = record.draft
    result = result_payload(draft)
    review_task = record.review_task or {}
    validation = draft.get("validation") or {}
    discussion_button = ""
    if record.discussion_prompt_path:
        discussion_button = f"""
  <div class="actions">
    <a class="button" href="{escape(relative_path(record.discussion_prompt_path))}" target="_blank" rel="noopener">与AI讨论</a>
    <a class="button secondary" href="{escape(relative_path(record.discussion_json_path))}" target="_blank" rel="noopener">查看讨论记录</a>
  </div>"""
    return f"""<section class="card {'latest' if is_latest else ''}">
  <h2>{escape(str(draft.get('symbol') or '-'))} · {escape(str(draft.get('task_type') or draft.get('taskName') or '-'))}</h2>
  <div>
    {badge('AI Draft')}
    {badge(escape(str(draft.get('provider') or '-')))}
    {badge(escape(str(draft.get('model') or '-')))}
    {badge('Schema 通过', 'good') if validation.get('schemaValid') else badge('Schema 未通过', 'warn')}
  </div>
  {discussion_button}
  {render_decision_outcome_viewer(record.decision_outcome, record.decision_outcome_path)}
  <div class="grid">
    {metric('AI结论', result.get('summary'))}
    {metric('业务状态 logic_status', result.get('logic_status'))}
    {metric('draft_status', draft.get('draft_status'))}
    {metric('review_status', draft.get('review_status'))}
    {metric('Review Task状态', review_task.get('status') or '未匹配')}
    {metric('Provider / Model', f"{draft.get('provider') or '-'} / {draft.get('model') or '-'}")}
    {metric('Token', token_text(draft))}
    {metric('耗时 / 费用', f"{draft.get('duration_ms') or draft.get('latencyMs') or '-'} ms / {draft.get('estimated_cost')}")}
  </div>
  <h3>风险</h3>{render_list(result.get('longTermRisks'))}
  <h3>机会 / 驱动</h3>{render_list(result.get('coreDrivers'))}
  <h3>Notes</h3>{render_list(result.get('notes'))}
  <details open><summary>数据时间</summary><div class="grid">
    {metric('AI updatedAt', result.get('updatedAt'))}
    {metric('validUntil', result.get('validUntil'))}
    {metric('nextReviewDate', result.get('nextReviewDate'))}
    {metric('Draft created_at', draft.get('created_at') or draft.get('generatedAt'))}
    {metric('技术/新闻/基本面/估值/配置', based_on_text(draft.get('basedOn') or {}))}
  </div></details>
  <details><summary>完整 AI 结果</summary><pre>{escape(json.dumps(result, ensure_ascii=False, indent=2))}</pre></details>
  <details><summary>文件路径</summary>
    <p class="subtle">AI Draft: {escape(str(record.draft_path))}</p>
    <p class="subtle">Review Task: {escape(str(record.review_path or '未匹配'))}</p>
    <p class="subtle">Discussion Prompt: {escape(str(record.discussion_prompt_path or '未生成'))}</p>
  </details>
</section>"""


def render_decision_outcome_viewer(outcome: dict[str, Any] | None, outcome_path: Path | None = None) -> str:
    if not outcome:
        return '<section class="card"><h3>决策结果</h3><p class="subtle">尚未形成 Decision Outcome。</p></section>'
    outcome_type = str(outcome.get("outcome_type") or "")
    title, message, action = decision_outcome_display(outcome_type)
    action_html = f'<div class="actions"><a class="button secondary" href="#">{escape(action)}</a></div>' if action else ""
    path_html = f'<p class="subtle">Decision Outcome: {escape(str(outcome_path))}</p>' if outcome_path else ""
    return f"""<section class="card">
  <h3>{escape(title)}</h3>
  <div>{badge(escape(outcome_type or 'unknown'))}</div>
  <div class="grid">
    {metric('来源复核', outcome.get('source_review_id'))}
    {metric('结论', outcome.get('conclusion'))}
  </div>
  <p>{escape(message)}</p>
  {action_html}
  {path_html}
</section>"""


def decision_outcome_display(outcome_type: str) -> tuple[str, str, str | None]:
    if outcome_type == "no_change":
        return ("当前策略无需调整", "本次讨论结果不需要进入计划或操作流程。", None)
    if outcome_type == "plan_update":
        return ("需要更新计划", "本次讨论结果建议进入计划更新请求，但本页不生成或修改计划。", "查看计划更新请求")
    if outcome_type == "operation_request":
        return ("进入操作流程", "本次讨论结果建议进入操作录入，但本页不创建 Trade，不更新持仓或现金。", "进入操作录入")
    return ("未知决策结果", "无法识别 outcome_type。", None)


def result_payload(draft: dict[str, Any]) -> dict[str, Any]:
    result = draft.get("result") or draft.get("draft") or {}
    return result if isinstance(result, dict) else {}


def token_text(draft: dict[str, Any]) -> str:
    return (
        f"in {draft.get('input_tokens') or '-'} / "
        f"cached {draft.get('cached_tokens') or '-'} / "
        f"out {draft.get('output_tokens') or '-'}"
    )


def based_on_text(based_on: dict[str, Any]) -> str:
    if not based_on:
        return "-"
    labels = [
        ("技术", "technicalUpdatedAt"),
        ("新闻", "newsUpdatedAt"),
        ("基本面", "fundamentalUpdatedAt"),
        ("估值", "valuationUpdatedAt"),
        ("配置", "allocationUpdatedAt"),
        ("旧长期逻辑", "previousLongTermLogicUpdatedAt"),
    ]
    return "；".join(f"{label}: {based_on.get(key) or '未更新'}" for label, key in labels)


def metric(label: str, value: Any) -> str:
    return f"""<div class="metric">
  <div class="label">{escape(label)}</div>
  <div class="value">{escape('-' if value is None or value == '' else str(value))}</div>
</div>"""


def render_list(value: Any) -> str:
    if value is None:
        return '<p class="subtle">无</p>'
    values = value if isinstance(value, list) else [value]
    if not values:
        return '<p class="subtle">无</p>'
    return "<ul>" + "".join(f"<li>{escape(str(item))}</li>" for item in values) + "</ul>"


def badge(text: str, variant: str = "") -> str:
    class_name = f"badge {variant}".strip()
    return f'<span class="{class_name}">{text}</span>'


def relative_path(path: Path | None) -> str:
    if path is None:
        return "#"
    try:
        return path.resolve().relative_to(DEFAULT_OUTPUT.parent.resolve()).as_posix()
    except ValueError:
        return str(path)


def escape(value: str) -> str:
    return html.escape(value, quote=True)


if __name__ == "__main__":
    raise SystemExit(main())
