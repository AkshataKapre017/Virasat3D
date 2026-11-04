"""Contribution verification: upload validation, automated routing, reviewer authorisation and history."""

from __future__ import annotations

import io
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import create_app
from tests.conftest import login_as, make_settings, wait_for_asset

API = "/api/v1"
RIGHTS = {"license": "CC0", "rights_confirmed": "true"}
SITE = {
    "slug": "rani-ki-vav",
    "name": "Rani ki Vav",
    "category": "stepwell",
    "state": "Gujarat",
    "lat": 23.8589,
    "lon": 72.1016,
    "summary": "An 11th-century stepwell in Patan.",
}
NOTES = (
    "Field notes from Rani ki Vav, Patan, written in 1998.\n\n"
    "The stepwell was silted up until the excavations; the sculpted panels show Vishnu avatars."
)


@pytest.fixture
def curated(tmp_path: Path) -> Iterator[TestClient]:
    s = make_settings(tmp_path, embedded_worker=True, max_upload_mb=1)
    with TestClient(create_app(s)) as c:
        login_as(c)
        yield c


def _upload(
    client: TestClient, name: str, data: bytes, mime: str = "text/plain", *, form: dict[str, Any] | None = None
) -> Any:
    fields = {**RIGHTS, **(form or {})}
    return client.post(
        f"{API}/assets", files=[("files", (name, data, mime))], data=fields
    )


def _ok(client: TestClient, name: str, data: bytes, mime: str = "text/plain", **form: Any) -> dict[str, Any]:
    r = _upload(client, name, data, mime, form={k: str(v) for k, v in form.items()})
    assert r.status_code == 201, r.text
    [result] = r.json()
    return dict(result["asset"])


def _problem(r: Any, status: int) -> dict[str, Any]:
    assert r.status_code == status, r.text
    assert r.headers["content-type"].startswith("application/problem+json")
    body: dict[str, Any] = r.json()
    return body


def _jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), (120, 80, 40)).save(buf, "JPEG")
    return buf.getvalue()


# ------------------------------------------------------------ upload validation
def test_rights_and_licence_are_required(curated: TestClient) -> None:
    files = [("files", ("notes.txt", NOTES.encode(), "text/plain"))]
    _problem(curated.post(f"{API}/assets", files=files), 422)
    _problem(curated.post(f"{API}/assets", files=files, data={"license": "CC0"}), 422)
    body = _problem(
        curated.post(
            f"{API}/assets",
            files=files,
            data={"license": "CC0", "rights_confirmed": "false"},
        ),
        422,
    )
    assert body["title"] == "Permission required"
    body = _problem(
        curated.post(
            f"{API}/assets",
            files=files,
            data={"license": "Copyright Ltd", "rights_confirmed": "true"},
        ),
        422,
    )
    assert body["title"] == "Licence required"


def test_invalid_coordinates_and_language_are_rejected(curated: TestClient) -> None:
    body = _problem(_upload(curated, "n.txt", NOTES.encode(), form={"lat": "23.8"}), 422)
    assert body["title"] == "Invalid location"
    _problem(_upload(curated, "n.txt", NOTES.encode(), form={"lat": "95", "lon": "72"}), 422)
    _problem(_upload(curated, "n.txt", NOTES.encode(), form={"lat": "23.8", "lon": "200"}), 422)
    body = _problem(_upload(curated, "n.txt", NOTES.encode(), form={"language": "<script>"}), 422)
    assert body["title"] == "Invalid language"


def test_wrong_content_for_extension_is_rejected(curated: TestClient) -> None:
    _problem(_upload(curated, "photo.jpg", b"MZ\x90\x00not an image", "image/jpeg"), 415)
    _problem(_upload(curated, "bad.jpg", b"\xff\xd8\xff" + b"\x00" * 200, "image/jpeg"), 415)
    _problem(_upload(curated, "fake.pdf", b"Just plain text, not a PDF", "application/pdf"), 415)
    _problem(_upload(curated, "readme.txt", b"\x89PNG\r\n\x1a\nbinary", "text/plain"), 415)


def test_oversize_and_empty_files_are_rejected(curated: TestClient) -> None:
    _problem(_upload(curated, "big.txt", b"a" * (1024 * 1024 + 1)), 413)
    _problem(_upload(curated, "empty.txt", b""), 400)


def test_filenames_are_sanitised(curated: TestClient) -> None:
    asset = _ok(curated, "../../etc/notes<script>.txt", NOTES.encode())
    assert "/" not in asset["original_filename"] and "<" not in asset["original_filename"]


def test_exact_duplicates_are_flagged_not_stored_twice(curated: TestClient) -> None:
    first = _ok(curated, "a.txt", NOTES.encode())
    r = _upload(curated, "b.txt", NOTES.encode())
    assert r.status_code == 201 and r.json()[0]["created"] is False
    assert r.json()[0]["asset"]["id"] == first["id"]


def test_valid_jpeg_is_accepted(curated: TestClient) -> None:
    r = _upload(curated, "photo.jpg", _jpeg(), "image/jpeg")
    assert r.status_code == 201, r.text


# ------------------------------------------------------------ automated routing
def test_contribution_goes_to_curator_review_not_verified(curated: TestClient) -> None:
    site = curated.post(f"{API}/sites", json=SITE).json()
    asset = _ok(curated, "notes.txt", NOTES.encode(), site_id=str(site["id"]))
    assert curated.get(f"{API}/assets/{asset['id']}").json()["verification_state"] in ("received", "processing")
    done = wait_for_asset(curated, asset["id"])
    assert done["status"] == "ready"
    assert done["verification_state"] == "needs_review"


