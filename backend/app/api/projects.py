from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.database.models import Project, ProjectMemory, Conversation
from app.schemas.chat import ProjectInput, ProjectOut, MemoryInput
from app.services.memory import get_all_memories, set_memory, delete_memory

router = APIRouter(prefix="/api/projects", tags=["Projects"])


async def require_project(db: AsyncSession, project_id: int) -> Project:
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


@router.get("", response_model=list[ProjectOut])
async def list_projects(db: AsyncSession = Depends(get_db)):
    return (await db.execute(select(Project).order_by(Project.updated_at.desc()))).scalars().all()


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(body: ProjectInput, db: AsyncSession = Depends(get_db)):
    project = Project(**body.model_dump())
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.put("/{project_id}", response_model=ProjectOut)
async def edit_project(project_id: int, body: ProjectInput, db: AsyncSession = Depends(get_db)):
    project = await require_project(db, project_id)
    for name, value in body.model_dump().items():
        setattr(project, name, value)
    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=204)
async def remove_project(project_id: int, db: AsyncSession = Depends(get_db)):
    project = await require_project(db, project_id)
    # Preserve chats and documents when a space is removed.
    await db.execute(update(Conversation).where(Conversation.project_id == project_id).values(project_id=None))
    await db.execute(delete(ProjectMemory).where(ProjectMemory.project_id == project_id))
    await db.delete(project)
    await db.commit()


@router.get("/{project_id}/memories")
async def list_project_memories(project_id: int, db: AsyncSession = Depends(get_db)):
    await require_project(db, project_id)
    return await get_all_memories(db, project_id)


@router.post("/{project_id}/memories")
async def save_project_memory(project_id: int, body: MemoryInput, db: AsyncSession = Depends(get_db)):
    await require_project(db, project_id)
    return await set_memory(db, body.key, body.value, project_id)


@router.delete("/{project_id}/memories/{memory_id}", status_code=204)
async def remove_project_memory(project_id: int, memory_id: int, db: AsyncSession = Depends(get_db)):
    await require_project(db, project_id)
    if not await delete_memory(db, memory_id, project_id):
        raise HTTPException(404, "Memory not found")
