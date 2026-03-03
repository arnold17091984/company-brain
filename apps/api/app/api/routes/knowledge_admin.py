"""Admin endpoints for promoting chat Q&A into the knowledge base."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from qdrant_client import AsyncQdrantClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import User, get_admin_user
from app.core.config import settings
from app.core.database import get_db
from app.models.database import AuditLog, ChatMessage, Document, Feedback, User as DBUser
from app.models.schemas import (
    KnowledgePromoteRequest,
    KnowledgePromoteResponse,
    PromotableQA,
    PromotableQAListResponse,
)
from app.services.knowledge_promoter import KnowledgePromoter
from app.services.rag.embedder import TogetherEmbeddingService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/knowledge", tags=["knowledge-admin"])


def _get_promoter() -> KnowledgePromoter:
    """Build a KnowledgePromoter with live services."""
    embedding_service = TogetherEmbeddingService(api_key=settings.together_ai_api_key)
    qdrant_client = AsyncQdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key or None,
    )
    return KnowledgePromoter(
        embedding_service=embedding_service,
        qdrant_client=qdrant_client,
    )


@router.get("/promotable", response_model=PromotableQAListResponse)
async def list_promotable_qa(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> PromotableQAListResponse:
    """List assistant messages that received thumbs-up feedback (promotable Q&A).

    Returns paginated results with upvote counts and promotion status.
    """
    # Subquery: count upvotes per message
    upvote_count = (
        func.count(Feedback.id)
        .filter(Feedback.rating == "up")
        .label("upvote_count")
    )

    # Base query: assistant messages with at least one upvote
    base_query = (
        select(
            ChatMessage.id.label("message_id"),
            ChatMessage.content.label("answer"),
            ChatMessage.session_id,
            ChatMessage.created_at,
            upvote_count,
        )
        .join(Feedback, Feedback.message_id == ChatMessage.id)
        .where(ChatMessage.role == "assistant")
        .group_by(ChatMessage.id)
        .having(func.count(Feedback.id).filter(Feedback.rating == "up") > 0)
    )

    # Count total
    count_result = await db.execute(
        select(func.count()).select_from(base_query.subquery())
    )
    total = count_result.scalar() or 0

    # Fetch page
    offset = (page - 1) * page_size
    rows = await db.execute(
        base_query
        .order_by(upvote_count.desc(), ChatMessage.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    results = rows.all()

    # Build response items
    items: list[PromotableQA] = []
    for row in results:
        msg_id = str(row.message_id)
        session_id = str(row.session_id)

        # Find the preceding user message (question)
        q_result = await db.execute(
            select(ChatMessage.content)
            .where(
                ChatMessage.session_id == row.session_id,
                ChatMessage.role == "user",
                ChatMessage.created_at < row.created_at,
            )
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        )
        question_row = q_result.scalar_one_or_none()
        question = question_row or "(No question found)"

        # Find user email for the session
        from app.models.database import ChatSession
        sess_result = await db.execute(
            select(DBUser.email)
            .join(ChatSession, ChatSession.user_id == DBUser.id)
            .where(ChatSession.id == row.session_id)
        )
        email_row = sess_result.scalar_one_or_none()

        # Check if already promoted
        source_id = f"chat_learned:{msg_id}"
        promoted_result = await db.execute(
            select(Document.id).where(Document.source_id == source_id)
        )
        already_promoted = promoted_result.scalar_one_or_none() is not None

        items.append(
            PromotableQA(
                message_id=msg_id,
                question=question[:500],
                answer=row.answer[:500],
                upvote_count=row.upvote_count,
                session_id=session_id,
                user_email=email_row or "",
                created_at=row.created_at.isoformat(),
                already_promoted=already_promoted,
            )
        )

    return PromotableQAListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/promote", response_model=KnowledgePromoteResponse)
async def promote_to_knowledge(
    request: KnowledgePromoteRequest,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> KnowledgePromoteResponse:
    """Promote a thumbs-up Q&A pair into the vector knowledge base."""
    promoter = _get_promoter()

    try:
        result = await promoter.promote(
            db=db,
            message_id=request.message_id,
            title=request.title,
            category=request.category,
            department_id=request.department_id,
            access_level=request.access_level,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    # Record audit log
    audit = AuditLog(
        user_id=admin.id,
        action="knowledge_promote",
        query=f"Promoted message {request.message_id}",
        metadata_={
            "document_id": result["document_id"],
            "title": result["title"],
            "chunks_count": result["chunks_count"],
        },
    )
    db.add(audit)
    await db.commit()

    return KnowledgePromoteResponse(
        document_id=result["document_id"],
        title=result["title"],
        status=result["status"],
        chunks_count=result["chunks_count"],
    )
