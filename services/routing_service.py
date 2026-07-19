"""Routing and session-state helpers for chat requests.

Builds the agent ``inputText`` (mode/prospect tags + product prefix) and
the Bedrock ``sessionState`` (attributes plus optional KB metadata filter).
"""

from config import BEDROCK_KNOWLEDGE_BASE_ID


def _apply_product_prefix(question: str, selected_product: str) -> str:
    """Prefix the question with the active product when one is selected.

    ``general`` means no product scope, so the question is returned unchanged.

    Args:
        question: The rep's raw question text.
        selected_product: Product id from the UI, or ``general`` for no filter.

    Returns:
        The question, optionally prefixed with ``[Active product: ...]``.
    """
    if not selected_product or selected_product == "general":
        return question
    return f"[Active product: {selected_product}] {question}"


def _build_kb_filter(selected_product: str) -> dict | None:
    """Build a Bedrock KB metadata filter for the active product.

    Scopes retrieval to the selected product's docs while still allowing
    customer notes. Prospect matching stays semantic via input tags / query
    text rather than hard metadata equality.

    Metadata keys (S3 sidecars):
      - product docs: ``product=<id>``
      - customer notes: ``doc_type=customer_notes``

    Args:
        selected_product: Product id from the UI, or ``general`` for no filter.

    Returns:
        An ``orAll`` filter dict, or ``None`` when no product scoping applies.
    """
    if not selected_product or selected_product == "general":
        return None

    return {
        "orAll": [
            {"equals": {"key": "product", "value": selected_product}},
            {"equals": {"key": "doc_type", "value": "customer_notes"}},
        ]
    }


def build_input_text(
    question: str,
    mode: str,
    selected_product: str,
    prospect_name: str,
    prospect_company: str,
) -> str:
    """Build the agent ``inputText`` with routing tags and product scope.

    Tags are embedded in ``inputText`` so orchestration rules can see them
    via ``$question$`` even when ``promptSessionAttributes`` are not wired
    into the agent template.

    Args:
        question: The rep's question text.
        mode: Conversation mode (e.g. ``prep`` or ``live``); selects the
            instruction tag that steers answer shape and tool use.
        selected_product: Product id for the ``[Active product: ...]`` prefix.
        prospect_name: Optional prospect contact; omitted from tags when empty.
        prospect_company: Optional prospect company; omitted from tags when empty.

    Returns:
        A single string: routing tags, then the (possibly product-prefixed)
        question body.
    """
    tags: list[str] = [f"[mode: {mode}]"]
    if prospect_name:
        tags.append(f"[prospect_name: {prospect_name}]")
    if prospect_company:
        tags.append(f"[prospect_company: {prospect_company}]")

    if mode == "live":
        # Live answers must stay short and actionable; company tool only on ask.
        tags.append(
            "[LIVE_CALL: WHAT TO SAY RIGHT NOW. No intro. No preamble. No greeting. "
            "Exactly 4 lines starting with •. Last line: • Next move: ... "
            "Do NOT call get_company_context unless the rep explicitly asks about company background.]"
        )
    else:
        tags.append(
            "[PREP: Help prepare before the call. Use customer notes and KB docs. "
            "If the rep explicitly asks about a company, call get_company_context for company background only.]"
        )

    body = _apply_product_prefix(question, selected_product)
    return " ".join(tags) + " " + body


def build_session_state(
    mode: str,
    selected_product: str,
    prospect_name: str,
    prospect_company: str,
) -> dict:
    """Build Bedrock ``sessionState`` for one chat turn.

    Always sets session/prompt attributes for mode and product. Attaches a
    KB retrieval filter only when a specific product is selected and a
    knowledge base id is configured.

    Args:
        mode: Conversation mode mirrored into session and prompt attributes.
        selected_product: Product id used for attributes and optional KB filter.
        prospect_name: Optional prospect contact for prompt attributes.
        prospect_company: Optional prospect company for prompt attributes.

    Returns:
        A ``sessionState`` dict suitable for ``invoke_agent``, including
        ``knowledgeBaseConfigurations`` when product filtering applies.
    """
    prompt_attrs = {
        "mode": mode,
        "product": selected_product,
    }
    if prospect_name:
        prompt_attrs["prospect_name"] = prospect_name
    if prospect_company:
        prompt_attrs["prospect_company"] = prospect_company

    session_state = {
        "sessionAttributes": {
            "mode": mode,
            "product": selected_product,
        },
        "promptSessionAttributes": prompt_attrs,
    }

    kb_filter = _build_kb_filter(selected_product)
    # Skip KB config entirely for general / missing KB so Bedrock uses defaults.
    if kb_filter and BEDROCK_KNOWLEDGE_BASE_ID:
        session_state["knowledgeBaseConfigurations"] = [
            {
                "knowledgeBaseId": BEDROCK_KNOWLEDGE_BASE_ID,
                "retrievalConfiguration": {
                    "vectorSearchConfiguration": {
                        "filter": kb_filter,
                    }
                },
            }
        ]

    return session_state
