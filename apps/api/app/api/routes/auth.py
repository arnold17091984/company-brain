"""Authentication endpoints.

Provides token exchange (Google ID token -> internal JWT) and user profile
retrieval for the authenticated user.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    User,
    create_internal_jwt,
    get_current_user,
    get_or_create_user,
    verify_google_token,
)
from app.core.config import settings
from app.core.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class TokenExchangeRequest(BaseModel):
    """Request body for exchanging a Google ID token for an internal JWT."""

    google_token: str


class TokenExchangeResponse(BaseModel):
    """Response body containing the internal JWT and user profile."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: User


class UserProfileResponse(BaseModel):
    """Response body for the current user profile."""

    id: str
    email: str
    name: str
    department: str
    department_id: str | None
    access_level: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/token", response_model=TokenExchangeResponse)
async def exchange_token(
    request: TokenExchangeRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenExchangeResponse:
    """Exchange a Google ID token for an internal JWT.

    The frontend authenticates with Google via NextAuth.js, then sends the
    Google ID token here to receive a short-lived internal JWT that is used
    for all subsequent API calls.

    In development mode, sending "dev-token" as the google_token will
    return a token for the mock dev user.

    Args:
        request: Contains the Google ID token to exchange.
        db: Database session for user lookup/creation.

    Returns:
        TokenExchangeResponse: Internal JWT, expiry, and user profile.

    Raises:
        HTTPException: 401 if the Google token is invalid.
    """
    token = request.google_token

    # Dev mode shortcut
    if settings.app_env == "development" and token == "dev-token":
        from app.core.auth import _MOCK_USER  # noqa: PLC0415

        internal_jwt = create_internal_jwt(_MOCK_USER)
        return TokenExchangeResponse(
            access_token=internal_jwt,
            expires_in=settings.jwt_expiration_minutes * 60,
            user=_MOCK_USER,
        )

    # Verify Google ID token
    try:
        google_claims = await verify_google_token(token)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Unexpected error during token exchange: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token verification failed",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    # Look up or create user in database
    user = await get_or_create_user(db, google_claims)

    # Issue internal JWT
    internal_jwt = create_internal_jwt(user)

    logger.info("Token exchanged for user: %s", user.email)

    return TokenExchangeResponse(
        access_token=internal_jwt,
        expires_in=settings.jwt_expiration_minutes * 60,
        user=user,
    )


@router.get("/me", response_model=UserProfileResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserProfileResponse:
    """Get the profile of the currently authenticated user.

    Args:
        current_user: Injected by the auth dependency.

    Returns:
        UserProfileResponse: The authenticated user's profile.
    """
    return UserProfileResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        department=current_user.department,
        department_id=current_user.department_id,
        access_level=current_user.access_level,
    )
