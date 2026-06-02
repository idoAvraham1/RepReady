"""
generation_service.py — LLM response generation via AWS Bedrock.

Single responsibility: take a question, retrieved context chunks, and an
optional conversation history, then stream Claude Haiku tokens back to
the caller one at a time.
"""

import json
import boto3
from config import AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_KEY, BEDROCK_MODEL_ID, MAX_TOKENS

_client = None


def _get_client():
    """Return a lazily-initialised bedrock-runtime boto3 client."""
    global _client
    if _client is None:
        _client = boto3.client(
            "bedrock-runtime",
            region_name=AWS_REGION,
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_KEY,
        )
    return _client


SYSTEM_PROMPT = (
    "You are RepReady — a real-time presales assistant whispering in a sales rep's ear during a LIVE call.\n"
    "The rep is speaking with a prospect RIGHT NOW. Every answer must help them respond, handle objections, "
    "and move the deal forward — not just inform them.\n"
    "Rules you must follow without exception:\n"
    "1. Answer ONLY from the provided context. Never use outside knowledge.\n"
    "2. Only include information DIRECTLY relevant to the question. "
    "If a retrieved chunk contains a strong selling point useful for advancing the deal, "
    "include it as a bullet before 'Next move:' — but only if it genuinely helps.\n"
    "3. Every bullet must sound like a coach, not a manual. Use 'Tell them', 'Say that', "
    "'Ask if', 'Mention that', 'Point out' — write for a rep who is speaking out loud right now.\n"
    "4. Format every response as bullet points — maximum 4 bullets including 'Next move:'.\n"
    "5. Each bullet must be a unique, distinct point. Never repeat the same idea twice.\n"
    "6. Each bullet is one short, direct, confident sentence the rep can say immediately.\n"
    "7. Lead with the single most impactful point first.\n"
    "8. ALWAYS end with a 'Next move:' bullet as the last bullet — no exceptions, every single response. "
    "It must tell the rep exactly what to say or do RIGHT NOW to advance the deal.\n"
    "9. After each bullet cite the source in parentheses e.g. (repready_pro).\n"
    "10. Never write paragraphs, headers, or prose outside of bullets.\n"
    "11. Do NOT use any Markdown formatting — no asterisks, no underscores, no bold markers, "
    "no italic markers. Plain text only inside every bullet.\n"
    "12. If the context does not contain the answer respond with exactly:\n"
    "    • I don't have that information in my current knowledge base. "
    "I've logged this for the team to review.\n"
    "13. You have access to the recent conversation history. Use it to understand follow-up questions "
    "in context — especially when the rep's new message relates to a 'Next move:' you previously suggested.\n"
)


def _build_user_prompt(question: str, chunks: list[dict], comparison_mode: bool = False) -> str:
    """
    Assemble the user-turn prompt: retrieved context blocks followed by the question.

    The <context> tags help Claude clearly separate retrieved knowledge from
    the rep's live question.
    """
    context_parts = [
        f"[Source {i}: {chunk['source']}]\n{chunk['text'].strip()}"
        for i, chunk in enumerate(chunks, 1)
    ]
    context = "\n\n".join(context_parts)
    instruction = (
        "Respond in bullet points only (max 4). Cite the source name in parentheses after each bullet."
    )
    if comparison_mode:
        instruction += (
            " Context spans multiple NorthStar products — address each product relevant to the "
            "question and cite the correct source for every bullet."
        )
    return (
        f"<context>\n{context}\n</context>\n\n"
        f"<question>{question}</question>\n\n"
        f"{instruction}"
    )


def generate_stream(
    question: str,
    chunks: list[dict],
    history: list[dict] | None = None,
    comparison_mode: bool = False,
):
    """
    Yield text tokens from Claude Haiku via Bedrock streaming.

    Args:
        question: The rep's current question.
        chunks:   Retrieved KB chunks (list of {text, score, source}).
        history:  Optional list of previous messages in {role, content} format
                  (up to the last 2 exchanges = 4 messages). Prepended to the
                  Claude messages array so the model understands follow-up context
                  without significant latency overhead (~150-250 extra tokens).
        comparison_mode: When True, instruct the model to cover and cite each
                  product present in the retrieved context (All Products compare).

    Yields:
        str: Individual text tokens as they stream from the model.
    """
    prompt = _build_user_prompt(question, chunks, comparison_mode=comparison_mode)

    # Build the messages array: history (if any) then the current prompt
    messages: list[dict] = []
    if history:
        messages.extend({"role": m["role"], "content": m["content"]} for m in history)
    messages.append({"role": "user", "content": prompt})

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": MAX_TOKENS,
        "system": SYSTEM_PROMPT,
        "messages": messages,
    })

    response = _get_client().invoke_model_with_response_stream(
        modelId=BEDROCK_MODEL_ID,
        body=body,
        contentType="application/json",
        accept="application/json",
    )

    stream = response.get("body")
    if not stream:
        return

    for event in stream:
        chunk = event.get("chunk")
        if not chunk:
            continue
        data = json.loads(chunk.get("bytes", b"{}"))
        if data.get("type") == "content_block_delta":
            delta = data.get("delta", {})
            if delta.get("type") == "text_delta":
                text = delta.get("text", "")
                if text:
                    yield text
