from __future__ import annotations

from typing import Any

from .base import AIProvider, AIProviderLookupError, AIProviderRegistrationError


class ProviderRegistry:
    """Registry boundary for AI providers.

    Business code should resolve providers through this registry instead of
    importing concrete provider implementations directly.
    """

    def __init__(self, *, default_name: str | None = None) -> None:
        self._providers: dict[str, AIProvider] = {}
        self._default_name = default_name

    def register(self, name: str, provider: AIProvider, *, default: bool = False) -> None:
        normalized = self._normalize_name(name)
        if normalized in self._providers:
            raise AIProviderRegistrationError(f"AI provider '{normalized}' is already registered.")
        if not hasattr(provider, "generate") or not callable(getattr(provider, "generate")):
            raise AIProviderRegistrationError(f"AI provider '{normalized}' does not implement generate().")
        self._providers[normalized] = provider
        if default or self._default_name is None:
            self._default_name = normalized

    def get(self, name: str) -> AIProvider:
        normalized = self._normalize_name(name)
        try:
            return self._providers[normalized]
        except KeyError as exc:
            available = ", ".join(self.list_available()) or "none"
            raise AIProviderLookupError(f"AI provider '{normalized}' is not registered. Available: {available}.") from exc

    def get_default(self) -> AIProvider:
        if not self._default_name:
            raise AIProviderLookupError("No default AI provider has been configured.")
        return self.get(self._default_name)

    def list_available(self) -> list[str]:
        return sorted(self._providers.keys())

    @property
    def default_name(self) -> str | None:
        return self._default_name

    @staticmethod
    def _normalize_name(name: str) -> str:
        normalized = str(name or "").strip().lower()
        if not normalized:
            raise AIProviderRegistrationError("AI provider name must not be empty.")
        return normalized


def create_default_registry(config: dict[str, Any] | None = None) -> ProviderRegistry:
    """Create the Sprint01-A default registry.

    Only the mock provider is enabled in this foundation sprint.
    """

    from .mock_provider import MockAIProvider

    ai_config = (config or {}).get("ai", {}) if isinstance(config, dict) else {}
    default_name = ai_config.get("default") or "mock"
    registry = ProviderRegistry(default_name=default_name)
    registry.register("mock", MockAIProvider(), default=True)
    return registry

