# RepReady

AI-powered sales assistant for live calls. Reps ask product questions in plain language and get streamed, cited coaching bullets powered by AWS Bedrock RAG and Claude Haiku 4.5.

Single Flask app — backend and frontend ship in one Docker image.

---

## Features

- **RAG answers** — Retrieves from a Bedrock Knowledge Base, generates responses with source citations
- **Live streaming** — Server-Sent Events (SSE) for token-by-token replies
- **Product scoping** — Select a product per conversation; retrieval is metadata-filtered to that product's docs
- **Cross-product comparisons** — In All Products mode, queries naming 2+ products trigger per-product retrieval so answers cite each product fairly
- **Conversation memory** — Last 2 exchanges (4 messages) sent to the LLM for follow-up continuity
- **Knowledge gaps** — Unanswered questions logged when the model uses the fallback phrase; viewable on the Gaps page
- **SPA frontend** — Landing page, chat UI, Best Practices guide, and scrollable Gaps dashboard (hash routing, no separate FE build)

---

## Architecture

```
Browser  →  Flask (app.py)
              ├── retrieval_service  →  Bedrock KB retrieve()
              │                         (metadata filter + comparison mode)
              ├── generation_service →  Bedrock Claude Haiku (stream)
              └── gap_service        →  gaps_log.jsonl
```

| Layer | Role |
|-------|------|
| `app.py` | HTTP routes, SSE orchestration, comparison_mode wiring |
| `config.py` | Environment variables and retrieval constants |
| `services/` | Retrieval, generation, gap logging |
| `templates/` + `static/` | Vanilla HTML/CSS/JS UI served by Flask |

**API routes**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Web UI |
| `POST` | `/chat` | Chat (SSE). Body: `{ question, product, history? }` |
| `GET` | `/gaps` | Knowledge gaps grouped by product (JSON) |

**SSE events from `/chat`**

| Event | Payload | When |
|-------|---------|------|
| `sources` | JSON array of source filenames | Before tokens stream |
| (default) | Escaped text token | During generation |
| (default) | `[DONE]` | Stream complete |

---

## Prerequisites

- Python 3.11+ (local development)
- Docker (container deployment)
- AWS account with:
  - Bedrock Knowledge Base synced from S3 product docs **with metadata sidecars**
  - Access to Claude Haiku 4.5 (cross-region inference profile)
  - IAM permissions for `bedrock-agent-runtime:Retrieve` and `bedrock-runtime:InvokeModelWithResponseStream`

---

## Configuration

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env   # Linux/macOS
copy .env.example .env # Windows
```

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `AWS_REGION` | Yes | Region for Bedrock and KB | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | Yes* | AWS access key | — |
| `AWS_SECRET_ACCESS_KEY` | Yes* | AWS secret key | — |
| `BEDROCK_KB_ID` | Yes | Bedrock Knowledge Base ID | — |
| `BEDROCK_MODEL_ID` | No | Haiku inference profile ID | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |

\*On EC2, prefer an **IAM instance role** with Bedrock permissions and omit access keys from `.env`. Boto3 picks up role credentials automatically.

Retrieval tuning lives in `config.py` (not env vars):

| Constant | Default | Purpose |
|----------|---------|---------|
| `RETRIEVAL_TOP_K` | `5` | Chunks returned for single-product / general queries |
| `COMPARISON_CHUNKS_PER_PRODUCT` | `3` | Chunks per product in All Products comparison mode |
| `MAX_TOKENS` | `512` | Max LLM output tokens |

`.env` is gitignored and excluded from Docker builds (see `.dockerignore`). Pass credentials at runtime only.

---

## Run locally (Python)

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

## Run with Docker

One image serves the full app (no separate frontend container).

```bash
cd repready-chatbot

docker build -t repready .

docker run -p 5000:5000 --env-file .env repready
```

**Persist knowledge gaps across container restarts:**

```bash
mkdir -p ~/repready-data
touch ~/repready-data/gaps_log.jsonl

