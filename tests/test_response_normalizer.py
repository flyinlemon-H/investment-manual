from __future__ import annotations

import unittest

from src.ai.response_normalizer import normalize_ai_response


class ResponseNormalizerTests(unittest.TestCase):
    def test_string_array_field_becomes_single_item_array(self) -> None:
        note = "\u6d4b\u8bd5\u5907\u6ce8"
        normalized = normalize_ai_response(
            {"notes": note, "logic_status": "valid"},
            task_name="long_term_logic_review",
        )

        self.assertEqual(normalized["notes"], [note])

    def test_existing_array_is_preserved(self) -> None:
        normalized = normalize_ai_response(
            {"notes": ["a", "b"]},
            task_name="long_term_logic_review",
        )

        self.assertEqual(normalized["notes"], ["a", "b"])

    def test_null_array_field_becomes_empty_array(self) -> None:
        normalized = normalize_ai_response(
            {"notes": None, "coreDrivers": None},
            task_name="long_term_logic_review",
        )

        self.assertEqual(normalized["notes"], [])
        self.assertEqual(normalized["coreDrivers"], [])

    def test_enum_values_are_lowercase_trimmed(self) -> None:
        normalized = normalize_ai_response(
            {"logic_status": " Valid ", "confidence": "MEDIUM"},
            task_name="long_term_logic_review",
        )

        self.assertEqual(normalized["logic_status"], "valid")
        self.assertEqual(normalized["confidence"], "medium")


if __name__ == "__main__":
    unittest.main()
