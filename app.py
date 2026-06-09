"""
app.py — RepReady Flask application entry point.

Single responsibility: HTTP routing and request/response orchestration.
All business logic (retrieval, generation, product context) is handled
by the Bedrock Agent; this file invokes the agent and streams its
response back to the frontend via SSE.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MCP TOOL CONTRACTS  (tools live in AWS Lambda — not in this repo)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tool 1 — get_todays_calls
  Input:  none
  Output: JSON array
          [
            {
              "time":         "HH:MM",          # local time string, e.g. "14:30"
              "contact_name": "Sara Johnson",
              "company_name": "CloudX",
              "event_id":     "<google-event-id>"
            },
            ...
          ]
  Notes:  Connects to Google Calendar via a service account
          (GOOGLE_SERVICE_ACCOUNT_JSON env var in Lambda).
          Filters to calendar events for today only.
          Read-only — no side effects.

Tool 2 — get_company_context
  Input:  { "company_name": "<string>" }
  Output: JSON object
          {
            "industry":    "SaaS / HR Tech",
            "size":        "200-500 employees",
            "recent_news": "Raised Series B in Jan 2025",
            "key_facts":   "Competitors: Workday, BambooHR"
          }
  Notes:  Calls Tavily Search API (TAVILY_API_KEY env var in Lambda).
          Invoked only when the agent (or [KB_LOOKUP_COMPANY] routing) requests
          company background — never for person prep lookups.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import json
import logging
import uuid

import boto3
from flask import Flask, render_template, request, Response, stream_with_context, jsonify

from services.gap_service import log_gap_from_response
from config import (
    AWS_REGION,
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_KEY,
    BEDROCK_AGENT_ID,
    BEDROCK_AGENT_ALIAS_ID,
    GAP_LOG_PATH,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# ── Bedrock Agent client ─────────────────────────────────────────────

_agent_client = None


def _get_agent_client():
    """Return a lazily-initialised bedrock-agent-runtime boto3 client."""
    global _agent_client
    if _agent_client is None:
        _agent_client = boto3.client(
            "bedrock-agent-runtime",
            region_name=AWS_REGION,
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_KEY,
        )
    return _agent_client


PERSON_PREP_TRIGGERS = (
    "what should i know about",
    "tell me about",
    "prep me for",
)

COMPANY_PREP_TRIGGERS = (
    "what should i know about",
    "tell me about",
)


def _normalize(text: str) -> str:
    return (text or "").strip().lower()


def _is_person_prep_question(question: str, question_type: str | None, prospect_name: str) -> bool:
    if question_type == "person":
        return True
    q = _normalize(question)
    if not any(t in q for t in PERSON_PREP_TRIGGERS):
        return False
    if question_type == "company":
        return False
    if prospect_name and prospect_name.lower() in q:
        return True
    if "before the call" in q or "prep me for" in q:
        return True
    return False


def _is_company_prep_question(question: str, question_type: str | None, prospect_company: str) -> bool:
    if question_type == "company":
        return True
    q = _normalize(question)
    if not any(t in q for t in COMPANY_PREP_TRIGGERS):
        return False
    if prospect_company and prospect_company.lower() in q:
        if "before the call" not in q:
            return True
    if "to help me in the call" in q and prospect_company and prospect_company.lower() in q:
        return True
    return False


def _apply_product_prefix(
    question: str,
    selected_product: str,
    mode: str,
    is_person_prep: bool,
) -> str:
    """Product scoping applies to live calls and general Q&A — not person KB prep."""
    if not selected_product or selected_product == "general" or is_person_prep:
        return question
    return f"[Active product: {selected_product}] {question}"


def _build_input_text(
    question: str,
    mode: str,
    selected_product: str,
    question_type: str | None,
    prospect_name: str,
    prospect_company: str,
) -> str:
    """
    Embed routing tags in inputText so rules apply via $question$ even when
    promptSessionAttributes are not wired in the orchestration template.
    """
    is_person_prep = _is_person_prep_question(question, question_type, prospect_name)
    is_company_prep = _is_company_prep_question(question, question_type, prospect_company)

    tags: list[str] = [f"[mode: {mode}]"]

    if prospect_name:
        tags.append(f"[prospect_name: {prospect_name}]")
    if prospect_company:
        tags.append(f"[prospect_company: {prospect_company}]")

    if is_person_prep:
        name = prospect_name or "prospect"
        notes_title = f"Customer Notes: {name}"
        if prospect_company:
            notes_title += f" — {prospect_company}"
        tags.append(f"[KB_LOOKUP_PERSON: {name}]")
        tags.append(
            f'[ROUTING: Search KB for "{notes_title}". '
            "KB only — do NOT call get_company_context or get_todays_calls.]"
        )
    elif is_company_prep:
        company = prospect_company or "company"
        tags.append(f"[KB_LOOKUP_COMPANY: {company}]")
        tags.append("[ROUTING: Call get_company_context for this company only.]")
    elif mode == "live":
        tags.append(
            "[LIVE_CALL: WHAT TO SAY RIGHT NOW. No intro. No preamble. No greeting. "
            "Exactly 4 lines starting with •. Last line: • Next move: ... "
            "Do NOT call get_company_context or get_todays_calls unless the rep "
            "explicitly asks about schedule or company background.]"
        )
    elif mode == "prep":
        tags.append(
            "[PREP: Help prepare before the call. Customer Notes + company web data. "
            "Help pre-think objections and expected questions.]"
        )

    body = _apply_product_prefix(question, selected_product, mode, is_person_prep)
    return " ".join(tags) + " " + body


def _build_session_state(
    mode: str,
    selected_product: str,
    prospect_name: str,
    prospect_company: str,
    question_type: str | None,
) -> dict:
    prompt_attrs = {
        "mode": mode,
        "product": selected_product,
    }
    if prospect_name:
        prompt_attrs["prospect_name"] = prospect_name
    if prospect_company:
        prompt_attrs["prospect_company"] = prospect_company
    if question_type:
        prompt_attrs["question_type"] = question_type

    return {
        "sessionAttributes": {
            "mode": mode,
            "product": selected_product,
        },
        "promptSessionAttributes": prompt_attrs,
    }


def _unwrap_trace(event: dict) -> dict:
    """Bedrock nests trace payload under trace.trace in streaming responses."""
    outer = event.get("trace") or {}
    return outer.get("trace") or outer


def _log_agent_trace(event: dict) -> None:
    """Log tool / KB steps from Bedrock trace events (when enableTrace=True)."""
    inner = _unwrap_trace(event)
    if not inner:
        return

    orch = inner.get("orchestrationTrace") or {}
    inv = orch.get("invocationInput") or {}
    if "actionGroupInvocationInput" in inv:
        action = inv["actionGroupInvocationInput"]
        logger.info(
            "Agent tool call: %s — %s",
            action.get("actionGroupName", "?"),
            action.get("apiPath") or action.get("function", "?"),
        )
    if "knowledgeBaseLookupInput" in inv:
        kb = inv["knowledgeBaseLookupInput"]
        logger.info("Agent KB lookup (input): %s", kb.get("text", kb))

    obs = orch.get("observation") or {}
    if "knowledgeBaseLookupOutput" in obs:
        logger.info("Agent KB lookup (output): chunks returned")
    if "actionGroupInvocationOutput" in obs:
        logger.info("Agent tool response received")

    rationale = orch.get("rationale") or {}
    text = rationale.get("text") or rationale.get("traceText")
    if text:
        logger.info("Agent rationale: %s", str(text)[:200])

    failure = inner.get("failureTrace")
    if failure:
        logger.warning("Agent failure trace: %s", failure)


# ── Routes ───────────────────────────────────────────────────────────

@app.route("/")
def index():
    """Serve the single-page frontend."""
    return render_template("index.html")


@app.route("/init", methods=["GET"])
def init():
    """
    Fetch today's scheduled calls by invoking the Bedrock Agent.

    The agent calls the get_todays_calls MCP tool internally and
    returns the result as a JSON string.  This endpoint is called
    once on page load.

    Response JSON shape:
        [{"time": str, "contact_name": str, "company_name": str, "event_id": str}, ...]
    Returns [] on any failure so the frontend degrades gracefully.
    """
    try:
        session_id    = str(uuid.uuid4())
        response_text = ""

        response = _get_agent_client().invoke_agent(
            agentId=BEDROCK_AGENT_ID,
            agentAliasId=BEDROCK_AGENT_ALIAS_ID,
            sessionId=session_id,
            inputText="get_todays_calls",
        )

        for event in response["completion"]:
            if "chunk" in event and "bytes" in event["chunk"]:
                response_text += event["chunk"]["bytes"].decode("utf-8")

        calls = json.loads(response_text)
        if not isinstance(calls, list):
            calls = []
    except json.JSONDecodeError:
        logger.warning("/init: agent response was not valid JSON")
        calls = []
    except Exception:
        logger.error("/init failed", exc_info=True)
        calls = []

    return jsonify(calls)


@app.route("/chat", methods=["POST"])
def chat():
    """
    Handle a rep's question via Server-Sent Events.

    Expected JSON body:
        question   (str):  The rep's question (or silent opening message).
        product    (str):  Active product context ('general' or a product ID).
        session_id (str):  UUID v4 per browser session — passed to the agent
                           so it maintains conversation memory across turns.
        mode              (str):  'prep' or 'live'.
        prospect_name     (str):  Active prospect name (prospect chats only).
        prospect_company  (str):  Active prospect company (prospect chats only).
        question_type     (str):  'person' | 'company' for prep chip routing.

    Streams:
        event: sources  — Always an empty JSON array (agent manages sources internally).
        data: <token>   — Raw text tokens from the agent.
        data: [DONE]    — Signals stream completion.
    """
    data              = request.get_json()
    question          = (data.get("question") or "").strip()
    selected_product  = data.get("product") or "general"
    session_id        = data.get("session_id") or str(uuid.uuid4())
    mode              = data.get("mode") or "prep"
    if mode in ("assistant", "prospect"):
        mode = "live" if mode == "prospect" else "prep"
    prospect_name     = (data.get("prospect_name") or "").strip()
    prospect_company  = (data.get("prospect_company") or "").strip()
    question_type     = (data.get("question_type") or "").strip() or None

    if not question:
        return {"error": "Empty question"}, 400

    input_text   = _build_input_text(
        question, mode, selected_product, question_type, prospect_name, prospect_company,
    )
    session_state = _build_session_state(
        mode, selected_product, prospect_name, prospect_company, question_type,
    )

    logger.info(
        "/chat session=%s mode=%s type=%s input=%s",
        session_id[:8],
        mode,
        question_type,
        input_text[:240],
    )

    def event_stream():
        full_text = ""
        try:
            yield f"event: sources\ndata: {json.dumps([])}\n\n"

            response = _get_agent_client().invoke_agent(
                agentId=BEDROCK_AGENT_ID,
                agentAliasId=BEDROCK_AGENT_ALIAS_ID,
                sessionId=session_id,
                enableTrace=True,
                sessionState=session_state,
                inputText=input_text,
            )

            for event in response["completion"]:
                if "trace" in event:
                    _log_agent_trace(event)
                    continue
                if "chunk" not in event:
                    continue
                chunk = event["chunk"]
                if "bytes" not in chunk:
                    continue
                token = chunk["bytes"].decode("utf-8")
                if not token:
                    continue
                full_text += token
                escaped = token.replace("\n", "\\n")
                yield f"data: {escaped}\n\n"

            log_gap_from_response(question, full_text, selected_product)
            yield "data: [DONE]\n\n"

        except Exception:
            logger.error("event_stream failed", exc_info=True)
            yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(event_stream()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
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
        pass
    except Exception:
        logger.error("Failed to read gaps log", exc_info=True)
        return {"error": "Could not read gaps log"}, 500

    return grouped


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
