"""Bedrock Agent client and streaming utilities.

Owns the boto3 bedrock-agent-runtime client and turns invoke_agent
completion events into token strings for the Flask SSE layer.
"""

import logging

import boto3

from config import AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_KEY, BEDROCK_AGENT_ID, BEDROCK_AGENT_ALIAS_ID

logger = logging.getLogger(__name__)

_agent_client = None


def _get_agent_client():
    """Return a lazily-initialized bedrock-agent-runtime boto3 client.

    Created once and reused so each chat turn does not pay for a new
    client/session setup.

    Returns:
        A configured ``boto3`` client for ``bedrock-agent-runtime``.
    """
    global _agent_client
    if _agent_client is None:
        _agent_client = boto3.client(
            "bedrock-agent-runtime",
            region_name=AWS_REGION,
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_KEY,
        )
    return _agent_client


def _unwrap_trace(event: dict) -> dict:
    """Normalize Bedrock's nested streaming trace payload.

    Streaming responses nest the useful fields under ``trace.trace``;
    some events only have the outer dict. Fall back to the outer object
    so callers can read orchestration fields from either shape.

    Args:
        event: A single event from the ``completion`` event stream.

    Returns:
        The inner trace dict when present, otherwise the outer ``trace``
        object (or an empty dict if neither exists).
    """
    outer = event.get("trace") or {}
    return outer.get("trace") or outer


def _log_agent_trace(event: dict) -> None:
    """Log tool calls, KB lookups, rationale, and failures from a trace event.

    Used for ops visibility into what the agent did mid-turn without
    forwarding that detail to the client.

    Args:
        event: A completion-stream event that contains a ``trace`` key.
    """
    inner = _unwrap_trace(event)
    if not inner:
        return

    orch = inner.get("orchestrationTrace") or {}
    inv = orch.get("invocationInput") or {}
    if "actionGroupInvocationInput" in inv:
        action = inv["actionGroupInvocationInput"]
        logger.info(
            "Agent tool call: %s - %s",
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
    # Bedrock uses either key depending on agent/runtime version.
    text = rationale.get("text") or rationale.get("traceText")
    if text:
        logger.info("Agent rationale: %s", str(text)[:200])

    failure = inner.get("failureTrace")
    if failure:
        logger.warning("Agent failure trace: %s", failure)


def stream_agent_response(session_id: str, input_text: str, session_state: dict):
    """Yield UTF-8 token chunks from a Bedrock agent invoke_agent call.

    Args:
        session_id: Bedrock session key tying multi-turn state together.
        input_text: Fully built prompt text (question plus any routing
            context already assembled by the caller).
        session_state: Prompt-session attributes and filters Bedrock uses
            for this turn (product scope, prospect fields, etc.).

    Yields:
        Decoded token strings from the agent's final streamed response.
        Trace-only events are logged and skipped.
    """
    response = _get_agent_client().invoke_agent(
        agentId=BEDROCK_AGENT_ID,
        agentAliasId=BEDROCK_AGENT_ALIAS_ID,
        sessionId=session_id,
        # Trace events feed _log_agent_trace; not sent to the client.
        enableTrace=True,
        sessionState=session_state,
        inputText=input_text,
        streamingConfigurations={
            # Without this, the final answer may arrive as one buffered blob.
            "streamFinalResponse": True,
        },
    )
    for event in response["completion"]:
        if "trace" in event:
            _log_agent_trace(event)
            continue
        chunk = event.get("chunk") or {}
        raw_bytes = chunk.get("bytes")
        if not raw_bytes:
            continue
        token = raw_bytes.decode("utf-8")
        if token:
            yield token