docker run -d \
  --name repready \
  --restart unless-stopped \
  -p 5000:5000 \
  --env-file .env \
  -v ~/repready-data/gaps_log.jsonl:/app/gaps_log.jsonl \
  repready
```

Useful commands:

```bash
docker logs -f repready
docker stop repready && docker rm repready
```

---

## Deploy to EC2

1. **Launch instance** — Amazon Linux 2023 or Ubuntu; `t3.small` or larger is sufficient.
2. **Security group** — Allow inbound SSH (22) from your IP, HTTP (80) from `0.0.0.0/0` (or restrict as needed).
3. **Elastic IP** (recommended) — Keeps the public URL stable across restarts.
4. **Install Docker** on the instance:

   ```bash
   # Amazon Linux 2023
   sudo yum install -y docker
   sudo systemctl start docker && sudo systemctl enable docker
   sudo usermod -aG docker ec2-user
   # Log out and back in
   ```

5. **Copy project and `.env`** to the instance:

   ```bash
   scp -i your-key.pem -r repready-chatbot ec2-user@<EC2_IP>:~/
   scp -i your-key.pem repready-chatbot/.env ec2-user@<EC2_IP>:~/repready-chatbot/.env
   ```

6. **Build and run** (port 80 → container 5000):

   ```bash
   cd ~/repready-chatbot
   docker build -t repready .

   mkdir -p ~/repready-data && touch ~/repready-data/gaps_log.jsonl

   docker run -d \
     --name repready \
     --restart unless-stopped \
     -p 80:5000 \
     --env-file .env \
     -v ~/repready-data/gaps_log.jsonl:/app/gaps_log.jsonl \
     repready
   ```

7. Open `http://<EC2_PUBLIC_IP>`.

For production HTTPS, add an Application Load Balancer with ACM, or an Nginx reverse proxy in front of the container.

**IAM on EC2:** Attach a role with Bedrock retrieve + invoke permissions. Set only `AWS_REGION` and `BEDROCK_KB_ID` in `.env` on the server.

---

## Frontend views

Hash-based routing in a single `index.html`:

| URL hash | View |
|----------|------|
| (none) | Landing page |
| `#app` | Chat interface |
| `#best-practices` | Usage guide for reps |
| `#gaps` | Knowledge gaps dashboard (scrollable list) |

Conversations are stored in the browser (`localStorage`); only gap logs persist on the server.

**Product selector** — Set at New Chat or switch mid-conversation via the active pill. Values map to `product` in the `/chat` request body (`general` = All Products).

---

## Knowledge gaps

A gap is logged **after** the LLM finishes streaming, when the response contains:

> I don't have that information in my current knowledge base.

Entries are appended to `gaps_log.jsonl` with question, product, timestamp, and optional retrieval `max_score`. The **Knowledge Gaps** page (`#gaps`) reads `/gaps` and groups them by product.

This is tied to the system prompt in `services/generation_service.py` (rule 12). Do not change the fallback phrase without updating `GAP_FALLBACK_PHRASE` in `services/gap_service.py`.

---

## RAG, metadata filtering, and product context

### Knowledge base documents

Each product has a `.txt` file in `data/` plus a Bedrock metadata sidecar uploaded alongside it on S3:

```
coachai.txt
coachai.txt.metadata.json   →  { "metadataAttributes": { "product": "coachai" } }
```

Sidecar filenames must match the document name exactly (e.g. `dealdesk.txt.metadata.json`, not a typo). After any S3 or metadata change, **re-sync the Bedrock Knowledge Base**.

Documents are structured as self-contained blocks (e.g. `[COACHAI — PRICING]`) so Bedrock's default ~300-token chunking keeps related facts together — pricing, features, and objections stay in retrievable units.

### Retrieval modes

Implemented in `services/retrieval_service.py`:

