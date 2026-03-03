"""HR-specific API endpoints.

Provides category discovery and HR document listing with role-based ACL filtering.
Only users with roles ceo, executive, hr, or manager may access these endpoints.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import User, get_current_user
from app.core.database import get_db
from app.models.database import AuditLog, Document, DocumentACL
from app.models.schemas import DocumentListResponse, DocumentSummary

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/hr", tags=["hr"])

# ---------------------------------------------------------------------------
# HR category definitions
# ---------------------------------------------------------------------------

_HR_CATEGORIES: list[dict[str, str]] = [
    {"value": "hr_evaluation", "label": "Performance Evaluation"},
    {"value": "hr_compensation", "label": "Compensation & Benefits"},
    {"value": "hr_contract", "label": "Employment Contracts"},
    {"value": "hr_attendance", "label": "Attendance & Leave"},
    {"value": "hr_skills", "label": "Skills & Training"},
    {"value": "hr_org", "label": "Organization Chart"},
    {"value": "hr_compliance", "label": "Compliance (DOLE)"},
]

# Roles permitted to access HR endpoints at all
_ALLOWED_HR_ROLES = frozenset({"ceo", "executive", "hr", "manager"})

_HR_PREFIX = "hr_"
_HR_COMPENSATION = "hr_compensation"


def _require_hr_access(user: User) -> None:
    """Raise 403 if the user's role does not permit HR access.

    Args:
        user: The authenticated user.

    Raises:
        HTTPException: 403 when the role is not in the allowed HR roles set.
    """
    if user.role not in _ALLOWED_HR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to access HR data",
        )


def _build_hr_acl_filter(stmt: object, user: User) -> object:
    """Restrict an HR document query to what the given role may see.

    Args:
        stmt: A SQLAlchemy select statement targeting Document.
        user: The authenticated user.

    Returns:
        The select statement with role-specific HR filter applied.
    """
    role = user.role

    # CEO: full access, no additional filter
    if role == "ceo":
        return stmt

    # Executive: all HR except docs restricted to ceo-only ACL
    if role == "executive":
        ceo_only_subq = select(DocumentACL.document_id).where(
            and_(
                DocumentACL.document_id == Document.id,
                DocumentACL.grantee_type == "role",
                DocumentACL.grantee_id == "ceo",
            )
        )
        exec_grant_subq = select(DocumentACL.document_id).where(
            and_(
                DocumentACL.document_id == Document.id,
                or_(
                    and_(
                        DocumentACL.grantee_type == "role",
                        DocumentACL.grantee_id == "executive",
                    ),
                    and_(
                        DocumentACL.grantee_type == "user",
                        DocumentACL.grantee_id == user.id,
                    ),
                ),
            )
        )
        from sqlalchemy import not_  # noqa: PLC0415

        stmt = stmt.where(
            or_(
                not_(exists(ceo_only_subq)),
                exists(exec_grant_subq),
            )
        )
        return stmt

    # HR role: all HR docs except hr_compensation (unless explicitly granted)
    if role == "hr":
        hr_comp_grant_subq = select(DocumentACL.document_id).where(
            and_(
                DocumentACL.document_id == Document.id,
                or_(
                    and_(
                        DocumentACL.grantee_type == "role",
                        DocumentACL.grantee_id == "hr",
                    ),
                    and_(
                        DocumentACL.grantee_type == "user",
                        DocumentACL.grantee_id == user.id,
                    ),
                ),
            )
        )
        return stmt.where(
            or_(
                Document.category != _HR_COMPENSATION,
                exists(hr_comp_grant_subq),
            )
        )

    # Manager: own department HR docs + ACL-granted docs
    manager_acl_subq = select(DocumentACL.document_id).where(
        and_(
            DocumentACL.document_id == Document.id,
            or_(
                and_(
                    DocumentACL.grantee_type == "role",
                    DocumentACL.grantee_id == "manager",
                ),
                and_(
                    DocumentACL.grantee_type == "user",
                    DocumentACL.grantee_id == user.id,
                ),
            ),
        )
    )
    conditions: list[object] = [exists(manager_acl_subq)]
    if user.department_id:
        conditions.append(Document.department_id == uuid.UUID(user.department_id))
    return stmt.where(or_(*conditions))


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/categories", response_model=list[dict])
async def list_hr_categories(
    current_user: User = Depends(get_current_user),
) -> list[dict[str, str]]:
    """Return the list of available HR document categories.

    Args:
        current_user: Injected authenticated user.

    Returns:
        List of category dicts with ``value`` and ``label`` keys.

    Raises:
        HTTPException: 403 if the user lacks HR access.
    """
    _require_hr_access(current_user)
    return _HR_CATEGORIES


@router.get("/documents", response_model=DocumentListResponse)
async def list_hr_documents(
    page: int = Query(default=1, ge=1, description="1-based page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    category: str | None = Query(default=None, description="HR category filter"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentListResponse:
    """List HR documents filtered by category and the user's role + ACL.

    Args:
        page: 1-based page number (default ``1``).
        page_size: Number of items per page (default ``20``, max ``100``).
        category: Optional HR category to filter by (e.g. ``"hr_evaluation"``).
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        DocumentListResponse: Paginated HR document list.

    Raises:
        HTTPException: 403 if the user lacks HR access.
        HTTPException: 400 if ``category`` is not a valid HR category.
    """
    _require_hr_access(current_user)

    if category is not None and not category.startswith(_HR_PREFIX):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category {category!r} is not a valid HR category (must start with 'hr_')",
        )

    logger.info(
        "List HR documents",
        extra={
            "user": current_user.email,
            "role": current_user.role,
            "category": category,
            "page": page,
        },
    )

    # Base query: only HR categories
    from sqlalchemy import func  # noqa: PLC0415

    base_stmt = select(Document).where(Document.category.like(f"{_HR_PREFIX}%"))

    # Apply optional category filter
    if category:
        base_stmt = base_stmt.where(Document.category == category)

    # Apply role-based ACL filter
    base_stmt = _build_hr_acl_filter(base_stmt, current_user)  # type: ignore[assignment]

    # Total count
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total_result = await db.execute(count_stmt)
    total: int = total_result.scalar_one() or 0

    # Paginated fetch
    offset = (page - 1) * page_size
    paginated_stmt = base_stmt.order_by(Document.updated_at.desc()).offset(offset).limit(page_size)
    rows_result = await db.execute(paginated_stmt)
    docs = rows_result.scalars().all()

    # Audit log HR document access
    audit_entry = AuditLog(
        user_id=uuid.UUID(current_user.id),
        action="hr_document_access",
        query=category,
        metadata_={"category": category, "page": page, "result_count": len(docs)},
    )
    db.add(audit_entry)
    await db.flush()

    summaries: list[DocumentSummary] = []
    for doc in docs:
        meta = doc.metadata_ or {}
        related_emp = str(doc.related_employee_id) if doc.related_employee_id else None
        from app.api.routes.documents import _derive_status  # noqa: PLC0415

        summaries.append(
            DocumentSummary(
                id=str(doc.id),
                title=doc.title,
                source_type=doc.source_type,
                status=_derive_status(doc),
                access_level=doc.access_level,
                category=doc.category,
                related_employee_id=related_emp,
                created_at=doc.created_at.isoformat(),
                updated_at=doc.updated_at.isoformat(),
                indexed_at=doc.indexed_at.isoformat() if doc.indexed_at else None,
                file_size=meta.get("file_size"),
                mime_type=meta.get("mime_type"),
            )
        )

    return DocumentListResponse(
        documents=summaries,
        total=total,
        page=page,
        page_size=page_size,
    )
