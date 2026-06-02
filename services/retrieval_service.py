import os
import boto3

KNOWLEDGE_BASE_ID = os.environ.get("BEDROCK_KB_ID", "")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
TOP_K = 5

_client = None


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


def retrieve_chunks(query: str) -> list[dict]:
    """
    Query the Bedrock Knowledge Base and return the top-K chunks
    with their source document name and relevance score.
    """
    client = _get_client()
    response = client.retrieve(
        knowledgeBaseId=KNOWLEDGE_BASE_ID,
        retrievalQuery={"text": query},
        retrievalConfiguration={
            "vectorSearchConfiguration": {"numberOfResults": TOP_K}
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
