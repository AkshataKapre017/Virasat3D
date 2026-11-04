"""Verification workflow: RECEIVED -> PROCESSING -> NEEDS_REVIEW | VERIFIED -> PUBLISHED (or REJECTED).

Automated checks only ever reach VERIFIED through `decide`, which looks at metadata and text rules,
never at OCR or model output. Curators make every other move, and every move is written to `review_events`.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError
from app.db.models import Asset, ReviewEvent, Site, VerificationState
from app.services.geo import haversine_km

S = VerificationState
SYSTEM_ACTOR = "system:checks"
PUBLIC_STATE = S.published.value

TRANSITIONS: dict[str, frozenset[str]] = {
    S.received: frozenset({S.processing, S.rejected}),
    S.processing: frozenset({S.needs_review, S.rejected}),
    S.needs_review: frozenset({S.verified, S.rejected}),
    S.verified: frozenset({S.published, S.needs_review, S.rejected}),
    S.published: frozenset({S.rejected, S.needs_review}),
    S.rejected: frozenset({S.needs_review}),
}
SYSTEM_TRANSITIONS: dict[str, frozenset[str]] = {
    S.received: frozenset({S.processing, S.needs_review}),
    S.processing: frozenset({S.needs_review}),
}

ALLOWED_LICENSES = frozenset(
    {"CC0", "CC BY 4.0", "CC BY-SA 4.0", "Public domain", "All rights reserved, shared with permission"}
)

FLAG_LABELS = {
    "location_mismatch": "The coordinates are far from the selected heritage site",
    "no_location": "No location was given or found in the file",
    "suspicious_coordinates": "The coordinates look like a placeholder",
    "low_relevance": "No heritage site, place or heritage term was recognised",
    "incomplete": "Very little description was provided",
    "personal_data": "May contain personal contact or identity details",
    "sensitive_content": "May describe human remains or burial sites",
    "near_duplicate": "Looks very similar to an item already in the archive",
    "processing_failed": "Automated processing did not finish",
}

HERITAGE_TERMS = re.compile(
    r"\b(temple|mandir|mosque|masjid|stepwell|vav|baoli|fort|palace|haveli|monument|archaeolog\w*|heritage"
    r"|sculpt\w*|inscription|carv\w*|architect\w*|shrine|cave|tomb|dargah|church|ruins?|manuscript|folk\w*"
    r"|festival|craft|mural|pottery|weav\w*|fresco|stupa|monastery|gate|vihara|chaitya|kund|ghat)\b",
    re.IGNORECASE,
)
PERSONAL_DATA = re.compile(
    r"[\w.+-]+@[\w-]+\.[\w.]+|\+\d{1,3}[\s-]?\d{5,}|\b[6-9]\d{9}\b|\b\d{4}\s\d{4}\s\d{4}\b"
)
SENSITIVE_CONTENT = re.compile(r"\b(human remains|burial|skeletal|grave)\b", re.IGNORECASE)
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_TAGS = re.compile(r"[<>]")
_SPACES = re.compile(r"[ \t]+")


def clean_text(value: str | None, limit: int) -> str | None:
    """Normalise user-supplied text: NFC, no control characters, no markup brackets, bounded length."""
    if value is None:
        return None
    text = unicodedata.normalize("NFC", value)
    text = _TAGS.sub("", _CONTROL.sub("", text))
    text = _SPACES.sub(" ", text).strip()
    return text[:limit] or None


def location_flags(lat: float | None, lon: float | None, site: Site | None, max_km: float) -> set[str]:
    flags: set[str] = set()
    if lat is None or lon is None:
        if site is None:
            flags.add("no_location")
        return flags
    if lat == 0 and lon == 0:
        flags.add("suspicious_coordinates")
    if site is not None and haversine_km(lat, lon, site.lat, site.lon) > max_km:
        flags.add("location_mismatch")
    return flags


def content_flags(texts: Iterable[str], title: str, caption: str | None, has_site: bool) -> set[str]:
    body = " ".join([title, caption or "", *texts])
    flags: set[str] = set()
    if not has_site and not HERITAGE_TERMS.search(body):
        flags.add("low_relevance")
    if not has_site and len(body.strip()) < 40:
        flags.add("incomplete")
    if PERSONAL_DATA.search(body):
        flags.add("personal_data")
    if SENSITIVE_CONTENT.search(body):
        flags.add("sensitive_content")
    return flags


async def transition(
    session: AsyncSession,
    asset: Asset,
    to_state: str,
    *,
    actor: str,
    reason: str | None = None,
    note: str | None = None,
) -> None:
    current = asset.verification_state
    allowed = SYSTEM_TRANSITIONS if actor == SYSTEM_ACTOR else TRANSITIONS
    if to_state not in allowed.get(current, frozenset()):
        raise ConflictError(
            f"a submission cannot move from {current} to {to_state}", title="Invalid verification transition"
        )
    session.add(
        ReviewEvent(
            asset_id=asset.id,
            from_state=current,
            to_state=to_state,
            actor=actor,
            reason=reason,
            note=note,
        )
    )
    asset.verification_state = to_state
    asset.verification_reason = reason if to_state == S.rejected else None


async def decide(session: AsyncSession, asset: Asset, texts: list[str], max_km: float) -> None:
    """Run the deterministic checks once extraction has produced the text. Only fresh submissions are decided."""
    if asset.verification_state != S.processing:
        return
    site = await session.get(Site, asset.site_id) if asset.site_id is not None else None
    flags = location_flags(asset.lat, asset.lon, site, max_km)
    flags |= content_flags(texts, asset.title, asset.caption, has_site=site is not None)
    if (asset.meta or {}).get("near_duplicate_of") is not None:
        flags.add("near_duplicate")
    asset.meta = {**(asset.meta or {}), "verification_flags": sorted(flags)}
    await transition(session, asset, S.needs_review, actor=SYSTEM_ACTOR)


async def fail_processing(session: AsyncSession, asset: Asset) -> None:
    if asset.verification_state not in (S.received, S.processing):
        return
    asset.meta = {
        **(asset.meta or {}),
        "verification_flags": sorted({*(asset.meta or {}).get("verification_flags", []), "processing_failed"}),
    }
    await transition(session, asset, S.needs_review, actor=SYSTEM_ACTOR)
