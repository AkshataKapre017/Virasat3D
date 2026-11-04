from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy import event, inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.schema import CreateColumn

from app.core.config import Settings, get_settings


def _sqlite_pragmas(dbapi_conn: Any, _record: Any) -> None:
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.execute("PRAGMA busy_timeout=30000")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.close()


def build_engine(settings: Settings) -> AsyncEngine:
    kwargs: dict[str, Any] = {"echo": settings.db_echo, "pool_pre_ping": True}
    if settings.is_sqlite:
        path = settings.database_url.split("///", 1)[-1]
        if path and path != ":memory:":
            from pathlib import Path

            Path(path).parent.mkdir(parents=True, exist_ok=True)
        kwargs["connect_args"] = {"timeout": 30}
    else:
        kwargs.update(pool_size=10, max_overflow=20)
    engine = create_async_engine(settings.database_url, **kwargs)
    if settings.is_sqlite:
        event.listen(engine.sync_engine, "connect", _sqlite_pragmas)
    return engine


def _upgrade_sqlite_schema(conn: Connection) -> None:
    """Bring an existing SQLite database up to date with the current models.

    `MetaData.create_all` only creates missing *tables*: it never adds columns to a table that
    already exists. The SQLite quick-start therefore silently kept the schema of the first run,
    and every query touching a newly added column failed with `no such column` (a 500 from the
    API and a failing live-events poller). Add the missing columns/indexes here so starting the
    API after an upgrade is enough. Idempotent, so it is safe on every start-up.
    """
    from app.db import models  # noqa: F401  (register models)
    from app.db.base import Base

    inspector = inspect(conn)
    existing_tables = set(inspector.get_table_names())
    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        existing_columns = {col["name"] for col in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in existing_columns:
                continue
            # SQLite can add a NOT NULL column only when it has a server-side default, which is
            # why new required columns in migrations must declare one.
            ddl = str(CreateColumn(column).compile(dialect=conn.dialect))
            conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN {ddl}'))

    inspector = inspect(conn)
    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        existing_columns = {col["name"] for col in inspector.get_columns(table.name)}
        existing_indexes = {ix["name"] for ix in inspector.get_indexes(table.name)}
        for index in table.indexes:
            if not index.name or index.name in existing_indexes:
                continue
            if any(col.name not in existing_columns for col in index.columns):
                continue
            index.create(conn)


class Database:
    """Owns the engine + session factory; one instance per process."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.engine = build_engine(self.settings)
        self.sessionmaker = async_sessionmaker(self.engine, expire_on_commit=False, autoflush=False)

    @property
    def dialect(self) -> str:
        return self.engine.dialect.name

    async def session(self) -> AsyncIterator[AsyncSession]:
        async with self.sessionmaker() as s:
            yield s

    async def create_all(self) -> None:
        """Used by tests and the SQLite quick-start. Production uses Alembic migrations."""
        from app.db import models  # noqa: F401  (register models)
        from app.db.base import Base

        async with self.engine.begin() as conn:
            if self.dialect == "postgresql":
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await conn.run_sync(Base.metadata.create_all)
            if self.dialect == "sqlite":
                await conn.run_sync(_upgrade_sqlite_schema)

    async def dispose(self) -> None:
        await self.engine.dispose()
