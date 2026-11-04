"""The bundled sample archive loads offline, is fully searchable, and re-seeding is a no-op."""

from __future__ import annotations

import json

from sqlalchemy import func, select

from app.db.models import Asset, AssetStatus, Chunk, CultureItem, Job, JobStatus, Site, Twin
from app.seed.loader import DATA_DIR, DISABLED_SITE_SLUGS, run_seed
from app.services.pipeline import JobContext
from app.services.search import SearchService

# These slugs were permanently removed from the sample archive. Keep the assertion below so a
# future edit to the seed files cannot quietly resurrect them.
REMOVED_SLUGS = {
    "raisen-fort",
    "brahma-sarovar",
    "brihadeeswarar",
    "darjeeling-himalayan-railway",
    "leh-palace",
    "maluti-temples",
    "cellular-jail",
    "ellora-fort",
    "kamakhya",
    "tabo-monastery",
    "padmanabhaswamy",
    "ujjayanta-palace",
    "vangchhia",
    "chapora-fort",
    "diu-fort",
    "gwalior-fort",
    "living-root-bridges",
    "jageshwar",
    "rumtek-monastery",
    "sarnath",
    "shalimar-bagh",
    "sidi-saiyyed",
    "bhimbetka",
    "kangla-fort",
    "virupaksha",
    "khonoma",
    "majuli",
    "lepakshi",
    "laxman-temple",
    "mahabodhi",
    "nalanda",
    "puducherry-french-quarter",
}


async def _counts(ctx: JobContext) -> dict[str, int]:
    async with ctx.db.sessionmaker() as s:
        return {
            m.__tablename__: int(await s.scalar(select(func.count()).select_from(m)) or 0)
            for m in (Site, CultureItem, Asset, Chunk, Twin, Job)
        }


async def test_seed_is_offline_complete_and_idempotent(ctx: JobContext) -> None:
    rows = json.loads((DATA_DIR / "sites.json").read_text(encoding="utf-8"))
    culture = json.loads((DATA_DIR / "culture.json").read_text(encoding="utf-8"))
    first = await run_seed(ctx, offline=True)
    assert first.sites == len(rows) - len(DISABLED_SITE_SLUGS) and first.journeys == 3
    assert first.culture == len(culture)
    assert first.assets_created > 0 and first.twins_created > 0 and first.jobs_processed > 0
    assert first.photos_unavailable == []  # every sample photo ships in the repo

    async with ctx.db.sessionmaker() as s:
        statuses = dict((await s.execute(select(Asset.status, func.count()).group_by(Asset.status))).all())
        assert set(statuses) <= {AssetStatus.ready, AssetStatus.processing}
        # Only the untranscribed scan waits, for a GPU worker to OCR it.
        gpu = (await s.scalars(select(Job.type).where(Job.queue == "gpu", Job.status == JobStatus.queued))).all()
        assert "ocr" in gpu
        assert await s.scalar(select(func.count()).where(Job.status == JobStatus.dead)) == 0
        res = await SearchService(ctx.settings).search(s, "chand baori")
        assert res.sites and res.sites[0].slug == "chand-baori"

    before = await _counts(ctx)
    second = await run_seed(ctx, offline=True)
    assert second.assets_created == 0 and second.twins_created == 0
    assert second.culture == first.culture
    assert second.assets_existing == first.assets_created + first.assets_existing
    assert await _counts(ctx) == before


def test_site_catalogue_spans_regions_and_categories() -> None:
    rows = json.loads((DATA_DIR / "sites.json").read_text(encoding="utf-8"))
    assert len(rows) == 31
    assert len({row["slug"] for row in rows}) == len(rows)

    states = {row["state"] for row in rows}
    assert len(states) >= 13
    assert {"Gujarat", "Rajasthan", "Delhi", "Karnataka", "Punjab", "Telangana"} <= states
    assert {"Tamil Nadu", "Andhra Pradesh", "Odisha", "Arunachal Pradesh"} <= states
    assert {"Maharashtra", "Madhya Pradesh", "Chhattisgarh"} <= states

    categories = {row["category"] for row in rows}
    assert {"archaeological", "fort", "palace", "temple", "mosque", "stepwell", "craft"} <= categories
    assert all(row["summary"] and row["lat"] and row["lon"] for row in rows)

    # Only genuinely inscribed properties carry the UNESCO flag.
    assert {row["slug"] for row in rows if row["unesco"]} == {
        "rani-ki-vav",
        "champaner",
        "dholavira",
        "hampi-stepped-tank",
        "konark",
        "ajanta-caves",
        "sanchi",
        "khajuraho",
        "qutub-minar",
        "taj-mahal",
    }
    requested = {"sanchi", "khajuraho", "konark", "victoria-memorial", "qutub-minar", "taj-mahal"}
    assert requested <= {row["slug"] for row in rows}


def test_removed_sites_cannot_be_restored_from_the_seed_files() -> None:
    sites = json.loads((DATA_DIR / "sites.json").read_text(encoding="utf-8"))
    photos = json.loads((DATA_DIR / "photos.json").read_text(encoding="utf-8"))
    documents = json.loads((DATA_DIR / "documents.json").read_text(encoding="utf-8"))

    assert not ({row["slug"] for row in sites} & REMOVED_SLUGS)
    assert not ({row["site"] for row in photos if row.get("site")} & REMOVED_SLUGS)
    assert not ({row["site"] for row in documents if row.get("site")} & REMOVED_SLUGS)
    assert all(row["name"].strip() != "Fort" for row in sites)
