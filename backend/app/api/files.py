import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.database.models import Document, Message
from app.schemas.chat import FileAttachmentOut, FilePreviewOut
from app.services.documents import MAX_FILE_BYTES, clean_filename, extract_document

router = APIRouter(prefix="/api/files", tags=["Files"])


@router.post("", response_model=FileAttachmentOut, status_code=201)
async def upload_file(request: Request, name: str = Query(min_length=1, max_length=1024), db: AsyncSession = Depends(get_db)):
    try:
        name = clean_filename(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_FILE_BYTES:
            raise HTTPException(status_code=413, detail="Each file must be 8 MB or smaller.")
        data.extend(chunk)
    if not data:
        raise HTTPException(status_code=400, detail="This file is empty.")
    try:
        extracted = await asyncio.to_thread(extract_document, name, bytes(data))
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="PDF support is not installed. Update the backend dependencies and restart it.") from exc
    except (ValueError, UnicodeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    document = Document(id=str(uuid.uuid4()), name=name, size=len(data), **extracted)
    db.add(document)
    await db.commit()
    return document


@router.get("/{document_id}", response_model=FilePreviewOut)
async def preview_file(document_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    document = await db.get(Document, str(document_id))
    if document is None:
        raise HTTPException(status_code=404, detail="This file is no longer available.")
    return document


@router.delete("/{document_id}", status_code=204)
async def delete_draft_file(document_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    document = await db.get(Document, str(document_id))
    if document is None:
        return
    groups = (await db.execute(select(Message.attachments).where(Message.attachments.is_not(None)))).scalars()
    if any(item["id"] == str(document_id) for group in groups for item in (group or [])):
        raise HTTPException(status_code=409, detail="This file belongs to a saved conversation.")
    await db.delete(document)
    await db.commit()
