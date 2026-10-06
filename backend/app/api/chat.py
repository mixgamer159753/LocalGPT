import logging
import datetime
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
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
)
from app.services.ollama import OllamaService, OllamaUnavailableError
from app.services.streaming import stream_chat
from app.services.web_research import apply_research_context, decide_search, research_for_messages, research_payload
from app.services.memory import build_memory_context, get_all_memories, set_memory, delete_memory
from app.schemas.chat import ContentPart
from sqlalchemy import text

logger = logging.getLogger("localgpt.chat")

router = APIRouter(prefix="/api", tags=["Chat"])

ollama = OllamaService()


def _stream_event(event_type: str, **payload) -> str:
    return json.dumps({"type": event_type, **payload}, ensure_ascii=False) + "\n"


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
        await asyncio.to_thread(ollama.list_models)
    except OllamaUnavailableError as exc:
        ollama_ok = False
        ollama_detail = str(exc)

    db_ok = True
    db_detail = None
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
    except Exception as exc:
        db_ok = False
        db_detail = str(exc)

    return {
        "status": "ok" if (ollama_ok and db_ok) else "degraded",
        "ollama_reachable": ollama_ok,
        "ollama_detail": ollama_detail,
        "database_connected": db_ok,
        "database_detail": db_detail,
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
async def add_memory(body: dict, db: AsyncSession = Depends(get_db)):
    key = body.get("key", "").strip()
    value = body.get("value", "").strip()
    if not key or not value:
        raise HTTPException(status_code=400, detail="key and value are required")
    return await set_memory(db, key, value)


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
    conversation = Conversation(title=body.title or "New Chat", model=body.model)
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
    conversation.title = body.title.strip()
    conversation.updated_at = _utcnow()
    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(conversation_id: int, db: AsyncSession = Depends(get_db)):
    conversation = await db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.delete(conversation)
    await db.commit()


async def _get_memory_context(db: AsyncSession) -> str:
    try:
        return await build_memory_context(db)
    except Exception:
        logger.exception("Failed to build memory context")
        return ""


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    messages = [m.model_dump() for m in request.messages]
    research = await research_for_messages(messages, request.web_search_mode) if request.web_search_enabled else None
    enriched_messages = apply_research_context(messages, research)
    memory_context = await _get_memory_context(db)

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
    conversation_id = await _persist_turn(db, request, answer, metadata)
    return ChatResponse(content=answer, conversation_id=conversation_id, research=metadata)


async def _persist_turn(db: AsyncSession, request: ChatRequest, answer: str, research: dict | None = None) -> int | None:
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
        conversation = Conversation(title=_default_title(first_user_text), model=request.model)
        db.add(conversation)
        await db.flush()
    elif request.model:
        conversation.model = request.model

    last_user_message = next((m for m in reversed(request.messages) if m.role == "user"), None)
    if last_user_message is None:
        return conversation.id

    db.add(Message(conversation_id=conversation.id, role=last_user_message.role, content=_content_to_text(last_user_message.content)))
    db.add(Message(conversation_id=conversation.id, role="assistant", content=answer, research=research))

    # Explicitly touch updated_at so the sidebar sorts correctly
    conversation.updated_at = _utcnow()

    await db.commit()
    return conversation.id


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    messages = [m.model_dump() for m in request.messages]

    conversation = None
    if request.conversation_id:
        conversation = await db.get(Conversation, request.conversation_id)
        if conversation is None:
            raise HTTPException(status_code=404, detail="Conversation not found")

    try:
        request.model = await asyncio.to_thread(ollama.resolve_model, request.model)
    except OllamaUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    created_new_conversation = conversation is None
    if conversation is None:
        first_user_msg = next((m for m in request.messages if m.role == "user"), None)
        first_user_text = _content_to_text(first_user_msg.content) if first_user_msg else ""
        conversation = Conversation(title=_default_title(first_user_text), model=request.model)
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
        try:
            decision = decide_search(messages, request.web_search_mode) if request.web_search_enabled else None
            if decision:
                yield _stream_event("status", message=decision.status, phase="search", query=decision.query)
            research = await research_for_messages(messages, request.web_search_mode) if request.web_search_enabled else None
            if research is not None:
                metadata = research_payload(research)
                yield _stream_event("research", research=metadata)
            yield _stream_event("status", message="Preparing answer..." if research else "Thinking...", phase="answer")
            enriched_messages = apply_research_context(messages, research)
            memory_context = await _get_memory_context(db)

            async for chunk in stream_chat(
                enriched_messages,
                request.model,
                request.temperature,
                request.max_tokens,
                request.response_style,
                memory_context=memory_context,
                thinking_effort=request.thinking_effort,
            ):
                chunks.append(chunk)
                yield _stream_event("token", content=chunk)
            if not "".join(chunks).strip():
                stream_failed = True
                error_message = "The model returned an empty response."
        except OllamaUnavailableError as exc:
            stream_failed = True
            error_message = str(exc)
        except asyncio.CancelledError:
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
                            ))
                        session.add(Message(conversation_id=conversation_id, role="assistant", content=full_reply, research=metadata))
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
        yield _stream_event("done")

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers={
            "X-Conversation-Id": str(conversation_id),
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )
