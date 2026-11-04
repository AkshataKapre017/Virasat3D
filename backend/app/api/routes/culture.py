from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import ColumnElement, func, or_, select

from app.api.deps import SessionDep
from app.core.errors import NotFoundError
from app.db.models import CultureItem
from app.schemas.catalog import CultureOut, CulturePage

router = APIRouter(prefix="/culture", tags=["culture"])


def _conditions(q: str | None, region: str | None = None, category: str | None = None) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = []
    if category:
        conditions.append(CultureItem.category == category)
    if region:
        conditions.append(CultureItem.region == region)
    if q:
        like = f"%{q.replace('%', '').replace('_', '')}%"
        conditions.append(
            or_(
                CultureItem.name.ilike(like),
                CultureItem.name_hi.ilike(like),
                CultureItem.region.ilike(like),
                CultureItem.summary.ilike(like),
            )
        )
    return conditions


@router.get("", response_model=CulturePage, summary="Living traditions from the archive")
async def list_culture(
    session: SessionDep,
    category: Annotated[str | None, Query(max_length=80)] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    region: Annotated[str | None, Query(max_length=120)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 48,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CulturePage:
    conditions = _conditions(q, region)
    all_count = await session.scalar(select(func.count(CultureItem.id)).where(*conditions)) or 0
    category_values = (
        await session.scalars(select(CultureItem.category).distinct().order_by(CultureItem.category))
    ).all()
    category_counts = dict(
        (
            await session.execute(
                select(CultureItem.category, func.count(CultureItem.id))
                .where(*conditions)
                .group_by(CultureItem.category)
            )
        ).all()
    )
    regions = (
        await session.execute(
            select(CultureItem.region, func.count(CultureItem.id))
            .where(*_conditions(q, category=category))
            .group_by(CultureItem.region)
            .order_by(CultureItem.region)
        )
    ).all()
    filtered_conditions = _conditions(q, region, category)
    total = await session.scalar(select(func.count(CultureItem.id)).where(*filtered_conditions)) or 0
    rows = (
        await session.scalars(
            select(CultureItem)
            .where(*filtered_conditions)
            .order_by(CultureItem.name, CultureItem.id)
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return CulturePage(
        items=[CultureOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
        all_count=all_count,
        categories=[
            {
                "value": value,
                "label": value.replace("_", " ").replace("-", " ").title(),
                "count": category_counts.get(value, 0),
            }
            for value in category_values
        ],
        regions=[{"value": value, "label": value, "count": count} for value, count in regions],
    )


@router.get("/{item_id}", response_model=CultureOut)
async def culture_detail(session: SessionDep, item_id: int) -> CultureOut:
    item = await session.get(CultureItem, item_id)
    if item is None:
        raise NotFoundError(f"culture item {item_id} not found")
    return CultureOut.model_validate(item)
