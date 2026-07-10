"""AI provider foundation.

This package exposes provider abstractions only. Real API integrations must be
added behind the registry boundary in later API sprints.
"""

from .base import AIProvider, ensure_ai_runtime_dirs
from .mock_provider import MockAIProvider
from .registry import ProviderRegistry

__all__ = [
    "AIProvider",
    "MockAIProvider",
    "ProviderRegistry",
    "ensure_ai_runtime_dirs",
]

