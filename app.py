"""
app.py — RepReady Flask application entry point.

Single responsibility: HTTP routing and request/response orchestration.
All business logic (retrieval, generation, product context) is handled
by the Bedrock Agent; this file invokes the agent and streams its
response back to the frontend via SSE.

MCP TOOL CONTRACTS (reference only, deployed in AWS Lambda)
- get_company_context:
  Input: {"company_name": "<string>"}
  Purpose: company background lookup when company-prep routing is requested.
"""

import json
import logging
import uuid

from flask import Flask, render_template, request, Response, stream_with_context

from services.routing_service import build_input_text, build_session_state
from services.bedrock_agent_service import stream_agent_response

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
    """Handle a rep's question via Server-Sent Events."""
    data = request.get_json() or {}
    question = (data.get("question") or "").strip()
    selected_product = data.get("product") or "general"
    session_id = data.get("session_id") or str(uuid.uuid4())
    mode = data.get("mode") or "prep"
    prospect_name = (data.get("prospect_name") or "").strip()
    prospect_company = (data.get("prospect_company") or "").strip()

    if not question:
        return {"error": "Empty question"}, 400

    input_text = build_input_text(
        question,
        mode,
        selected_product,
        prospect_name,
        prospect_company,
    )
    session_state = build_session_state(
        mode,
        selected_product,
        prospect_name,
        prospect_company,
    )

    logger.info(
        "/chat session=%s mode=%s input=%s",
        session_id[:8],
        mode,
        input_text[:240],
    )

    def event_stream():
        try:
            yield f"event: sources\ndata: {json.dumps([])}\n\n"
            for token in stream_agent_response(session_id, input_text, session_state):
                escaped = token.replace("\n", "\\n")
                yield f"data: {escaped}\n\n"
            yield "data: [DONE]\n\n"
        except Exception:
            logger.error("event_stream failed", exc_info=True)
            yield 'event: error\ndata: {"code":"AGENT_FAILED"}\n\n'
            yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(event_stream()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)


