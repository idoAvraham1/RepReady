"""
gap_service.py — Knowledge gap detection and logging.

Gaps are logged when the LLM responds with the canonical fallback phrase
(see GAP_FALLBACK_PHRASE), meaning the knowledge base did not contain
enough information to answer the rep's question.
"""

import json
from datetime import datetime, timezone
from config import GAP_LOG_PATH

# Must stay in sync with rule 12 in generation_service.SYSTEM_PROMPT
GAP_FALLBACK_PHRASE = "I don't have that information in my current knowledge base."


def is_gap_response(text: str) -> bool:
    """Return True if the LLM response indicates a knowledge gap."""
    return GAP_FALLBACK_PHRASE.lower() in (text or "").lower()


def log_gap(
    question: str,
    product: str = "general",
    max_score: float | None = None,
) -> bool:
    """
    Append a gap entry to gaps_log.jsonl.

    Returns True if the entry was written, False on I/O failure.
    """
    entry: dict = {
        "question":  question,
        "product":   product,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if max_score is not None:
        entry["max_score"] = round(max_score, 4)

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
    max_score: float | None = None,
) -> bool:
    """
    Log a gap only when the LLM used the fallback no-answer phrase.

    Called after streaming completes so logging matches what the rep actually saw.
    """
    if not is_gap_response(response_text):
        return False
    return log_gap(question, product, max_score)
