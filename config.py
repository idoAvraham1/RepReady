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

# --- Bedrock Knowledge Base ---------------------------------------------
BEDROCK_KB_ID = os.environ.get("BEDROCK_KB_ID", "")

# --- Bedrock LLM (Claude Haiku 4.5 cross-region inference profile) ------
BEDROCK_MODEL_ID = os.environ.get(
    "BEDROCK_MODEL_ID",
    "us.anthropic.claude-haiku-4-5-20251001-v1:0",
)
MAX_TOKENS = 512

# --- Retrieval ----------------------------------------------------------
RETRIEVAL_TOP_K = 5
# Chunks retrieved per product when All Products mode detects a 2+ product comparison.
COMPARISON_CHUNKS_PER_PRODUCT = 3

# --- File paths ---------------------------------------------------------
# Absolute path to the JSONL file where knowledge gaps are logged.
GAP_LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gaps_log.jsonl")
