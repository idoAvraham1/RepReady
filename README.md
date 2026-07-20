# RepReady

> *"Always know your next move."*

RepReady is a real-time sales call coach for B2B reps. It helps you **prepare before a call** and **respond during a live call** when an objection lands or a detail slips your mind. Answers are grounded in your approved product knowledge and prospect notes via an **AWS Bedrock Agent** — not model memory.

---

## Two modes

Every prospect chat runs in one of two phases, toggled in the UI:

| UI label | Backend mode | When to use | Response style |
|----------|--------------|-------------|----------------|
| **Before the call** | `prep` | Research, objections, background | Calm scannable notes — max **6 bullets** (`•`) |
| **On the call now** | `live` | On the phone right now | Urgent coach bullets — exactly **4 lines** (`•`), last line is **Next move:** |

The UI shifts tone with the mode: **Before the call** feels relaxed; **On the call now** uses a focused “win this moment” layout with live example prompts above the input.

---

## How it works

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (templates/ + static/)                                 │
│  Prospect chats · Before/On-call toggle · Product pill · SSE    │
└────────────────────────────┬────────────────────────────────────┘
                             │ POST /chat  (question, mode, product,
                             │              prospect, session_id)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  app.py (Flask)                                                 │
│  Embeds routing tags in inputText · builds sessionState         │
│  (optional KB metadata filter) · invokes Bedrock Agent · SSE    │
└────────────────────────────┬────────────────────────────────────┘
                             │ bedrock-agent-runtime:InvokeAgent
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  AWS Bedrock Agent (configured in console — not in this repo)   │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │ Agent        │  │ Knowledge Base  │  │ Action groups    │  │
│  │ instructions │  │ (S3 sync)       │  │ (Lambda / MCP)   │  │
│  │ + orchestration│ │ product docs   │  │ Tavily, email,   │  │
│  │              │  │ customer notes  │  │ etc.             │  │
│  └──────────────┘  └─────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**This repository is the web app only.** Retrieval, generation, tool calls, and KB lookup are handled by the Bedrock Agent you configure in AWS. The Flask app passes context (mode, prospect, product), optionally scopes KB retrieval with a metadata filter when a product is selected, and streams the agent response back to the browser.

---

## What lives where

### `prompts/` — Agent configuration (copy to AWS)

These files are the **source-of-truth drafts** for your Bedrock Agent. They are **not read at runtime** by the Flask app. After editing, paste them into the agent in the AWS console, then **Prepare** and point your **alias** at the new version.

| File | AWS destination |
|------|-----------------|
| `prompts/agent_instruction.md` | Agent **Instructions** — Prep/Live rules, tool routing, response formats |
| `prompts/kb_instruction.md` | Knowledge Base **Instructions** (if using KB instruction field) |

> **Important:** The web app calls `BEDROCK_AGENT_ALIAS_ID`, not DRAFT. Console tests against DRAFT will not match the web app until the alias is updated to the latest prepared version.

### `data/` — Example KB content (mirror of S3)

The `data/` folder shows **what we upload to the S3 bucket** that backs the Bedrock Knowledge Base. It is **not loaded by the app at runtime** — it is documentation and a local reference for content authors.

```
data/
├── products/              # Product docs (RepReady Pro, CoachAI, SalesTrain, …)
├── customer_notes/        # Per-prospect prep files for KB retrieval
└── metadatafilter/        # Example .metadata.json sidecars (upload next to each source file in S3)
```

Product files use `[PRODUCT — TOPIC]` section blocks. Customer Notes use the title format:

`Customer Notes: [Name] — [Company]`

Sidecar examples:

- Product: `"product": "<product_id>"` (e.g. `repready_pro`)
- Customer notes: `"doc_type": "customer_notes"` (plus optional `prospect_name` / `company`)

On S3, place each `{filename}.metadata.json` beside its source file, then re-run KB ingestion when content or metadata changes.

### `customer_notes/` (repo root)

Duplicate/reference copies of prospect note files may also exist at the repo root. The canonical examples for KB structure are under `data/customer_notes/`.

---

## Agent tools (AWS Lambda action groups)

Tools are implemented as **Lambda action groups** on the Bedrock Agent, not in this repo. Contracts are documented in the header of `app.py`.

| Tool | Purpose |
|------|---------|
| `get_company_context` | Company background via Tavily — never for person prep |
| `send_call_update_email` | Email team lead via Resend when the rep explicitly asks (optional) |

---

## Features

| Feature | Description |
|---------|-------------|
| **Before the call / On the call now** | Per-conversation phase toggle with distinct UI and agent response format |
| **Prospect chats** | One chat per prospect; name and company sent as agent context |
| **KB prospect cards** | Pre-loaded prospects (Alex Rivera, Marcus Johnson, Priya Patel) in the new-chat modal with notes lookup |
| **Product scoping** | Product pill (“Ask about:”) adds `[Active product: …]` tags **and** a KB metadata filter (`product=<id>` OR `doc_type=customer_notes`); `general` skips the filter |
| **KB sidebar** | Synced product list in the sidebar; highlights the active product |
| **SSE streaming** | Streamed responses in the browser (`streamFinalResponse` on `InvokeAgent`) |
| **Session memory** | Bedrock `sessionId` per chat — follow-ups work without repeating context |
| **Routing tags** | App embeds `[mode: prep/live]`, prospect tags, and `[PREP: …]` / `[LIVE_CALL: …]` in `inputText` |

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Backend | Flask, boto3 |
| AI | Amazon Bedrock **Agent** + Knowledge Base |
| Tools | AWS Lambda action groups (Tavily, Resend, …) |
| Frontend | Vanilla HTML, CSS, JavaScript |
| State | `localStorage` (conversations), Bedrock sessions (agent memory) |
| Deployment | Docker (optional) |

