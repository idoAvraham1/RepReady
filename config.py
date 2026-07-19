"""Configuration for the Flask web app."""

import os
from dotenv import load_dotenv

load_dotenv()

# --- AWS credentials & region -------------------------------------------
AWS_REGION        = os.environ.get("AWS_REGION", "us-east-1")
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID")
AWS_SECRET_KEY    = os.environ.get("AWS_SECRET_ACCESS_KEY")

# --- Bedrock Agent ------------------------------------------------------
BEDROCK_AGENT_ID       = os.environ.get("BEDROCK_AGENT_ID", "")
BEDROCK_AGENT_ALIAS_ID = os.environ.get("BEDROCK_AGENT_ALIAS_ID", "")
BEDROCK_KNOWLEDGE_BASE_ID = os.environ.get("BEDROCK_KB_ID", "")
