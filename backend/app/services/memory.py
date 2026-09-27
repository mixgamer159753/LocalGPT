import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Memory

logger = logging.getLogger("localgpt.memory")


async def get_all_memories(db: AsyncSession) -> list[dict]:
    result = await db.execute(select(Memory).order_by(Memory.key))
    return [
        {"id": m.id, "key": m.key, "value": m.value, "created_at": m.created_at.isoformat()}
        for m in result.scalars().all()
    ]


async def set_memory(db: AsyncSession, key: str, value: str) -> dict:
    result = await db.execute(select(Memory).where(Memory.key == key))
    existing = result.scalar_one_or_none()
    if existing:
        existing.value = value
    else:
        existing = Memory(key=key, value=value)
        db.add(existing)
    await db.commit()
    await db.refresh(existing)
    return {"id": existing.id, "key": existing.key, "value": existing.value}


async def delete_memory(db: AsyncSession, memory_id: int) -> bool:
    result = await db.execute(select(Memory).where(Memory.id == memory_id))
    memory = result.scalar_one_or_none()
    if not memory:
        return False
    await db.delete(memory)
    await db.commit()
    return True


async def build_memory_context(db: AsyncSession) -> str:
    result = await db.execute(select(Memory).order_by(Memory.key))
    memories = result.scalars().all()
    if not memories:
        return ""
    lines = [f"{m.key}: {m.value}" for m in memories]
    return "Here is what you know about the user:\n" + "\n".join(lines)
