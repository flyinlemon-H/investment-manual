from __future__ import annotations


LONG_TERM_LOGIC_REVIEW_TASK = {
    "taskName": "long_term_logic_review",
    "version": "1.0.0",
    "enabled": True,
    "promptPath": "prompts/long_term_logic_review/v1.0.0.md",
    "promptVersion": "1.0.0",
    "schemaPath": "schemas/long_term_logic_review/v1.0.0.json",
    "schemaVersion": "1.0.0",
    "defaultProvider": "mock",
    "defaultModel": "mock-model",
    "dependencies": [
        "stock",
        "fundamentalReview",
        "valuationReview",
        "recentCatalyst",
        "allocationDecision",
        "longTermLogic",
    ],
    "requiresHumanApproval": True,
    "outputTarget": "aiDiscussionState.drafts",
    "maxFrequencyMinutes": 1440,
}

