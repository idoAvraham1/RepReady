"""
gap_service.py — Knowledge gap detection and logging.

Gaps are logged when the agent signals it could not answer from the KB
(see GAP_MARKERS and is_gap_response). Keep markers aligned with
prompts/agent_instruction.md global rule 3.
"""

import json
from datetime import datetime, timezone
from config import GAP_LOG_PATH

# Canonical fallback — prompts/agent_instruction.md global rule 3
GAP_FALLBACK_PHRASE = "I don't have that information in my current knowledge base."

# Agent often keeps this tail even when paraphrasing the opening sentence
GAP_LOGGED_PHRASE = "logged this for the team to review"

KB_SCOPE_FRAGMENT = "in my current knowledge base"

# Paraphrased gap openers that still mean "not in KB" (e.g. "There is no X plan in my current knowledge base")
GAP_NEGATION_HINTS = (
    "i don't have",
    "i do not have",
    "don't have that information",
    "do not have that information",
    "there is no",
    "there's no",
    "is no ",
    "not in my current knowledge base",
)


def is_gap_response(text: str) -> bool:
    """Return True if the agent response indicates a knowledge gap."""
    t = (text or "").lower()

    if GAP_FALLBACK_PHRASE.lower() in t:
        return True
    if GAP_LOGGED_PHRASE in t:
        return True
    if KB_SCOPE_FRAGMENT in t and any(hint in t for hint in GAP_NEGATION_HINTS):
        return True

    return False


def log_gap(question: str, product: str = "general") -> bool:
    """
    Append a gap entry to gaps_log.jsonl.

    Returns True if the entry was written, False on I/O failure.
    """
    entry: dict = {
        "question":  question,
        "product":   product,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        with open(GAP_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
        return True
    except OSError:
        return False


def log_gap_from_response(
    question: str,
    response_text: str,
    product: str = "general",
) -> bool:
    """
    Log a gap when the agent used a fallback / not-in-KB phrase.

    Called after streaming completes so logging matches what the rep actually saw.
    """
    if not is_gap_response(response_text):
        return False
    return log_gap(question, product)
