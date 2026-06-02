"""
app.py — RepReady Flask application entry point.

Single responsibility: HTTP routing and request/response orchestration.
All business logic lives in the service modules; this file only wires them
together and handles SSE streaming to the frontend.
"""

import json
import logging
from flask import Flask, render_template, request, Response, stream_with_context

from services.retrieval_service import retrieve_chunks
from services.generation_service import generate_stream
from services.gap_service import log_gap_from_response
from config import GAP_LOG_PATH

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(__name__)


@app.route("/")
def index():
    """Serve the single-page frontend."""
    return render_template("index.html")


@app.route("/chat", methods=["POST"])
def chat():
    """
    Handle a rep's question via Server-Sent Events.

    Expected JSON body:
        question (str):          The rep's question.
        product  (str):          Active product context ('general' or a product ID).
        history  (list[dict]):   Optional. Up to 4 previous messages
                                 [{role: 'user'|'assistant', content: str}].

    Streams:
        event: sources  — JSON array of source names from retrieval.
        data: <token>   — Individual text tokens from the LLM.
        data: [DONE]    — Signals stream completion.
    """
    data             = request.get_json()
    question         = (data.get("question") or "").strip()
    selected_product = data.get("product") or "general"
    history          = data.get("history") or []

    if not question:
        return {"error": "Empty question"}, 400

    try:
        chunks = retrieve_chunks(question, selected_product)
    except Exception:
        logger.error("retrieve_chunks failed", exc_info=True)
        return {"error": "Retrieval failed"}, 500

    sources = list(dict.fromkeys(c["source"] for c in chunks))
    scores = [c["score"] for c in chunks]
    max_score = max(scores) if scores else 0.0

    def event_stream():
        full_text = ""
        try:
            yield f"event: sources\ndata: {json.dumps(sources)}\n\n"
            for token in generate_stream(question, chunks, history):
                full_text += token
                escaped = token.replace("\n", "\\n")
                yield f"data: {escaped}\n\n"
            log_gap_from_response(
                question, full_text, selected_product, max_score=max_score
            )
            yield "data: [DONE]\n\n"
        except Exception:
            logger.error("event_stream failed", exc_info=True)
            yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(event_stream()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        },
    )


@app.route("/gaps")
def gaps():
    """
    Return all logged knowledge gaps grouped by product.

    Response JSON shape:
        {
          "<product_id>": [
            {"question": str, "timestamp": str, "max_score": float},
            ...
          ],
          ...
        }
    """
    grouped: dict[str, list[dict]] = {}
    try:
        with open(GAP_LOG_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                entry = json.loads(line)
                product = entry.get("product", "general")
                grouped.setdefault(product, []).append({
                    "question":  entry.get("question", ""),
                    "timestamp": entry.get("timestamp", ""),
                    "max_score": entry.get("max_score", 0),
                })
    except FileNotFoundError:
        pass  # No gaps logged yet — return empty object
    except Exception:
        logger.error("Failed to read gaps log", exc_info=True)
        return {"error": "Could not read gaps log"}, 500

    return grouped


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
