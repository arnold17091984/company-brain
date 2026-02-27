"""Health endpoint smoke test."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_health_returns_200() -> None:
    """GET /health must return 200 with status ok and a version string."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/health")

    assert response.status_code == 200

    body = response.json()
    assert body["status"] == "ok"
    assert "version" in body


@pytest.mark.asyncio
async def test_health_version_format() -> None:
    """The version field must follow semantic versioning (MAJOR.MINOR.PATCH)."""
    import re

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/health")

    version = response.json()["version"]
    assert re.match(r"^\d+\.\d+\.\d+$", version), f"Unexpected version format: {version}"
