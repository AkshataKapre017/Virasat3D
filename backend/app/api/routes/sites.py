from __future__ import annotations

import hashlib
from collections import Counter
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import or_, select

from app.api.deps import ServicesDep, SessionDep
from app.core.errors import AppError, ConflictError, NotFoundError
from app.core.security import require_permission
from app.db.models import (
    Asset,
    AssetKind,
    AssetStatus,
    Chunk,
    Journey,
    JourneyStop,
    Site,
    Twin,
)
from app.schemas.catalog import (
    JobOut,
    JourneyRef,
    ModelModeOut,
    ModelModesOut,
    NearbySite,
    SiteCreate,
    SiteDetail,
    SiteOut,
    TwinOut,
    TwinRequest,
)
from app.services.catalog import cover_url, index_site, site_counts
from app.services.geo import haversine_km
from app.services.procedural import ensure_procedural_mesh_twin, ensure_procedural_twin
from app.services.search import asset_brief

router = APIRouter(prefix="/sites", tags=["sites"])

DISABLED_SITE_SLUGS = {
    "golden-temple",
    "golconda-fort",
    "charminar",
    "meenakshi",
    "tawang-monastery",
    "shaniwar-wada",
    "ajanta-caves",
}

DETAILED_METHODS = ("depth-relief", "gaussian-splat", "photogrammetry")


def _site_slug_filter() -> Any:
    return Site.slug.notin_(sorted(DISABLED_SITE_SLUGS))


def site_out(site: Site, assets: dict[int, int], twins: dict[int, int], cover_source: str | None = None) -> SiteOut:
    out = SiteOut.model_validate(site)
    out.cover_url = cover_url(site.cover_asset_id)
    out.cover_source_url = cover_source
    out.asset_count, out.twin_count = assets.get(site.id, 0), twins.get(site.id, 0)
    return out


def twin_out(t: Twin) -> TwinOut:
    out = TwinOut.model_validate(t)
    out.url = f"/api/v1/twins/{t.id}/file"
    out.model_kind = "procedural" if t.method == "procedural" else "detailed"
    return out


async def get_site(session: SessionDep, slug: str) -> Site:
    if slug in DISABLED_SITE_SLUGS:
        raise NotFoundError(f"site {slug!r} not found")
    site = await session.scalar(select(Site).where(Site.slug == slug))
    if site is None:
        raise NotFoundError(f"site {slug!r} not found")
    return site


async def active_job_out(services: ServicesDep, session: SessionDep) -> JobOut | None:
    job = await services.queue.active_reconstruction(session)
    return JobOut.model_validate(job) if job is not None else None


@router.get("", response_model=list[SiteOut], summary="All heritage sites")
async def list_sites(
    session: SessionDep,
    category: str | None = None,
    state: str | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
) -> list[SiteOut]:
    conds: list[Any] = [_site_slug_filter()]
    if category:
        conds.append(Site.category == category)
    if state:
        conds.append(Site.state == state)
    if q:
        like = f"%{q.replace('%', '')}%"
        conds.append(or_(Site.name.ilike(like), Site.name_native.ilike(like)))
    rows = (await session.scalars(select(Site).where(*conds).order_by(Site.name))).all()
    assets, twins = await site_counts(session)
    cover_ids = [s.cover_asset_id for s in rows if s.cover_asset_id]
    sources = dict((await session.execute(select(Asset.id, Asset.source_url).where(Asset.id.in_(cover_ids)))).all())
    return [site_out(s, assets, twins, sources.get(s.cover_asset_id)) for s in rows]


@router.get("/geojson", summary="Sites as GeoJSON points (map layer)")
async def sites_geojson(session: SessionDep) -> dict[str, Any]:
    rows = (await session.scalars(select(Site).where(_site_slug_filter()).order_by(Site.id))).all()
    assets, twins = await site_counts(session)
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": s.id,
                "geometry": {"type": "Point", "coordinates": [s.lon, s.lat]},
                "properties": {
                    "id": s.id,
                    "slug": s.slug,
                    "name": s.name,
                    "name_native": s.name_native,
                    "category": s.category,
                    "era_start": s.era_start,
                    "era_label": s.era_label,
                    "unesco": s.unesco,
                    "assets": assets.get(s.id, 0),
                    "twins": twins.get(s.id, 0),
                    "cover_url": cover_url(s.cover_asset_id),
                },
            }
            for s in rows
        ],
    }


@router.post(
    "",
    response_model=SiteOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("contribute"))],
)
async def create_site(services: ServicesDep, session: SessionDep, body: SiteCreate) -> SiteOut:
    if await session.scalar(select(Site.id).where(Site.slug == body.slug)):
        raise ConflictError(f"site {body.slug!r} already exists")
    site = Site(**body.model_dump())
    await index_site(site, services.settings)
    session.add(site)
    await session.commit()
    return site_out(site, {}, {})


