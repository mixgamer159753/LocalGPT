from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Memory, Project, ProjectMemory

def _scope(project_id: int | None):
    model = ProjectMemory if project_id is not None else Memory
    statement = select(model)
    if project_id is not None:
        statement = statement.where(ProjectMemory.project_id == project_id)
    return model, statement


async def get_all_memories(db: AsyncSession, project_id: int | None = None) -> list[dict]:
    model, statement = _scope(project_id)
    result = await db.execute(statement.order_by(model.key))
    return [
        {"id": m.id, "key": m.key, "value": m.value, "created_at": m.created_at.isoformat()}
        for m in result.scalars().all()
    ]


async def set_memory(db: AsyncSession, key: str, value: str, project_id: int | None = None) -> dict:
    model, statement = _scope(project_id)
    result = await db.execute(statement.where(model.key == key))
    existing = result.scalar_one_or_none()
    if existing:
        existing.value = value
    else:
        count = (await db.execute(select(func.count()).select_from(statement.subquery()))).scalar_one()
        if count >= 30:
            raise HTTPException(409, "This space has 30 memories. Edit or remove one before adding another.")
        existing = model(key=key, value=value, **({"project_id": project_id} if project_id is not None else {}))
        db.add(existing)
    await db.commit()
    await db.refresh(existing)
    return {"id": existing.id, "key": existing.key, "value": existing.value, "created_at": existing.created_at.isoformat()}


async def delete_memory(db: AsyncSession, memory_id: int, project_id: int | None = None) -> bool:
    model, statement = _scope(project_id)
    result = await db.execute(statement.where(model.id == memory_id))
    memory = result.scalar_one_or_none()
    if not memory:
        return False
    await db.delete(memory)
    await db.commit()
    return True


async def build_memory_context(db: AsyncSession, project_id: int | None = None) -> str:
    """Project chats use only their own instructions and explicitly saved facts."""
    parts = []
    if project_id is not None:
        project = await db.get(Project, project_id)
        if not project:
            raise HTTPException(404, "Project not found")
        parts.append(f"Active project: {project.name}\nDescription: {project.description}")
        if project.instructions:
            parts.append(f"User instructions for this project:\n{project.instructions}")
        if not project.memory_enabled:
            return "\n\n".join(parts)
    memories = await get_all_memories(db, project_id)
    if memories:
        lines, remaining = [], 6000
        for memory in memories[:30]:
            line = f"{memory['key']}: {memory['value']}"[:max(0, min(2100, remaining))]
            if not line:
                break
            lines.append(line)
            remaining -= len(line) + 1
        parts.append("User-saved context (use when relevant):\n" + "\n".join(lines))
    return "\n\n".join(parts)
