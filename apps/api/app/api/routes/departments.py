"""Department management endpoints (admin only)."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import User, get_admin_user
from app.core.database import get_db
from app.models.database import Department
from app.models.database import User as DBUser
from app.models.schemas import DepartmentCreate, DepartmentResponse, DepartmentUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/departments", tags=["admin-departments"])


@router.get("", response_model=list[DepartmentResponse])
async def list_departments(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[DepartmentResponse]:
    """Return all departments with user counts."""
    stmt = (
        select(
            Department,
            func.count(DBUser.id).label("user_count"),
        )
        .outerjoin(DBUser, Department.id == DBUser.department_id)
        .group_by(Department.id)
        .order_by(Department.name)
    )
    result = await db.execute(stmt)
    rows = result.all()

    return [
        DepartmentResponse(
            id=str(dept.id),
            name=dept.name,
            slug=dept.slug,
            user_count=user_count,
            created_at=dept.created_at.isoformat(),
        )
        for dept, user_count in rows
    ]


@router.post("", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    body: DepartmentCreate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> DepartmentResponse:
    """Create a new department."""
    # Check for duplicate slug
    existing = await db.execute(select(Department).where(Department.slug == body.slug))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail=f"Department slug '{body.slug}' already exists.")

    dept = Department(name=body.name, slug=body.slug)
    db.add(dept)
    await db.flush()
    await db.commit()

    logger.info("Department '%s' created by %s", body.name, current_user.email)

    return DepartmentResponse(
        id=str(dept.id),
        name=dept.name,
        slug=dept.slug,
        user_count=0,
        created_at=dept.created_at.isoformat(),
    )


@router.patch("/{department_id}", response_model=DepartmentResponse)
async def update_department(
    department_id: str,
    body: DepartmentUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> DepartmentResponse:
    """Update a department's name or slug."""
    try:
        did = uuid.UUID(department_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid department_id format.") from None

    result = await db.execute(select(Department).where(Department.id == did))
    dept = result.scalar_one_or_none()
    if dept is None:
        raise HTTPException(status_code=404, detail="Department not found.")

    if body.name is not None:
        dept.name = body.name
    if body.slug is not None:
        # Check slug uniqueness
        slug_check = await db.execute(
            select(Department).where(Department.slug == body.slug, Department.id != did)
        )
        if slug_check.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail=f"Slug '{body.slug}' already exists.")
        dept.slug = body.slug

    await db.flush()
    await db.commit()

    # Get user count
    count_result = await db.execute(
        select(func.count(DBUser.id)).where(DBUser.department_id == did)
    )
    user_count = count_result.scalar_one()

    logger.info("Department %s updated by %s", department_id, current_user.email)

    return DepartmentResponse(
        id=str(dept.id),
        name=dept.name,
        slug=dept.slug,
        user_count=user_count,
        created_at=dept.created_at.isoformat(),
    )


@router.delete("/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_department(
    department_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a department (only if no users are assigned)."""
    try:
        did = uuid.UUID(department_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid department_id format.") from None

    result = await db.execute(select(Department).where(Department.id == did))
    dept = result.scalar_one_or_none()
    if dept is None:
        raise HTTPException(status_code=404, detail="Department not found.")

    # Check for assigned users
    user_count_result = await db.execute(
        select(func.count(DBUser.id)).where(DBUser.department_id == did)
    )
    user_count = user_count_result.scalar_one()
    if user_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete department with {user_count} assigned user(s). Reassign them first.",
        )

    await db.delete(dept)
    await db.commit()
    logger.info("Department %s deleted by %s", department_id, current_user.email)
