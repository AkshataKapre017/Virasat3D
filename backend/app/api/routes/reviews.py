from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select

from app.api.deps import SessionDep
from app.core.errors import NotFoundError
from app.core.security import require_permission
from app.db.models import Asset, ReviewEvent
from app.schemas.catalog import Page as PageOf
from app.schemas.verification import ReviewEventOut, ReviewIn, VerificationOut
from app.services.verification import FLAG_LABELS, transition

router = APIRouter(prefix="/assets", tags=["verification"])


async def _asset(session: SessionDep, asset_id: int) -> Asset:
    asset = await session.get(Asset, asset_id)
    if asset is None:
        raise NotFoundError(f"asset {asset_id} not found")
    return asset


def _public_view(asset: Asset) -> VerificationOut:
    flags = (asset.meta or {}).get("verification_flags", [])
    return VerificationOut(
        asset_id=asset.id,
        state=asset.verification_state,
        reason=asset.verification_reason,
        flags=[FLAG_LABELS[f] for f in flags if f in FLAG_LABELS],
    )


@router.get("/{asset_id}/verification", response_model=VerificationOut, summary="Review state of a submission")
async def verification_status(session: SessionDep, asset_id: int) -> VerificationOut:
    return _public_view(await _asset(session, asset_id))


@router.post(
    "/{asset_id}/review",
    response_model=VerificationOut,
    dependencies=[Depends(require_permission("review"))],
    summary="Curator decision: move a submission to a new review state",
)
async def review(session: SessionDep, asset_id: int, body: ReviewIn) -> VerificationOut:
    asset = await _asset(session, asset_id)
    await transition(
        session,
        asset,
        body.to_state,
        actor=f"curator:{body.reviewer}",
        reason=body.reason.strip() if body.reason else None,
        note=body.note,
    )
    await session.commit()
    return _public_view(asset)


@router.get(
    "/{asset_id}/review-history",
    response_model=PageOf[ReviewEventOut],
    dependencies=[Depends(require_permission("review"))],
    summary="Status history with curator notes (archivist role required)",
)
async def review_history(
    session: SessionDep,
    asset_id: int,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PageOf[ReviewEventOut]:
    await _asset(session, asset_id)
    total = await session.scalar(select(func.count(ReviewEvent.id)).where(ReviewEvent.asset_id == asset_id)) or 0
    rows = (
        await session.scalars(
            select(ReviewEvent)
            .where(ReviewEvent.asset_id == asset_id)
            .order_by(ReviewEvent.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    items = [ReviewEventOut.model_validate(r, from_attributes=True) for r in rows]
    return PageOf[ReviewEventOut](items=items, total=total, limit=limit, offset=offset)
