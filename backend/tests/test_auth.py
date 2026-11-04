"""Password authentication: account creation, sign-in, sessions and role permissions."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.services.auth import verify_password
from tests.conftest import TEST_PASSWORD, login_as, make_settings

API = "/api/v1"
SITE = {
    "slug": "auth-test-site",
    "name": "Auth Test Site",
    "category": "stepwell",
    "state": "Gujarat",
    "lat": 23.8589,
    "lon": 72.1016,
    "summary": "A site used to check role-based write access.",
}
SIGNUP = {
    "email": "asha@example.com",
    "password": TEST_PASSWORD,
    "confirm_password": TEST_PASSWORD,
    "role": "archivist",
}


def test_signup_creates_an_account_and_starts_a_session(anonymous_client: TestClient) -> None:
    assert anonymous_client.get(f"{API}/auth/me").status_code == 401

    created = anonymous_client.post(f"{API}/auth/signup", json={**SIGNUP, "email": "Asha@Example.com"})
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["email"] == "asha@example.com"
    assert body["role"] == "archivist"
    assert {"contribute", "reprocess", "pipeline", "review"} <= set(body["permissions"])

    cookie = created.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie

    me = anonymous_client.get(f"{API}/auth/me")
    assert me.status_code == 200 and me.json()["email"] == "asha@example.com"

    assert anonymous_client.post(f"{API}/auth/logout").json() == {"ok": True}
    assert anonymous_client.get(f"{API}/auth/me").status_code == 401


def test_password_is_hashed_and_signs_in(tmp_path: Path) -> None:
    settings = make_settings(tmp_path)
    with TestClient(create_app(settings)) as client:
        created = client.post(f"{API}/auth/signup", json={**SIGNUP, "email": "stored@example.com"})
        assert created.status_code == 201, created.text

        with sqlite3.connect(tmp_path / "hl.db") as db:
            (stored,) = db.execute(
                "select password_hash from users where email = ?", ("stored@example.com",)
            ).fetchone()
        assert stored != TEST_PASSWORD
        assert TEST_PASSWORD not in stored
        assert verify_password(TEST_PASSWORD, stored)

        client.post(f"{API}/auth/logout")
        wrong = client.post(
            f"{API}/auth/login", json={"email": "stored@example.com", "password": "not-the-password"}
        )
        assert wrong.status_code == 401
        assert "incorrect" in wrong.json()["detail"]

        signed_in = client.post(
            f"{API}/auth/login", json={"email": "STORED@example.com", "password": TEST_PASSWORD}
        )
        assert signed_in.status_code == 200, signed_in.text
        assert signed_in.json()["email"] == "stored@example.com"


def test_signup_rejects_duplicate_accounts_and_bad_passwords(anonymous_client: TestClient) -> None:
    first = anonymous_client.post(f"{API}/auth/signup", json=SIGNUP)
    assert first.status_code == 201, first.text

    duplicate = anonymous_client.post(f"{API}/auth/signup", json=SIGNUP)
    assert duplicate.status_code == 409

    mismatch = anonymous_client.post(
        f"{API}/auth/signup",
        json={**SIGNUP, "email": "mismatch@example.com", "confirm_password": "something-else"},
    )
    assert mismatch.status_code == 422
    assert "do not match" in mismatch.text

    short = anonymous_client.post(
        f"{API}/auth/signup",
        json={
            **SIGNUP,
            "email": "short@example.com",
            "password": "short",
            "confirm_password": "short",
        },
    )
    assert short.status_code == 422


def test_login_rejects_unknown_email(anonymous_client: TestClient) -> None:
    rejected = anonymous_client.post(
        f"{API}/auth/login", json={"email": "nobody@example.com", "password": TEST_PASSWORD}
    )
    assert rejected.status_code == 401
    assert rejected.json()["detail"] == "email or password is incorrect"


def test_roles_gate_privileged_writes(anonymous_client: TestClient) -> None:
    for role in ("researcher", "academic", "tourism"):
        user = login_as(anonymous_client, role=role, email=f"{role}@example.com")
        assert "contribute" not in user["permissions"]
        denied = anonymous_client.post(f"{API}/sites", json={**SITE, "slug": f"{role}-site"})
        assert denied.status_code == 403, denied.text

    archivist = login_as(anonymous_client, role="archivist", email="archivist@example.com")
    assert {"contribute", "reprocess", "pipeline"} <= set(archivist["permissions"])
    allowed = anonymous_client.post(f"{API}/sites", json={**SITE, "slug": "archivist-site"})
    assert allowed.status_code == 201, allowed.text


def test_roles_cannot_be_self_assigned_as_admin(anonymous_client: TestClient) -> None:
    response = anonymous_client.post(
        f"{API}/auth/signup", json={**SIGNUP, "email": "admin@example.com", "role": "admin"}
    )
    assert response.status_code == 422
