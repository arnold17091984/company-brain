"""User management endpoints (admin only)."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import User, get_admin_user
from app.core.database import get_db
from app.models.database import Department
from app.models.database import User as DBUser
from app.models.schemas import (
    BulkUserCreateItem,
    BulkUserCreateResult,
    UserCreate,
    UserDetailResponse,
    UserSummary,
    UserUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


@router.get("", response_model=list[UserSummary])
async def list_users(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[UserSummary]:
    """Return a summary list of all registered users."""
    stmt = (
        select(
            DBUser.id,
            DBUser.email,
            DBUser.name,
            DBUser.role,
            Department.name.label("department_name"),
            DBUser.department_id,
            DBUser.access_level,
            DBUser.telegram_id,
            DBUser.created_at,
        )
        .outerjoin(Department, DBUser.department_id == Department.id)
        .order_by(DBUser.created_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [
        UserSummary(
            id=str(row.id),
            email=row.email,
            name=row.name,
            role=row.role,
            department=row.department_name,
            department_id=str(row.department_id) if row.department_id else None,
            access_level=row.access_level,
            telegram_id=row.telegram_id,
            created_at=row.created_at.isoformat(),
        )
        for row in rows
    ]


@router.post("", response_model=UserDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> UserDetailResponse:
    """Pre-provision a new user account.

    Creates a user with google_id=None. When the user first signs in
    via Google OAuth, the existing get_or_create_user() flow will
    automatically link their Google account by matching email.
    """
    # Check for duplicate email
    existing = await db.execute(select(DBUser).where(DBUser.email == body.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    # Validate department if provided
    dept_uuid = None
    if body.department_id:
        try:
            dept_uuid = uuid.UUID(body.department_id)
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail="Invalid department_id format.",
            ) from None
        dept_result = await db.execute(select(Department).where(Department.id == dept_uuid))
        if dept_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Department not found.")

    new_user = DBUser(
        email=body.email,
        name=body.name,
        role=body.role,
        department_id=dept_uuid,
        access_level=body.access_level,
        google_id=None,
    )
    db.add(new_user)
    await db.flush()
    await db.commit()

    # Re-fetch with department name
    stmt = (
        select(DBUser, Department.name.label("department_name"))
        .outerjoin(Department, DBUser.department_id == Department.id)
        .where(DBUser.id == new_user.id)
    )
    result = await db.execute(stmt)
    row = result.one()
    user_obj = row[0]
    dept_name = row.department_name

    logger.info("User %s created by %s", body.email, current_user.email)

    return UserDetailResponse(
        id=str(user_obj.id),
        email=user_obj.email,
        name=user_obj.name,
        role=user_obj.role,
        department_id=(str(user_obj.department_id) if user_obj.department_id else None),
        department_name=dept_name,
        access_level=user_obj.access_level,
        telegram_id=user_obj.telegram_id,
        created_at=user_obj.created_at.isoformat(),
        updated_at=user_obj.updated_at.isoformat(),
    )


@router.post("/bulk", response_model=list[BulkUserCreateResult])
async def bulk_create_users(
    body: list[BulkUserCreateItem],
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[BulkUserCreateResult]:
    """Bulk-create multiple user accounts.

    Each user is created independently — failures for one do not
    block others. Returns per-user success/error results.
    """
    if len(body) > 200:
        raise HTTPException(
            status_code=422,
            detail="Maximum 200 users per bulk request.",
        )

    results: list[BulkUserCreateResult] = []
    for item in body:
        try:
            existing = await db.execute(select(DBUser).where(DBUser.email == item.email))
            if existing.scalar_one_or_none() is not None:
                results.append(
                    BulkUserCreateResult(
                        email=item.email,
                        success=False,
                        error="Email already exists",
                    )
                )
                continue

            dept_uuid = None
            if item.department_id:
                try:
                    dept_uuid = uuid.UUID(item.department_id)
                except ValueError:
                    results.append(
                        BulkUserCreateResult(
                            email=item.email,
                            success=False,
                            error="Invalid department_id",
                        )
                    )
                    continue

            new_user = DBUser(
                email=item.email,
                name=item.name,
                role=item.role,
                department_id=dept_uuid,
                access_level=item.access_level,
                google_id=None,
            )
            db.add(new_user)
            await db.flush()
            results.append(BulkUserCreateResult(email=item.email, success=True))
        except Exception as exc:
            logger.warning("Bulk create failed for %s: %s", item.email, exc)
            results.append(BulkUserCreateResult(email=item.email, success=False, error=str(exc)))

    await db.commit()
    created_count = sum(1 for r in results if r.success)
    logger.info("Bulk created %d/%d users by %s", created_count, len(body), current_user.email)
    return results


@router.get("/by-telegram/{telegram_id}", response_model=UserDetailResponse)
async def get_user_by_telegram(
    telegram_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> UserDetailResponse:
    """Look up a user by their Telegram ID."""
    stmt = (
        select(DBUser, Department.name.label("department_name"))
        .outerjoin(Department, DBUser.department_id == Department.id)
        .where(DBUser.telegram_id == telegram_id)
    )
    result = await db.execute(stmt)
    row = result.one_or_none()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail="No user linked to this Telegram ID.",
        )

    user_obj = row[0]
    dept_name = row.department_name

    return UserDetailResponse(
        id=str(user_obj.id),
        email=user_obj.email,
        name=user_obj.name,
        role=user_obj.role,
        department_id=(str(user_obj.department_id) if user_obj.department_id else None),
        department_name=dept_name,
        access_level=user_obj.access_level,
        telegram_id=user_obj.telegram_id,
        created_at=user_obj.created_at.isoformat(),
        updated_at=user_obj.updated_at.isoformat(),
    )


@router.get("/{user_id}", response_model=UserDetailResponse)
async def get_user(
    user_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> UserDetailResponse:
    """Return detailed user info with department."""
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid user_id format.") from None

    stmt = (
        select(DBUser, Department.name.label("department_name"))
        .outerjoin(Department, DBUser.department_id == Department.id)
        .where(DBUser.id == uid)
    )
    result = await db.execute(stmt)
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found.")

    user_obj = row[0]
    dept_name = row.department_name

    return UserDetailResponse(
        id=str(user_obj.id),
        email=user_obj.email,
        name=user_obj.name,
        role=user_obj.role,
        department_id=str(user_obj.department_id) if user_obj.department_id else None,
        department_name=dept_name,
        access_level=user_obj.access_level,
        telegram_id=user_obj.telegram_id,
        created_at=user_obj.created_at.isoformat(),
        updated_at=user_obj.updated_at.isoformat(),
    )


@router.patch("/{user_id}", response_model=UserDetailResponse)
async def update_user(
    user_id: str,
    body: UserUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> UserDetailResponse:
    """Update user role, department, access level, or name."""
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid user_id format.") from None

    result = await db.execute(select(DBUser).where(DBUser.id == uid))
    user_obj = result.scalar_one_or_none()
    if user_obj is None:
        raise HTTPException(status_code=404, detail="User not found.")

    if body.role is not None:
        user_obj.role = body.role
    if body.access_level is not None:
        user_obj.access_level = body.access_level
    if body.name is not None:
        user_obj.name = body.name
    if body.department_id is not None:
        try:
            dept_uuid = uuid.UUID(body.department_id)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid department_id format.") from None
        # Verify department exists
        dept_result = await db.execute(select(Department).where(Department.id == dept_uuid))
        if dept_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Department not found.")
        user_obj.department_id = dept_uuid

    if body.telegram_id is not None:
        # Check for duplicate telegram_id
        dup_result = await db.execute(
            select(DBUser).where(
                DBUser.telegram_id == body.telegram_id,
                DBUser.id != uid,
            )
        )
        if dup_result.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This Telegram ID is already linked to another user.",
            )
        user_obj.telegram_id = body.telegram_id

    await db.flush()
    await db.commit()

    # Re-fetch with department name
    stmt = (
        select(DBUser, Department.name.label("department_name"))
        .outerjoin(Department, DBUser.department_id == Department.id)
        .where(DBUser.id == uid)
    )
    result = await db.execute(stmt)
    row = result.one()
    updated_user = row[0]
    dept_name = row.department_name

    logger.info("User %s updated by %s", user_id, current_user.email)

    return UserDetailResponse(
        id=str(updated_user.id),
        email=updated_user.email,
        name=updated_user.name,
        role=updated_user.role,
        department_id=str(updated_user.department_id) if updated_user.department_id else None,
        department_name=dept_name,
        access_level=updated_user.access_level,
        telegram_id=updated_user.telegram_id,
        created_at=updated_user.created_at.isoformat(),
        updated_at=updated_user.updated_at.isoformat(),
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disable_user(
    user_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Disable a user by setting role to 'disabled'."""
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid user_id format.") from None

    result = await db.execute(select(DBUser).where(DBUser.id == uid))
    user_obj = result.scalar_one_or_none()
    if user_obj is None:
        raise HTTPException(status_code=404, detail="User not found.")

    if str(uid) == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot disable yourself.")

    user_obj.role = "disabled"
    await db.flush()
    await db.commit()
    logger.info("User %s disabled by %s", user_id, current_user.email)
