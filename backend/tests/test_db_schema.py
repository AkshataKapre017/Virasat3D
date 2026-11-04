"""The SQLite quick-start must upgrade databases created by an older build.

`create_all` only creates missing tables, so a database made before a column was added kept its
old schema and every query touching the new column failed with `no such column` (asset endpoints
returned 500 and the live-events poller logged the same error on every tick).
"""

from __future__ import annotations

from sqlalchemy import inspect, select, text

from app.core.config import Settings
from app.db.models import Asset
from app.db.session import Database


async def test_create_all_adds_columns_and_tables_introduced_by_a_newer_build(settings: Settings) -> None:
    db = Database(settings)
    await db.create_all()
    try:
        # Recreate the pre-verification schema: drop the two columns, their index and the new table.
        async with db.engine.begin() as conn:
            await conn.execute(text("DROP INDEX IF EXISTS ix_assets_verification_state"))
            await conn.execute(text("ALTER TABLE assets DROP COLUMN verification_state"))
            await conn.execute(text("ALTER TABLE assets DROP COLUMN verification_reason"))
            await conn.execute(text("DROP TABLE review_events"))

        await db.create_all()  # what `heritagelens migrate` / API start-up runs

        async with db.engine.connect() as conn:
            columns = await conn.run_sync(lambda c: {col["name"] for col in inspect(c).get_columns("assets")})
            indexes = await conn.run_sync(lambda c: {ix["name"] for ix in inspect(c).get_indexes("assets")})
            tables = await conn.run_sync(lambda c: set(inspect(c).get_table_names()))
            published = await conn.scalar(text("SELECT COUNT(*) FROM assets WHERE verification_state = 'published'"))

        assert {"verification_state", "verification_reason"} <= columns
        assert "ix_assets_verification_state" in indexes
        assert "review_events" in tables
        assert published == 0  # the server default backfills existing rows

        # The exact query that used to fail.
        async with db.sessionmaker() as session:
            assert (await session.scalars(select(Asset))).all() == []
    finally:
        await db.dispose()


async def test_create_all_is_idempotent(settings: Settings) -> None:
    db = Database(settings)
    try:
        await db.create_all()
        await db.create_all()
    finally:
        await db.dispose()
