"""Telegram connector – fetches message history from monitored channels/groups.

Uses the Bot API (not the MTProto API) with httpx.  The bot must be a member
of every channel or group it should read.

Message threading is reconstructed by grouping on ``reply_to_message_id``.
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

_BOT_API = "https://api.telegram.org"
# Maximum messages per getUpdates / forwardMessages batch
_BATCH_LIMIT = 100
# We combine messages in the same thread into one document; cap content size
_MAX_THREAD_CHARS = 8_000


# ── Connector class ──────────────────────────────────────────────────────────


class TelegramConnector:
    """Reads message history from Telegram channels/groups via the Bot API."""

    def __init__(self, *, bot_token: str | None = None) -> None:
        self._bot_token = bot_token

    @property
    def connector_type(self) -> ConnectorType:
        return ConnectorType.TELEGRAM

    def _base_url(self) -> str:
        token = self._bot_token or settings.telegram_bot_token
        if not token:
            raise RuntimeError("telegram_bot_token is not configured")
        return f"{_BOT_API}/bot{token}"

    # ── Low-level API helpers ────────────────────────────────────────────────

    async def _api_call(
        self,
        client: httpx.AsyncClient,
        method: str,
        **params: Any,
    ) -> Any:
        """Call a Telegram Bot API method and return the ``result`` field."""
        resp = await client.post(
            f"{self._base_url()}/{method}",
            json={k: v for k, v in params.items() if v is not None},
        )
        resp.raise_for_status()
        body = resp.json()
        if not body.get("ok"):
            raise RuntimeError(f"Telegram API error: {body.get('description')}")
        return body["result"]

    # ── Message fetching ─────────────────────────────────────────────────────

    async def _get_updates(
        self,
        client: httpx.AsyncClient,
        offset: int | None,
        limit: int = _BATCH_LIMIT,
    ) -> list[dict[str, Any]]:
        """Fetch pending updates (messages) from getUpdates."""
        params: dict[str, Any] = {
            "limit": limit,
            "timeout": 0,
            "allowed_updates": ["message", "channel_post"],
        }
        if offset is not None:
            params["offset"] = offset

        result = await self._api_call(client, "getUpdates", **params)
        return result if isinstance(result, list) else []

    @staticmethod
    def _since_to_offset(since: datetime | None) -> int | None:
        """Convert a since timestamp to an approximate update_id offset.

        The Bot API doesn't support time-based filtering directly; we use the
        Unix timestamp as a lower-bound update_id proxy (update IDs are not
        Unix timestamps, but they are monotonically increasing, so we log a
        note that this is approximate).
        """
        if since is None:
            return None
        # We cannot derive an exact offset from a timestamp without state.
        # Return None and filter messages by date in the caller.
        return None

    # ── Thread grouping ──────────────────────────────────────────────────────

    @staticmethod
    def _group_into_threads(
        messages: list[dict[str, Any]],
    ) -> dict[int, list[dict[str, Any]]]:
        """Group messages by thread root message_id.

        A thread root is any message without reply_to_message_id or whose
        reply parent is not in the current batch.
        """
        msg_ids = {m["message_id"] for m in messages}
        threads: dict[int, list[dict[str, Any]]] = {}

        for msg in messages:
            reply_to = (msg.get("reply_to_message") or {}).get("message_id")
            root_id: int = reply_to if reply_to and reply_to in msg_ids else msg["message_id"]
            threads.setdefault(root_id, []).append(msg)

        return threads

    @staticmethod
    def _thread_to_text(messages: list[dict[str, Any]]) -> str:
        """Concatenate message texts in a thread, newest last."""
        sorted_msgs = sorted(messages, key=lambda m: m.get("date", 0))
        lines: list[str] = []
        for msg in sorted_msgs:
            sender = (
                (msg.get("from") or {}).get("username")
                or (msg.get("from") or {}).get("first_name")
                or "unknown"
            )
            text: str = msg.get("text") or msg.get("caption") or ""
            if text:
                lines.append(f"[{sender}]: {text}")
        return "\n".join(lines)

    # ── Public interface ─────────────────────────────────────────────────────

    async def fetch_documents(
        self,
        *,
        since: datetime | None = None,
    ) -> AsyncIterator[RawDocument]:
        """Yield RawDocuments from Telegram messages.

        Each thread (root message + replies) becomes one document.
        Messages without text content are skipped.

        Args:
            since: Only return messages sent after this timestamp.
        """
        since_ts: float = since.astimezone(UTC).timestamp() if since else 0.0

        async with httpx.AsyncClient(timeout=30.0) as client:
            offset: int | None = None
            seen_update_ids: set[int] = set()

            while True:
                updates = await self._get_updates(client, offset)
                if not updates:
                    break

                # Advance offset past the last processed update
                max_update_id = max(u["update_id"] for u in updates)
                offset = max_update_id + 1

                if max_update_id in seen_update_ids:
                    # Guard against infinite loops
                    break
                seen_update_ids.add(max_update_id)

                # Collect messages from updates
                messages: list[dict[str, Any]] = []
                for update in updates:
                    msg: dict[str, Any] | None = update.get("message") or update.get("channel_post")
                    if not msg:
                        continue
                    msg_date: int = msg.get("date", 0)
                    if msg_date < since_ts:
                        continue
                    if not (msg.get("text") or msg.get("caption")):
                        continue
                    messages.append(msg)

                if not messages:
                    # All updates were older than `since` – stop paginating
                    if since and all(
                        (u.get("message") or u.get("channel_post") or {}).get("date", 0) < since_ts
                        for u in updates
                    ):
                        break
                    continue

                threads = self._group_into_threads(messages)

                for root_id, thread_msgs in threads.items():
                    content = self._thread_to_text(thread_msgs)
                    if not content.strip():
                        continue
                    # Truncate overly long threads
                    content = content[:_MAX_THREAD_CHARS]

                    first_msg = min(thread_msgs, key=lambda m: m.get("date", 0))
                    chat: dict[str, Any] = first_msg.get("chat", {})
                    chat_id: int | str = chat.get("id", 0)
                    chat_title: str = chat.get("title") or chat.get("username") or str(chat_id)
                    source_id = f"{chat_id}:{root_id}"
                    title = f"{chat_title} – message {root_id}"

                    # Detect language from chat username heuristics (best-effort)
                    content_hash = hashlib.sha256(content.encode()).hexdigest()
                    msg_date_dt = datetime.fromtimestamp(first_msg.get("date", 0), tz=UTC)

                    yield RawDocument(
                        source_type=ConnectorType.TELEGRAM,
                        source_id=source_id,
                        title=title,
                        content=content,
                        content_hash=content_hash,
                        url="",
                        access_level="restricted",
                        metadata={
                            "chat_id": chat_id,
                            "chat_title": chat_title,
                            "root_message_id": root_id,
                            "message_count": len(thread_msgs),
                            "date": msg_date_dt.isoformat(),
                        },
                        fetched_at=datetime.now(tz=UTC),
                    )

                # If we received fewer updates than the batch limit we've reached the end
                if len(updates) < _BATCH_LIMIT:
                    break

    async def health_check(self) -> bool:
        """Return True if the bot token is valid (getMe succeeds)."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await self._api_call(client, "getMe")
                return True
        except Exception as exc:
            logger.error("Telegram health check failed: %s", exc)
            return False
