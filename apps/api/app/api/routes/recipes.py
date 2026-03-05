"""AI Recipe Book endpoints."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import User, get_current_user
from app.core.database import get_db
from app.models.database import AIRecipe
from app.models.schemas import (
    AIRecipeCreate,
    AIRecipeListResponse,
    AIRecipeResponse,
    AIRecipeUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/recipes", tags=["recipes"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_response(recipe: AIRecipe) -> AIRecipeResponse:
    """Convert an ORM AIRecipe to an AIRecipeResponse schema.

    Args:
        recipe: An ORM AIRecipe instance (department relationship must be loaded).

    Returns:
        AIRecipeResponse suitable for API serialisation.
    """
    department_name: str | None = None
    if recipe.department is not None:
        department_name = recipe.department.name

    return AIRecipeResponse(
        id=str(recipe.id),
        title=recipe.title,
        description=recipe.description,
        prompt_template=recipe.prompt_template,
        example_query=recipe.example_query,
        example_response=recipe.example_response,
        department_id=str(recipe.department_id) if recipe.department_id else None,
        department_name=department_name,
        category=recipe.category,
        effectiveness_score=recipe.effectiveness_score,
        usage_count=recipe.usage_count,
        source=recipe.source,
        status=recipe.status,
        created_at=recipe.created_at.isoformat(),
        updated_at=recipe.updated_at.isoformat(),
    )


def _require_admin(current_user: User) -> None:
    """Raise 403 if the user does not have the admin role.

    Args:
        current_user: The authenticated user to check.

    Raises:
        HTTPException: 403 if the user's role is not ``"admin"``.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )


# ---------------------------------------------------------------------------
# Endpoints
# NOTE: /onboarding and /departments are declared BEFORE /{recipe_id} to
#       prevent FastAPI from treating those literal path segments as UUIDs.
# ---------------------------------------------------------------------------


