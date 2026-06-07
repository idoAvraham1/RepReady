# RepReady

> *"Always know your next move."*

RepReady is a real-time sales call coach for B2B reps. It helps you **prepare before a call** and **respond during a live call** when an objection lands or a detail slips your mind. Answers are grounded in your approved product knowledge and prospect notes via an **AWS Bedrock Agent** — not model memory.

---

## Two modes

Every prospect chat runs in one of two phases, toggled in the UI:

| Mode | When to use | Response style |
|------|-------------|----------------|
| **Prep** | Before or after the call — research, objections, background | Calm scannable notes — max **6 bullets** (`•`) |
| **Live on call** | On the phone right now | Urgent coach bullets — exactly **4 lines** (`•`), last line is **Next move:** |

The UI shifts tone with the mode: Prep feels relaxed; Live uses a focused “win this moment” layout.

---

## How it works

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (templates/ + static/)                                 │
│  Prospect chats · Prep/Live toggle · Product pill · SSE stream  │
└────────────────────────────┬────────────────────────────────────┘
                             │ POST /chat  (question, mode, product,
                             │              prospect, session_id)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  app.py (Flask)                                                 │
│  Embeds routing tags in inputText · invokes Bedrock Agent       │
│  Streams tokens via SSE · logs knowledge gaps locally           │
└────────────────────────────┬────────────────────────────────────┘
                             │ bedrock-agent-runtime:InvokeAgent
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  AWS Bedrock Agent (configured in console — not in this repo)   │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │ Agent        │  │ Knowledge Base  │  │ Action groups    │  │
│  │ instructions │  │ (S3 sync)       │  │ (Lambda / MCP)   │  │
│  │ + orchestration│ │ product docs   │  │ calendar, Tavily │  │
│  │              │  │ customer notes  │  │ email, etc.      │  │
│  └──────────────┘  └─────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**This repository is the web app only.** Retrieval, generation, tool calls, and KB lookup are handled by the Bedrock Agent you configure in AWS. The Flask app passes context (mode, prospect, product) and streams the agent response back to the browser.

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
└── metadatafilter/        # Example .metadata.json sidecars for product filtering
```

Product files use `[PRODUCT — TOPIC]` section blocks. Customer Notes use the title format:

`Customer Notes: [Name] — [Company]`

Sync these to S3 and re-run KB ingestion in Bedrock when content changes.

### `customer_notes/` (repo root)

Duplicate/reference copies of prospect note files may also exist at the repo root. The canonical examples for KB structure are under `data/customer_notes/`.

---

## Agent tools (AWS Lambda action groups)

Tools are implemented as **Lambda action groups** on the Bedrock Agent, not in this repo. Contracts are documented in the header of `app.py`.

| Tool | Purpose |
|------|---------|
| `get_todays_calls` | Today's calendar calls (Google Calendar via service account) |
| `get_company_context` | Company background via Tavily — never for person prep |
| `send_call_update_email` | Email team lead via Resend when the rep explicitly asks (optional) |

---

## Features

| Feature | Description |
|---------|-------------|
| **Prep / Live phases** | Per-conversation mode with distinct UI and agent response format |
| **Prospect chats** | One chat per prospect; name and company sent as agent context |
| **Product scoping** | Product pill filters agent context (`repready_pro`, `coachai`, …) |
| **SSE streaming** | Token-by-token responses in the browser |
| **Session memory** | Bedrock `sessionId` per chat — follow-ups work without repeating context |
| **Routing tags** | App embeds `[mode: prep/live]`, `[KB_LOOKUP_PERSON: …]`, `[LIVE_CALL: …]` in `inputText` |
| **Knowledge gaps** | Questions the KB cannot answer are logged to `gaps_log.jsonl` |
| **Gap dashboard** | Review gaps at `GET /gaps` (Knowledge Gaps page in the UI) |

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Backend | Flask, boto3 |
| AI | Amazon Bedrock **Agent** + Knowledge Base |
| Tools | AWS Lambda action groups (Calendar, Tavily, Resend, …) |
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

\*On EC2, prefer an IAM instance role instead of keys in `.env`.

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

**Persist knowledge gaps across container restarts:**

```bash
docker run -p 5000:5000 --env-file .env \
  -v $(pwd)/gaps_log.jsonl:/app/gaps_log.jsonl \
  repready
