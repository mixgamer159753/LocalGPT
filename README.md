# LocalGPT

LocalGPT is a private local AI chat workspace. The frontend is a Next.js app, the
backend is a FastAPI service, and chat completions are generated through a local
Ollama server. Conversation history is stored in SQLite.

## Project Structure

```text
backend/
  app/
    api/          FastAPI routes for health, models, conversations, and chat
    core/         Environment-driven configuration
    database/     Async SQLAlchemy engine and SQLite models
    schemas/      Pydantic request and response schemas
    services/     Ollama HTTP and streaming clients
  requirements.txt

frontend/
  app/            Next.js app router entrypoints and global styles
  components/     Chat layout, sidebar, model picker, input, and messages
  hooks/          Chat state and streaming orchestration
  lib/            API client helpers
  types/          Shared frontend types
```

## Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

The API defaults to `http://127.0.0.1:8000`.

If Windows returns `[WinError 10013]` when starting Uvicorn, the port is usually
already in use or reserved. Check what owns the port:

```powershell
Get-NetTCPConnection -LocalPort 8000 | Select-Object LocalAddress,LocalPort,State,OwningProcess
```

Then either stop the existing process or run the backend on another port:

```powershell
python -m uvicorn app.main:app --reload --port 8001
```

If you use another backend port, update `frontend/.env.local`:

```text
NEXT_PUBLIC_BACKEND_PORT=8001
```

Useful environment variables:

```text
OLLAMA_HOST=http://localhost:11434
DEFAULT_MODEL=
DATABASE_URL=sqlite+aiosqlite:///./localgpt.db
CORS_ORIGINS=http://localhost:3000
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000
OLLAMA_CONNECT_TIMEOUT=10
OLLAMA_READ_TIMEOUT=300
OLLAMA_KEEP_ALIVE=10m
OLLAMA_NUM_CTX=4096
DEFAULT_MAX_TOKENS=1536
QWEN_MAX_TOKENS=1024
DEBUG=false
WEB_SEARCH_ENABLED=true
WEB_SEARCH_ALWAYS=false
WEB_SEARCH_CACHE_TTL=900
WEB_SEARCH_MAX_RESULTS=6
WEB_SEARCH_MAX_PAGES=3
```

For LM Studio, point `OLLAMA_HOST` at its local server (for example,
`http://127.0.0.1:1234`) and set `LLM_USE_NATIVE_OLLAMA=false`. Set
`DEFAULT_MODEL` to an exact model ID returned by LM Studio's `/v1/models` route.

When `WEB_SEARCH_ENABLED` is true, the backend automatically decides whether the
latest user question needs current web context. For live topics like weather,
news, prices, documentation, sports, finance, travel, and product comparisons,
it searches the web, reads top results, injects source context into the local
model prompt, and streams a subtle status update to the UI. Static questions
continue directly through the local model.

Search is selective by default. Set `WEB_SEARCH_ALWAYS=true` to search most
messages, or disable web research in the frontend settings. Native Ollama mode
is enabled by default; to use an OpenAI-compatible server such as LM Studio, set
`LLM_USE_NATIVE_OLLAMA=false` and point `OLLAMA_HOST` at that server.

For Qwen3 models, LocalGPT applies a shorter output limit by default. You can
raise `QWEN_MAX_TOKENS` if you prefer longer answers over speed.

## LAN Access

To use LocalGPT from another computer or phone on the same network:

1. Set the backend to listen on your network:

```text
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
CORS_ORIGINS=*
```

2. Leave `frontend/.env.local` like this so the browser automatically uses the
same hostname you opened:

```text
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_BACKEND_PORT=8000
NEXT_ALLOWED_DEV_ORIGINS=192.168.1.20
```

3. Start the apps:

```bash
cd backend
python run.py

cd ../frontend
npm run dev:lan
```

4. Open the frontend from another device using your PC's LAN address, for
example `http://192.168.1.20:3000`.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend defaults to `http://localhost:3000` and talks to
the backend on the same browser hostname and `NEXT_PUBLIC_BACKEND_PORT`.
Override the API target with:

```text
NEXT_PUBLIC_API_URL=http://192.168.1.20:8000
NEXT_PUBLIC_BACKEND_PORT=8000
```

### Vercel frontend with a local backend

When the frontend is hosted on Vercel and the backend runs on your PC, expose
the backend through a running HTTPS tunnel such as ngrok. In the Vercel
project's **Settings → Environment Variables**, add `NEXT_PUBLIC_API_URL` as a
**Config** value for Production. Set it to the tunnel's origin only, such as
`https://your-tunnel.ngrok-free.app` (do not append `/api` or `/v1`). This
`NEXT_PUBLIC_` value is included in browser code, so it must not contain
secrets. Save the variable and redeploy the frontend.

Set the backend's `CORS_ORIGINS` to include the Vercel site origin, for example
`https://local-gpt-three.vercel.app`, along with local origins if needed. Keep
the backend and tunnel running while using the Vercel site. Free tunnel URLs
can change; if yours changes, update `NEXT_PUBLIC_API_URL` in Vercel and
redeploy.

## API Overview

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Backend and Ollama reachability |
| `GET` | `/api/models` | Installed Ollama models |
| `GET` | `/api/conversations` | Saved conversation list |
| `POST` | `/api/conversations` | Create an empty conversation |
| `GET` | `/api/conversations/{id}` | Conversation with messages |
| `DELETE` | `/api/conversations/{id}` | Delete a conversation |
| `POST` | `/api/chat` | Non-streaming chat completion |
| `POST` | `/api/chat/stream` | Streaming chat completion as newline-delimited JSON events |

The streaming endpoint sends one JSON event per line: `status` carries a
progress message, `token` carries generated text, `error` reports a failure,
and `done` marks a successfully completed and saved response. Deploy the backend
and frontend together when changing this protocol.

## Validation

```bash
cd frontend
npm run lint
npm run build

cd ../backend
python -m compileall app
python -m unittest discover
```
