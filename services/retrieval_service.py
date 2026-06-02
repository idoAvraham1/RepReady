"""
retrieval_service.py — Bedrock Knowledge Base retrieval.

Single responsibility: query the AWS Bedrock KB and return a ranked list
of text chunks with source names and relevance scores.

Query augmentation strengthens semantic search when a product is selected.
Metadata filtering scopes retrieval to the selected product's documents via
Bedrock KB sidecar metadata (product attribute on each S3 document).
"""

import boto3
from config import AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_KEY, BEDROCK_KB_ID, RETRIEVAL_TOP_K

# Maps product IDs to the natural-language aliases a rep might type,
# used to detect when multiple products are implicitly involved in a query.
PRODUCT_IDS: dict[str, list[str]] = {
    "repready_pro": ["repready pro", "repready"],
    "coachai":      ["coachai", "coach ai"],
    "salestrain":   ["salestrain", "sales train"],
    "signalhq":     ["signalhq", "signal hq"],
    "dealdesk":     ["dealdesk", "deal desk"],
}

_client = None


def _get_client():
    """Return a lazily-initialised bedrock-agent-runtime boto3 client."""
    global _client
    if _client is None:
        _client = boto3.client(
            "bedrock-agent-runtime",
            region_name=AWS_REGION,
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_KEY,
        )
    return _client


def _build_retrieval_context(
    question: str, selected_product: str | None
) -> tuple[str, dict | None]:
    """
    Return (augmented_query, retrieval_filter | None).

    When a product is selected the product name (and any other product names
    mentioned in the query) is prepended to the query to strengthen the
    semantic signal sent to the vector index.
    """
    q = question.lower()

    # No product selected → general mode, no augmentation needed
    if not selected_product or selected_product == "general":
        return question, None

    # Detect other product names explicitly mentioned in the query text
    mentioned = {
        pid for pid, aliases in PRODUCT_IDS.items()
        if any(alias in q for alias in aliases)
    }
    involved = mentioned | {selected_product}

    label = " vs ".join(p.replace("_", " ").title() for p in involved)
    augmented = f"{label} — {question}"

    if len(involved) == 1:
        retrieval_filter = {"equals": {"key": "product", "value": selected_product}}
    else:
        retrieval_filter = {
            "orAll": [{"equals": {"key": "product", "value": p}} for p in sorted(involved)]
        }
    return augmented, retrieval_filter


def retrieve_chunks(question: str, selected_product: str | None = None) -> list[dict]:
    """
    Query the Bedrock Knowledge Base and return the top-K chunks.

    Args:
        question: The rep's question (raw text from the frontend).
        selected_product: Optional product ID (e.g. 'repready_pro'). When
            provided, the query is augmented with product context.

    Returns:
        List of dicts with keys: 'text', 'score', 'source'.
    """
    augmented_query, retrieval_filter = _build_retrieval_context(question, selected_product)

    vector_config: dict = {"numberOfResults": RETRIEVAL_TOP_K}
    if retrieval_filter:
        vector_config["filter"] = retrieval_filter

    response = _get_client().retrieve(
        knowledgeBaseId=BEDROCK_KB_ID,
        retrievalQuery={"text": augmented_query},
        retrievalConfiguration={"vectorSearchConfiguration": vector_config},
    )

    results = []
    for item in response.get("retrievalResults", []):
        text   = item.get("content", {}).get("text", "")
        score  = float(item.get("score", 0.0))
        source = _extract_source_name(item.get("location", {}))
        results.append({"text": text, "score": score, "source": source})

    return results


def _extract_source_name(location: dict) -> str:
    """Derive a human-readable source label from a Bedrock S3 location dict."""
    uri = location.get("s3Location", {}).get("uri", "")
    if uri:
        filename = uri.rstrip("/").split("/")[-1]
        return filename.rsplit(".", 1)[0] if "." in filename else filename
    return "knowledge_base"
