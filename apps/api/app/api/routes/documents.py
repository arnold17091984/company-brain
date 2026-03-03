"""Document management endpoints."""

from __future__ import annotations

import hashlib
import json
import logging
import uuid

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import User, get_current_user
from app.core.database import get_db
from app.models.database import AuditLog, Document, DocumentACL
from app.models.schemas import (
    ACLEntry,
    DocumentListResponse,
    DocumentSummary,
    DocumentUploadResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

# ---------------------------------------------------------------------------
# Supported upload MIME types / extensions
# ---------------------------------------------------------------------------

_ALLOWED_CONTENT_TYPES: frozenset[str] = frozenset(
    {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "text/markdown",
        "text/csv",
        "application/octet-stream",  # fallback for clients that don't set content-type
    }
)

_ALLOWED_EXTENSIONS: frozenset[str] = frozenset({".pdf", ".docx", ".txt", ".md", ".csv"})

# Status values derived from Document.indexed_at / metadata_
_STATUS_PROCESSING = "processing"
_STATUS_INDEXED = "indexed"
_STATUS_ERROR = "error"

# Roles that have broad HR document access
_HR_ROLES = frozenset({"ceo", "executive", "hr"})
# Roles explicitly excluded from all HR documents
_ADMIN_ROLE = "admin"
# HR category prefix
_HR_PREFIX = "hr_"
# Valid categories
_VALID_CATEGORIES = frozenset(
    {
        "general",
        "hr_evaluation",
        "hr_compensation",
        "hr_contract",
        "hr_attendance",
        "hr_skills",
        "hr_org",
        "hr_compliance",
    }
)
# Compensation category (restricted even from hr role)
_HR_COMPENSATION = "hr_compensation"


def _derive_status(doc: Document) -> str:
    """Derive a display status from ORM Document fields.

    Args:
        doc: An ORM Document instance.

    Returns:
        One of ``"processing"``, ``"indexed"``, or ``"error"``.
    """
    meta = doc.metadata_ or {}
    if meta.get("error"):
        return _STATUS_ERROR
    if doc.indexed_at is not None:
        return _STATUS_INDEXED
    return _STATUS_PROCESSING


def _to_summary(doc: Document) -> DocumentSummary:
    """Convert an ORM Document to a ``DocumentSummary`` schema.

    Args:
        doc: An ORM Document instance.

    Returns:
        DocumentSummary suitable for API serialisation.
    """
    meta = doc.metadata_ or {}
    related_emp = str(doc.related_employee_id) if doc.related_employee_id else None
    return DocumentSummary(
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


def _apply_role_filter(
    stmt: object,
    user: User,
) -> object:
    """Apply role-based and ACL-based document filtering to a SELECT statement.

    Args:
        stmt: A SQLAlchemy select statement targeting Document.
        user: The authenticated user whose role and ID determine access.

    Returns:
        The select statement with access filters applied.
    """
    from sqlalchemy import and_, exists, not_  # noqa: PLC0415

    role = user.role

    # CEO sees everything
    if role == "ceo":
        return stmt

    # Admin cannot see any HR documents
    if role == _ADMIN_ROLE:
        return stmt.where(not_(Document.category.like(f"{_HR_PREFIX}%")))

    # Executive: all HR except docs restricted to ceo-only ACL
    # A doc is "ceo-only" if it has at least one role ACL entry for ceo
    # and no ACL entry for the executive role or the user's ID.
    if role == "executive":
        ceo_only_subq = (
            select(DocumentACL.document_id)
            .where(
                and_(
                    DocumentACL.grantee_type == "role",
                    DocumentACL.grantee_id == "ceo",
                )
            )
            .correlate(Document)
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
        # Exclude docs that have a ceo-only ACL unless executive is also granted
        stmt = stmt.where(
            or_(
                not_(Document.category.like(f"{_HR_PREFIX}%")),
                not_(exists(ceo_only_subq.where(DocumentACL.document_id == Document.id))),
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
        stmt = stmt.where(
            or_(
                Document.category != _HR_COMPENSATION,
                exists(hr_comp_grant_subq),
            )
        )
        return stmt

    # Manager: own department HR docs + general docs
    if role == "manager":
        conditions = [not_(Document.category.like(f"{_HR_PREFIX}%"))]
        if user.department_id:
            conditions.append(
                and_(
                    Document.category.like(f"{_HR_PREFIX}%"),
                    Document.department_id == uuid.UUID(user.department_id),
                )
            )
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
        conditions.append(exists(manager_acl_subq))
        return stmt.where(or_(*conditions))

    # Employee (default): own docs only — where related_employee_id matches or in ACL
    employee_acl_subq = select(DocumentACL.document_id).where(
        and_(
            DocumentACL.document_id == Document.id,
            DocumentACL.grantee_type == "user",
            DocumentACL.grantee_id == user.id,
        )
    )
    try:
        user_uuid = uuid.UUID(user.id)
        own_doc_condition = Document.related_employee_id == user_uuid
    except ValueError:
        own_doc_condition = None  # type: ignore[assignment]

    conditions_emp = [exists(employee_acl_subq)]
    if own_doc_condition is not None:
        conditions_emp.append(own_doc_condition)

    return stmt.where(
        or_(
            not_(Document.category.like(f"{_HR_PREFIX}%")),
            or_(*conditions_emp),
        )
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    page: int = Query(default=1, ge=1, description="1-based page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    search: str | None = Query(default=None, description="Full-text search on title"),
    source_type: str | None = Query(default=None, description="Filter by connector type"),
    category: str | None = Query(default=None, description="Filter by document category"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentListResponse:
    """List documents with pagination, optional search, and source-type filtering.

    Access is scoped by the user's role and ACL entries.

    Args:
        page: 1-based page number (default ``1``).
        page_size: Number of items per page (default ``20``, max ``100``).
        search: Optional substring match against the document title.
        source_type: Optional filter restricting results to a single connector type.
        category: Optional filter restricting results to a specific document category.
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        DocumentListResponse: Paginated document list with metadata.
    """
    logger.info(
        "List documents",
        extra={
            "user": current_user.email,
            "page": page,
            "page_size": page_size,
            "search": search,
            "source_type": source_type,
            "category": category,
        },
    )

    # ── Base query ────────────────────────────────────────────────────────
    base_stmt = select(Document)

    # ── Legacy access-level scoping (non-HR, non-role-based) ─────────────
    if current_user.access_level == "restricted":
        base_stmt = base_stmt.where(Document.access_level == "restricted")
    elif current_user.access_level == "department":
        filters = [Document.access_level == "restricted"]
        if current_user.department_id:
            filters.append(
                (Document.access_level == "department")
                & (Document.department_id == uuid.UUID(current_user.department_id))
            )
        base_stmt = base_stmt.where(or_(*filters))
    # "all" access level: no additional legacy filter

    # ── Role-based HR access filter ───────────────────────────────────────
    base_stmt = _apply_role_filter(base_stmt, current_user)  # type: ignore[assignment]

    # ── Optional filters ──────────────────────────────────────────────────
    if search:
        base_stmt = base_stmt.where(Document.title.ilike(f"%{search}%"))

    if source_type:
        base_stmt = base_stmt.where(Document.source_type == source_type)

    if category:
        base_stmt = base_stmt.where(Document.category == category)

    # ── Total count ───────────────────────────────────────────────────────
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total_result = await db.execute(count_stmt)
    total: int = total_result.scalar_one() or 0

    # ── Paginated fetch ───────────────────────────────────────────────────
    offset = (page - 1) * page_size
    paginated_stmt = base_stmt.order_by(Document.updated_at.desc()).offset(offset).limit(page_size)
    rows_result = await db.execute(paginated_stmt)
    docs = rows_result.scalars().all()

    return DocumentListResponse(
        documents=[_to_summary(doc) for doc in docs],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{document_id}", response_model=DocumentSummary)
async def get_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentSummary:
    """Retrieve a single document by ID.

    Args:
        document_id: UUID string identifying the document.
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        DocumentSummary for the requested document.

    Raises:
        HTTPException: 404 if the document does not exist.
        HTTPException: 400 if ``document_id`` is not a valid UUID.
    """
    logger.info(
        "Get document",
        extra={"user": current_user.email, "document_id": document_id},
    )

    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid document ID format: {document_id!r}",
        ) from None

    stmt = select(Document).where(Document.id == doc_uuid)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()

    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document {document_id!r} not found",
        )

    return _to_summary(doc)


@router.delete("/{document_id}", response_model=dict)
async def delete_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    """Delete a document record from the database.

    This performs a hard delete (removes the row).  Vector-store cleanup is
    handled by a background worker and is outside the scope of this phase.

    Args:
        document_id: UUID string identifying the document to delete.
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        ``{"deleted": true}`` on success.

    Raises:
        HTTPException: 404 if the document does not exist.
        HTTPException: 400 if ``document_id`` is not a valid UUID.
    """
    logger.info(
        "Delete document",
        extra={"user": current_user.email, "document_id": document_id},
    )

    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid document ID format: {document_id!r}",
        ) from None

    stmt = select(Document).where(Document.id == doc_uuid)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()

    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document {document_id!r} not found",
        )

    await db.delete(doc)
    await db.commit()

    logger.info("Document deleted", extra={"document_id": document_id, "user": current_user.email})
    return {"deleted": True}


@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile,
    category: str = Form(default="general"),
    acl: str = Form(default="[]"),
    related_employee_id: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentUploadResponse:
    """Accept a file upload and create a Document DB record for async processing.

    Supported file types: PDF, DOCX, TXT, MD, CSV.

    The file is read into memory to compute a SHA-256 content hash and derive
    metadata.  No chunking or embedding is performed here — those steps are
    handled by the ingestion pipeline (out of scope for this phase).

    Args:
        file: The uploaded file (multipart/form-data ``file`` field).
        category: Document category (default ``"general"``). HR categories
            require at least one ACL entry.
        acl: JSON-encoded list of ACLEntry objects (default ``"[]"``).
        related_employee_id: Optional UUID linking this document to an employee.
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        DocumentUploadResponse with the new document ID and initial status.

    Raises:
        HTTPException: 400 for unsupported file types, missing filenames,
            invalid ACL JSON, or HR docs without ACL entries.
        HTTPException: 413 if the file exceeds the 50 MB limit.
    """
    # ── Filename validation ───────────────────────────────────────────────
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a filename",
        )

    filename: str = file.filename
    dot_pos = filename.rfind(".")
    extension = filename[dot_pos:].lower() if dot_pos != -1 else ""

    if extension not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(f"Unsupported file type {extension!r}. Allowed: {sorted(_ALLOWED_EXTENSIONS)}"),
        )

    # ── Category validation ──────────────────────────────────────────────
    if category not in _VALID_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid category {category!r}. Valid: {sorted(_VALID_CATEGORIES)}",
        )

    # ── Parse ACL entries ─────────────────────────────────────────────────
    try:
        raw_acl = json.loads(acl)
        acl_entries = [ACLEntry.model_validate(entry) for entry in raw_acl]
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid ACL JSON: {exc}",
        ) from exc

    # ── HR category requires at least one ACL entry ───────────────────────
    if category.startswith(_HR_PREFIX) and not acl_entries:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"HR category {category!r} requires at least one ACL entry",
        )

    # ── Validate related_employee_id ──────────────────────────────────────
    related_emp_uuid: uuid.UUID | None = None
    if related_employee_id:
        try:
            related_emp_uuid = uuid.UUID(related_employee_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid related_employee_id format: {related_employee_id!r}",
            ) from None

    # ── Read file bytes (cap at 50 MB) ────────────────────────────────────
    _max_bytes = 50 * 1024 * 1024  # 50 MB
    raw = await file.read(_max_bytes + 1)
    if len(raw) > _max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds the 50 MB upload limit",
        )

    # ── Compute content hash ──────────────────────────────────────────────
    content_hash = hashlib.sha256(raw).hexdigest()

    # ── Determine MIME type ───────────────────────────────────────────────
    mime_type = file.content_type or "application/octet-stream"

    # ── Persist Document record ───────────────────────────────────────────
    doc = Document(
        source_type="upload",
        source_id=filename,
        title=filename,
        content_hash=content_hash,
        access_level=current_user.access_level,
        category=category,
        related_employee_id=related_emp_uuid,
        metadata_={
            "file_size": len(raw),
            "mime_type": mime_type,
            "original_filename": filename,
            "uploaded_by": current_user.email,
        },
    )
    db.add(doc)
    await db.flush()

    # ── Persist ACL entries ───────────────────────────────────────────────
    for entry in acl_entries:
        acl_row = DocumentACL(
            document_id=doc.id,
            grantee_type=entry.grantee_type,
            grantee_id=entry.grantee_id,
            permission=entry.permission,
        )
        db.add(acl_row)

    # ── Audit log for HR uploads ──────────────────────────────────────────
    if category.startswith(_HR_PREFIX):
        audit = AuditLog(
            user_id=uuid.UUID(current_user.id),
            action="hr_document_upload",
            metadata_={
                "document_id": str(doc.id),
                "category": category,
                "document_title": filename,
            },
        )
        db.add(audit)

    await db.commit()

    logger.info(
        "Document uploaded",
        extra={
            "user": current_user.email,
            "document_id": str(doc.id),
            "filename": filename,
            "file_size": len(raw),
            "category": category,
            "acl_count": len(acl_entries),
        },
    )

    return DocumentUploadResponse(
        id=str(doc.id),
        title=doc.title,
        status=_STATUS_PROCESSING,
    )
