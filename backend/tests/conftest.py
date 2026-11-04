"""Shared fixtures. Every test gets a throw-away SQLite database and storage directory, the
deterministic hashing embedder and no network access, so the suite is hermetic and fast."""

from __future__ import annotations

import os
import shutil
import tempfile
import time
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from typing import Any

# Must be set before `app` is imported: `app.main` builds a module-level app from the environment.
_SCRATCH = Path(tempfile.mkdtemp(prefix="heritagelens-tests-"))
os.environ.update(
    {
        "HL_ENV": "test",
        "HL_DATABASE_URL": f"sqlite+aiosqlite:///{(_SCRATCH / 'default.db').as_posix()}",
        "HL_STORAGE_DIR": str(_SCRATCH / "storage"),
        "HL_EMBEDDER": "hashing",
        "HL_ENABLE_IMAGE_SEARCH": "false",
        "HL_LOG_LEVEL": "WARNING",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import Settings  # noqa: E402
from app.db.session import Database  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services.embeddings import reset_embedders  # noqa: E402
from app.services.jobs import JobQueue  # noqa: E402
from app.services.pipeline import JobContext  # noqa: E402
from app.services.pipeline.index import reset_gazetteer_cache  # noqa: E402
from app.services.storage import build_storage  # noqa: E402
from app.workers.local import LocalWorker  # noqa: E402

WORKER_TOKEN = "test-worker-token"
TEST_PASSWORD = "correct horse battery staple"


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    shutil.rmtree(_SCRATCH, ignore_errors=True)


def make_settings(tmp_path: Path, **overrides: Any) -> Settings:
    base: dict[str, Any] = {
        "database_url": f"sqlite+aiosqlite:///{(tmp_path / 'hl.db').as_posix()}",
        "storage_dir": tmp_path / "storage",
        "embedder": "hashing",
        "enable_image_search": False,
        "embedded_worker": False,
        "gpu_fallback_to_cpu": False,
        "worker_poll_seconds": 0.05,
        "worker_token": WORKER_TOKEN,
        # TestClient talks plain HTTP; real deployments keep the secure default.
        "session_cookie_secure": False,
        "log_level": "WARNING",
    }
    base.update(overrides)
    return Settings(**base)


@pytest.fixture(autouse=True)
def _fresh_caches() -> Iterator[None]:
    reset_embedders()
    reset_gazetteer_cache()
    yield
    reset_embedders()
    reset_gazetteer_cache()


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return make_settings(tmp_path)


@pytest.fixture
async def ctx(settings: Settings) -> AsyncIterator[JobContext]:
    db = Database(settings)
    await db.create_all()
    try:
        yield JobContext(settings, db, build_storage(settings), JobQueue(settings))
    finally:
        await db.dispose()


async def drain(ctx: JobContext) -> int:
    """Run every queued CPU job (and the jobs they spawn) to completion."""
    return await LocalWorker(ctx).drain()


def login_as(client: TestClient, role: str = "archivist", email: str | None = None) -> dict[str, Any]:
    """Create the account when needed, then sign in through the real password flow."""
    address = email or f"{role}@example.com"
    body = {"email": address, "password": TEST_PASSWORD, "confirm_password": TEST_PASSWORD, "role": role}
    response = client.post("/api/v1/auth/signup", json=body)
    if response.status_code == 409:
        response = client.post("/api/v1/auth/login", json={"email": address, "password": TEST_PASSWORD})
    assert response.status_code in {200, 201}, response.text
    return dict(response.json())


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    """Full app with its embedded CPU worker, signed in as an archivist (the write-capable role)."""
    s = make_settings(tmp_path, embedded_worker=True)
    with TestClient(create_app(s)) as c:
        login_as(c)
        yield c


@pytest.fixture
def anonymous_client(tmp_path: Path) -> Iterator[TestClient]:
    """Full app without a session cookie, for authentication and role-denial tests."""
    s = make_settings(tmp_path, embedded_worker=True)
    with TestClient(create_app(s)) as c:
        yield c


def wait_for_asset(client: TestClient, asset_id: int, timeout: float = 20.0) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        asset = client.get(f"/api/v1/assets/{asset_id}").json()
        if asset["status"] in ("ready", "failed"):
            return asset
        time.sleep(0.1)
    raise AssertionError(f"asset {asset_id} did not finish processing in {timeout}s")
