import os
import json
import boto3

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

# Cross-region inference profile for Claude Haiku 4.5
# Override with BEDROCK_MODEL_ID env var if the model ID changes
MODEL_ID = os.environ.get(
    "BEDROCK_MODEL_ID",
    "us.anthropic.claude-haiku-4-5-20251001-v1:0",
)

MAX_TOKENS = 512

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = boto3.client(
            "bedrock-runtime",
            region_name=AWS_REGION,
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
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
    "    • I don't have that information in my current knowledge base.\n"
)

def _build_user_prompt(question: str, chunks: list[dict]) -> str:
    context_parts = []
    for i, chunk in enumerate(chunks, 1):
        context_parts.append(
            f"[Source {i}: {chunk['source']}]\n{chunk['text'].strip()}"
        )
    context = "\n\n".join(context_parts)

    return (
        f"<context>\n{context}\n</context>\n\n"
        f"<question>{question}</question>\n\n"
        "Respond in bullet points only (max 4). Cite the source name in parentheses after each bullet."
    )


def generate_stream(question: str, chunks: list[dict]):
    """
    Yield text tokens from Claude Haiku 4.5 via Bedrock streaming.
    """
    client = _get_client()
    prompt = _build_user_prompt(question, chunks)

    body = json.dumps(
        {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": MAX_TOKENS,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": prompt}],
        }
    )

    response = client.invoke_model_with_response_stream(
        modelId=MODEL_ID,
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
        raw = chunk.get("bytes", b"{}")
        data = json.loads(raw)
        if data.get("type") == "content_block_delta":
            delta = data.get("delta", {})
            if delta.get("type") == "text_delta":
                text = delta.get("text", "")
                if text:
                    yield text
