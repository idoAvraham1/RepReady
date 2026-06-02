import os
import boto3

KNOWLEDGE_BASE_ID = os.environ.get("BEDROCK_KB_ID", "")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
TOP_K = 5

_client = None


PRODUCT_IDS = {
    "repready_pro": ["repready pro", "repready"],
    "coachai":      ["coachai", "coach ai"],
    "salestrain":   ["salestrain", "sales train"],
    "signalhq":     ["signalhq", "signal hq"],
    "dealdesk":     ["dealdesk", "deal desk"],
}

def _get_client():
    global _client
    if _client is None:
        _client = boto3.client(
            "bedrock-agent-runtime",
            region_name=AWS_REGION,
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        )
    return _client

def _build_retrieval_context(question: str, selected_product: str | None):
    """Returns (augmented_query, filter_config | None)"""
    q = question.lower()
    # No product selected → General mode, no filter
    if not selected_product or selected_product == "general":
        return question, None
    # Detect other product names explicitly mentioned in the query
    mentioned = {
        pid for pid, aliases in PRODUCT_IDS.items()
        if any(alias in q for alias in aliases)
    }
    involved = mentioned | {selected_product}
    # Augment the query with product context
    label = " vs ".join(p.replace("_", " ").title() for p in involved)
    augmented = f"{label} — {question}"
    # # Single product → hard filter
    # if len(involved) == 1:
    #     retrieval_filter = {
    #         "equals": {"key": "product", "value": selected_product}
    #     }
    # # Multiple products → OR filter
    # else:
    #     retrieval_filter = {
    #         "orAll": [
    #             {"equals": {"key": "product", "value": p}}
    #             for p in involved
    #         ]
    #     }
    return augmented, None

    
def retrieve_chunks(question: str, selected_product: str = None):
    augmented_query, retrieval_filter = _build_retrieval_context(
        question, selected_product
    )
    vector_config = {"numberOfResults": TOP_K}
    if retrieval_filter:
        vector_config["filter"] = retrieval_filter
    response = _get_client().retrieve(
        knowledgeBaseId=KNOWLEDGE_BASE_ID,
        retrievalQuery={"text": augmented_query},
        retrievalConfiguration={
            "vectorSearchConfiguration": vector_config
        },
    )

    results = []
    for item in response.get("retrievalResults", []):
        text = item.get("content", {}).get("text", "")
        score = float(item.get("score", 0.0))
        location = item.get("location", {})
        source = _extract_source_name(location)
        results.append({"text": text, "score": score, "source": source})

    return results


def _extract_source_name(location: dict) -> str:
    s3_loc = location.get("s3Location", {})
    uri = s3_loc.get("uri", "")
    if uri:
        filename = uri.rstrip("/").split("/")[-1]
        return filename.rsplit(".", 1)[0] if "." in filename else filename
    return "knowledge_base"
