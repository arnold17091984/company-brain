"""Notion connector – fetches pages and database entries via the Notion API.

Uses integration token (Bearer) auth and the Notion API v2022-06-28.
Block content is converted to a simplified Markdown representation so that the
chunker can apply consistent splitting logic.
"""

from __future__ import annotations

import hashlib
import logging
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

import httpx

from app.core.config import settings
from app.services.types import ConnectorType, RawDocument

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

_NOTION_API = "https://api.notion.com/v1"
_NOTION_VERSION = "2022-06-28"
_PAGE_SIZE = 100


# ── Markdown block renderer ──────────────────────────────────────────────────


def _rich_text_to_str(rich_text: list[dict[str, Any]]) -> str:
    """Concatenate plain_text from a rich_text array."""
    return "".join(rt.get("plain_text", "") for rt in rich_text)


def _block_to_markdown(block: dict[str, Any]) -> str:  # noqa: PLR0911
    """Convert a single Notion block object to a Markdown string."""
    btype: str = block.get("type", "")
    data: dict[str, Any] = block.get(btype, {})
    text = _rich_text_to_str(data.get("rich_text", []))

    if btype == "paragraph":
        return text
    if btype in ("heading_1", "heading_2", "heading_3"):
        level = int(btype[-1])
        return f"{'#' * level} {text}"
    if btype == "bulleted_list_item":
        return f"- {text}"
    if btype == "numbered_list_item":
        return f"1. {text}"
    if btype == "to_do":
        checked = data.get("checked", False)
        return f"- [{'x' if checked else ' '}] {text}"
    if btype == "toggle":
        return f"> {text}"
    if btype == "quote":
        return f"> {text}"
    if btype == "callout":
        emoji = (data.get("icon") or {}).get("emoji", "")
        return f"> {emoji} {text}".strip()
    if btype == "code":
        lang = data.get("language", "")
        return f"```{lang}\n{text}\n```"
    if btype == "divider":
        return "---"
    if btype == "equation":
        return f"$${data.get('expression', '')}$$"
    if btype == "table_row":
        cells = data.get("cells", [])
        row_text = " | ".join(_rich_text_to_str(cell) for cell in cells)
        return f"| {row_text} |"
    # Unsupported block types: return empty string
    return ""


# ── Connector class ──────────────────────────────────────────────────────────


class NotionConnector:
    """Fetches Notion pages and database entries as RawDocuments."""

    def __init__(self, *, integration_token: str | None = None) -> None:
        self._integration_token = integration_token

    @property
    def connector_type(self) -> ConnectorType:
        return ConnectorType.NOTION

    def _headers(self) -> dict[str, str]:
        token = self._integration_token or settings.notion_integration_token
        if not token:
            raise RuntimeError("notion_integration_token is not configured")
        return {
            "Authorization": f"Bearer {token}",
            "Notion-Version": _NOTION_VERSION,
            "Content-Type": "application/json",
        }

    # ── Search / listing ─────────────────────────────────────────────────────

    async def _search_pages(
        self,
        client: httpx.AsyncClient,
        since: datetime | None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield all page objects visible to the integration."""
        cursor: str | None = None
        filter_: dict[str, Any] = {"property": "object", "value": "page"}

        while True:
            body: dict[str, Any] = {
                "filter": filter_,
                "page_size": _PAGE_SIZE,
                "sort": {"direction": "descending", "timestamp": "last_edited_time"},
            }
            if cursor:
                body["start_cursor"] = cursor

            resp = await client.post(
                f"{_NOTION_API}/search",
                headers=self._headers(),
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()

            for result in data.get("results", []):
                # Skip pages that haven't changed since the watermark
                if since:
                    last_edited_str: str = result.get("last_edited_time", "")
                    if last_edited_str:
                        last_edited = datetime.fromisoformat(last_edited_str.replace("Z", "+00:00"))
                        if last_edited <= since.astimezone(UTC):
                            # Results are sorted descending so we can stop
                            return
                yield result

            if not data.get("has_more"):
                break
            cursor = data.get("next_cursor")

    # ── Block content fetching ───────────────────────────────────────────────

    async def _fetch_block_children(
        self,
        client: httpx.AsyncClient,
        block_id: str,
    ) -> list[dict[str, Any]]:
        """Recursively fetch all blocks under block_id."""
        blocks: list[dict[str, Any]] = []
        cursor: str | None = None

        while True:
            params: dict[str, Any] = {"page_size": _PAGE_SIZE}
            if cursor:
                params["start_cursor"] = cursor

            resp = await client.get(
                f"{_NOTION_API}/blocks/{block_id}/children",
                headers=self._headers(),
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()

            for block in data.get("results", []):
                blocks.append(block)
                # Recurse into children if the block has any
                if block.get("has_children"):
                    child_blocks = await self._fetch_block_children(client, block["id"])
                    blocks.extend(child_blocks)

            if not data.get("has_more"):
                break
            cursor = data.get("next_cursor")

        return blocks

    # ── Metadata extraction ──────────────────────────────────────────────────

    @staticmethod
    def _extract_title(page: dict[str, Any]) -> str:
        """Pull the title from a page's properties."""
        props: dict[str, Any] = page.get("properties", {})
        for prop_value in props.values():
            if prop_value.get("type") == "title":
                title_rt: list[dict[str, Any]] = prop_value.get("title", [])
                title = _rich_text_to_str(title_rt)
                if title:
                    return title
        return page.get("id", "Untitled")

    @staticmethod
    def _extract_url(page: dict[str, Any]) -> str:
        return page.get("url", "")

    # ── Public interface ─────────────────────────────────────────────────────

    async def fetch_documents(
        self,
        *,
        since: datetime | None = None,
    ) -> AsyncIterator[RawDocument]:
        """Yield RawDocuments from Notion pages.

        Args:
            since: Only return pages edited after this timestamp.
        """
        async with httpx.AsyncClient(timeout=60.0) as client:
            async for page in self._search_pages(client, since):
                page_id: str = page["id"]
                title = self._extract_title(page)

                try:
                    blocks = await self._fetch_block_children(client, page_id)
                except Exception as exc:
                    logger.warning("Failed to fetch Notion blocks for %s: %s", page_id, exc)
                    continue

                lines: list[str] = []
                for block in blocks:
                    md_line = _block_to_markdown(block)
                    if md_line:
                        lines.append(md_line)

                content = "\n\n".join(lines)
                if not content.strip():
                    logger.debug("Skipping empty Notion page %s", page_id)
                    continue

                content_hash = hashlib.sha256(content.encode()).hexdigest()
                last_edited: str = page.get("last_edited_time", "")

                yield RawDocument(
                    source_type=ConnectorType.NOTION,
                    source_id=page_id,
                    title=title,
                    content=content,
                    content_hash=content_hash,
                    url=self._extract_url(page),
                    access_level="restricted",
                    metadata={
                        "last_edited_time": last_edited,
                        "created_time": page.get("created_time", ""),
                        "object": page.get("object", "page"),
                    },
                )

    async def health_check(self) -> bool:
        """Return True if the Notion API is reachable."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{_NOTION_API}/users/me",
                    headers=self._headers(),
                )
                resp.raise_for_status()
                return True
        except Exception as exc:
            logger.error("Notion health check failed: %s", exc)
            return False
