"""Recipe extraction service.

Analyses chat history to identify effective AI usage patterns and
auto-generates draft AIRecipe records from messages that received
positive user feedback.
"""

from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AIRecipe, ChatMessage, Feedback

logger = logging.getLogger(__name__)


class RecipeExtractor:
    """Extract draft AI recipes from positively-rated chat messages.

    The extractor queries ChatMessage rows that have at least one ``"up"``
    Feedback rating, groups them by content similarity (prefix deduplication),
    and persists new draft AIRecipe records for any patterns not already
    represented in the recipes table.

    Attributes:
        db: An active async database session used for all queries and writes.

    Example::

        async with AsyncSessionLocal() as db:
            extractor = RecipeExtractor(db)
            drafts = await extractor.extract_recipes()
    """

    def __init__(self, db: AsyncSession) -> None:
        """Initialise the extractor with a database session.

        Args:
            db: An active SQLAlchemy async session.
        """
        self.db = db

    async def extract_recipes(self) -> list[dict]:
        """Find effective prompts and create draft AIRecipe records from them.

        Queries ChatMessage rows (role=``"user"``) that are joined to at
        least one Feedback row with ``rating="up"``.  Each unique message
        content becomes a candidate for a draft recipe.  Candidates whose
        title (first 80 chars of content) already matches an existing
        AIRecipe title are skipped to avoid duplication.

        Returns:
            list[dict]: A list of dicts representing the created draft
            recipes.  Each dict mirrors the AIRecipe columns:
            ``id``, ``title``, ``description``, ``prompt_template``,
            ``example_query``, ``source``, ``status``.

        Raises:
            sqlalchemy.exc.SQLAlchemyError: If a database operation fails.
        """
        logger.info("Starting recipe extraction from positively-rated messages")

        # ── Step 1: Fetch user messages with at least one "up" feedback ──────
        # Subquery: message_ids that have a positive feedback rating
        positive_message_ids_subq = (
            select(Feedback.message_id)
            .where(Feedback.rating == "up")
            .distinct()
            .scalar_subquery()
        )

        stmt = (
            select(ChatMessage)
            .where(
                ChatMessage.role == "user",
                ChatMessage.id.in_(positive_message_ids_subq),
            )
            .order_by(ChatMessage.created_at.desc())
        )
        result = await self.db.execute(stmt)
        messages: list[ChatMessage] = list(result.scalars().all())

        logger.info("Found %d positively-rated user messages", len(messages))

        if not messages:
            return []

        # ── Step 2: Aggregate feedback counts per message content ─────────────
        # Count how many distinct users gave "up" rating to messages with the
        # same content, to approximate an effectiveness score.
        content_feedback_stmt = (
            select(
                ChatMessage.content,
                func.count(Feedback.id).label("up_count"),
            )
            .join(Feedback, Feedback.message_id == ChatMessage.id)
            .where(
                ChatMessage.role == "user",
                Feedback.rating == "up",
            )
            .group_by(ChatMessage.content)
            .order_by(func.count(Feedback.id).desc())
        )
        feedback_result = await self.db.execute(content_feedback_stmt)
        content_counts: dict[str, int] = {
            row.content: row.up_count for row in feedback_result
        }

        # ── Step 3: Fetch existing recipe titles to avoid duplicates ──────────
        existing_titles_stmt = select(AIRecipe.title)
        existing_result = await self.db.execute(existing_titles_stmt)
        existing_titles: frozenset[str] = frozenset(
            title.lower() for (title,) in existing_result
        )

        # ── Step 4: Deduplicate candidates by content prefix ─────────────────
        # Use the first 80 characters as a deduplication key so that near-
        # identical prompts only produce a single recipe draft.
        seen_prefixes: set[str] = set()
        candidates: list[ChatMessage] = []

        for msg in messages:
            prefix = msg.content[:80].strip().lower()
            if prefix not in seen_prefixes:
                seen_prefixes.add(prefix)
                candidates.append(msg)

        logger.info("Deduplicated to %d candidate messages", len(candidates))

        # ── Step 5: Create draft AIRecipe rows for novel candidates ───────────
        created: list[dict] = []

        for msg in candidates:
            title = _derive_title(msg.content)
            if title.lower() in existing_titles:
                logger.debug("Skipping duplicate recipe title: %r", title)
                continue

            effectiveness = _normalise_effectiveness(
                content_counts.get(msg.content, 1)
            )

            recipe = AIRecipe(
                title=title,
                description=(
                    f"Auto-extracted recipe from a positively-rated chat message "
                    f"({content_counts.get(msg.content, 1)} upvotes)."
                ),
                prompt_template=msg.content,
                example_query=msg.content,
                example_response="",
                category="general",
                effectiveness_score=effectiveness,
                source="extracted",
                status="draft",
            )
            self.db.add(recipe)
            await self.db.flush()

            recipe_dict: dict = {
                "id": str(recipe.id),
                "title": recipe.title,
                "description": recipe.description,
                "prompt_template": recipe.prompt_template,
                "example_query": recipe.example_query,
                "source": recipe.source,
                "status": recipe.status,
            }
            created.append(recipe_dict)

            # Track new title to prevent within-batch duplicates
            existing_titles = existing_titles | frozenset([title.lower()])

        await self.db.commit()

        logger.info(
            "Recipe extraction complete: %d new draft recipes created", len(created)
        )
        return created


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _derive_title(content: str, max_length: int = 60) -> str:
    """Derive a short recipe title from message content.

    Takes the first sentence or the first ``max_length`` characters,
    whichever is shorter, and strips surrounding whitespace.

    Args:
        content: The raw message content to derive a title from.
        max_length: Maximum character length for the returned title.

    Returns:
        A non-empty title string.
    """
    # Use the first sentence (up to first `.`, `?`, or `!`) as the title
    for sep in (".", "?", "!"):
        idx = content.find(sep)
        if 0 < idx <= max_length:
            return content[: idx + 1].strip()

    # Fall back to truncating at max_length with an ellipsis
    stripped = content.strip()
    if len(stripped) <= max_length:
        return stripped
    return stripped[:max_length].rstrip() + "..."


def _normalise_effectiveness(up_count: int, ceiling: int = 20) -> float:
    """Normalise an upvote count to a 0.0–1.0 effectiveness score.

    Scores are clamped to ``ceiling`` before normalising so that very
    popular prompts cap at ``1.0`` rather than exceeding it.

    Args:
        up_count: Raw number of ``"up"`` feedback ratings for the message.
        ceiling: The upvote count that maps to a score of ``1.0``.

    Returns:
        float: Effectiveness score in the range ``[0.0, 1.0]``.
    """
    return min(up_count, ceiling) / ceiling