@router.get("/{slug}", response_model=SiteDetail)
async def site_detail(services: ServicesDep, session: SessionDep, slug: str) -> SiteDetail:
    site = await get_site(session, slug)
    assets_rows = (
        await session.scalars(
            select(Asset)
            .where(Asset.site_id == site.id)
            .order_by(Asset.kind != AssetKind.photo, Asset.era_year, Asset.id)
        )
    ).all()
    twins = (await session.scalars(select(Twin).where(Twin.site_id == site.id).order_by(Twin.id.desc()))).all()
    journeys = (
        await session.scalars(
            select(Journey).where(Journey.id.in_(select(JourneyStop.journey_id).where(JourneyStop.site_id == site.id)))
        )
    ).all()
    langs = Counter(
        lang
        for (lang,) in (
            await session.execute(
                select(Chunk.language).join(Asset, Asset.id == Chunk.asset_id).where(Asset.site_id == site.id)
            )
        ).all()
        if lang
    )
    others = (await session.scalars(select(Site).where(Site.id != site.id))).all()
    nearby = sorted(
        (
            NearbySite(
                slug=o.slug,
                name=o.name,
                category=o.category,
                distance_km=round(haversine_km(site.lat, site.lon, o.lat, o.lon), 1),
            )
            for o in others
        ),
        key=lambda n: n.distance_km,
    )[:6]
    counts = ({site.id: len(assets_rows)}, {site.id: len(twins)})
    base = site_out(site, *counts)
    active = await services.queue.active_reconstruction(session)
    return SiteDetail(
        **base.model_dump(),
        alt_names=site.alt_names,
        description=site.description,
        assets=[asset_brief(a, site) for a in assets_rows],
        twins=[twin_out(t) for t in twins],
        journeys=[JourneyRef(slug=j.slug, title=j.title, year=j.year, color=j.color) for j in journeys],
        nearby=nearby,
        languages=dict(langs),
        active_job=JobOut.model_validate(active) if active is not None and active.site_id == site.id else None,
    )


@router.get("/{slug}/twins", response_model=list[TwinOut])
async def site_twins(session: SessionDep, slug: str) -> list[TwinOut]:
    site = await get_site(session, slug)
    rows = (await session.scalars(select(Twin).where(Twin.site_id == site.id).order_by(Twin.id.desc()))).all()
    return [twin_out(t) for t in rows]


@router.get("/{slug}/model-modes", response_model=ModelModesOut, summary="The three viewer modes for this site")
async def site_model_modes(services: ServicesDep, session: SessionDep, slug: str) -> ModelModesOut:
    site = await get_site(session, slug)
    procedural, _ = await ensure_procedural_twin(session, services.storage, site, site.id)
    await session.commit()
    meta = procedural.meta or {}

    detailed = await session.scalar(
        select(Twin)
        .where(Twin.site_id == site.id, Twin.method.in_(DETAILED_METHODS))
        .order_by(Twin.id.desc())
        .limit(1)
    )
    # Wireframe always renders a real triangle mesh: the photo-reconstructed GLB when one exists,
    # otherwise the procedural mesh twin.  The displayed procedural model may be a point cloud
    # (the original HeritageLens method), which has no triangles, so it is not a wireframe source.
    if detailed is not None and detailed.format == "glb":
        wireframe_source = detailed
    else:
        wireframe_source, _ = await ensure_procedural_mesh_twin(session, services.storage, site, site.id)
        await session.commit()

    modes = [
        ModelModeOut(
            id="procedural",
            label="Procedural Typology Model",
            available=True,
            twin=twin_out(procedural),
            disclaimer=meta.get("disclaimer"),
            parameters=meta.get("parameters"),
            required=meta.get("required"),
            optional=meta.get("optional"),
            estimated=meta.get("estimated"),
        ),
        ModelModeOut(
            id="detailed",
            label="Detailed 3D Model",
            available=detailed is not None,
            twin=twin_out(detailed) if detailed is not None else None,
            reason=None
            if detailed is not None
            else (
                "No photo-reconstructed model has been built for this site yet. Upload at least eight "
                "overlapping photographs and run a depth-relief or Gaussian-splat reconstruction from "
                "the site page; HeritageLens does not fabricate a detailed survey model."
            ),
        ),
        ModelModeOut(
            id="wireframe",
            label="Wireframe Model",
            available=wireframe_source.format == "glb",
            twin=twin_out(wireframe_source) if wireframe_source.format == "glb" else None,
            source_twin_id=wireframe_source.id if wireframe_source.format == "glb" else None,
            reason=None
            if wireframe_source.format == "glb"
            else (
                "Wireframe mode needs a mesh. The models stored for this site are point clouds; run a "
                "mesh reconstruction (or use the procedural typology model) to inspect real geometry."
            ),
        ),
    ]
    return ModelModesOut(
        site_id=site.id,
        site_slug=site.slug,
        modes=modes,
        active_job=await active_job_out(services, session),
    )


@router.post(
    "/{slug}/twins",
    response_model=JobOut,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_permission("reprocess"))],
    summary="Queue a 3D reconstruction (GPU) from this site's photos",
)
async def request_twin(services: ServicesDep, session: SessionDep, slug: str, body: TwinRequest) -> JobOut:
    site = await get_site(session, slug)
    active = await services.queue.active_reconstruction(session)
    if active is not None:
        where = active.site_id
        raise ConflictError(
            f"reconstruction job #{active.id} is still active"
            + (f" for site {where}" if where is not None else "")
            + "; stop it or wait for it to finish before starting another heritage location"
        )
    photos = (
        await session.scalars(
            select(Asset).where(
                Asset.id.in_(body.asset_ids),
                Asset.status == AssetStatus.ready,
                Asset.kind.in_([AssetKind.photo, AssetKind.scan]),
            )
        )
    ).all()
    if not photos:
        raise AppError("none of the given assets are processed photos", status_code=422)
    if body.method == "gaussian-splat" and len(photos) < 8:
        raise AppError("gaussian splatting needs at least 8 overlapping photos", status_code=422)
    payload = {
        "site_id": site.id,
        "method": body.method,
        "title": body.title,
        "images": [{"asset_id": p.id, "image_key": p.storage_key} for p in photos],
    }
    ids = ",".join(str(i) for i in sorted(p.id for p in photos))
    job = await services.queue.enqueue(
        session,
        "reconstruct3d",
        payload,
        site_id=site.id,
        priority=150,
        dedupe_key=f"reconstruct3d:{site.id}:{body.method}:{hashlib.sha1(ids.encode()).hexdigest()[:16]}",
    )
    await session.commit()
    return JobOut.model_validate(job)
