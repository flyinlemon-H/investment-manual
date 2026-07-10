from __future__ import annotations

from dataclasses import dataclass
from typing import Any


REQUIRED_TASK_FIELDS = {
    "taskName",
    "version",
    "enabled",
    "promptPath",
    "promptVersion",
    "schemaPath",
    "schemaVersion",
    "defaultProvider",
    "defaultModel",
    "dependencies",
    "requiresHumanApproval",
    "outputTarget",
    "maxFrequencyMinutes",
}


class AITaskRegistryError(ValueError):
    """Raised when an AI task definition is invalid or duplicated."""


class AITaskLookupError(LookupError):
    """Raised when an AI task cannot be found."""


@dataclass(frozen=True)
class AITaskDefinition:
    taskName: str
    version: str
    enabled: bool
    promptPath: str
    promptVersion: str
    schemaPath: str
    schemaVersion: str
    defaultProvider: str
    defaultModel: str
    dependencies: list[str]
    requiresHumanApproval: bool
    outputTarget: str
    maxFrequencyMinutes: int

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "AITaskDefinition":
        missing = sorted(REQUIRED_TASK_FIELDS - set(raw.keys()))
        if missing:
            raise AITaskRegistryError(f"AI task definition missing required fields: {', '.join(missing)}.")
        if not raw["taskName"]:
            raise AITaskRegistryError("AI task definition taskName must not be empty.")
        if not isinstance(raw["dependencies"], list):
            raise AITaskRegistryError("AI task definition dependencies must be a list.")
        return cls(
            taskName=str(raw["taskName"]),
            version=str(raw["version"]),
            enabled=bool(raw["enabled"]),
            promptPath=str(raw["promptPath"]),
            promptVersion=str(raw["promptVersion"]),
            schemaPath=str(raw["schemaPath"]),
            schemaVersion=str(raw["schemaVersion"]),
            defaultProvider=str(raw["defaultProvider"]),
            defaultModel=str(raw["defaultModel"]),
            dependencies=[str(item) for item in raw["dependencies"]],
            requiresHumanApproval=bool(raw["requiresHumanApproval"]),
            outputTarget=str(raw["outputTarget"]),
            maxFrequencyMinutes=int(raw["maxFrequencyMinutes"]),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "taskName": self.taskName,
            "version": self.version,
            "enabled": self.enabled,
            "promptPath": self.promptPath,
            "promptVersion": self.promptVersion,
            "schemaPath": self.schemaPath,
            "schemaVersion": self.schemaVersion,
            "defaultProvider": self.defaultProvider,
            "defaultModel": self.defaultModel,
            "dependencies": list(self.dependencies),
            "requiresHumanApproval": self.requiresHumanApproval,
            "outputTarget": self.outputTarget,
            "maxFrequencyMinutes": self.maxFrequencyMinutes,
        }


class AITaskRegistry:
    def __init__(self) -> None:
        self._tasks: dict[str, AITaskDefinition] = {}

    def register(self, task: AITaskDefinition | dict[str, Any]) -> AITaskDefinition:
        definition = task if isinstance(task, AITaskDefinition) else AITaskDefinition.from_dict(task)
        name = definition.taskName
        if name in self._tasks:
            raise AITaskRegistryError(f"AI task '{name}' is already registered.")
        self._tasks[name] = definition
        return definition

    def get(self, task_name: str) -> AITaskDefinition:
        try:
            return self._tasks[task_name]
        except KeyError as exc:
            available = ", ".join(sorted(self._tasks.keys())) or "none"
            raise AITaskLookupError(f"AI task '{task_name}' is not registered. Available: {available}.") from exc

    def list_enabled(self) -> list[AITaskDefinition]:
        return [task for task in sorted(self._tasks.values(), key=lambda item: item.taskName) if task.enabled]


def create_default_task_registry() -> AITaskRegistry:
    from .long_term_logic_review import LONG_TERM_LOGIC_REVIEW_TASK

    registry = AITaskRegistry()
    registry.register(LONG_TERM_LOGIC_REVIEW_TASK)
    return registry