```

---

## Usage

1. **Open the app** → create a **New Prospect Chat** (name + optional company).
2. **Prep mode** (default) — ask about the prospect, company, objections, or product. Use the prep chips or type freely.
3. **Select product** via the pill in the input bar when the question is product-specific.
4. **Live on call** — switch the toggle when on the phone. Describe what's happening; get 4 coached bullets + Next move.
5. **Email team lead** (if action group is deployed) — e.g. *"Send mail to my team lead that Alex is still not sure about the product."*
6. **Knowledge Gaps** — open the Gaps page to see questions the KB could not answer.

---

## API routes

| Route | Method | Description |
|-------|--------|-------------|
| `/` | GET | Web UI |
| `/chat` | POST | SSE stream — body: `question`, `mode`, `product`, `session_id`, `prospect_name`, `prospect_company`, `question_type` |
| `/init` | GET | Today's calls via agent (optional; returns `[]` on failure) |
| `/gaps` | GET | Knowledge gaps grouped by product |

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

## Knowledge gaps

When the agent signals it cannot answer from the KB (canonical fallback phrase or variants like *"logged this for the team to review"*), the question is appended to `gaps_log.jsonl`:

```json
{"question": "...", "product": "signalhq", "timestamp": "..."}
```

Gap detection logic lives in `services/gap_service.py` and should stay aligned with `prompts/agent_instruction.md` global rule 3.

---

## Project structure

```
repready-chatbot/
├── app.py                      # Flask routes, Bedrock Agent invoke, SSE, routing tags
├── config.py                   # Environment variables
├── services/
│   └── gap_service.py          # Gap detection and JSONL logging
├── prompts/
│   ├── agent_instruction.md    # → paste into Bedrock Agent instructions
│   └── kb_instruction.md       # → paste into KB instructions
├── data/                       # Example S3/KB content (not used at runtime)
│   ├── products/
│   ├── customer_notes/
│   └── metadatafilter/
├── templates/                  # HTML (landing, app, gaps, best practices)
├── static/                     # CSS and JS (Prep/Live UI, prospect chats)
├── gaps_log.jsonl              # Runtime gap log (gitignored in production)
├── Dockerfile
└── requirements.txt
```

---

## Adding a product

1. Add `data/products/<product_id>.txt` with `[PRODUCT — TOPIC]` sections.
2. Add metadata sidecar under `data/metadatafilter/<product_id>.txt.metadata.json` with `"product": "<product_id>"`.
3. Upload to S3 and re-sync the Knowledge Base.
4. Add the product to the `PRODUCTS` array in `static/js/app.js`.

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Agent works in console but not web app | Alias vs DRAFT — update alias to latest prepared version; restart Flask |
| Old “presales assistant” responses | Alias points to old version; orchestration template may duplicate outdated persona |
| Email tool not invoked | Action group enabled on prepared version; instructions mention `send_call_update_email`; new chat (fresh `sessionId`) |
| Person prep returns web data not notes | Agent instructions + `[KB_LOOKUP_PERSON]` routing; Customer Notes in KB with correct title |
| Live mode returns paragraphs not bullets | Agent instructions LIVE format; `[LIVE_CALL:` tag in `inputText` |
| Prep mode too long / markdown essays | Agent instructions PREP format (max 6 bullets); re-Prepare alias |
| Gaps not logged | `gap_service.py` markers vs actual agent fallback wording |
| Gaps lost on redeploy | Mount `gaps_log.jsonl` as a Docker volume |

---

## License

Proprietary — NorthStar Software / RepReady.