| UI selection | Query pattern | Behavior |
|--------------|---------------|----------|
| **Single product** (e.g. RepReady Pro) | Any question | Query augmented with product label; metadata filter `product = <id>`; top **5** chunks |
| **Single product + other product named** | e.g. "CoachAI vs us" with RepReady Pro selected | Augmented query; `orAll` filter across involved products |
| **All Products** | General question | No metadata filter; top **5** chunks from full KB |
| **All Products** | 2+ product names in question | **Comparison mode**: separate retrieve per product (**3** chunks each), merged for generation; LLM prompted to cite each product |

Product name detection uses aliases in `PRODUCT_IDS` (e.g. `repready pro`, `coach ai`, `deal desk`). Comparison mode only runs when the pill is **All Products** (`general`) and at least two products are detected in the question.

### Products in the demo KB

| ID | Label |
|----|-------|
| `repready_pro` | RepReady Pro |
| `coachai` | CoachAI |
| `salestrain` | SalesTrain |
| `signalhq` | SignalHQ |
| `dealdesk` | DealDesk |

**Best practice:** Select the active product in the UI for single-product calls. Use **All Products** when comparing offerings and name both products in the question (e.g. *"debating between repready_pro and coachai on pricing"*).

---

## Project structure

```
repready-chatbot/
├── app.py                 # Flask entry point, routes, SSE
├── config.py              # Environment variables and constants
├── requirements.txt
├── Dockerfile
├── .dockerignore
├── gaps_log.jsonl         # Runtime gap log (gitignored; volume on EC2)
│
├── services/
│   ├── retrieval_service.py   # KB retrieve, metadata filter, comparison mode
│   ├── generation_service.py  # Claude Haiku streaming + system prompt
│   └── gap_service.py         # Gap detection and JSONL logging
│
├── templates/
│   └── index.html
│
├── static/
│   ├── css/style.css
│   └── js/app.js
│
└── data/                  # Sample docs + metadata sidecars (upload to S3/KB)
    ├── repready_pro.txt
    ├── repready_pro.txt.metadata.json
    ├── coachai.txt
    ├── coachai.txt.metadata.json
    ├── salestrain.txt
    ├── salestrain.txt.metadata.json
    ├── signalhq.txt
    ├── signalhq.txt.metadata.json
    ├── dealdesk.txt
    └── dealdesk.txt.metadata.json
```

---

## Adding a new product

1. Add `<product_id>.txt` to `data/`, structured as self-contained `[PRODUCT — TOPIC]` blocks (~250 tokens each).
2. Add `<product_id>.txt.metadata.json` with `"product": "<product_id>"` in `metadataAttributes`.
3. Upload both files to the KB's S3 data source (matching filenames) and re-sync the Knowledge Base.
4. Add the product ID and aliases to `PRODUCT_IDS` in `services/retrieval_service.py`.
5. Add an entry to the `PRODUCTS` array in `static/js/app.js` (label and dot color).

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| Retrieval failed | `BEDROCK_KB_ID`, region, IAM permissions, KB sync status |
| Model error | `BEDROCK_MODEL_ID` — use the Haiku 4.5 inference profile for your region |
| Wrong product in sources | Product pill selection; metadata sidecar filename and `product` value; KB re-sync after S3 changes |
| Comparison only shows one product | Pill must be **All Products**; question must name 2+ products (see `PRODUCT_IDS` aliases) |
| Pricing/facts missing from chunks | Doc may span chunk boundaries — restructure into self-contained blocks and re-upload |
| Empty gaps page | Ask a question outside the KB; confirm fallback phrase in response |
| Gaps lost after redeploy | Mount `gaps_log.jsonl` as a Docker volume |
| Docker build includes secrets | Ensure `.env` is listed in `.dockerignore` |
| Stale code after edits | Kill all `python app.py` processes; only one Flask instance should listen on port 5000 |
