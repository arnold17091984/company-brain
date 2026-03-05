"""AI Template Market endpoints."""

from __future__ import annotations

import logging
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import User, get_current_user
from app.core.database import get_db
from app.models.database import PromptTemplate, PromptTemplateVote
from app.models.schemas import (
    PromptTemplateCreate,
    PromptTemplateListResponse,
    PromptTemplateResponse,
    PromptTemplateUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/templates", tags=["templates"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_response(
    template: PromptTemplate,
    voted_by_me: bool = False,
) -> PromptTemplateResponse:
    """Convert an ORM PromptTemplate to a PromptTemplateResponse schema.

    Args:
        template: An ORM PromptTemplate instance with ``user`` eagerly loaded.
        voted_by_me: Whether the requesting user has voted on this template.

    Returns:
        PromptTemplateResponse suitable for API serialisation.
    """
    user_name = template.user.name if template.user is not None else ""
    return PromptTemplateResponse(
        id=str(template.id),
        user_id=str(template.user_id),
        user_name=user_name,
        title=template.title,
        description=template.description,
        content=template.content,
        category=template.category,
        vote_count=template.vote_count,
        copy_count=template.copy_count,
        voted_by_me=voted_by_me,
        created_at=template.created_at.isoformat(),
        updated_at=template.updated_at.isoformat(),
    )


async def _get_voted_ids(
    db: AsyncSession,
    template_ids: list[uuid.UUID],
    user_uuid: uuid.UUID,
) -> set[uuid.UUID]:
    """Return the subset of template IDs that the given user has voted on.

    Args:
        db: Active database session.
        template_ids: List of template UUIDs to check.
        user_uuid: The user whose votes are being checked.

    Returns:
        A set of template UUIDs for which a vote row exists for this user.
    """
    if not template_ids:
        return set()

    stmt = select(PromptTemplateVote.template_id).where(
        PromptTemplateVote.template_id.in_(template_ids),
        PromptTemplateVote.user_id == user_uuid,
    )
    result = await db.execute(stmt)
    return set(result.scalars().all())


async def _fetch_template_or_404(
    db: AsyncSession,
    template_uuid: uuid.UUID,
) -> PromptTemplate:
    """Fetch a PromptTemplate by its UUID, raising 404 if not found.

    Args:
        db: Active database session.
        template_uuid: The UUID of the template to retrieve.

    Returns:
        The PromptTemplate ORM instance with the ``user`` relationship loaded.

    Raises:
        HTTPException: 404 if no template matches the given UUID.
    """
    stmt = (
        select(PromptTemplate)
        .options(selectinload(PromptTemplate.user))
        .where(PromptTemplate.id == template_uuid)
    )
    result = await db.execute(stmt)
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template {str(template_uuid)!r} not found",
        )
    return template


def _parse_template_id(template_id: str) -> uuid.UUID:
    """Parse a string template ID into a UUID, raising 400 on invalid format.

    Args:
        template_id: Raw path parameter string.

    Returns:
        Parsed UUID.

    Raises:
        HTTPException: 400 if the string is not a valid UUID.
    """
    try:
        return uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid template ID format: {template_id!r}",
        ) from None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=PromptTemplateListResponse)
