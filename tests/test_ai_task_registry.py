from __future__ import annotations

import unittest

from ai_tasks.long_term_logic_review import LONG_TERM_LOGIC_REVIEW_TASK
from ai_tasks.registry import AITaskRegistry


class AITaskRegistryTests(unittest.TestCase):
    def test_registers_long_term_logic_task(self) -> None:
        registry = AITaskRegistry()
        task = registry.register(LONG_TERM_LOGIC_REVIEW_TASK)

        self.assertEqual(task.taskName, "long_term_logic_review")
        self.assertTrue(task.enabled)

    def test_gets_registered_task(self) -> None:
        registry = AITaskRegistry()
        registry.register(LONG_TERM_LOGIC_REVIEW_TASK)

        self.assertEqual(registry.get("long_term_logic_review").version, "1.0.0")

    def test_rejects_duplicate_task(self) -> None:
        registry = AITaskRegistry()
        registry.register(LONG_TERM_LOGIC_REVIEW_TASK)

        with self.assertRaisesRegex(ValueError, "already registered"):
            registry.register(LONG_TERM_LOGIC_REVIEW_TASK)

    def test_rejects_missing_required_field(self) -> None:
        registry = AITaskRegistry()
        raw = dict(LONG_TERM_LOGIC_REVIEW_TASK)
        del raw["schemaPath"]

        with self.assertRaisesRegex(ValueError, "missing required fields"):
            registry.register(raw)


if __name__ == "__main__":
    unittest.main()

