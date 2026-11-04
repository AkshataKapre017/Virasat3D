"""Read-side contract the web app is built against, checked on the real seeded sample archive."""

from __future__ import annotations

import json
from collections import Counter
from collections.abc import Iterator
from functools import partial
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.db.models import CultureItem
from app.main import create_app
from app.seed.loader import DATA_DIR, DISABLED_SITE_SLUGS, run_seed
from tests.conftest import make_settings

API = "/api/v1"
INDIA = (68.0, 6.0, 98.0, 37.5)  # lon/lat bounding box
SEEDED_SITES = len(json.loads((DATA_DIR / "sites.json").read_text(encoding="utf-8"))) - len(DISABLED_SITE_SLUGS)
REQUESTED_SITES = {
    "sanchi": ("Sanchi Stupa", "archaeological", "Madhya Pradesh", True),
    "khajuraho": ("Khajuraho Group of Monuments", "temple", "Madhya Pradesh", True),
    "konark": ("Konark Sun Temple", "temple", "Odisha", True),
    "victoria-memorial": ("Victoria Memorial", "memorial", "West Bengal", False),
    "qutub-minar": ("Qutub Minar", "archaeological", "Delhi", True),
    "taj-mahal": ("Taj Mahal", "mausoleum", "Uttar Pradesh", True),
}


def _in_india(lon: float, lat: float) -> bool:
    return INDIA[0] <= lon <= INDIA[2] and INDIA[1] <= lat <= INDIA[3]


@pytest.fixture(scope="module")
def seeded(tmp_path_factory: pytest.TempPathFactory) -> Iterator[TestClient]:
    settings = make_settings(tmp_path_factory.mktemp("seeded"))
    with TestClient(create_app(settings)) as client:
        assert client.portal is not None
        client.portal.call(partial(run_seed, client.app.state.services.ctx, offline=True))  # type: ignore[attr-defined]
        yield client


