"""Bedrock Agent client and streaming utilities."""

import logging

import boto3

from config import AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_KEY, BEDROCK_AGENT_ID, BEDROCK_AGENT_ALIAS_ID

logger = logging.getLogger(__name__)

_agent_client = None


def _get_agent_client():
    """Return a lazily-initialized bedrock-agent-runtime boto3 client."""
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
    """Bedrock nests trace payload under trace.trace in streaming responses."""
    outer = event.get("trace") or {}
    return outer.get("trace") or outer


def _log_agent_trace(event: dict) -> None:
    """Log tool and KB steps from Bedrock trace events."""
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
    text = rationale.get("text") or rationale.get("traceText")
    if text:
        logger.info("Agent rationale: %s", str(text)[:200])

    failure = inner.get("failureTrace")
    if failure:
        logger.warning("Agent failure trace: %s", failure)


def stream_agent_response(session_id: str, input_text: str, session_state: dict):
    """Yield streamed token chunks from the Bedrock agent response."""
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
        chunk = event.get("chunk") or {}
        raw_bytes = chunk.get("bytes")
        if not raw_bytes:
            continue
        token = raw_bytes.decode("utf-8")
        if token:
            yield token
