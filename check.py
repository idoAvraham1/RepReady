import boto3, json
from config import BEDROCK_KB_ID, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_KEY

client = boto3.client("bedrock-agent-runtime", region_name=AWS_REGION,
    aws_access_key_id=AWS_ACCESS_KEY_ID, aws_secret_access_key=AWS_SECRET_KEY)

# A) No filter — inspect what metadata Bedrock actually stored
r = client.retrieve(
    knowledgeBaseId=BEDROCK_KB_ID,
    retrievalQuery={"text": "growth plan pricing"},
    retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": 5}},
)
for i, item in enumerate(r["retrievalResults"]):
    print(f"--- chunk {i} ---")
    print("source:", item.get("location", {}).get("s3Location", {}).get("uri"))
    print("metadata:", json.dumps(item.get("metadata", {}), indent=2))  # ← critical
    print("score:", item.get("score"))

# B) With filter — does it return anything?
r2 = client.retrieve(
    knowledgeBaseId=BEDROCK_KB_ID,
    retrievalQuery={"text": "Repready Pro — what is the pricing for growth plan"},
    retrievalConfiguration={"vectorSearchConfiguration": {
        "numberOfResults": 5,
        "filter": {"equals": {"key": "product", "value": "repready_pro"}},
    }},
)
for i, item in enumerate(r2["retrievalResults"]):
    text = item.get("content", {}).get("text", "")
    print(f"--- chunk {i} (score {item.get('score')}) ---")
    print(text[:500])
    print("HAS PRICE:", "$" in text or "199" in text)