def get(client: TestClient, path: str, **params: Any) -> Any:
    r = client.get(f"{API}{path}", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_sites_list_filters_and_map_layer(seeded: TestClient) -> None:
    sites = get(seeded, "/sites")
    assert len(sites) == SEEDED_SITES and [s["name"] for s in sites] == sorted(s["name"] for s in sites)
    assert sum(s["asset_count"] for s in sites) > 0 and sum(s["twin_count"] for s in sites) > 0

    stepwells = get(seeded, "/sites", category="stepwell")
    assert {"rani-ki-vav", "chand-baori"} <= {s["slug"] for s in stepwells}
    assert all(s["category"] == "stepwell" for s in stepwells)
    assert [s["slug"] for s in get(seeded, "/sites", q="baori")] == ["chand-baori"]

    layer = get(seeded, "/sites/geojson")
    assert layer["type"] == "FeatureCollection" and len(layer["features"]) == SEEDED_SITES
    for f in layer["features"]:
        assert f["geometry"]["type"] == "Point" and _in_india(*f["geometry"]["coordinates"])
        assert {"slug", "name", "category", "assets", "twins", "cover_url"} <= set(f["properties"])


def test_requested_heritage_listings_are_public(seeded: TestClient) -> None:
    sites = {s["slug"]: s for s in get(seeded, "/sites")}
    layer = {f["properties"]["slug"]: f for f in get(seeded, "/sites/geojson")["features"]}
    for slug, (name, category, state, unesco) in REQUESTED_SITES.items():
        site = sites[slug]
        assert (site["name"], site["category"], site["state"], site["unesco"]) == (name, category, state, unesco)
        assert site["cover_url"] and site["cover_source_url"].startswith("https://commons.wikimedia.org/"), slug
        assert slug in layer

        detail = get(seeded, f"/sites/{slug}")
        assert detail["description"] and detail["summary"]
        assert detail["cover_url"] == site["cover_url"]
        assert detail["assets"] and detail["cover_url"]


def test_site_detail_bundles_everything_a_site_page_needs(seeded: TestClient) -> None:
    site = get(seeded, "/sites/rani-ki-vav")
    assert site["assets"] and all(a["site_slug"] == "rani-ki-vav" for a in site["assets"])
    assert "stepwells-of-north-gujarat" in {j["slug"] for j in site["journeys"]}
    assert site["nearby"] and site["nearby"] == sorted(site["nearby"], key=lambda n: n["distance_km"])
    assert "rani-ki-vav" not in {n["slug"] for n in site["nearby"]}
    assert site["languages"] and site["asset_count"] == len(site["assets"])
    for twin in site["twins"]:
        assert twin["url"] == f"/api/v1/twins/{twin['id']}/file"


def test_journeys_story_mode_payload(seeded: TestClient) -> None:
    journeys = get(seeded, "/journeys")
    assert {j["slug"] for j in journeys} == {"stepwells-of-north-gujarat", "kutch-crafts-trail", "baolis-of-the-north"}
    for j in journeys:
        assert j["stop_count"] > 1 and j["distance_km"] > 0 and j["color"].startswith("#")
        w, s, e, n = j["bbox"]
        assert _in_india(w, s) and _in_india(e, n)

    routes = get(seeded, "/journeys/geojson")["features"]
    assert len(routes) == 3 and all(f["geometry"]["type"] == "LineString" for f in routes)

    story = get(seeded, "/journeys/stepwells-of-north-gujarat")
    seqs = [stop["seq"] for stop in story["stops"]]
    assert seqs == sorted(seqs) and len(seqs) == story["stop_count"]
    assert story["stops"][0]["leg_km"] == 0 and all(stop["leg_km"] > 0 for stop in story["stops"][1:])
    assert any(stop["assets"] for stop in story["stops"]) and any(stop["site"] for stop in story["stops"])
    assert story["route"]["geometry"]["type"] == "LineString"
    assert len(story["route"]["geometry"]["coordinates"]) == len(story["stops"])
    assert seeded.get(f"{API}/journeys/nowhere").status_code == 404


def test_archive_browse_filters_sorting_and_paging(seeded: TestClient) -> None:
    everything = get(seeded, "/assets", limit=200)
    assert everything["total"] == len(everything["items"]) > 0

    photos = get(seeded, "/assets", kind="photo", limit=200)
    assert photos["total"] > 0 and all(a["kind"] == "photo" for a in photos["items"])
    docs = get(seeded, "/assets", kind=["journal", "pdf", "deck", "scan"], limit=200)
    assert photos["total"] + docs["total"] <= everything["total"]

    page1, page2 = get(seeded, "/assets", limit=5), get(seeded, "/assets", limit=5, offset=5)
    assert not {a["id"] for a in page1["items"]} & {a["id"] for a in page2["items"]}

    by_era = [a["era_year"] for a in get(seeded, "/assets", sort="era", limit=200)["items"]]
    dated = [y for y in by_era if y is not None]
    assert dated == sorted(dated) and by_era[: len(dated)] == dated  # undated last

    geo = get(seeded, "/assets/geojson")["features"]
    assert geo and all(_in_india(*f["geometry"]["coordinates"]) for f in geo)
    assert get(seeded, "/assets", has_geo=False, limit=200)["total"] + len(geo) >= everything["total"] - 5


def test_asset_media_and_document_reader(seeded: TestClient) -> None:
    [photo] = get(seeded, "/assets", kind="photo", status="ready", limit=1)["items"]
    thumb = seeded.get(f"{API}/assets/{photo['id']}/thumbnail")
    assert thumb.status_code == 200 and thumb.headers["content-type"].startswith("image/")
    assert "max-age" in thumb.headers.get("cache-control", "")
    etag = thumb.headers.get("etag")
    if etag:
        assert seeded.get(f"{API}/assets/{photo['id']}/thumbnail", headers={"If-None-Match": etag}).status_code == 304

    docs = get(seeded, "/assets", kind=["journal", "pdf", "deck"], status="ready", limit=50)["items"]
    doc = get(seeded, f"/assets/{docs[0]['id']}")
    assert doc["pages"] and doc["entities"] and doc["jobs"]
    text = get(seeded, f"/assets/{doc['id']}/pages/{doc['pages'][0]['page_no']}/text")
    assert text["text"]
    chunks = get(seeded, f"/assets/{doc['id']}/chunks")
    assert chunks and all(c["text"] for c in chunks)


def test_twin_gallery_streams_meshes(seeded: TestClient) -> None:
    twins = get(seeded, "/twins")
    assert twins and all(t["format"] in {"ply", "splat", "glb"} for t in twins)
    glb = next(t for t in twins if t["format"] == "glb")
    assert glb["model_kind"] == "procedural"
    assert get(seeded, f"/twins/{glb['id']}")["id"] == glb["id"]
    model = seeded.get(glb["url"])
    assert model.status_code == 200 and model.content.startswith(b"glTF")
    ranged = seeded.get(glb["url"], headers={"Range": "bytes=0-3"})
    assert ranged.status_code in (200, 206) and ranged.content[:4] == b"glTF"


def test_culture_section_filters_searches_and_pages(seeded: TestClient) -> None:
    rows = json.loads((DATA_DIR / "culture.json").read_text(encoding="utf-8"))
    category_counts = Counter(row["category"] for row in rows)
    assert category_counts and all(count >= 3 for count in category_counts.values())
    page = get(seeded, "/culture")
    assert page["total"] == len(page["items"]) == len(rows)
    assert [item["name"] for item in page["items"]] == sorted(item["name"] for item in page["items"])
    expected = {row["name"]: row for row in rows}
    assert page["all_count"] == page["total"]
    assert {option["value"] for option in page["categories"]} == {row["category"] for row in rows}
    for option in page["categories"]:
        category_page = get(seeded, "/culture", category=option["value"])
        assert option["count"] == category_page["total"]
        assert category_page["all_count"] == page["total"]
    for item in page["items"]:
        assert item["category"] in {option["value"] for option in page["categories"]}
        assert item["region"] and isinstance(item["highlights"], list)
        assert item["popular_time"] == expected[item["name"]]["popular_time"]
        assert item["popular_time"]

    crafts = get(seeded, "/culture", category="craft")
    assert crafts["total"] == sum(row["category"] == "craft" for row in rows)
    assert all(item["category"] == "craft" for item in crafts["items"])
    assert get(seeded, "/culture", category="oral_history")["total"] == 0

    assert [item["name"] for item in get(seeded, "/culture", q="patola")["items"]] == ["Patan Patola"]
    assert [item["name"] for item in get(seeded, "/culture", q="पटोला")["items"]] == ["Patan Patola"]

    regional = get(seeded, "/culture", region="Kutch, Gujarat")
    assert regional["total"] == sum(row["region"] == "Kutch, Gujarat" for row in rows)
    assert all(item["region"] == "Kutch, Gujarat" for item in regional["items"])
    assert {option["value"] for option in regional["categories"]} == {row["category"] for row in rows}
    assert regional["all_count"] == regional["total"]

    page1, page2 = get(seeded, "/culture", limit=3), get(seeded, "/culture", limit=3, offset=3)
    assert not {item["id"] for item in page1["items"]} & {item["id"] for item in page2["items"]}
    assert page1["limit"] == 3 and page1["offset"] == 0 and page2["offset"] == 3

    detail = get(seeded, f"/culture/{page1['items'][0]['id']}")
    assert detail == page1["items"][0]
    missing = seeded.get(f"{API}/culture/999999")
    assert missing.status_code == 404 and missing.headers["content-type"].startswith("application/problem+json")

    async def add_category_data() -> None:
        async with seeded.app.state.services.db.sessionmaker() as session:
            session.add(
                CultureItem(
                    category="oral_history",
                    name="Oral history",
                    region="Gujarat",
                    summary="Recorded community histories.",
                    highlights=[],
                )
            )
            await session.commit()

    assert seeded.portal is not None
    seeded.portal.call(add_category_data())
    expanded = get(seeded, "/culture", category="oral_history")
    assert expanded["total"] == 1 and expanded["items"][0]["name"] == "Oral history"
    assert {option["value"] for option in expanded["categories"]} >= {"oral_history"}


def test_dashboard_stats_reflect_the_archive(seeded: TestClient) -> None:
    stats = get(seeded, "/stats")
    assert stats["sites"] == SEEDED_SITES and stats["journeys"] == 3 and stats["twins"] > 0
    assert stats["chunks"] > 0 and stats["entities"] > 0 and stats["geotagged_assets"] > 0
    assert {"en", "gu", "hi"} <= set(stats["languages"])
    assert stats["queue_depth"].get("gpu", 0) >= 1  # the untranscribed scan waits for a GPU
    assert sum(stats["assets_by_kind"].values()) == stats["assets"]
