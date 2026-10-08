from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event, inspect, text

from app.core.config import DATABASE_URL

# Enable WAL mode for SQLite to prevent "database is locked" errors
_connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    _connect_args["connect_args"] = {"check_same_thread": False}

engine = create_async_engine(DATABASE_URL, echo=False, **_connect_args)


# Enable WAL mode at connection time for SQLite
@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()


AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


class Base(DeclarativeBase):
    pass


async def init_db() -> None:
    """Create tables on startup if they don't exist yet."""
    from app.database import models  # noqa: F401  (register models on Base)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add optional metadata to existing installations; keep all chat data.
        columns = await conn.run_sync(lambda connection: inspect(connection).get_columns("messages"))
        existing = {column["name"] for column in columns}
        for name, sql_type in (("research", "JSON"), ("attachments", "JSON"), ("generation_warning", "TEXT")):
            if name not in existing:
                await conn.execute(text(f"ALTER TABLE messages ADD COLUMN {name} {sql_type}"))
        columns = await conn.run_sync(lambda connection: inspect(connection).get_columns("conversations"))
        if "project_id" not in {column["name"] for column in columns}:
            await conn.execute(text("ALTER TABLE conversations ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL"))

    # Clean up empty conversations (from previous crashes)
    from sqlalchemy import func, select
    from app.database.models import Conversation, Message

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Conversation).outerjoin(
                Message, Message.conversation_id == Conversation.id
            ).group_by(Conversation.id).having(func.count(Message.id) == 0)
        )
        empty = result.scalars().all()
        for conv in empty:
            await session.delete(conv)
        if empty:
            await session.commit()
            import logging
            logging.getLogger("localgpt").info("Cleaned up %d empty conversations", len(empty))

    # Interrupted uploads can leave unreferenced drafts; expire them after a day.
    import datetime
    from app.database.models import Document
    from app.services.documents import delete_unused_documents
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)
    async with AsyncSessionLocal() as session:
        ids = set((await session.execute(select(Document.id).where(Document.created_at < cutoff))).scalars())
        await delete_unused_documents(session, ids)
        await session.commit()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
