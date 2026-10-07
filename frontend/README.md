# LocalGPT Frontend

Next.js app router frontend for LocalGPT. It provides the chat workspace,
conversation sidebar, model picker, streaming message display, empty states, and
responsive layout. Model generation is provided by Atomic Chat through the
FastAPI backend.

The composer offers Auto / Search / Off web search modes. Search replies show
live retrieval progress, expandable source cards, and numbered links. FastAPI
retrieves sources from Exa and stores source metadata with completed replies.
Exa credentials belong only in the backend environment.

The paperclip and composer drop zone accept PDF, DOCX, text, CSV, and code files
alongside existing image attachments. Files show extraction progress, retry,
removal, and searchable text previews with line numbers. FastAPI stores extracted
text locally; saved chats retain files for follow-up questions and show which
files supplied each answer's context. Up to four attachments are allowed per
message (8 MB per document, 3.5 MB per image). Long files use bounded excerpts.
Auto web mode keeps file questions local; Search adds web results using the question.

Streaming accepts backend keepalive events and reports incomplete answers without
discarding partial text. Reported token-limit stops can trigger automatic backend
continuation. Install updated backend dependencies and restart FastAPI when updating.

Code blocks can open a coding workspace with editable files, syntax highlighting,
HTML/CSS/JavaScript preview, desktop/mobile sizes, local browser drafts, and ZIP
export. Generated pages run in a sandboxed frame; optional external assets are
controlled separately. Framework and server code can be edited and downloaded,
but require their own build tool or runtime.

## Scripts

```bash
npm run dev
npm run lint
npm run build
```

Copy `.env.local.example` to `.env.local` for a new installation. With a blank
`NEXT_PUBLIC_API_URL`, the browser connects to its current hostname on backend
port `8000`. Set an explicit API origin when FastAPI is hosted elsewhere.

`NEXT_PUBLIC_API_URL` points to FastAPI, without `/api` or `/v1`. Atomic Chat's
`http://127.0.0.1:1337/v1` address belongs in the backend provider configuration.

See the [project README](../README.md) for installation, Atomic Chat configuration,
LAN access, and Vercel deployment.
