"""Seed the sample archive.

Loads a small but realistic slice of an Explorer-Fellowship archive so every feature can be demoed
offline: a gazetteer of heritage sites, three expedition routes, multilingual field journals and
folk tales (Hindi, Gujarati, English) with curated translations, scanned notebook pages (one left
un-transcribed to exercise the GPU OCR queue), CC-licensed Wikimedia Commons photographs, a slide
deck whose photos must be "rescued", and procedural 3D twins.

Idempotent: sites and journeys are upserted by slug, files are skipped when already ingested.
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from hashlib import sha1
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import BACKEND_DIR
from app.db.models import Asset, AssetKind, CultureItem, Journey, JourneyStop, Site
from app.services.catalog import index_site
from app.services.ingest import IngestMeta, ingest_bytes
from app.services.pipeline import JobContext
from app.services.pipeline.index import TM_KEY, norm
from app.services.procedural import ensure_procedural_twin
from app.workers.local import LocalWorker

log = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent / "data"
CACHE_DIR = BACKEND_DIR / "var" / "seed-cache"
SAMPLE_CONTRIBUTOR = "HeritageLens sample archive"
SAMPLE_LICENSE = "CC0 1.0"
SAMPLE_NOTE = "Synthetic sample content written for the HeritageLens demo; people named are fictional."
CURATED_ENGINE = "curated (sample archive)"

# Public catalogue filter: keep the demo archive focused on the approved heritage set.
DISABLED_SITE_SLUGS = {
    "golden-temple",
    "golconda-fort",
    "charminar",
    "meenakshi",
    "tawang-monastery",
    "shaniwar-wada",
    "ajanta-caves",
}


@dataclass(slots=True)
class SeedReport:
    sites: int = 0
    culture: int = 0
    journeys: int = 0
    assets_created: int = 0
    assets_existing: int = 0
    photos_unavailable: list[str] = field(default_factory=list)
    twins_created: int = 0
    jobs_processed: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "sites": self.sites,
            "culture": self.culture,
            "journeys": self.journeys,
            "assets_created": self.assets_created,
            "assets_existing": self.assets_existing,
            "photos_unavailable": len(self.photos_unavailable),
            "twins_created": self.twins_created,
            "jobs_processed": self.jobs_processed,
        }


def _load(name: str) -> Any:
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


async def upsert_sites(session: AsyncSession, ctx: JobContext) -> dict[str, Site]:
    existing = {s.slug: s for s in (await session.scalars(select(Site))).all()}
    for row in _load("sites.json"):
        slug = row["slug"]
        if slug in DISABLED_SITE_SLUGS:
            continue
        site = existing.get(slug)
        if site is None:
            site = Site(slug=slug)
            session.add(site)
            existing[site.slug] = site
        for key in ("name", "name_native", "category", "state", "district", "lat", "lon"):
            setattr(site, key, row.get(key))
        site.alt_names = row.get("alt_names", [])
        site.era_start = row.get("era_start")
        site.era_end = row.get("era_end")
        site.era_label = row.get("era_label")
        site.summary = row.get("summary", "")
        if "description" in row:
            site.description = row["description"]
        site.tags = row.get("tags", [])
        site.unesco = bool(row.get("unesco"))
        await index_site(site, ctx.settings)
    await session.flush()
    return existing


async def upsert_culture(session: AsyncSession) -> int:
    rows = _load("culture.json")
    wanted = {(row["category"], row["name"]) for row in rows}
    existing = {(c.category, c.name): c for c in (await session.scalars(select(CultureItem))).all()}
    for key, item in existing.items():
        if key not in wanted:
            await session.delete(item)
    for row in rows:
        item = existing.get((row["category"], row["name"]))
        if item is None:
            item = CultureItem(category=row["category"], name=row["name"])
            session.add(item)
            existing[(item.category, item.name)] = item
        for key in (
            "name_hi",
            "region",
            "summary",
            "popular_time",
            "highlights",
            "image_url",
            "image_alt",
            "credit",
            "licence",
            "source_url",
        ):
            setattr(item, key, row.get(key))
    await session.flush()
    return len(rows)


async def upsert_journeys(session: AsyncSession, sites: dict[str, Site]) -> dict[str, Journey]:
    existing = {j.slug: j for j in (await session.scalars(select(Journey))).all()}
    for row in _load("journeys.json"):
        journey = existing.get(row["slug"])
        if journey is None:
            journey = Journey(slug=row["slug"])
            session.add(journey)
            existing[journey.slug] = journey
        for key in ("title", "fellow", "year", "region", "summary", "color"):
            setattr(journey, key, row[key])
        await session.flush()
        await session.execute(delete(JourneyStop).where(JourneyStop.journey_id == journey.id))
        for seq, stop in enumerate(row["stops"]):
            site = sites.get(stop["site"])
            if site is None:
                continue
            session.add(
                JourneyStop(
                    journey_id=journey.id,
                    seq=seq,
                    site_id=site.id,
                    title=site.name,
                    lat=site.lat,
                    lon=site.lon,
                    visited_on=date.fromisoformat(stop["visited_on"]) if stop.get("visited_on") else None,
                    narrative=stop.get("narrative", ""),
                )
            )
        await session.flush()
    return existing


class PhotoFetcher:
    """Resolves seed photos from the bundled copy, the local cache, or Wikimedia Commons."""

    def __init__(self, user_agent: str, *, offline: bool = False, delay: float = 1.0) -> None:
        self.user_agent = user_agent
        self.offline = offline
        self.delay = delay
        self._client: httpx.AsyncClient | None = None

    @staticmethod
    def cache_path(url: str) -> Path:
        return CACHE_DIR / f"{sha1(url.encode()).hexdigest()[:16]}.jpg"

    async def get(self, row: dict[str, Any]) -> bytes | None:
        bundled = DATA_DIR / row["file"] if row.get("file") else None
        if bundled is not None and bundled.is_file():
            return bundled.read_bytes()

        url = row["url"]
        path = self.cache_path(url)
        if path.exists():
            return path.read_bytes()
        if self.offline:
            return None

        if self._client is None:
            self._client = httpx.AsyncClient(headers={"User-Agent": self.user_agent}, timeout=30.0, follow_redirects=True)

        for attempt in range(4):
            try:
                resp = await self._client.get(url)
            except httpx.HTTPError as exc:
                log.warning("photo download failed (%s): %s", exc.__class__.__name__, url)
                return None
            if resp.status_code == 429 or resp.status_code >= 500:
                wait = float(resp.headers.get("retry-after") or 0) or 2.0 * (attempt + 1)
                await asyncio.sleep(min(wait, 30.0))
                continue
            if resp.status_code == 200 and resp.content[:3] == b"\xff\xd8\xff":
                CACHE_DIR.mkdir(parents=True, exist_ok=True)
                path.write_bytes(resp.content)
                return resp.content
            log.warning("photo download returned HTTP %s: %s", resp.status_code, url)
            return None
        return None

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()


async def _already_ingested(session: AsyncSession, filename: str) -> Asset | None:
    return await session.scalar(select(Asset).where(Asset.original_filename == filename).limit(1))


async def ingest_photos(
    session: AsyncSession,
    ctx: JobContext,
    sites: dict[str, Site],
    fetcher: PhotoFetcher,
    report: SeedReport,
) -> dict[str, bytes]:
    """Returns the downloaded bytes keyed by Commons title (reused to build the slide deck)."""
    blobs: dict[str, bytes] = {}
    for row in _load("photos.json"):
        site_slug = row.get("site")
        if site_slug not in sites:
            continue
        commons_title = row["commons_title"]
        data = await fetcher.get(row)
        if data is None:
            if not (fetcher.offline and row.get("offline_optional")):
                report.photos_unavailable.append(commons_title)
            continue
        blobs[commons_title] = data
        if await _already_ingested(session, commons_title) is not None:
            report.assets_existing += 1
            continue
        _, created = await ingest_bytes(
            session,
            ctx.storage,
            ctx.queue,
            ctx.settings,
            commons_title,
            data,
            IngestMeta(
                title=row["caption"],
                kind="photo",
                site_id=sites[site_slug].id,
                contributor="Wikimedia Commons",
                license=row["license"],
                attribution=f"{row['author']} / Wikimedia Commons, {row['license']}",
                source_url=row["source_url"],
                caption=row["caption"],
            ),
            trusted=True,
        )
        report.assets_created += int(created)
        report.assets_existing += int(not created)
    await session.flush()
    return blobs


def _pairs(doc: dict[str, Any]) -> list[tuple[str, str | None]]:
    return [(p[0], p[1]) if isinstance(p, list) else (p, None) for p in doc.get("paragraphs", [])]


def build_deck(doc: dict[str, Any], photos: dict[str, bytes]) -> bytes:
    """A fellowship slide deck as fellows actually make them: text plus re-compressed photos."""
    from PIL import Image
    from pptx import Presentation
    from pptx.util import Inches, Pt

    prs = Presentation()
    props = prs.core_properties
    props.author, props.title = doc["contributor"], doc["title"]
    props.created = props.modified = datetime(2024, 2, 1, 10, 0)
    props.last_modified_by, props.revision = doc["contributor"], 1

    for i, spec in enumerate(doc["slides"]):
        layout = prs.slide_layouts[0 if i == 0 else 1]
        slide = prs.slides.add_slide(layout)
        if i == 0:
            slide.shapes.title.text = spec["title"]
            body = slide.placeholders[1]
            body.text = "\n".join(spec["bullets"])
        else:
            slide.shapes.title.text = spec["title"]
            body = slide.placeholders[1]
            frame = body.text_frame
            frame.text = spec["bullets"][0]
            for bullet in spec["bullets"][1:]:
                frame.add_paragraph().text = bullet
            for para in frame.paragraphs:
                para.font.size = Pt(20)
            photo = photos.get(spec.get("photo") or "")
            if photo is not None:
                img = Image.open(io.BytesIO(photo)).convert("RGB")
                img.thumbnail((900, 900))
                buf = io.BytesIO()
                img.save(buf, "JPEG", quality=72)
                buf.seek(0)
                slide.shapes.add_picture(buf, Inches(5.2), Inches(1.7), width=Inches(4.4))
        if spec.get("notes"):
            slide.notes_slide.notes_text_frame.text = spec["notes"]
    out = io.BytesIO()
    prs.save(out)
    return out.getvalue()


async def ingest_documents(
    session: AsyncSession,
    ctx: JobContext,
    sites: dict[str, Site],
    journeys: dict[str, Journey],
    report: SeedReport,
    *,
    photos: dict[str, bytes],
    kinds: set[AssetKind],
) -> None:
    for doc in _load("documents.json"):
        if doc["kind"] not in kinds or (doc.get("site") and doc["site"] not in sites):
            continue
        if await _already_ingested(session, doc["file"]) is not None:
            report.assets_existing += 1
            continue

        if doc["kind"] == "scan":
            data = (DATA_DIR / doc["image"]).read_bytes()
        elif doc["kind"] == "deck":
            data = await asyncio.to_thread(build_deck, doc, photos)
        else:
            pairs = _pairs(doc)
            data = "\n\n".join(original for original, _ in pairs).encode("utf-8")

        asset, created = await ingest_bytes(
            session,
            ctx.storage,
            ctx.queue,
            ctx.settings,
            doc["file"],
            data,
            IngestMeta(
                title=doc["title"],
                kind=doc["kind"],
                site_id=sites[doc["site"]].id if doc.get("site") else None,
                journey_id=journeys[doc["journey"]].id if doc.get("journey") else None,
                contributor=doc.get("contributor") or SAMPLE_CONTRIBUTOR,
                license=SAMPLE_LICENSE,
                attribution=SAMPLE_NOTE,
                source_url=doc.get("source_url"),
                caption=doc.get("caption"),
            ),
            trusted=True,
        )
        if not created:
            report.assets_existing += 1
            continue
        report.assets_created += 1

        meta = dict(asset.meta or {})
        pairs = _pairs(doc)
        memory = {norm(original): [english, CURATED_ENGINE] for original, english in pairs if english}
        if memory:
            meta[TM_KEY] = memory
        if doc["kind"] == "scan" and doc.get("transcribed"):
            meta["transcript"] = "\n\n".join(original for original, _ in pairs)
        meta["sample"] = True
        asset.meta = meta
    await session.flush()


async def create_twins(session: AsyncSession, ctx: JobContext, sites: dict[str, Site], report: SeedReport) -> None:
    for site in sites.values():
        _, created = await ensure_procedural_twin(session, ctx.storage, site, site.id)
        if created:
            report.twins_created += 1
    await session.flush()


async def assign_covers(session: AsyncSession, sites: dict[str, Site], journeys: dict[str, Journey]) -> None:
    rows = (
        await session.execute(
            select(Asset.site_id, Asset.id)
            .where(Asset.kind == AssetKind.photo, Asset.site_id.is_not(None), Asset.parent_id.is_(None))
            .order_by(Asset.id)
        )
    ).all()
    first: dict[int, int] = {}
    for site_id, asset_id in rows:
        if site_id is not None:
            first.setdefault(site_id, asset_id)

    # The `sites`/`journeys` dictionaries were loaded in an earlier session and are detached here;
    # re-load them so the cover ids are written to the rows owned by this session.
    for site in (await session.scalars(select(Site))).all():
        if site.cover_asset_id is None:
            site.cover_asset_id = first.get(site.id)

    for journey in (await session.scalars(select(Journey))).all():
        stops = (
            await session.scalars(
                select(JourneyStop.site_id).where(JourneyStop.journey_id == journey.id).order_by(JourneyStop.seq)
            )
        ).all()
        journey.cover_asset_id = next((first[s] for s in stops if s in first), None)
    await session.flush()


async def run_seed(ctx: JobContext, *, offline: bool = False, process: bool = True) -> SeedReport:
    """Load the sample archive. With `process`, the CPU pipeline is drained so the archive is
    searchable on return; GPU-only work (OCR of the untranscribed scan) stays queued for a GPU worker."""
    report = SeedReport()
    fetcher = PhotoFetcher(ctx.settings.http_user_agent, offline=offline)
    worker = LocalWorker(ctx, name="seed worker", concurrency=1)
    try:
        async with ctx.db.sessionmaker() as session:
            sites = await upsert_sites(session, ctx)
            report.culture = await upsert_culture(session)
            journeys = await upsert_journeys(session, sites)
            report.sites, report.journeys = len(sites), len(journeys)
            await session.commit()

        async with ctx.db.sessionmaker() as session:
            photos = await ingest_photos(session, ctx, sites, fetcher, report)
            text_kinds = {AssetKind.journal, AssetKind.story, AssetKind.scan}
            await ingest_documents(session, ctx, sites, journeys, report, photos=photos, kinds=text_kinds)
            await create_twins(session, ctx, sites, report)
            await assign_covers(session, sites, journeys)
            await session.commit()
            if process:
                report.jobs_processed += await worker.drain()

        async with ctx.db.sessionmaker() as session:
            sites = {s.slug: s for s in (await session.scalars(select(Site))).all()}
            journeys = {j.slug: j for j in (await session.scalars(select(Journey))).all()}
            photos = await ingest_photos(session, ctx, sites, fetcher, report)
            await ingest_documents(session, ctx, sites, journeys, report, photos=photos, kinds={AssetKind.deck})
            await session.commit()
        if process:
            report.jobs_processed += await worker.drain()
    finally:
        await fetcher.aclose()
    return report
