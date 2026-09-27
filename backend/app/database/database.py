from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event

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


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