async def list_templates(
    page: int = Query(default=1, ge=1, description="1-based page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    category: str | None = Query(default=None, description="Filter by category"),
    search: str | None = Query(
        default=None,
        description="Full-text search on title and description",
    ),
    sort: Literal["popular", "recent", "my"] = Query(
        default="recent",
        description="Sort order: 'popular' (most votes), 'recent' (newest), 'my' (own templates)",
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PromptTemplateListResponse:
    """List prompt templates with pagination, optional filtering, and sort order.

    Args:
        page: 1-based page number (default ``1``).
        page_size: Number of items per page (default ``20``, max ``100``).
        category: Optional category filter.
        search: Optional substring match against title and description.
        sort: Sort strategy - ``"popular"`` (vote_count desc), ``"recent"``
            (created_at desc), or ``"my"`` (current user's templates only).
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        PromptTemplateListResponse: Paginated template list with metadata.
    """
    logger.info(
        "List templates",
        extra={
            "user": current_user.email,
            "page": page,
            "page_size": page_size,
            "category": category,
            "search": search,
            "sort": sort,
        },
    )

    try:
        current_user_uuid = uuid.UUID(current_user.id)
    except ValueError:
        current_user_uuid = None  # type: ignore[assignment]

    # ── Base query ────────────────────────────────────────────────────────
    base_stmt = select(PromptTemplate).options(selectinload(PromptTemplate.user))

    # ── "my" sort filters by current user ────────────────────────────────
    if sort == "my" and current_user_uuid is not None:
        base_stmt = base_stmt.where(PromptTemplate.user_id == current_user_uuid)

    # ── Optional filters ──────────────────────────────────────────────────
    if category:
        base_stmt = base_stmt.where(PromptTemplate.category == category)

    if search:
        base_stmt = base_stmt.where(
            or_(
                PromptTemplate.title.ilike(f"%{search}%"),
                PromptTemplate.description.ilike(f"%{search}%"),
            )
        )

    # ── Total count ───────────────────────────────────────────────────────
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total_result = await db.execute(count_stmt)
    total: int = total_result.scalar_one() or 0

    # ── Sort order ────────────────────────────────────────────────────────
    if sort == "popular":
        order_col = PromptTemplate.vote_count.desc()
    else:
        # "recent" and "my" both order by newest first
        order_col = PromptTemplate.created_at.desc()

    # ── Paginated fetch ───────────────────────────────────────────────────
    offset = (page - 1) * page_size
    paginated_stmt = base_stmt.order_by(order_col).offset(offset).limit(page_size)
    rows_result = await db.execute(paginated_stmt)
    templates = rows_result.scalars().all()

    # ── Voted-by-me check ─────────────────────────────────────────────────
    template_ids = [t.id for t in templates]
    voted_ids: set[uuid.UUID] = set()
    if current_user_uuid is not None:
        voted_ids = await _get_voted_ids(db, template_ids, current_user_uuid)

    return PromptTemplateListResponse(
        templates=[_to_response(t, voted_by_me=t.id in voted_ids) for t in templates],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=PromptTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    body: PromptTemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PromptTemplateResponse:
    """Create a new prompt template owned by the current user.

    Args:
        body: Template creation payload.
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        PromptTemplateResponse for the newly created template.

    Raises:
        HTTPException: 400 if the current user ID is not a valid UUID.
    """
    logger.info("Create template", extra={"user": current_user.email, "title": body.title})

    try:
        user_uuid = uuid.UUID(current_user.id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid user ID format: {current_user.id!r}",
        ) from None

    template = PromptTemplate(
        user_id=user_uuid,
        title=body.title,
        description=body.description,
        content=body.content,
        category=body.category,
    )
    db.add(template)
    await db.flush()

    # Reload with user relationship populated
    template = await _fetch_template_or_404(db, template.id)

    logger.info(
        "Template created",
        extra={"user": current_user.email, "template_id": str(template.id)},
    )
    return _to_response(template, voted_by_me=False)


@router.get("/{template_id}", response_model=PromptTemplateResponse)
async def get_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PromptTemplateResponse:
    """Retrieve a single template by ID.

    Args:
        template_id: UUID string identifying the template.
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        PromptTemplateResponse for the requested template.

    Raises:
        HTTPException: 400 if ``template_id`` is not a valid UUID.
        HTTPException: 404 if the template does not exist.
    """
    logger.info(
        "Get template",
        extra={"user": current_user.email, "template_id": template_id},
    )

    template_uuid = _parse_template_id(template_id)
    template = await _fetch_template_or_404(db, template_uuid)

    voted_by_me = False
    try:
        current_user_uuid = uuid.UUID(current_user.id)
        voted_ids = await _get_voted_ids(db, [template_uuid], current_user_uuid)
        voted_by_me = template_uuid in voted_ids
    except ValueError:
        pass

    return _to_response(template, voted_by_me=voted_by_me)


@router.put("/{template_id}", response_model=PromptTemplateResponse)
async def update_template(
    template_id: str,
    body: PromptTemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PromptTemplateResponse:
    """Update an existing template (owner only).

    Args:
        template_id: UUID string identifying the template.
        body: Partial update payload; only provided fields are applied.
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        PromptTemplateResponse reflecting the applied changes.

    Raises:
        HTTPException: 400 if ``template_id`` is not a valid UUID.
        HTTPException: 403 if the current user is not the template owner.
        HTTPException: 404 if the template does not exist.
    """
    logger.info(
        "Update template",
        extra={"user": current_user.email, "template_id": template_id},
    )

    template_uuid = _parse_template_id(template_id)
    template = await _fetch_template_or_404(db, template_uuid)

    # Ownership check
    if str(template.user_id) != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to update this template",
        )

    # Apply partial updates
    if body.title is not None:
        template.title = body.title
    if body.description is not None:
        template.description = body.description
    if body.content is not None:
        template.content = body.content
    if body.category is not None:
        template.category = body.category

    await db.flush()

    # Reload to get the refreshed updated_at timestamp and eager relationship
    template = await _fetch_template_or_404(db, template_uuid)

    voted_by_me = False
    try:
        current_user_uuid = uuid.UUID(current_user.id)
        voted_ids = await _get_voted_ids(db, [template_uuid], current_user_uuid)
        voted_by_me = template_uuid in voted_ids
    except ValueError:
        pass

    logger.info(
        "Template updated",
        extra={"user": current_user.email, "template_id": template_id},
    )
    return _to_response(template, voted_by_me=voted_by_me)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a template (owner or admin only).

    Args:
        template_id: UUID string identifying the template.
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        None (HTTP 204 No Content).

    Raises:
        HTTPException: 400 if ``template_id`` is not a valid UUID.
        HTTPException: 403 if the user is neither the owner nor an admin.
        HTTPException: 404 if the template does not exist.
    """
    logger.info(
        "Delete template",
        extra={"user": current_user.email, "template_id": template_id},
    )

    template_uuid = _parse_template_id(template_id)
    template = await _fetch_template_or_404(db, template_uuid)

    # Permission check: owner or admin
    is_owner = str(template.user_id) == current_user.id
    is_admin = current_user.role == "admin"
    if not is_owner and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this template",
        )

    await db.delete(template)
    await db.flush()

    logger.info(
        "Template deleted",
        extra={"user": current_user.email, "template_id": template_id},
    )


@router.post("/{template_id}/vote", response_model=dict)
async def toggle_vote(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool | int]:
    """Toggle a vote on a template for the current user.

    If the user has not yet voted, adds a vote and increments ``vote_count``.
    If the user has already voted, removes the vote and decrements ``vote_count``.

    Args:
        template_id: UUID string identifying the template.
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        dict: ``{"voted": bool, "vote_count": int}`` reflecting the new state.

    Raises:
        HTTPException: 400 if ``template_id`` or the user ID are not valid UUIDs.
        HTTPException: 404 if the template does not exist.
    """
    logger.info(
        "Toggle vote",
        extra={"user": current_user.email, "template_id": template_id},
    )

    template_uuid = _parse_template_id(template_id)

    try:
        current_user_uuid = uuid.UUID(current_user.id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid user ID format: {current_user.id!r}",
        ) from None

    # Fetch the template (no user eager load needed here)
    stmt = select(PromptTemplate).where(PromptTemplate.id == template_uuid)
    result = await db.execute(stmt)
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template {template_id!r} not found",
        )

    # Check for an existing vote
    vote_stmt = select(PromptTemplateVote).where(
        PromptTemplateVote.template_id == template_uuid,
        PromptTemplateVote.user_id == current_user_uuid,
    )
    vote_result = await db.execute(vote_stmt)
    existing_vote = vote_result.scalar_one_or_none()

    if existing_vote is not None:
        # Remove vote
        await db.delete(existing_vote)
        template.vote_count = max(0, template.vote_count - 1)
        voted = False
    else:
        # Add vote
        new_vote = PromptTemplateVote(
            template_id=template_uuid,
            user_id=current_user_uuid,
        )
        db.add(new_vote)
        template.vote_count = template.vote_count + 1
        voted = True

    await db.flush()

    logger.info(
        "Vote toggled",
        extra={
            "user": current_user.email,
            "template_id": template_id,
            "voted": voted,
            "vote_count": template.vote_count,
        },
    )
    return {"voted": voted, "vote_count": template.vote_count}


@router.post("/{template_id}/copy", response_model=dict)
async def copy_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str | int]:
    """Increment the copy count for a template and return its content.

    Args:
        template_id: UUID string identifying the template.
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        dict: ``{"content": str, "copy_count": int}`` with the template content
        and updated copy count.

    Raises:
        HTTPException: 400 if ``template_id`` is not a valid UUID.
        HTTPException: 404 if the template does not exist.
    """
    logger.info(
        "Copy template",
        extra={"user": current_user.email, "template_id": template_id},
    )

    template_uuid = _parse_template_id(template_id)

    # Fetch without eager loading; we only need content and copy_count
    stmt = select(PromptTemplate).where(PromptTemplate.id == template_uuid)
    result = await db.execute(stmt)
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template {template_id!r} not found",
        )

    template.copy_count = template.copy_count + 1
    await db.flush()

    logger.info(
        "Template copied",
        extra={
            "user": current_user.email,
            "template_id": template_id,
            "copy_count": template.copy_count,
        },
    )
    return {"content": template.content, "copy_count": template.copy_count}
