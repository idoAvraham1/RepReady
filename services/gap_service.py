import os
import json
from datetime import datetime, timezone

GAP_LOG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "gaps_log.jsonl",
)

CONFIDENCE_THRESHOLD = 0.4


def check_and_log_gap(question: str, chunks: list[dict]) -> bool:
    """
    If the highest retrieval score is below the confidence threshold,
    log the question as a knowledge gap and return True.
    """
    scores = [c["score"] for c in chunks]
    max_score = max(scores) if scores else 0.0

    if max_score < CONFIDENCE_THRESHOLD:
        entry = {
            "question": question,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "max_score": round(max_score, 4),
            "scores": [round(s, 4) for s in scores],
        }
        try:
            with open(GAP_LOG_PATH, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry) + "\n")
        except OSError:
            pass
        return True

    return False
