# RepReady

> *"Know everything on the call."*

A sales-assist chat app for live calls. Reps ask product questions in plain language and get streamed, cited coaching bullets — every answer grounded in your approved docs via **AWS Bedrock**, not model memory.

Single Flask app — backend and UI ship in one Docker image.

---

## Features

- **Bedrock-grounded answers** — Retrieves from a Knowledge Base, generates responses with source citations
- **Live streaming** — Server-Sent Events (SSE) for token-by-token replies
- **Product scoping** — Metadata-filtered retrieval per product conversation
- **Cross-product comparisons** — All Products mode + 2+ product names triggers fair per-product retrieval
- **Conversation memory** — Last 2 exchanges (4 messages) sent to the LLM for follow-ups
- **Knowledge gaps** — Questions the model can't answer are logged automatically for review
- **Docker-ready** — One image, env-based config, optional volume for gap persistence

---

## Data Sources

The `data/` folder in this repo holds **sample product docs for quick start only**. They mirror the shape of real content but are not what the running app reads at query time.

| Product | Sample file |
|---------|-------------|
| RepReady Pro | `repready_pro.txt` |
| CoachAI | `coachai.txt` |
| SalesTrain | `salestrain.txt` |
| SignalHQ | `signalhq.txt` |
| DealDesk | `dealdesk.txt` |

Each `.txt` file has a matching Bedrock metadata sidecar (e.g. `coachai.txt.metadata.json` with `"product": "coachai"`).

> **Production:** Upload documents and sidecars to the **S3 bucket** configured as your Bedrock Knowledge Base data source, then **re-sync the KB**. The app never reads `data/` directly — Bedrock retrieves from the synced index.

---

## AWS Bedrock Integration

```
User Question  (+ product context, optional history)
       │
       ▼
  app.py  /chat
       │
       ├── retrieval_service  ──►  Bedrock Agent Runtime
       │                            retrieve() on Knowledge Base
       │                            (metadata filter · comparison mode)
       │
       ├── generation_service ──►  Bedrock Runtime
       │                            Claude Haiku 4.5 (stream)
       │
       └── gap_service        ──►  gaps_log.jsonl
       │
       ▼
  SSE stream  →  cited answer  +  source filenames
```

### How a question becomes an answer

1. The client sends `POST /chat` with `question`, `product`, and optional `history`.
2. `retrieval_service.py` calls **Bedrock KB `retrieve()`** — with metadata filters scoped to the selected product, or comparison-mode retrieves when All Products is active and the question names multiple offerings.
3. `generation_service.py` builds a prompt from retrieved chunks and streams **Claude Haiku** via `InvokeModelWithResponseStream`.
4. The model is instructed to cite sources, stay concise, and use a fixed fallback phrase when the KB doesn't cover the topic.
5. `gap_service.py` logs unanswered questions when that fallback phrase appears in the response.

### Retrieval modes

| Product context | Query pattern | Bedrock behavior |
|-----------------|---------------|------------------|
| Single product | Any question | Metadata filter `product = <id>`; top **5** chunks |
| Single product | Question names another product too | `orAll` filter across involved products |
| All Products | General question | No filter; top **5** chunks |
| All Products | 2+ products in question | **Comparison mode**: **3** chunks per product, merged |

Product detection uses aliases in `PRODUCT_IDS` inside `services/retrieval_service.py`. After any S3 or metadata change, re-sync the Knowledge Base.

### Document format

Structure S3 docs as self-contained blocks (e.g. `[COACHAI — PRICING]`) so Bedrock's default chunking keeps related facts together. Sidecar filenames must match the document exactly (`dealdesk.txt.metadata.json`, not a typo).

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Flask, boto3 |
| Retrieval | Amazon Bedrock Knowledge Base (`bedrock-agent-runtime`) |
| LLM | Amazon Bedrock — Claude Haiku 4.5 (cross-region inference profile) |
| Frontend | Vanilla HTML, CSS, JavaScript (served by Flask) |
| Deployment | Docker |

---

## Project Structure

