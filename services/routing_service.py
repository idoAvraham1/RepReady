"""Routing and session-state helpers for chat requests."""

def _apply_product_prefix(question: str, selected_product: str) -> str:
    """Product scoping applies to prep and live responses."""
    if not selected_product or selected_product == "general":
        return question
    return f"[Active product: {selected_product}] {question}"


def build_input_text(
    question: str,
    mode: str,
    selected_product: str,
    prospect_name: str,
    prospect_company: str,
) -> str:
    """
    Embed routing tags in inputText so rules apply via $question$ even when
    promptSessionAttributes are not wired in the orchestration template.
    """
    tags: list[str] = [f"[mode: {mode}]"]
    if prospect_name:
        tags.append(f"[prospect_name: {prospect_name}]")
    if prospect_company:
        tags.append(f"[prospect_company: {prospect_company}]")

    if mode == "live":
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
    prompt_attrs = {
        "mode": mode,
        "product": selected_product,
    }
    if prospect_name:
        prompt_attrs["prospect_name"] = prospect_name
    if prospect_company:
        prompt_attrs["prospect_company"] = prospect_company
    return {
        "sessionAttributes": {
            "mode": mode,
            "product": selected_product,
        },
        "promptSessionAttributes": prompt_attrs,
    }
