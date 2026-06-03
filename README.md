# RepReady

> *"Always know your next move."*

RepReady is a real-time sales coach powered by your own product docs. It's built for two moments: **warming up before a call** and **rescuing you mid-call** when a hard objection or forgotten detail catches you off guard.

Unlike static battle cards or cheat sheets that give you facts, RepReady generates coached responses — what to say right now, and what your next move is. Every answer is grounded in your approved knowledge base via **AWS Bedrock**, not model memory.

---

## Two ways to use it

**Before the call — warm up**
Open a chat, select your product, and run through the objections you expect. Pricing pushback? Competitor comparison? Onboarding concerns? Get the coached answer in advance so it's already in your head when it matters.

**During the call**
When an objection you haven't heard before lands, or a technical detail slips your mind, type a quick 3–5 word query while the prospect is still talking. The answer streams back before you need to respond.

---

## How it works

```
Your question  (+ product context, optional history)
      │
      ▼
  app.py  /chat
      │
      ├── retrieval_service  ──►  Bedrock KB  (metadata-filtered retrieve)
      ├── generation_service ──►  Claude Haiku 4.5  (streamed bullets)
      └── gap_service        ──►  gaps_log.jsonl
      │
      ▼
  SSE stream  →  coached bullets  +  "Next move:"  +  source citations
```

Every response follows the same format: up to 4 coaching bullets written for someone speaking out loud right now, ending with a **Next move:** the rep can act on immediately.

---

## Features

| | |
|---|---|
| ⚡ **Live streaming** | Token-by-token via SSE — first bullet appears in under a second |
| 🎯 **Product scoping** | Metadata-filtered retrieval per product conversation |
| 🔄 **Comparison mode** | All Products + 2 product names → fair per-product retrieval |
| 🧠 **Conversation memory** | Last 2 exchanges sent to the LLM — follow-ups just work |
| 🕳️ **Gap detection** | Questions the KB can't answer are auto-logged for your content team |

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Backend | Flask, boto3 |
| Retrieval | Amazon Bedrock Knowledge Base (`bedrock-agent-runtime`) |
| LLM | Claude Haiku 4.5 via Amazon Bedrock (cross-region inference profile) |
| Frontend | Vanilla HTML / CSS / JS |
| Deployment | Docker |

---

## Setup

### Prerequisites

- Python 3.11+ or Docker
- AWS account with a synced Bedrock Knowledge Base
- IAM permissions: `bedrock-agent-runtime:Retrieve` + `bedrock-runtime:InvokeModelWithResponseStream`

### Configuration

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `AWS_REGION` | ✅ | Bedrock / KB region (default `us-east-1`) |
| `AWS_ACCESS_KEY_ID` | ✅ * | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | ✅ * | AWS secret key |
| `BEDROCK_KB_ID` | ✅ | Your Knowledge Base ID |
| `BEDROCK_MODEL_ID` | — | Haiku inference profile (has a default) |

*On EC2, use an IAM instance role instead of keys in `.env`.

Fine-tuning in `config.py`: `RETRIEVAL_TOP_K` (5), `COMPARISON_CHUNKS_PER_PRODUCT` (3), `MAX_TOKENS` (512).

### Run locally

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py
# → http://localhost:5000
```

### Docker

```bash
docker build -t repready .
docker run -p 5000:5000 --env-file .env repready
```

**Persist knowledge gaps across restarts:**
```bash
mkdir -p ~/repready-data && touch ~/repready-data/gaps_log.jsonl

docker run -d --name repready --restart unless-stopped \
  -p 5000:5000 --env-file .env \
  -v ~/repready-data/gaps_log.jsonl:/app/gaps_log.jsonl \
  repready
```

---

## Project structure

```
repready/
├── app.py                      # Flask routes, SSE orchestration
├── config.py                   # Env vars and tuning constants
├── services/
│   ├── retrieval_service.py    # Bedrock KB retrieve, filters, comparison mode
│   ├── generation_service.py   # Prompt building + Claude streaming
│   └── gap_service.py          # Gap detection and JSONL logging
├── templates/                  # HTML
├── static/                     # CSS and JS
├── data/                       # Sample docs + metadata sidecars (not used at runtime)
├── Dockerfile
└── requirements.txt
```

**Routes:** `GET /` · `POST /chat` (SSE) · `GET /gaps`

---

## Adding a product

1. Write `<product_id>.txt` using `[PRODUCT — TOPIC]` section blocks — Bedrock's chunker keeps them together.
2. Add a sidecar `<product_id>.txt.metadata.json` with `"product": "<product_id>"`.
3. Upload both to your S3 data source and re-sync the Knowledge Base.
4. Add aliases to `PRODUCT_IDS` in `retrieval_service.py`.
5. Add the product to `PRODUCTS` in `static/js/app.js`.

---

## Knowledge gaps

When the KB can't answer, RepReady responds with a fixed fallback phrase and logs the question to `gaps_log.jsonl` (question, product, timestamp, retrieval score). Review them at `GET /gaps` and use them to improve your knowledge base over time.

Keep `GAP_FALLBACK_PHRASE` in `gap_service.py` in sync with rule 12 in `generation_service.py`.

---

## Deploy to EC2

1. Launch `t3.small`+, open HTTP (80) and SSH in the security group.
2. Install Docker, copy the project and `.env`.
3. Attach an IAM role with Bedrock permissions (skip access keys in `.env`).
4. Build and run on port 80 → 5000 with the gaps volume mounted.

For production: add HTTPS via ALB + ACM or an Nginx reverse proxy.

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| Retrieval failed | `BEDROCK_KB_ID`, region, IAM, KB sync status |
| Model error | `BEDROCK_MODEL_ID` — correct Haiku inference profile for your region |
| Wrong product in answer | Metadata sidecar filename and `product` value; re-sync after S3 changes |
| Comparison missing a product | All Products mode; question must name 2+ products (check `PRODUCT_IDS` aliases) |
| Gaps lost on redeploy | Mount `gaps_log.jsonl` as a Docker volume |

---

## What's next

- **Stronger model** — swap Haiku for a larger Claude profile where latency allows
- **Auth & rate limits** — protect `/chat` before external deployment
- **Feedback loop** — thumbs-up/down to log quality signals per answer
- **Section-aware metadata** — tag chunks with doc section for finer citations