```
repready-chatbot/
├── app.py                      # Flask routes, SSE orchestration
├── config.py                   # Environment variables and constants
├── services/
│   ├── retrieval_service.py    # Bedrock KB retrieve, filters, comparison mode
│   ├── generation_service.py   # Claude streaming + system prompt
│   └── gap_service.py          # Gap detection and JSONL logging
├── templates/                  # HTML
├── static/                     # CSS and JavaScript
├── data/                       # Sample docs + sidecars (not used at runtime)
├── Dockerfile
└── requirements.txt
```

**API routes:** `GET /` · `POST /chat` (SSE) · `GET /gaps`

---

## Prerequisites

- Python 3.11+ or Docker
- AWS account with:
  - Bedrock Knowledge Base synced from **S3** (docs + metadata sidecars)
  - Access to Claude Haiku 4.5 (inference profile for your region)
  - IAM: `bedrock-agent-runtime:Retrieve` and `bedrock-runtime:InvokeModelWithResponseStream`

---

## Configuration

```bash
cp .env.example .env   # Linux/macOS
copy .env.example .env # Windows
```

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `AWS_REGION` | Yes | Bedrock / KB region | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | Yes* | AWS access key | — |
| `AWS_SECRET_ACCESS_KEY` | Yes* | AWS secret key | — |
| `BEDROCK_KB_ID` | Yes | Knowledge Base ID | — |
| `BEDROCK_MODEL_ID` | No | Haiku inference profile | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |

\*On EC2, use an **IAM instance role** instead of access keys in `.env`.

Tuning in `config.py`: `RETRIEVAL_TOP_K` (5), `COMPARISON_CHUNKS_PER_PRODUCT` (3), `MAX_TOKENS` (512).

`.env` is gitignored and excluded from Docker builds — pass credentials at runtime only.

---

## Setup & Running Locally

```bash
cd repready-chatbot
python -m venv venv
source venv/bin/activate          # Linux/macOS
# venv\Scripts\activate           # Windows
pip install -r requirements.txt
python app.py
```

Open [http://localhost:5000](http://localhost:5000).

---

## Docker

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

## Deploy to EC2 (summary)

1. Launch a `t3.small`+ instance; security group allows HTTP (80) and SSH.
2. Install Docker, copy the project and `.env` to the instance.
3. Attach an IAM role with Bedrock retrieve + invoke permissions (omit access keys from `.env`).
4. Build and run on port 80 → 5000, with the gaps volume mounted (same as Docker example above).

Add HTTPS via ALB + ACM or an Nginx reverse proxy for production.

---

## Knowledge Gaps

When the model can't answer from the KB, it responds with:

> I don't have that information in my current knowledge base.

Matching responses are appended to `gaps_log.jsonl` (question, product, timestamp, retrieval score). View them via `GET /gaps`. Keep `GAP_FALLBACK_PHRASE` in `gap_service.py` in sync with rule 12 in `generation_service.py`.

---

## Adding a New Product

1. Write `<product_id>.txt` as self-contained `[PRODUCT — TOPIC]` blocks; add `<product_id>.txt.metadata.json` with `"product": "<product_id>"`.
2. Upload both to your **S3 data source** and re-sync the Knowledge Base.
3. Add aliases to `PRODUCT_IDS` in `services/retrieval_service.py`.
4. Add the product to the `PRODUCTS` array in `static/js/app.js`.

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| Retrieval failed | `BEDROCK_KB_ID`, region, IAM, KB sync status |
| Model error | `BEDROCK_MODEL_ID` — correct Haiku inference profile for your region |
| Wrong sources / product | Metadata sidecar filename and `product` value; re-sync after S3 changes |
| Comparison missing a product | All Products mode; question must name 2+ products (`PRODUCT_IDS` aliases) |
| Gaps lost on redeploy | Mount `gaps_log.jsonl` as a Docker volume |

---

## Future Improvements

- **Stronger model** — swap Haiku for a larger Claude profile where latency allows
- **Auth & rate limits** — protect `/chat` before external deployment
- **Feedback loop** — wire thumbs-up/down to log quality signals
- **Section-aware metadata** — tag chunks with doc section for finer citations