@router.get("", response_model=AIRecipeListResponse)
async def list_recipes(
    page: int = Query(default=1, ge=1, description="1-based page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    category: str | None = Query(default=None, description="Filter by category"),
    department_id: str | None = Query(default=None, description="Filter by department UUID"),
    search: str | None = Query(default=None, description="Full-text search on title/description"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIRecipeListResponse:
    """List published AI recipes with optional filtering and pagination.

    Only recipes with ``status="published"`` are returned.  Results are
    ordered by ``effectiveness_score`` descending.

    Args:
        page: 1-based page number (default ``1``).
        page_size: Number of items per page (default ``20``, max ``100``).
        category: Optional category filter.
        department_id: Optional department UUID filter.
        search: Optional substring match against title and description.
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        AIRecipeListResponse: Paginated recipe list with metadata.
    """
    logger.info(
        "List recipes",
        extra={
            "user": current_user.email,
            "page": page,
            "page_size": page_size,
            "category": category,
            "department_id": department_id,
            "search": search,
        },
    )

    base_stmt = (
        select(AIRecipe)
        .where(AIRecipe.status == "published")
        .options(selectinload(AIRecipe.department))
    )

    if category:
        base_stmt = base_stmt.where(AIRecipe.category == category)

    if department_id:
        try:
            dept_uuid = uuid.UUID(department_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid department_id format: {department_id!r}",
            ) from None
        base_stmt = base_stmt.where(AIRecipe.department_id == dept_uuid)

    if search:
        escaped = search.replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        base_stmt = base_stmt.where(
            AIRecipe.title.ilike(pattern) | AIRecipe.description.ilike(pattern)
        )

    # Total count
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total_result = await db.execute(count_stmt)
    total: int = total_result.scalar_one() or 0

    # Paginated fetch
    offset = (page - 1) * page_size
    paginated_stmt = (
        base_stmt.order_by(AIRecipe.effectiveness_score.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows_result = await db.execute(paginated_stmt)
    recipes = rows_result.scalars().all()

    return AIRecipeListResponse(
        recipes=[_to_response(r) for r in recipes],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/onboarding", response_model=list[AIRecipeResponse])
async def get_onboarding_recipes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AIRecipeResponse]:
    """Return the top published recipes for the current user's department.

    Recipes are filtered by the user's ``department_id`` and sorted by
    ``effectiveness_score`` descending.  At most 10 recipes are returned.

    Args:
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        list[AIRecipeResponse]: Up to 10 recipes ranked by effectiveness.
    """
    logger.info(
        "Onboarding recipes",
        extra={"user": current_user.email, "department_id": current_user.department_id},
    )

    stmt = (
        select(AIRecipe)
        .where(AIRecipe.status == "published")
        .options(selectinload(AIRecipe.department))
        .order_by(AIRecipe.effectiveness_score.desc())
        .limit(10)
    )

    if current_user.department_id:
        try:
            dept_uuid = uuid.UUID(current_user.department_id)
        except ValueError:
            dept_uuid = None  # type: ignore[assignment]

        if dept_uuid is not None:
            stmt = stmt.where(AIRecipe.department_id == dept_uuid)

    result = await db.execute(stmt)
    recipes = result.scalars().all()

    return [_to_response(r) for r in recipes]


@router.get("/departments", response_model=dict)
async def get_recipes_by_department(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Return published recipes grouped by department name with recipe counts.

    Recipes with no associated department are grouped under the key
    ``"Unassigned"``.

    Args:
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        dict: Keys are department names, values are dicts containing
        ``count`` (int) and ``recipes`` (list of AIRecipeResponse).
    """
    logger.info("Recipes by department", extra={"user": current_user.email})

    stmt = (
        select(AIRecipe)
        .where(AIRecipe.status == "published")
        .options(selectinload(AIRecipe.department))
        .order_by(AIRecipe.effectiveness_score.desc())
    )
    result = await db.execute(stmt)
    recipes = result.scalars().all()

    grouped: dict[str, dict[str, object]] = {}
    for recipe in recipes:
        dept_name = recipe.department.name if recipe.department else "Unassigned"
        if dept_name not in grouped:
            grouped[dept_name] = {"count": 0, "recipes": []}
        grouped[dept_name]["count"] = int(grouped[dept_name]["count"]) + 1  # type: ignore[arg-type]
        grouped[dept_name]["recipes"].append(_to_response(recipe))  # type: ignore[union-attr]

    return grouped


@router.get("/{recipe_id}", response_model=AIRecipeResponse)
async def get_recipe(
    recipe_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIRecipeResponse:
    """Retrieve a single recipe by ID and increment its usage counter.

    Args:
        recipe_id: UUID string identifying the recipe.
        current_user: Injected authenticated user.
        db: Injected database session.

    Returns:
        AIRecipeResponse for the requested recipe.

    Raises:
        HTTPException: 404 if the recipe does not exist.
        HTTPException: 400 if ``recipe_id`` is not a valid UUID.
    """
    logger.info(
        "Get recipe",
        extra={"user": current_user.email, "recipe_id": recipe_id},
    )

    try:
        recipe_uuid = uuid.UUID(recipe_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid recipe ID format: {recipe_id!r}",
        ) from None

    stmt = (
        select(AIRecipe)
        .where(AIRecipe.id == recipe_uuid)
        .options(selectinload(AIRecipe.department))
    )
    result = await db.execute(stmt)
    recipe = result.scalar_one_or_none()

    if recipe is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Recipe {recipe_id!r} not found",
        )

    # Increment usage counter on every view
    recipe.usage_count += 1
    await db.flush()

    return _to_response(recipe)


@router.post("", response_model=AIRecipeResponse, status_code=status.HTTP_201_CREATED)
async def create_recipe(
    body: AIRecipeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIRecipeResponse:
    """Create a new AI recipe.  Admin role required.

    Args:
        body: AIRecipeCreate payload with recipe details.
        current_user: Injected authenticated user (must be admin).
        db: Injected database session.

    Returns:
        AIRecipeResponse for the newly created recipe.

    Raises:
        HTTPException: 403 if the user is not an admin.
        HTTPException: 400 if ``department_id`` is provided but not a valid UUID.
    """
    _require_admin(current_user)

    logger.info("Create recipe", extra={"user": current_user.email, "title": body.title})

    dept_uuid: uuid.UUID | None = None
    if body.department_id:
        try:
            dept_uuid = uuid.UUID(body.department_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid department_id format: {body.department_id!r}",
            ) from None

    recipe = AIRecipe(
        title=body.title,
        description=body.description,
        prompt_template=body.prompt_template,
        example_query=body.example_query,
        example_response=body.example_response,
        department_id=dept_uuid,
        category=body.category,
        status=body.status,
        source="manual",
    )
    db.add(recipe)
    await db.flush()

    # Reload with department relationship for response serialisation
    stmt = (
        select(AIRecipe)
        .where(AIRecipe.id == recipe.id)
        .options(selectinload(AIRecipe.department))
    )
    result = await db.execute(stmt)
    recipe = result.scalar_one()

    logger.info("Recipe created", extra={"recipe_id": str(recipe.id), "user": current_user.email})

    return _to_response(recipe)


@router.put("/{recipe_id}", response_model=AIRecipeResponse)
async def update_recipe(
    recipe_id: str,
    body: AIRecipeUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIRecipeResponse:
    """Update an existing AI recipe.  Admin role required.

    Only fields present in the request body (non-None) are updated.

    Args:
        recipe_id: UUID string identifying the recipe to update.
        body: AIRecipeUpdate payload with the fields to modify.
        current_user: Injected authenticated user (must be admin).
        db: Injected database session.

    Returns:
        AIRecipeResponse for the updated recipe.

    Raises:
        HTTPException: 403 if the user is not an admin.
        HTTPException: 404 if the recipe does not exist.
        HTTPException: 400 if ``recipe_id`` or ``department_id`` are invalid UUIDs.
    """
    _require_admin(current_user)

    logger.info(
        "Update recipe",
        extra={"user": current_user.email, "recipe_id": recipe_id},
    )

    try:
        recipe_uuid = uuid.UUID(recipe_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid recipe ID format: {recipe_id!r}",
        ) from None

    stmt = (
        select(AIRecipe)
        .where(AIRecipe.id == recipe_uuid)
        .options(selectinload(AIRecipe.department))
    )
    result = await db.execute(stmt)
    recipe = result.scalar_one_or_none()

    if recipe is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Recipe {recipe_id!r} not found",
        )

    # Apply partial updates for each non-None field
    if body.title is not None:
        recipe.title = body.title
    if body.description is not None:
        recipe.description = body.description
    if body.prompt_template is not None:
        recipe.prompt_template = body.prompt_template
    if body.example_query is not None:
        recipe.example_query = body.example_query
    if body.example_response is not None:
        recipe.example_response = body.example_response
    if body.category is not None:
        recipe.category = body.category
    if body.effectiveness_score is not None:
        recipe.effectiveness_score = body.effectiveness_score
    if body.status is not None:
        recipe.status = body.status

    if body.department_id is not None:
        try:
            recipe.department_id = uuid.UUID(body.department_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid department_id format: {body.department_id!r}",
            ) from None

    await db.flush()

    # Reload relationship after potential department_id change
    stmt = (
        select(AIRecipe)
        .where(AIRecipe.id == recipe_uuid)
        .options(selectinload(AIRecipe.department))
    )
    result = await db.execute(stmt)
    recipe = result.scalar_one()

    logger.info("Recipe updated", extra={"recipe_id": recipe_id, "user": current_user.email})

    return _to_response(recipe)


@router.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recipe(
    recipe_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Delete an AI recipe.  Admin role required.

    Args:
        recipe_id: UUID string identifying the recipe to delete.
        current_user: Injected authenticated user (must be admin).
        db: Injected database session.

    Returns:
        204 No Content on success.

    Raises:
        HTTPException: 403 if the user is not an admin.
        HTTPException: 404 if the recipe does not exist.
        HTTPException: 400 if ``recipe_id`` is not a valid UUID.
    """
    _require_admin(current_user)

    logger.info(
        "Delete recipe",
        extra={"user": current_user.email, "recipe_id": recipe_id},
    )

    try:
        recipe_uuid = uuid.UUID(recipe_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid recipe ID format: {recipe_id!r}",
        ) from None

    stmt = select(AIRecipe).where(AIRecipe.id == recipe_uuid)
    result = await db.execute(stmt)
    recipe = result.scalar_one_or_none()

    if recipe is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Recipe {recipe_id!r} not found",
        )

    await db.delete(recipe)
    await db.commit()

    logger.info("Recipe deleted", extra={"recipe_id": recipe_id, "user": current_user.email})

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/extract", response_model=dict)
async def extract_recipes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Trigger the recipe extraction pipeline.  Admin role required.

    In a production implementation this endpoint would dispatch an Inngest
    event to run the background extraction pipeline asynchronously.

    Args:
        current_user: Injected authenticated user (must be admin).
        db: Injected database session.

    Returns:
        dict: Status and message confirming the pipeline was initiated.

    Raises:
        HTTPException: 403 if the user is not an admin.
    """
    _require_admin(current_user)

    logger.info("Recipe extraction triggered", extra={"user": current_user.email})

    # TODO: dispatch Inngest event here once the pipeline is wired up
    return {
        "status": "extraction_started",
        "message": "Recipe extraction pipeline initiated.",
    }
