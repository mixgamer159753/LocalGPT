import logging
import datetime
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import func
from app.database.database import get_db, AsyncSessionLocal
from app.database.models import Conversation, Message
from app.schemas.chat import (
    ChatRequest,
    ChatResponse,
    ConversationCreate,
    ConversationUpdate,
    ConversationDetailOut,
    ConversationOut,
    ModelInfo,
    MemoryInput,
)
from app.services.ollama import OllamaService, OllamaUnavailableError
from app.services.streaming import stream_chat, StreamResult, StreamStatus
from app.services.documents import apply_file_context, prepare_file_context, delete_unused_documents
from app.services.web_research import apply_research_context, decide_search, research_for_messages, research_payload, research_events, ResearchProgress
from app.api.projects import require_project
from app.services.memory import build_memory_context, get_all_memories, set_memory, delete_memory
from app.schemas.chat import ContentPart
from sqlalchemy import text

logger = logging.getLogger("localgpt.chat")

router = APIRouter(prefix="/api", tags=["Chat"])

ollama = OllamaService()


def _stream_event(event_type: str, **payload) -> str:
    return json.dumps({"type": event_type, **payload}, ensure_ascii=False) + "\n"


async def _with_heartbeats(events):
    """Keep tunnels alive during search or private reasoning without cancelling it."""
    iterator = events.__aiter__()
    pending = None
    try:
        while True:
            if pending is None:
                pending = asyncio.create_task(anext(iterator))
            ready, _ = await asyncio.wait({pending}, timeout=15)
            if not ready:
                yield _stream_event("ping")
                continue
            try:
                event = pending.result()
            except StopAsyncIteration:
                return
            pending = None
            yield event
    finally:
        if pending is not None:
            pending.cancel()
            try:
                await pending
            except (asyncio.CancelledError, StopAsyncIteration):
                pass
        await iterator.aclose()


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _content_to_text(content: str | list | dict) -> str:
    """Convert message content to plain text for DB storage."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(part.get("text", ""))
            elif isinstance(part, ContentPart) and part.type == "text":
                parts.append(part.text or "")
        text = " ".join(parts).strip()
        return text if text else "[Image attached]"
    return str(content)


def _default_title(text: str) -> str:
    text = text.strip().replace("\n", " ")
    return (text[:47] + "...") if len(text) > 50 else (text or "New Chat")


@router.get("/health")
async def health():
    ollama_ok = True
    ollama_detail = None
    try:
        models = await asyncio.to_thread(ollama.list_models)
        if not models:
            ollama_ok = False
            ollama_detail = "No model loaded. Load a model in Atomic Chat and refresh."
    except OllamaUnavailableError as exc:
        ollama_ok = False
        ollama_detail = str(exc)

    db_ok = True
    db_detail = None
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
        db_detail = "The database cannot be reached. Check the backend logs."

    return {
        "status": "ok" if (ollama_ok and db_ok) else "degraded",
        "ollama_reachable": ollama_ok,
        "ollama_detail": ollama_detail,
        "database_connected": db_ok,
        "database_detail": db_detail,
    }


@router.get("/diagnostics")
async def diagnostics(request: Request):
    from app.core.config import OLLAMA_CHAT_URL, OLLAMA_TAGS_URL, DEFAULT_MODEL, LLM_USE_NATIVE_OLLAMA, CORS_ORIGINS, EXA_API_KEY, WEB_SEARCH_ENABLED, WEB_SEARCH_PROVIDER
    from urllib.parse import urlsplit, urlunsplit

    def public_url(value):
        parsed = urlsplit(value)
        host = parsed.hostname or ""
        if ":" in host:
            host = f"[{host}]"
        return urlunsplit((parsed.scheme, host + (f":{parsed.port}" if parsed.port else ""), parsed.path, "", ""))

    models, provider_error, database_error = [], None, None
    try:
        raw_models = await asyncio.to_thread(ollama.list_models)
        names = [(item.get("name") or item.get("model")) if LLM_USE_NATIVE_OLLAMA else item.get("id") for item in raw_models]
        models = [name for name in names if isinstance(name, str) and name and name != "unknown"]
    except OllamaUnavailableError:
        provider_error = "Cannot read the model list. Start Atomic Chat's API and check OLLAMA_HOST in backend/.env."
    except Exception:
        provider_error = "The model server returned an invalid model list. Check its API URL."
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        database_error = "Cannot read the database. Check DATABASE_URL and the backend logs."
    origin = request.headers.get("origin", "")
    provider = ("exa" if EXA_API_KEY else "legacy") if WEB_SEARCH_PROVIDER == "auto" else WEB_SEARCH_PROVIDER
    return {
        "backend": "ok", "database_connected": database_error is None, "database_detail": database_error,
        "provider": "Ollama" if LLM_USE_NATIVE_OLLAMA else "Atomic Chat / OpenAI compatible",
        "provider_reachable": provider_error is None, "provider_detail": provider_error,
        "chat_url": public_url(OLLAMA_CHAT_URL), "models_url": public_url(OLLAMA_TAGS_URL),
        "default_model": DEFAULT_MODEL, "models": models,
        "frontend_origin_allowed": not origin or "*" in CORS_ORIGINS or origin in CORS_ORIGINS,
        "search_enabled": WEB_SEARCH_ENABLED, "search_provider": provider, "exa_configured": bool(EXA_API_KEY),
    }


@router.get("/models", response_model=list[ModelInfo])
async def list_models():
    try:
        models = await asyncio.to_thread(ollama.list_models)
    except OllamaUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    from app.core.config import LLM_USE_NATIVE_OLLAMA
    if LLM_USE_NATIVE_OLLAMA:
        return [
            ModelInfo(
                name=m.get("name") or m.get("model", "unknown"),
                size=m.get("size"),
                modified_at=m.get("modified_at"),
                family=(m.get("details") or {}).get("family"),
                parameter_size=(m.get("details") or {}).get("parameter_size"),
                quantization_level=(m.get("details") or {}).get("quantization_level"),
                context_length=(m.get("details") or {}).get("context_length"),
            )
            for m in models
        ]
    return [
        ModelInfo(name=m.get("id", "unknown"))
        for m in models
    ]


@router.get("/memories")
async def list_memories(db: AsyncSession = Depends(get_db)):
    return await get_all_memories(db)


@router.post("/memories")
async def add_memory(body: MemoryInput, db: AsyncSession = Depends(get_db)):
    return await set_memory(db, body.key, body.value)


@router.delete("/memories/{memory_id}", status_code=204)
async def remove_memory(memory_id: int, db: AsyncSession = Depends(get_db)):
    deleted = await delete_memory(db, memory_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Memory not found")


@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Conversation)
        .outerjoin(Message, Message.conversation_id == Conversation.id)
        .group_by(Conversation.id)
        .having(func.count(Message.id) > 0)
        .order_by(Conversation.updated_at.desc())
    )
    return result.scalars().all()


@router.post("/conversations", response_model=ConversationOut)
async def create_conversation(body: ConversationCreate, db: AsyncSession = Depends(get_db)):
    if body.project_id is not None:
        await require_project(db, body.project_id)
    conversation = Conversation(title=body.title or "New Chat", model=body.model, project_id=body.project_id)
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailOut)
async def get_conversation(conversation_id: int, db: AsyncSession = Depends(get_db)):
    conversation = await db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.refresh(conversation, attribute_names=["messages"])
    return conversation


@router.patch("/conversations/{conversation_id}", response_model=ConversationOut)
async def update_conversation(
    conversation_id: int,
    body: ConversationUpdate,
    db: AsyncSession = Depends(get_db),
):
    conversation = await db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if body.title is not None:
        if not body.title.strip():
            raise HTTPException(400, "Title cannot be empty")
        conversation.title = body.title.strip()
    if "project_id" in body.model_fields_set:
        if body.project_id is not None:
            await require_project(db, body.project_id)
        conversation.project_id = body.project_id
    conversation.updated_at = _utcnow()
    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(conversation_id: int, db: AsyncSession = Depends(get_db)):
    conversation = await db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    groups = (await db.execute(select(Message.attachments).where(Message.conversation_id == conversation_id))).scalars()
    file_ids = {item["id"] for group in groups for item in (group or [])}
    await db.delete(conversation)
    await db.flush()
    await delete_unused_documents(db, file_ids)
    await db.commit()


async def _get_memory_context(db: AsyncSession, project_id: int | None = None) -> str:
    try:
        return await build_memory_context(db, project_id)
    except Exception:
        logger.exception("Failed to build memory context")
        return ""


async def _resolve_project(db: AsyncSession, request: ChatRequest):
    if request.conversation_id:
        conversation = await db.get(Conversation, request.conversation_id)
        if not conversation:
            raise HTTPException(404, "Conversation not found")
        if request.project_id is not None and request.project_id != conversation.project_id:
            raise HTTPException(409, "This chat belongs to a different space. Reopen it before sending.")
        request.project_id = conversation.project_id
    if request.project_id is not None:
        await require_project(db, request.project_id)


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    await _resolve_project(db, request)
    messages = [m.model_dump() for m in request.messages]
    files = await prepare_file_context(db, messages, request.conversation_id)
    search_enabled = request.web_search_enabled and (not files.text or request.web_search_mode == "always")
    research = await research_for_messages(messages, request.web_search_mode, request.research_depth) if search_enabled else None
    enriched_messages = apply_file_context(apply_research_context(messages, research), files)
    memory_context = await _get_memory_context(db, request.project_id)

    try:
        request.model = await asyncio.to_thread(ollama.resolve_model, request.model)
        answer = await asyncio.to_thread(
            ollama.chat,
            enriched_messages,
            request.model,
            request.temperature,
            request.max_tokens,
            request.response_style,
            memory_context,
            request.thinking_effort,
        )
    except OllamaUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    metadata = research_payload(research)
    conversation_id = await _persist_turn(db, request, answer, metadata, files.attachments, files.sources)
    return ChatResponse(content=answer, conversation_id=conversation_id, research=metadata)


async def _persist_turn(db: AsyncSession, request: ChatRequest, answer: str, research: dict | None = None, attachments: list | None = None, file_sources: list | None = None) -> int | None:
    """Save the latest user message + assistant reply to a conversation."""
    if not request.messages:
        return request.conversation_id

    conversation = None
    if request.conversation_id:
        conversation = await db.get(Conversation, request.conversation_id)
        if conversation is None:
            raise HTTPException(status_code=404, detail="Conversation not found")

    created_new_conversation = conversation is None
    if created_new_conversation:
        first_user_msg = next((m for m in request.messages if m.role == "user"), None)
        first_user_text = _content_to_text(first_user_msg.content) if first_user_msg else ""
        conversation = Conversation(title=_default_title(first_user_text), model=request.model, project_id=request.project_id)
        db.add(conversation)
        await db.flush()
    elif request.model:
        conversation.model = request.model

    last_user_message = next((m for m in reversed(request.messages) if m.role == "user"), None)
    if last_user_message is None:
        return conversation.id

    if request.persist_user_message:
        db.add(Message(conversation_id=conversation.id, role=last_user_message.role, content=_content_to_text(last_user_message.content), attachments=attachments))
    db.add(Message(conversation_id=conversation.id, role="assistant", content=answer, research=research, attachments=file_sources))

    # Explicitly touch updated_at so the sidebar sorts correctly
    conversation.updated_at = _utcnow()

    await db.commit()
    return conversation.id


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    await _resolve_project(db, request)
    messages = [m.model_dump() for m in request.messages]

    conversation = None
    if request.conversation_id:
        conversation = await db.get(Conversation, request.conversation_id)
        if conversation is None:
            raise HTTPException(status_code=404, detail="Conversation not found")

    files = await prepare_file_context(db, messages, request.conversation_id)
    search_enabled = request.web_search_enabled and (not files.text or request.web_search_mode == "always")

    try:
        request.model = await asyncio.to_thread(ollama.resolve_model, request.model)
    except OllamaUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    created_new_conversation = conversation is None
    if conversation is None:
        first_user_msg = next((m for m in request.messages if m.role == "user"), None)
        first_user_text = _content_to_text(first_user_msg.content) if first_user_msg else ""
        conversation = Conversation(title=_default_title(first_user_text), model=request.model, project_id=request.project_id)
        db.add(conversation)
        await db.commit()
        await db.refresh(conversation)
    else:
        conversation.model = request.model
        await db.commit()

    conversation_id = conversation.id
    last_user_message = next((m for m in reversed(messages) if m["role"] == "user"), None)

    async def generate():
        chunks: list[str] = []
        stream_failed = False
        error_message = ""
        metadata = None
        result = StreamResult()
        try:
            if files.names:
                yield _stream_event("files", attachments=files.sources)
                yield _stream_event("status", message=f"Reading {len(files.names)} attached file(s)...", phase="answer")
            search_mode = "always" if request.research_depth == "deep" and request.web_search_mode != "off" else request.web_search_mode
            decision = decide_search(messages, search_mode) if search_enabled else None
            if decision:
                yield _stream_event("status", message=decision.status, phase="search", query=decision.query, stage="search", depth=request.research_depth)
            research = None
            if search_enabled:
                async for event in research_events(messages, request.web_search_mode, request.research_depth):
                    if isinstance(event, ResearchProgress):
                        yield _stream_event("status", message=event.message, phase="search", stage=event.stage, depth=request.research_depth)
                    else:
                        research = event
            if research is not None:
                metadata = research_payload(research)
                yield _stream_event("research", research=metadata)
            yield _stream_event("status", message="Preparing answer..." if research else "Thinking...", phase="answer")
            enriched_messages = apply_file_context(apply_research_context(messages, research), files)
            memory_context = await _get_memory_context(db, request.project_id)

            async for chunk in stream_chat(
                enriched_messages,
                request.model,
                request.temperature,
                request.max_tokens,
                request.response_style,
                memory_context=memory_context,
                thinking_effort=request.thinking_effort,
                result=result,
            ):
                if isinstance(chunk, StreamStatus):
                    yield _stream_event("status", message=chunk.message, phase="answer")
                    continue
                chunks.append(chunk)
                yield _stream_event("token", content=chunk)
            if not "".join(chunks).strip():
                stream_failed = True
                error_message = "The model returned an empty response."
        except OllamaUnavailableError as exc:
            stream_failed = True
            error_message = str(exc)
        except (asyncio.CancelledError, GeneratorExit):
            stream_failed = True
            logger.info("Streaming cancelled by client; reply was not saved")
            raise
        except Exception:
            logger.exception("Error during streaming; reply was not saved")
            stream_failed = True
            error_message = "The response stream failed. Please try again."
        finally:
            full_reply = "".join(chunks)
            if stream_failed and created_new_conversation:
                try:
                    async with AsyncSessionLocal() as session:
                        stale = await session.get(Conversation, conversation_id)
                        if stale:
                            await session.delete(stale)
                            await session.commit()
                except Exception:
                    logger.exception("Failed to clean up empty failed conversation")

            if not stream_failed and full_reply.strip():
                try:
                    async with AsyncSessionLocal() as session:
                        if last_user_message is not None and request.persist_user_message:
                            session.add(Message(
                                conversation_id=conversation_id,
                                role=last_user_message["role"],
                                content=_content_to_text(last_user_message["content"]),
                                attachments=files.attachments,
                            ))
                        session.add(Message(conversation_id=conversation_id, role="assistant", content=full_reply, research=metadata, generation_warning=result.warning, attachments=files.sources))
                        # Touch updated_at for sidebar ordering
                        conv = await session.get(Conversation, conversation_id)
                        if conv:
                            conv.updated_at = _utcnow()
                        await session.commit()
                except Exception:
                    logger.exception("Failed to persist streaming messages")
                    stream_failed = True
                    error_message = "The response was generated but could not be saved."

        if stream_failed:
            yield _stream_event("error", message=error_message or "The response stream failed.")
            return
        yield _stream_event("done", finish_reason=result.finish_reason, warning=result.warning)

    return StreamingResponse(
        _with_heartbeats(generate()),
        media_type="application/x-ndjson",
        headers={
            "X-Conversation-Id": str(conversation_id),
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )
