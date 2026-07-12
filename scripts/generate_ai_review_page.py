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
    empty = '<section class="card"><h2>\u6682\u65e0 AI Draft</h2><p class="subtle">\u8bf7\u5148\u8fd0\u884c AI task\u3002</p></section>'
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Review \u9a8c\u6536\u9875</title>
  <style>{page_css()}</style>
</head>
<body>
  <header>
    <h1>AI Review \u9a8c\u6536\u9875</h1>
    <div class="subtle">\u53ea\u8bfb\u9875\u9762\u3002\u8bfb\u53d6 AI Draft\u3001Review Task \u4e0e Decision Outcome\uff1b\u201c\u4e0eAI\u8ba8\u8bba\u201d\u53ea\u751f\u6210\u8ba8\u8bba Prompt\uff1b\u5bfc\u5165\u8ba8\u8bba\u7ed3\u679c\u53ea\u5728\u672c\u9875\u5c55\u793a Decision Outcome\uff0c\u4e0d\u5199\u6b63\u5f0f\u6295\u8d44\u6570\u636e\u3002</div>
  </header>
  <main>
    {render_summary(latest, len(records))}
    {cards or empty}
  </main>
  <script>{discussion_import_js()}</script>
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
.button.secondary{background:#fff;color:var(--accent)}input[type=file]{margin-top:8px;max-width:100%}
ul{padding-left:20px;margin:8px 0}li{margin:5px 0}
details{border-top:1px solid var(--line);margin-top:12px;padding-top:12px}summary{cursor:pointer;font-weight:650}
pre{overflow:auto;background:#101828;color:#f2f4f7;padding:12px;border-radius:8px;font-size:12px}
@media(max-width:760px){header{padding:12px}main{padding:10px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.card{padding:12px}.button{width:100%}}
"""


def render_summary(latest: ReviewRecord | None, count: int) -> str:
    if latest is None:
        return '<section class="card"><h2>\u6700\u65b0 AI \u4efb\u52a1</h2><p>\u672a\u627e\u5230 AI Draft\u3002</p></section>'
    draft = latest.draft
    result = result_payload(draft)
    schema_valid = (draft.get("validation") or {}).get("schemaValid")
    return f"""<section class="card latest">
  <h2>\u6700\u65b0 AI \u4efb\u52a1</h2>
  <div>
    {badge('\u6700\u65b0', 'good')}
    {badge(escape(str(draft.get('validation_status') or 'unknown')))}
    {badge(escape(str(schema_valid)), 'good' if schema_valid else 'warn')}
  </div>
  <div class="grid">
    {metric('\u80a1\u7968', draft.get('symbol'))}
    {metric('\u4efb\u52a1\u7c7b\u578b', draft.get('task_type') or draft.get('taskName'))}
    {metric('AI\u7ed3\u8bba', result.get('summary'))}
    {metric('\u4e1a\u52a1\u72b6\u6001', result.get('logic_status'))}
  </div>
  <p class="subtle">\u5171\u8bfb\u53d6 {count} \u4e2a AI Draft\u3002\u9875\u9762\u751f\u6210\u65f6\u95f4\u4ec5\u4ee3\u8868\u672c\u5730 HTML \u751f\u6210\u65f6\u95f4\uff0c\u4e0d\u5199\u5165\u4efb\u4f55\u6295\u8d44\u6570\u636e\u3002</p>
</section>"""


def render_record(record: ReviewRecord, *, is_latest: bool) -> str:
    draft = record.draft
    result = result_payload(draft)
    review_task = record.review_task or {}
    validation = draft.get("validation") or {}
    review_id = str(review_task.get("review_id") or "")
    task_type = str(draft.get("task_type") or draft.get("taskName") or "")
    symbol = str(draft.get("symbol") or "")
    discussion_button = ""
    if record.discussion_prompt_path:
        discussion_button = f"""
  <div class="actions">
    <a class="button" href="{escape(relative_path(record.discussion_prompt_path))}" target="_blank" rel="noopener">\u4e0eAI\u8ba8\u8bba</a>
    <a class="button secondary" href="{escape(relative_path(record.discussion_json_path))}" target="_blank" rel="noopener">\u67e5\u770b\u8ba8\u8bba\u8bb0\u5f55</a>
  </div>"""
    return f"""<section class="card {'latest' if is_latest else ''}">
  <h2>{escape(symbol or '-')} \u00b7 {escape(task_type or '-')}</h2>
  <div>
    {badge('AI Draft')}
    {badge(escape(str(draft.get('provider') or '-')))}
    {badge(escape(str(draft.get('model') or '-')))}
    {badge('Schema \u901a\u8fc7', 'good') if validation.get('schemaValid') else badge('Schema \u672a\u901a\u8fc7', 'warn')}
  </div>
  {discussion_button}
  {render_discussion_result_import(review_id=review_id, task_type=task_type, symbol=symbol)}
  {render_decision_outcome_viewer(record.decision_outcome, record.decision_outcome_path)}
  <div class="grid">
    {metric('AI\u7ed3\u8bba', result.get('summary'))}
    {metric('\u4e1a\u52a1\u72b6\u6001 logic_status', result.get('logic_status'))}
    {metric('draft_status', draft.get('draft_status'))}
    {metric('review_status', draft.get('review_status'))}
    {metric('Review Task\u72b6\u6001', review_task.get('status') or '\u672a\u5339\u914d')}
    {metric('Provider / Model', f"{draft.get('provider') or '-'} / {draft.get('model') or '-'}")}
    {metric('Token', token_text(draft))}
    {metric('\u8017\u65f6 / \u8d39\u7528', f"{draft.get('duration_ms') or draft.get('latencyMs') or '-'} ms / {draft.get('estimated_cost')}")}
  </div>
  <h3>\u98ce\u9669</h3>{render_list(result.get('longTermRisks'))}
  <h3>\u673a\u4f1a / \u9a71\u52a8</h3>{render_list(result.get('coreDrivers'))}
  <h3>Notes</h3>{render_list(result.get('notes'))}
  <details open><summary>\u6570\u636e\u65f6\u95f4</summary><div class="grid">
    {metric('AI updatedAt', result.get('updatedAt'))}
    {metric('validUntil', result.get('validUntil'))}
    {metric('nextReviewDate', result.get('nextReviewDate'))}
    {metric('Draft created_at', draft.get('created_at') or draft.get('generatedAt'))}
    {metric('\u6280\u672f/\u65b0\u95fb/\u57fa\u672c\u9762/\u4f30\u503c/\u914d\u7f6e', based_on_text(draft.get('basedOn') or {}))}
  </div></details>
  <details><summary>\u5b8c\u6574 AI \u7ed3\u679c</summary><pre>{escape(json.dumps(result, ensure_ascii=False, indent=2))}</pre></details>
  <details><summary>\u6587\u4ef6\u8def\u5f84</summary>
    <p class="subtle">AI Draft: {escape(str(record.draft_path))}</p>
    <p class="subtle">Review Task: {escape(str(record.review_path or '\u672a\u5339\u914d'))}</p>
    <p class="subtle">Discussion Prompt: {escape(str(record.discussion_prompt_path or '\u672a\u751f\u6210'))}</p>
  </details>
</section>"""


def render_discussion_result_import(*, review_id: str, task_type: str, symbol: str) -> str:
    target_id = f"discussion-import-{safe_dom_id(review_id or symbol or task_type)}"
    return f"""<section class="card">
  <h3>\u5bfc\u5165\u8ba8\u8bba\u7ed3\u679c</h3>
  <p class="subtle">\u53ea\u5728\u672c\u9875\u89e3\u6790 Discussion Result JSON \u5e76\u663e\u793a Decision Outcome\uff1b\u4e0d\u5199\u6b63\u5f0f\u6570\u636e\u3002</p>
  <input type="file" accept="application/json,.json" data-discussion-import="1" data-target-id="{escape(target_id)}" data-source-review-id="{escape(review_id)}" data-task-type="{escape(task_type)}" data-symbol="{escape(symbol)}">
  <div id="{escape(target_id)}" class="subtle"></div>
</section>"""


def render_decision_outcome_viewer(outcome: dict[str, Any] | None, outcome_path: Path | None = None) -> str:
    if not outcome:
        return '<section class="card"><h3>\u51b3\u7b56\u7ed3\u679c</h3><p class="subtle">\u5c1a\u672a\u5f62\u6210 Decision Outcome\u3002</p></section>'
    outcome_type = str(outcome.get("outcome_type") or "")
    title, message, action = decision_outcome_display(outcome_type)
    action_html = f'<div class="actions"><a class="button secondary" href="#">{escape(action)}</a></div>' if action else ""
    path_html = f'<p class="subtle">Decision Outcome: {escape(str(outcome_path))}</p>' if outcome_path else ""
    return f"""<section class="card">
  <h3>{escape(title)}</h3>
  <div>{badge(escape(outcome_type or 'unknown'))}</div>
  <div class="grid">
    {metric('\u6765\u6e90\u590d\u6838', outcome.get('source_review_id'))}
    {metric('\u7ed3\u8bba', outcome.get('conclusion'))}
  </div>
  <p>{escape(message)}</p>
  {action_html}
  {path_html}
</section>"""


def decision_outcome_display(outcome_type: str) -> tuple[str, str, str | None]:
    if outcome_type == "no_change":
        return ("\u5f53\u524d\u7b56\u7565\u65e0\u9700\u8c03\u6574", "\u672c\u6b21\u8ba8\u8bba\u7ed3\u679c\u4e0d\u9700\u8981\u8fdb\u5165\u8ba1\u5212\u6216\u64cd\u4f5c\u6d41\u7a0b\u3002", None)
    if outcome_type == "plan_update":
        return ("\u9700\u8981\u66f4\u65b0\u8ba1\u5212", "\u672c\u6b21\u8ba8\u8bba\u7ed3\u679c\u5efa\u8bae\u8fdb\u5165\u8ba1\u5212\u66f4\u65b0\u8bf7\u6c42\uff0c\u4f46\u672c\u9875\u4e0d\u751f\u6210\u6216\u4fee\u6539\u8ba1\u5212\u3002", "\u67e5\u770b\u8ba1\u5212\u66f4\u65b0\u8bf7\u6c42")
    if outcome_type == "operation_request":
        return ("\u8fdb\u5165\u64cd\u4f5c\u6d41\u7a0b", "\u672c\u6b21\u8ba8\u8bba\u7ed3\u679c\u5efa\u8bae\u8fdb\u5165\u64cd\u4f5c\u5f55\u5165\uff0c\u4f46\u672c\u9875\u4e0d\u521b\u5efa Trade\uff0c\u4e0d\u66f4\u65b0\u6301\u4ed3\u6216\u73b0\u91d1\u3002", "\u8fdb\u5165\u64cd\u4f5c\u5f55\u5165")
    return ("\u672a\u77e5\u51b3\u7b56\u7ed3\u679c", "\u65e0\u6cd5\u8bc6\u522b outcome_type\u3002", None)


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
        ("\u6280\u672f", "technicalUpdatedAt"),
        ("\u65b0\u95fb", "newsUpdatedAt"),
        ("\u57fa\u672c\u9762", "fundamentalUpdatedAt"),
        ("\u4f30\u503c", "valuationUpdatedAt"),
        ("\u914d\u7f6e", "allocationUpdatedAt"),
        ("\u65e7\u957f\u671f\u903b\u8f91", "previousLongTermLogicUpdatedAt"),
    ]
    return "\uff1b".join(f"{label}: {based_on.get(key) or '\u672a\u66f4\u65b0'}" for label, key in labels)


def metric(label: str, value: Any) -> str:
    return f"""<div class="metric">
  <div class="label">{escape(label)}</div>
  <div class="value">{escape('-' if value is None or value == '' else str(value))}</div>
</div>"""


def render_list(value: Any) -> str:
    if value is None:
        return '<p class="subtle">\u65e0</p>'
    values = value if isinstance(value, list) else [value]
    if not values:
        return '<p class="subtle">\u65e0</p>'
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


def discussion_import_js() -> str:
    return r"""
const DS10_REQUIRED_FIELDS = ["discussion_id","source_review_id","symbol","final_conclusion","user_constraints","change_required","operation_required","created_at"];
function ds10Escape(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}
function ds10ValidateDiscussionResult(value, expectedReviewId, expectedSymbol){
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("\u6839\u5bf9\u8c61\u5fc5\u987b\u662f object");
  for (const field of DS10_REQUIRED_FIELDS) if (!(field in value)) throw new Error("\u7f3a\u5c11\u5b57\u6bb5: " + field);
  for (const field of ["discussion_id","source_review_id","symbol","final_conclusion","created_at"]) {
    if (typeof value[field] !== "string" || !value[field].trim()) throw new Error(field + " \u5fc5\u987b\u662f\u975e\u7a7a\u5b57\u7b26\u4e32");
  }
  if (!Array.isArray(value.user_constraints)) throw new Error("user_constraints \u5fc5\u987b\u662f\u6570\u7ec4");
  if (typeof value.change_required !== "boolean") throw new Error("change_required \u5fc5\u987b\u662f boolean");
  if (typeof value.operation_required !== "boolean") throw new Error("operation_required \u5fc5\u987b\u662f boolean");
  if (expectedReviewId && value.source_review_id !== expectedReviewId) throw new Error("source_review_id \u4e0e\u5f53\u524d Review Task \u4e0d\u5339\u914d");
  if (expectedSymbol && value.symbol !== expectedSymbol) throw new Error("symbol \u4e0e\u5f53\u524d\u6807\u7684\u4e0d\u5339\u914d");
}
function ds10OutcomeType(result){
  if (result.operation_required === true) return "operation_request";
  if (result.change_required === true) return "plan_update";
  return "no_change";
}
function ds10OutcomeTitle(outcomeType){
  if (outcomeType === "no_change") return "\u5f53\u524d\u7b56\u7565\u65e0\u9700\u8c03\u6574";
  if (outcomeType === "plan_update") return "\u9700\u8981\u66f4\u65b0\u8ba1\u5212";
  if (outcomeType === "operation_request") return "\u8fdb\u5165\u64cd\u4f5c\u6d41\u7a0b";
  return "\u672a\u77e5\u51b3\u7b56\u7ed3\u679c";
}
function ds10RenderImportedOutcome(target, result, taskType){
  const outcomeType = ds10OutcomeType(result);
  const decisionId = "decision_" + result.discussion_id;
  target.className = "";
  target.innerHTML = `
    <div class="card">
      <h3>${ds10Escape(ds10OutcomeTitle(outcomeType))}</h3>
      <div><span class="badge">${ds10Escape(outcomeType)}</span></div>
      <div class="grid">
        <div class="metric"><div class="label">source_review_id</div><div class="value">${ds10Escape(result.source_review_id)}</div></div>
        <div class="metric"><div class="label">decision_id</div><div class="value">${ds10Escape(decisionId)}</div></div>
        <div class="metric"><div class="label">task_type</div><div class="value">${ds10Escape(taskType || "")}</div></div>
        <div class="metric"><div class="label">conclusion</div><div class="value">${ds10Escape(result.final_conclusion)}</div></div>
      </div>
    </div>`;
}
document.querySelectorAll("[data-discussion-import]").forEach(input => {
  input.addEventListener("change", async event => {
    const file = event.target.files && event.target.files[0];
    const target = document.getElementById(event.target.dataset.targetId);
    if (!file || !target) return;
    try {
      const result = JSON.parse(await file.text());
      ds10ValidateDiscussionResult(result, event.target.dataset.sourceReviewId, event.target.dataset.symbol);
      ds10RenderImportedOutcome(target, result, event.target.dataset.taskType);
    } catch (error) {
      target.className = "subtle";
      target.textContent = "\u5bfc\u5165\u5931\u8d25\uff1a" + (error && error.message ? error.message : String(error));
    }
  });
});
"""


def escape(value: str) -> str:
    return html.escape(value, quote=True)


def safe_dom_id(value: str) -> str:
    return "".join(ch if ch.isalnum() else "-" for ch in value) or "discussion-import"


if __name__ == "__main__":
    raise SystemExit(main())
