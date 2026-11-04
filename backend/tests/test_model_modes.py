"""Model modes, the single-active-reconstruction rule, and honest cancellation semantics."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi.testclient import TestClient

from app.services.procedural import (
    build_procedural_mesh,
    procedural_artifact,
    procedural_point_cloud,
    profile_for_site,
)
from tests.conftest import WORKER_TOKEN, login_as

API = "/api/v1"
WORKER = {"Authorization": f"Bearer {WORKER_TOKEN}"}


def _create_site(client: TestClient, slug: str, category: str = "stepwell") -> dict[str, Any]:
    body = {
        "slug": slug,
        "name": f"Test {slug}",
        "category": category,
        "lat": 23.0,
        "lon": 72.0,
        "summary": "A test heritage location.",
    }
    r = client.post(f"{API}/sites", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _enqueue_reconstruction(client: TestClient, site_id: int) -> int:
    async def run() -> int:
        services = client.app.state.services  # type: ignore[attr-defined]
        async with services.db.sessionmaker() as session:
            job = await services.queue.enqueue(
                session,
                "reconstruct3d",
                {"site_id": site_id, "images": []},
                site_id=site_id,
            )
            await session.commit()
            return int(job.id)

    return int(client.portal.call(run))  # type: ignore[attr-defined]


def _register_worker(client: TestClient) -> str:
    r = client.post(
        f"{API}/workers/register",
        json={"name": "Model modes GPU", "queue": "gpu", "capabilities": ["reconstruct3d"]},
        headers=WORKER,
    )
    assert r.status_code == 200, r.text
    return str(r.json()["id"])


def _lease(client: TestClient, worker_id: str) -> list[dict[str, Any]]:
    r = client.post(f"{API}/workers/{worker_id}/lease", json={"limit": 1}, headers=WORKER)
    assert r.status_code == 200, r.text
    return list(r.json()["jobs"])


def test_model_modes_are_exactly_three_and_use_real_geometry(client: TestClient) -> None:
    site = _create_site(client, "modes-site")

    r = client.get(f"{API}/sites/{site['slug']}/model-modes")
    assert r.status_code == 200, r.text
    body = r.json()
    assert [m["id"] for m in body["modes"]] == ["procedural", "detailed", "wireframe"]

    procedural, detailed, wireframe = body["modes"]
    # Stepwells use the original HeritageLens parametric point-cloud method: no GPU required.
    assert procedural["available"] is True and procedural["twin"]["format"] == "ply"
    assert procedural["twin"]["model_kind"] == "procedural"
    assert procedural["disclaimer"] and procedural["parameters"]
    assert {"bays", "storeys", "width"} <= set(procedural["parameters"])

    assert detailed["available"] is False and detailed["twin"] is None
    assert "photograph" in (detailed["reason"] or "").lower()

    # Wireframe is still real triangle geometry, generated separately from the point cloud.
    assert wireframe["available"] is True
    assert wireframe["twin"]["format"] == "glb"
    assert wireframe["source_twin_id"] != procedural["twin"]["id"]

    cloud = client.get(procedural["twin"]["url"])
    assert cloud.status_code == 200 and cloud.content.startswith(b"ply")
    mesh = client.get(wireframe["twin"]["url"])
    assert mesh.status_code == 200 and mesh.content.startswith(b"glTF")

    detail = client.get(f"{API}/sites/{site['slug']}").json()
    formats = {(t["method"], t["format"]) for t in detail["twins"]}
    assert ("procedural", "ply") in formats
    assert ("procedural", "glb") in formats
    assert detail["active_job"] is None


@dataclass
class _Site:
    slug: str
    name: str
    category: str
    tags: list[str]


def test_procedural_engine_is_shared_deterministic_and_data_driven() -> None:
    a = _Site("unknown-stepwell-a", "A", "stepwell", [])
    b = _Site("unknown-stepwell-b", "B", "stepwell", [])
    profile_a, profile_b = profile_for_site(a), profile_for_site(b)
    assert profile_a["typology"] == profile_b["typology"] == "vav"
    assert profile_a["params"] == profile_b["params"]

    glb_a, meta_a = procedural_artifact(a)
    glb_b, meta_b = procedural_artifact(b)
    assert glb_a == glb_b and meta_a["config_hash"] == meta_b["config_hash"]
    assert meta_a["approximate"] is True and meta_a["vertices"] > 0

    # A site override changes parameters, not the algorithm.
    known = _Site("rani-ki-vav", "Rani ki Vav", "stepwell", [])
    profile_known = profile_for_site(known)
    assert profile_known["typology"] == "vav"
    assert profile_known["params"]["bays"] == 7
    mesh = build_procedural_mesh(profile_known)
    assert mesh.vertex_count > 0 and mesh.triangle_count > 0


def test_reference_point_cloud_method_is_deterministic_and_data_driven() -> None:
    a = _Site("unknown-stepwell-a", "A", "stepwell", [])
    b = _Site("unknown-stepwell-b", "B", "stepwell", [])
    cloud_a, ply_a = procedural_point_cloud(profile_for_site(a))  # type: ignore[misc]
    _cloud_b, ply_b = procedural_point_cloud(profile_for_site(b))  # type: ignore[misc]
    assert ply_a == ply_b
    assert ply_a.startswith(b"ply\nformat binary_little_endian 1.0")
    assert len(cloud_a) > 1_000 and cloud_a.xyz.shape[1] == 3

    # The five reference stepwells keep their pinned seeds, so the seeded archive is unchanged.
    known = _Site("rani-ki-vav", "Rani ki Vav", "stepwell", [])
    cloud_known, ply_known = procedural_point_cloud(profile_for_site(known))  # type: ignore[misc]
    assert len(cloud_known) > len(cloud_a)
    assert ply_known.startswith(b"ply")

    # The reference builders only describe stepwells; other typologies use the mesh renderer.
    temple = _Site("some-temple", "Some Temple", "temple", [])
    assert procedural_point_cloud(profile_for_site(temple)) is None


def test_only_one_location_reconstructs_at_a_time_and_cancel_is_authoritative(client: TestClient) -> None:
    first = _create_site(client, "active-site")
    second = _create_site(client, "blocked-site", category="temple")
    job_id = _enqueue_reconstruction(client, first["id"])

    active = client.get(f"{API}/jobs/active")
    assert active.status_code == 200 and active.json()["id"] == job_id

    blocked = client.post(f"{API}/sites/{second['slug']}/twins", json={"asset_ids": [1]})
    assert blocked.status_code == 409
    assert "still active" in blocked.json()["detail"]

    worker_id = _register_worker(client)
    [leased] = _lease(client, worker_id)
    assert leased["id"] == job_id

    login_as(client, role="researcher", email="reader@example.com")
    assert client.post(f"{API}/jobs/{job_id}/cancel").status_code == 403
    login_as(client, role="archivist", email="curator@example.com")
    cancelled = client.post(f"{API}/jobs/{job_id}/cancel")
    assert cancelled.status_code == 200, cancelled.text
    payload = cancelled.json()
    assert payload["cancelled"] is True
    assert payload["remote_processing_may_continue"] is True
    assert "remote worker" in payload["message"].lower()

    assert client.get(f"{API}/jobs/active").json() is None
    assert client.get(f"{API}/jobs/{job_id}").json()["status"] == "cancelled"

    # The guard is released: the request now reaches photo validation instead of the conflict.
    unblocked = client.post(f"{API}/sites/{second['slug']}/twins", json={"asset_ids": [1]})
    assert unblocked.status_code == 422

    # A worker that was already running cannot upload or complete into the cancelled job.
    upload = client.post(
        f"{API}/workers/{worker_id}/jobs/{job_id}/artifacts",
        files={"file": ("late.glb", b"glTF", "model/gltf-binary")},
        headers=WORKER,
    )
    assert upload.status_code == 409
    complete = client.post(
        f"{API}/workers/{worker_id}/jobs/{job_id}/complete",
        json={"result": {"artifact_key": "twins/site-1/job-1/x.glb", "format": "glb", "method": "depth-relief"}},
        headers=WORKER,
    )
    assert complete.status_code == 409
    assert client.get(f"{API}/sites/{first['slug']}/twins").json() == []


def test_cancelling_a_queued_job_reports_no_remote_work(client: TestClient) -> None:
    site = _create_site(client, "queued-site")
    job_id = _enqueue_reconstruction(client, site["id"])
    r = client.post(f"{API}/jobs/{job_id}/cancel")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["cancelled"] is True and body["remote_processing_may_continue"] is False
    assert "before a worker leased it" in body["message"]

    again = client.post(f"{API}/jobs/{job_id}/cancel")
    assert again.status_code == 200 and again.json()["cancelled"] is False