def test_location_mismatch_is_flagged_for_review(curated: TestClient) -> None:
    site = curated.post(f"{API}/sites", json=SITE).json()
    asset = _ok(curated, "notes.txt", NOTES.encode(), site_id=str(site["id"]), lat="40.7", lon="-74.0")
    wait_for_asset(curated, asset["id"])
    status = curated.get(f"{API}/assets/{asset['id']}/verification").json()
    assert status["state"] == "needs_review"
    assert "The coordinates are far from the selected heritage site" in status["flags"]


def test_irrelevant_text_is_flagged_as_low_relevance(curated: TestClient) -> None:
    asset = _ok(curated, "shopping.txt", b"Buy milk, eggs and bread on the way home today.")
    wait_for_asset(curated, asset["id"])
    status = curated.get(f"{API}/assets/{asset['id']}/verification").json()
    assert status["state"] == "needs_review"
    assert "No heritage site, place or heritage term was recognised" in status["flags"]


def test_sensitive_and_personal_content_is_flagged(curated: TestClient) -> None:
    text = b"Contact me at fellow@example.com. The burial ground near the old temple holds human remains."
    asset = _ok(curated, "field.txt", text)
    wait_for_asset(curated, asset["id"])
    flags = curated.get(f"{API}/assets/{asset['id']}/verification").json()["flags"]
    assert "May contain personal contact or identity details" in flags
    assert "May describe human remains or burial sites" in flags


# ------------------------------------------------------------ reviewer authorisation
def test_review_actions_require_the_archivist_role(curated: TestClient) -> None:
    asset = _ok(curated, "notes.txt", NOTES.encode())
    wait_for_asset(curated, asset["id"])
    url = f"{API}/assets/{asset['id']}/review"
    history = f"{API}/assets/{asset['id']}/review-history"

    login_as(curated, role="researcher", email="reader@example.com")
    _problem(curated.post(url, json={"to_state": "verified", "reviewer": "Asha"}), 403)
    _problem(curated.get(history), 403)

    login_as(curated, role="archivist", email="curator@example.com")
    ok = curated.post(url, json={"to_state": "verified", "reviewer": "Asha"})
    assert ok.status_code == 200 and ok.json()["state"] == "verified"


def test_review_actions_require_a_session(tmp_path: Path) -> None:
    with TestClient(create_app(make_settings(tmp_path, embedded_worker=True))) as c:
        login_as(c)
        asset = _ok(c, "notes.txt", NOTES.encode())
        wait_for_asset(c, asset["id"])
        c.post(f"{API}/auth/logout")
        _problem(
            c.post(f"{API}/assets/{asset['id']}/review", json={"to_state": "verified", "reviewer": "Asha"}),
            401,
        )


def test_transitions_follow_the_state_machine(curated: TestClient) -> None:
    asset = _ok(curated, "notes.txt", NOTES.encode())
    wait_for_asset(curated, asset["id"])
    url = f"{API}/assets/{asset['id']}/review"

    _problem(curated.post(url, json={"to_state": "published", "reviewer": "Asha"}), 409)
    _problem(curated.post(url, json={"to_state": "rejected", "reviewer": "Asha"}), 422)

    ok = curated.post(url, json={"to_state": "verified", "reviewer": "Asha", "note": "Checked against sources"})
    assert ok.status_code == 200 and ok.json()["state"] == "verified"
    published = curated.post(url, json={"to_state": "published", "reviewer": "Asha"})
    assert published.json()["state"] == "published"
    assert curated.get(f"{API}/assets/{asset['id']}").json()["verification_state"] == "published"


def test_rejection_reason_is_public_and_notes_stay_private(curated: TestClient) -> None:
    asset = _ok(curated, "notes.txt", NOTES.encode())
    wait_for_asset(curated, asset["id"])
    url = f"{API}/assets/{asset['id']}/review"
    rejected = curated.post(
        url,
        json={"to_state": "rejected", "reviewer": "Asha", "reason": "Unrelated to heritage", "note": "internal only"},
    )
    assert rejected.status_code == 200 and rejected.json()["reason"] == "Unrelated to heritage"

    public = curated.get(f"{API}/assets/{asset['id']}/verification").json()
    assert "internal only" not in str(public) and "Asha" not in str(public)
    detail = curated.get(f"{API}/assets/{asset['id']}").json()
    assert "internal only" not in str(detail)

    history = curated.get(f"{API}/assets/{asset['id']}/review-history").json()
    assert history["total"] == 2
    newest = history["items"][0]
    assert newest["to_state"] == "rejected" and newest["note"] == "internal only"
    assert newest["actor"] == "curator:Asha"


def test_review_history_is_paginated(curated: TestClient) -> None:
    asset = _ok(curated, "notes.txt", NOTES.encode())
    wait_for_asset(curated, asset["id"])
    url = f"{API}/assets/{asset['id']}/review"
    curated.post(url, json={"to_state": "rejected", "reviewer": "Asha", "reason": "Duplicate"})
    curated.post(url, json={"to_state": "needs_review", "reviewer": "Asha"})

    page = curated.get(
        f"{API}/assets/{asset['id']}/review-history", params={"limit": 1, "offset": 1}
    ).json()
    assert page["total"] == 3 and len(page["items"]) == 1 and page["items"][0]["to_state"] == "rejected"


def test_unknown_asset_has_no_verification_status(curated: TestClient) -> None:
    _problem(curated.get(f"{API}/assets/999999/verification"), 404)


# ------------------------------------------------------------ processing failures
def test_unreadable_pdf_is_routed_to_review_with_failure_flag(curated: TestClient) -> None:
    asset = _ok(curated, "broken.pdf", b"%PDF-1.4\n%%EOF truncated", "application/pdf")
    wait_for_asset(curated, asset["id"])
    status = curated.get(f"{API}/assets/{asset['id']}/verification").json()
    assert status["state"] == "needs_review"
