from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Query
from sqlalchemy import ColumnElement, func, or_, select

from app.api.deps import SessionDep
from app.core.errors import NotFoundError
from app.db.models import CultureItem
from app.schemas.catalog import CultureOut
from app.schemas.catalog import Page as PageOf

router = APIRouter(prefix="/culture", tags=["culture"])

Category = Literal["craft", "dance", "festival", "media"]


@router.get("", response_model=PageOf[CultureOut], summary="Living traditions from the archive")
async def list_culture(
    session: SessionDep,
    category: Category | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    region: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 48,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PageOf[CultureOut]:
    conds: list[ColumnElement[bool]] = []
    if category:
        conds.append(CultureItem.category == category)
    if region:
        conds.append(CultureItem.region == region)
    if q:
        like = f"%{q.replace('%', '').replace('_', '')}%"
        conds.append(
            or_(
                CultureItem.name.ilike(like),
                CultureItem.name_hi.ilike(like),
                CultureItem.region.ilike(like),
                CultureItem.summary.ilike(like),
            )
        )
    total = await session.scalar(select(func.count(CultureItem.id)).where(*conds)) or 0
    rows = (
        await session.scalars(
            select(CultureItem).where(*conds).order_by(CultureItem.name, CultureItem.id).limit(limit).offset(offset)
        )
    ).all()
    return PageOf[CultureOut](
        items=[CultureOut.model_validate(row) for row in rows], total=total, limit=limit, offset=offset
    )


@router.get("/{item_id}", response_model=CultureOut)
async def culture_detail(session: SessionDep, item_id: int) -> CultureOut:
    item = await session.get(CultureItem, item_id)
    if item is None:
        raise NotFoundError(f"culture item {item_id} not found")
    return CultureOut.model_validate(item)
