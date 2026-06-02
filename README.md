# RepReady

AI-powered sales assistant for live calls. Reps ask product questions in plain language and get streamed, cited coaching bullets powered by AWS Bedrock RAG and Claude Haiku 4.5.

Single Flask app — backend and frontend ship in one Docker image.

---

## Features

- **RAG answers** — Retrieves from a Bedrock Knowledge Base, generates responses with source citations
- **Live streaming** — Server-Sent Events (SSE) for token-by-token replies
- **Product context** — Select a product per conversation; queries are augmented for sharper retrieval
- **Conversation memory** — Last 2 exchanges sent to the LLM for follow-up continuity
- **Knowledge gaps** — Unanswered questions logged when the model uses the fallback phrase; viewable on the Gaps page
- **SPA frontend** — Landing page, chat UI, Best Practices guide, and Gaps dashboard (hash routing, no separate FE build)

---

## Architecture

```
Browser  →  Flask (app.py)
              ├── retrieval_service  →  Bedrock KB retrieve()
              ├── generation_service →  Bedrock Claude Haiku (stream)
              └── gap_service        →  gaps_log.jsonl
```

| Layer | Role |
|-------|------|
| `app.py` | HTTP routes, SSE orchestration |
| `config.py` | All environment variables (single source of truth) |
| `services/` | Retrieval, generation, gap logging |
| `templates/` + `static/` | Vanilla HTML/CSS/JS UI served by Flask |

**API routes**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Web UI |
| `POST` | `/chat` | Chat (SSE). Body: `{ question, product, history? }` |
| `GET` | `/gaps` | Knowledge gaps grouped by product (JSON) |

---

## Prerequisites

- Python 3.11+ (local development)
- Docker (container deployment)
- AWS account with:
  - Bedrock Knowledge Base (synced with your product docs)
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
| `#gaps` | Knowledge gaps dashboard |

Conversations are stored in the browser (`localStorage`); only gap logs persist on the server.

---

## Knowledge gaps

A gap is logged **after** the LLM finishes streaming, when the response contains:

> I don't have that information in my current knowledge base.

Entries are appended to `gaps_log.jsonl` with question, product, timestamp, and optional retrieval score. The **Knowledge Gaps** page (`#gaps`) reads `/gaps` and groups them by product.

This is tied to the system prompt in `services/generation_service.py` (rule 12). Do not change the fallback phrase without updating `GAP_FALLBACK_PHRASE` in `services/gap_service.py`.

---

## RAG and product context

- **Product pill / New Chat selector** — When a product is selected, the retrieval query is augmented (e.g. `Repready Pro — client says pricing is too high`).
- **All Products** — No augmentation; top-K chunks come from the full KB.
- **Metadata filtering** — Prepared in `retrieval_service.py` but disabled until KB document metadata is verified via the Bedrock API. Enable the commented filter block after tagging docs with a `product` attribute and re-syncing the KB.

For best retrieval quality: select the active product in the UI rather than relying on spelling in the question text.

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
│   ├── retrieval_service.py
│   ├── generation_service.py
│   └── gap_service.py
│
├── templates/
│   └── index.html
│
├── static/
│   ├── css/style.css
│   └── js/app.js
│
└── data/                  # Sample docs (upload to S3/KB for production)
    ├── repready_pro.txt
    ├── coachai.txt
    ├── salestrain.txt
    ├── signalhq.txt
    └── dealdesk.txt
```

---

## Adding a new product

1. Add documentation to S3 and sync the Bedrock Knowledge Base (with `product` metadata when filtering is enabled).
2. Add the product ID and aliases to `PRODUCT_IDS` in `services/retrieval_service.py`.
3. Add an entry to the `PRODUCTS` array in `static/js/app.js` (label and dot color).
4. Re-sync the knowledge base.

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| Retrieval failed | `BEDROCK_KB_ID`, region, IAM permissions, KB sync status |
| Model error | `BEDROCK_MODEL_ID` — use the Haiku 4.5 inference profile for your region |
| Empty gaps page | Ask a question outside the KB; confirm fallback phrase in response |
| Gaps lost after redeploy | Mount `gaps_log.jsonl` as a Docker volume |
| Docker build includes secrets | Ensure `.env` is listed in `.dockerignore` |
