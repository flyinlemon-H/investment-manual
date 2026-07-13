from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import apply_plan_update as cli
from src.plan_update.application import apply_plan_update, atomic_write_json, build_application_preview, plan_snapshot_hash, validate_application_request


class PlanApplicationTests(unittest.TestCase):
    def setUp(self):
        self.stock = {"id": "fixture", "name": "测试标的", "code": "601138.SS", "shares": 1234, "avgCost": 12.34, "currentPrice": 66, "strategy": {"minTradeUnit": 1}, "plans": [{"id": "keep", "action": "buy", "price": 60, "shares": 100, "note": "保留"}, {"id": "modify", "action": "buy", "price": 65, "shares": 100, "note": "旧支撑"}, {"id": "archive", "action": "sell", "price": 85, "shares": 100, "note": "旧减仓"}, {"id": "delete", "action": "sell", "price": 95, "shares": 100, "note": "删除建议"}], "tradeHistory": [{"id": "trade-1"}], "longTermLogic": {"logicStatus": "valid"}}
        self.state = {"stocks": [self.stock], "cash": 1000, "version": "test"}
        proposed = [self.plan("keep", "buy", 60, 100, "保留"), self.plan("modify", "add_review", 63, 100, "新支撑"), self.plan(None, "hold_review", 61.5, None, "观察"), self.plan(None, "reduce_review", 80, 100, "减仓复核")]
        self.draft = {"draft_id": "draft-1", "source_request_id": "request-1", "source_decision_id": "decision-1", "symbol": "601138.SS", "draft_status": "draft", "summary": "更新计划", "plan_strategy": "四档复核", "proposed_plans": proposed, "plans_to_archive": ["archive"], "plans_to_delete": ["delete"], "risk_flags": ["不自动交易"], "notes": [], "created_at": "2026-07-13T10:00:00+08:00"}
        self.request = {"application_id": "application-1", "draft_id": "draft-1", "source_request_id": "request-1", "source_decision_id": "decision-1", "symbol": "601138.SS", "current_plan_snapshot_hash": plan_snapshot_hash(self.stock["plans"]), "confirmed_changes": {"draft": self.draft, "validation": {"schema_valid": True, "business_valid": True, "warnings": [], "errors": []}, "diff": []}, "user_confirmed_at": "2026-07-13T11:00:00+08:00", "source_draft_status": "pending_confirmation", "status": "confirmed_pending_application", "created_at": "2026-07-13T11:00:00+08:00"}

    @staticmethod
    def plan(plan_id, action, price, quantity, reason):
        return {"plan_id": plan_id, "action_type": action, "trigger_price": price, "quantity": quantity, "status": "active", "priority": 1, "reason": reason, "conditions": [], "invalidation_conditions": [], "source": "ai_plan_update_draft", "valid_until": "2026-10-13"}

    def test_unconfirmed_or_non_pending_request_cannot_apply(self):
        for status in ("draft", "validated", "application_request_generated"):
            request = copy.deepcopy(self.request); request["status"] = status
            self.assertFalse(validate_application_request(request, self.stock)["valid"])
        request = copy.deepcopy(self.request); request["user_confirmed_at"] = ""
        self.assertFalse(validate_application_request(request, self.stock)["valid"])
        request = copy.deepcopy(self.request); request["source_draft_status"] = "validated"
        self.assertFalse(validate_application_request(request, self.stock)["valid"])

    def test_snapshot_change_and_symbol_mismatch_are_rejected(self):
        changed = copy.deepcopy(self.request); changed["current_plan_snapshot_hash"] = "old"
        self.assertFalse(validate_application_request(changed, self.stock)["valid"])
        mismatch = copy.deepcopy(self.request); mismatch["symbol"] = "1810.HK"
        self.assertFalse(validate_application_request(mismatch, self.stock)["valid"])

    def test_cn_default_unit_rejects_invalid_quantity(self):
        request = copy.deepcopy(self.request); request["confirmed_changes"]["draft"]["proposed_plans"][0]["quantity"] = 50
        self.assertFalse(build_application_preview(request, self.state)["valid"])

    def test_unknown_hk_unit_adds_warning(self):
        stock = copy.deepcopy(self.stock); stock["code"] = "1810.HK"; stock["strategy"] = {"minTradeUnit": 1}
        request = copy.deepcopy(self.request); request["symbol"] = "1810.HK"; request["confirmed_changes"]["draft"]["symbol"] = "1810.HK"; request["current_plan_snapshot_hash"] = plan_snapshot_hash(stock["plans"])
        result = validate_application_request(request, stock)
        self.assertTrue(any("unknown" in warning for warning in result["warnings"]))

    def test_apply_archives_modification_and_delete_without_physical_delete(self):
        updated = copy.deepcopy(self.state)
        result = apply_plan_update(self.request, updated, applied_at="2026-07-13T12:00:00+08:00")
        plans = updated["stocks"][0]["plans"]
        by_id = {plan["id"]: plan for plan in plans}
        self.assertEqual(by_id["modify"]["status"], "archived")
        self.assertEqual(by_id["archive"]["status"], "archived")
        self.assertEqual(by_id["delete"]["status"], "archived")
        self.assertEqual(by_id["delete"]["archive_reason"], "delete_suggestion_archived")
        self.assertIn("keep", result["retained_plan_ids"])
        self.assertEqual(len(result["created_plan_ids"]), 3)
        self.assertEqual(len(set(result["created_plan_ids"])), 3)
        self.assertEqual(len(plans), 7)

    def test_non_plan_fields_remain_identical(self):
        updated = copy.deepcopy(self.state); before = copy.deepcopy(updated)
        apply_plan_update(self.request, updated)
        before["stocks"][0].pop("plans"); updated["stocks"][0].pop("plans")
        self.assertEqual(updated, before)

    def test_dry_run_does_not_modify_formal_file(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); formal=root/"latest_export.json"; request=root/"request.json"
            formal.write_text(json.dumps(self.state, ensure_ascii=False), encoding="utf-8"); request.write_text(json.dumps(self.request, ensure_ascii=False), encoding="utf-8")
            before=formal.read_bytes(); code=cli.main(["--request",str(request),"--dry-run","--input",str(formal),"--audit-dir",str(root/"audits"),"--bridge",str(root/"bridge.js")])
            self.assertEqual(code,0); self.assertEqual(formal.read_bytes(),before); self.assertFalse((root/"backups").exists())

    def test_apply_creates_backup_audit_bridge_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); formal=root/"latest_export.json"; request=root/"request.json"; audits=root/"audits"; bridge=root/"bridge.js"
            formal.write_text(json.dumps(self.state,ensure_ascii=False),encoding="utf-8"); request.write_text(json.dumps(self.request,ensure_ascii=False),encoding="utf-8")
            self.assertEqual(cli.main(["--request",str(request),"--apply","--input",str(formal),"--audit-dir",str(audits),"--bridge",str(bridge)]),0)
            audit=json.loads((audits/"application-1.json").read_text(encoding="utf-8")); after_first=formal.read_bytes()
            self.assertTrue(Path(audit["backup_path"]).exists()); self.assertEqual(audit["result"],"applied"); self.assertTrue(audit["archived_plan_ids"]); self.assertTrue(audit["created_plan_ids"]); self.assertTrue(bridge.exists())
            self.assertEqual(cli.main(["--request",str(request),"--apply","--input",str(formal),"--audit-dir",str(audits),"--bridge",str(bridge)]),0)
            self.assertEqual(formal.read_bytes(),after_first)

    def test_atomic_write_failure_keeps_original(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"state.json"; path.write_text(json.dumps(self.state),encoding="utf-8"); before=path.read_bytes()
            with patch("src.plan_update.application.os.replace",side_effect=OSError("fail")):
                with self.assertRaises(OSError): atomic_write_json(path,{"stocks":[]})
            self.assertEqual(path.read_bytes(),before); self.assertFalse(path.with_suffix(".json.tmp").exists())

    def test_browser_only_generates_request_without_formal_write(self):
        source=Path("src/plan-update-draft.js").read_text(encoding="utf-8")+Path("src/ui-render.js").read_text(encoding="utf-8")
        self.assertIn("confirmed_pending_application",source)
        self.assertIn("已生成计划应用请求，尚未写入正式计划",source)
        self.assertNotIn("stock.plans=",Path("src/plan-update-draft.js").read_text(encoding="utf-8"))


if __name__ == "__main__": unittest.main()