---

## Setup

### Prerequisites

- Python 3.11+
- AWS account with a **Bedrock Agent** prepared and published to an **alias**
- Knowledge Base synced from S3 (product docs + customer notes)
- IAM permission: `bedrock-agent-runtime:InvokeAgent`

### Configuration

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `AWS_REGION` | Yes | Bedrock region (e.g. `us-east-1`) |
| `AWS_ACCESS_KEY_ID` | Yes* | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | Yes* | AWS secret key |
| `BEDROCK_AGENT_ID` | Yes | Bedrock Agent ID |
| `BEDROCK_AGENT_ALIAS_ID` | Yes | Published alias ID the web app invokes |
| `BEDROCK_KB_ID` | Yes** | Knowledge Base ID used for product metadata filters on `InvokeAgent` |

\*On EC2, prefer an IAM instance role instead of keys in `.env`.  
\*\*Required for product-scoped KB filtering. Without it, the app still runs but skips `knowledgeBaseConfigurations` (no hard product filter).

Restart Flask after changing `.env` (`python app.py` loads config at startup).

### Run locally

```bash
python -m venv venv
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
python app.py
# → http://localhost:5000
```

### Docker

```bash
docker build -t repready .
docker run -p 5000:5000 --env-file .env repready
```

---

## Usage

1. **Open the app** → click **+ New Prospect Chat**.
2. **Pick a KB prospect** (Alex, Marcus, or Priya) or enter any name and company manually. Company is required.
3. **Before the call** (default) — ask about the prospect, company, objections, or product. Use the welcome chips or type freely.
4. **Select product** via the pill in the input bar when the question is product-specific (scopes KB retrieval + answer context). Use **All products** for cross-product comparisons.
5. **On the call now** — switch the toggle when you pick up the phone. Describe what's happening; get 4 coached bullets + Next move.
6. **Email team lead** (if action group is deployed) — e.g. *"Send mail to my team lead that Alex is still not sure about the product."*

Routing behavior is mode-first: the app only tells the agent whether the turn is `prep` or `live`.
In prep mode, the prompt instructions decide when to call `get_company_context` based on the rep's question text.
When a specific product is selected, `sessionState` also applies a KB metadata filter: `(product = <id>) OR (doc_type = customer_notes)`. Prospect matching stays semantic via tags / query text.

---

## API routes

| Route | Method | Description |
|-------|--------|-------------|
| `/` | GET | Web UI (landing + chat app) |
| `/chat` | POST | SSE stream — body: `question`, `mode`, `product`, `session_id`, `prospect_name`, `prospect_company` |

---

## Deploying agent changes

1. Edit `prompts/agent_instruction.md` (and `kb_instruction.md` if needed).
2. Paste into the Bedrock Agent in AWS.
3. Add or update action groups (Lambda) if tools changed.
4. **Prepare** the agent.
5. Update the **alias** (`BEDROCK_AGENT_ALIAS_ID`) to the new prepared version.
6. Test in the console using **that alias**, not DRAFT.
7. Hard-refresh the web app and use a **new prospect chat** for a clean Bedrock session.

---

## Project structure

```
repready-chatbot/
├── app.py                      # Flask routes, Bedrock Agent invoke, SSE, routing tags
├── config.py                   # Environment variables
├── services/                   # Routing + Bedrock streaming helpers
├── prompts/
│   ├── agent_instruction.md    # → paste into Bedrock Agent instructions
│   └── kb_instruction.md       # → paste into KB instructions
├── data/                       # Example S3/KB content (not used at runtime)
│   ├── products/
│   ├── customer_notes/
│   └── metadatafilter/
├── templates/                  # HTML (landing page + chat app)
├── static/                     # CSS and JS (prospect chats, mode toggle, SSE)
├── Dockerfile
└── requirements.txt
```

`aws_lambdas/` files in this repository are reference copies only. The deployed versions live in AWS console action groups.

---

## Adding a product

1. Add `data/products/<product_id>.txt` with `[PRODUCT — TOPIC]` sections.
2. Add metadata sidecar under `data/metadatafilter/<product_id>.txt.metadata.json` with `"product": "<product_id>"`.
3. Upload the doc **and** sidecar to S3 (sidecar beside the source file as `<filename>.metadata.json`) and re-sync the Knowledge Base.
4. Add the product to the `PRODUCTS` array in `static/js/state.js`.

Customer notes need a sidecar with `"doc_type": "customer_notes"` so they remain retrievable when a product filter is active.

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Agent works in console but not web app | Alias vs DRAFT — update alias to latest prepared version; restart Flask |
| Old “presales assistant” responses | Alias points to old version; orchestration template may duplicate outdated persona |
| Email tool not invoked | Action group enabled on prepared version; instructions mention `send_call_update_email`; new chat (fresh `sessionId`) |
| Person prep returns web data not notes | Agent instructions in prep mode + Customer Notes in KB with correct title; notes sidecars have `doc_type=customer_notes` and are ingested |
| Wrong product’s pricing / facts | Product pill selected; `BEDROCK_KB_ID` set; product metadata on S3 matches pill id; KB re-synced |
| Live mode returns paragraphs not bullets | Agent instructions LIVE format; `[LIVE_CALL:` tag in `inputText` |
| Prep mode too long / markdown essays | Agent instructions PREP format (max 6 bullets); re-Prepare alias |
| Answer appears all at once (no typing) | `streamFinalResponse: True` on `InvokeAgent` (see `services/bedrock_agent_service.py`); agent role needs `bedrock:InvokeModelWithResponseStream` |

---
