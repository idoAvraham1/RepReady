"""
config.py — Centralised configuration for RepReady.

This is the ONLY module that reads os.environ / .env.
All other modules import their constants from here so that
environment variables and magic numbers are managed in one place.
"""

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

# --- File paths ---------------------------------------------------------
# Absolute path to the JSONL file where knowledge gaps are logged.
GAP_LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gaps_log.jsonl")
