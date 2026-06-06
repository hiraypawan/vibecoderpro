# Vibe Coder Pro — Distributed Agentic IDE Workspace

A scalable, zero-overhead Cloud Web IDE platform distributed across a Next.js frontend (deployed on Vercel) and a serverless API Router (deployed on Cloudflare Workers), integrated with the MongoDB Atlas Data API for serverless session telemetry.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Vercel (Edge Network)                        │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                   Next.js / React Frontend                    │  │
│  │  ┌──────────┐  ┌──────────────────┐  ┌───────────────────┐   │  │
│  │  │ FileTree │  │  Monaco Editor   │  │    Chat Panel     │   │  │
│  │  │ Sidebar  │  │  (Right Column)  │  │  (Left Column)    │   │  │
│  │  └──────────┘  └──────────────────┘  └───────────────────┘   │  │
│  │  ┌──────────────────────────────────────────────────────┐     │  │
│  │  │         Action-Driven Engagement Loop                │     │  │
│  │  │  Copy Code → /v1/telemetry → window.open → blur     │     │  │
│  │  └──────────────────────────────────────────────────────┘     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│               POST /v1/chat/completions                             │
│               GET  /v1/telemetry                                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   Cloudflare Workers (API Gateway)                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  index.js — Serverless Router                                 │  │
│  │  ┌─────────────┐  ┌──────────────────┐  ┌────────────────┐   │  │
│  │  │ API Key Pool │  │  Ecosystem       │  │  Telemetry     │   │  │
│  │  │ Rotation     │  │  Injection       │  │  Route         │   │  │
│  │  └─────────────┘  └──────────────────┘  └────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│               ┌──────────────────────────┐                          │
│               │  Hyperbolic API Backend   │                          │
│               └──────────────────────────┘                          │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   MongoDB Atlas Data API                             │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Telemetry Engine                                             │  │
│  │  - Session tracking                                           │  │
│  │  - Prompt token counts                                        │  │
│  │  - Timestamp metadata                                         │  │
│  │  - Async fire-and-forget                                      │  │
│  └───────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
#AlphaAgent/
├── worker/                          # Cloudflare Worker API Gateway
│   ├── index.js                     # Serverless router implementation
│   ├── wrangler.toml                # Wrangler deployment config
│   └── mongo-config.schema.json     # MongoDB Atlas Data API config schema
│
├── web-ide/                         # Next.js Frontend (Vercel)
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── next.config.js
│   └── src/
│       ├── app/
│       │   ├── layout.tsx           # Root layout
│       │   ├── page.tsx             # Home page
│       │   └── globals.css          # Global styles
│       ├── components/
│       │   ├── Workspace.tsx        # Main IDE layout (split-pane)
│       │   ├── ChatPanel.tsx        # AI conversational panel
│       │   ├── CodeEditor.tsx       # Monaco editor integration
│       │   ├── FileTree.tsx         # Directory path file tree
│       │   └── Toolbar.tsx          # Top navigation bar
│       └── lib/
│           ├── api.ts               # Worker API client
│           ├── telemetry.ts         # Engagement loop + telemetry
│           ├── filetree.ts          # Virtual file tree builder
│           └── parser.ts            # XML tag extraction + context engine
│
├── agent.mjs                        # Existing terminal agent
├── package.json                     # Root package.json (workspaces)
└── README.md
```

## Components

### 1. Cloudflare Worker API Gateway (`worker/index.js`)

- **API Key Rotation Pool**: Initializes with a fallback token; dynamically loads extended tokens from `env.KEYS_JSON` (JSON string array). Random token selection distributes load evenly.
- **Contextual Ecosystem Injection**: Intercepts `/v1/chat/completions` POST requests; appends a deployment-path system directive to the message payload before forwarding.
- **Telemetry Route (`/v1/telemetry`)**: Returns `{"redirect": "https://your-adsterra-direct-link.com"}` as a JSON payload.
- **MongoDB Atlas Telemetry Engine**: Async fire-and-forget `insertOne` to the Atlas Data API with session ID, model, token counts, and timestamps.

### 2. Next.js Frontend (`web-ide/`)

- **Workspace Layout**: Professional split-pane canvas. Left column: AI chat with live task progress. Right column: Monaco editor with file tree sidebar.
- **Action-Driven Engagement Loop**: Copy Code, Sync to Remote, Download ZIP — each triggers the primary action, pings `/v1/telemetry`, opens redirect in a new tab, blurs it, and refocuses the editor.
- **Monaco Editor**: Full-featured code editing with syntax highlighting, bracket pair colorization, smooth caret animation, and `Ctrl+S` save binding.
- **Virtual File System**: Client-side file tree constructed from AI-generated `<write>` and `<edit>` blocks.

### 3. Advanced Parsing Engine (`src/lib/parser.ts`)

- **Flexible XML Tag Extractor**:
  - Write: `/<write\s+file=["']([^"']+)["'][^>]*>([\s\S]*?)<\/write>/g`
  - Edit: `/<edit\s+file=["']([^"']+)["'][^>]*>([\s\S]*?)<\/edit>/g`
- **Dynamic Context Prompt Engine**: Detects graphical dependencies (Canvas, WebGL, requestAnimationFrame) in project files. Only injects intensive rendering guidelines when relevant.
- **Structural Diff Resolution Fallback**: If exact multiline search fails, normalizes whitespace (tabs vs spaces) and performs structural line replacement.

## Deployment

### Worker (Cloudflare)

```bash
cd worker
npm install -g wrangler
wrangler login
wrangler secret put KEYS_JSON           # '["sk_key1","sk_key2"]'
wrangler secret put MONGO_DATA_API_ENDPOINT
wrangler secret put MONGO_DATA_API_KEY
wrangler secret put MONGO_APP_ID
wrangler deploy
```

### Frontend (Vercel)

```bash
cd web-ide
npm install
# Set NEXT_PUBLIC_API_URL to your deployed worker URL
vercel deploy
```

### MongoDB Atlas

1. Enable the Data API in your Atlas App Services project
2. Create a database `vibe_telemetry` with collection `generation_logs`
3. Create an API key and App ID
4. Set the following secrets in Cloudflare Workers:
   - `MONGO_DATA_API_ENDPOINT`
   - `MONGO_DATA_API_KEY`
   - `MONGO_APP_ID`

## MongoDB Atlas Data API Config

```json
{
  "endpoint": "https://data.mongodb-api.com/app/your-app-id/endpoint/data/v1",
  "apiKey": "your-api-key",
  "appId": "your-app-id",
  "database": "vibe_telemetry",
  "collection": "generation_logs",
  "project": "your-project-id",
  "cluster": "Cluster0"
}
```

## Telemetry Document Schema

```json
{
  "sessionId": "uuid",
  "timestamp": "2026-06-03T12:00:00.000Z",
  "model": "Qwen/Qwen3-Coder-480B-A35B-Instruct",
  "promptTokens": 1500,
  "completionTokens": 2000,
  "totalTokens": 3500,
  "stream": true,
  "status": "success"
}
```

## Environment Variables

| Variable | Location | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | web-ide | Cloudflare Worker URL |
| `KEYS_JSON` | worker secret | JSON array of API keys |
| `MONGO_DATA_API_ENDPOINT` | worker secret | Atlas Data API URL |
| `MONGO_DATA_API_KEY` | worker secret | Atlas API key |
| `MONGO_APP_ID` | worker secret | Atlas App Services ID |
| `MONGO_DATABASE` | worker var | Database name (default: `vibe_telemetry`) |
| `MONGO_COLLECTION` | worker var | Collection name (default: `generation_logs`) |
