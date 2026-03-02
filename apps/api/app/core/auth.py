"""Authentication helpers and FastAPI dependencies.

Supports two token types:
1. Google ID tokens - verified against Google's JWKS public keys
2. Internal JWTs - signed by this service after Google token exchange

In development mode (APP_ENV=development), the special token "dev-token"
bypasses all verification and returns a mock user.
"""

import logging
import time
from datetime import UTC, datetime, timedelta
from typing import Literal

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Domain model (request-scoped user, NOT the ORM User)
# ---------------------------------------------------------------------------

AccessLevel = Literal["all", "department", "restricted"]


class User(BaseModel):
    """Authenticated user representation passed through the request context."""

    id: str
    email: str
    name: str
    department: str
    department_id: str | None = None
    access_level: AccessLevel


# ---------------------------------------------------------------------------
# Dev-mode mock user
# ---------------------------------------------------------------------------

_MOCK_USER = User(
    id="00000000-0000-0000-0000-000000000001",
    email="dev@example.com",
    name="Dev User",
    department="engineering",
    department_id=None,
    access_level="all",
)

_DEV_TOKEN = "dev-token"

# ---------------------------------------------------------------------------
# Google JWKS cache (public keys for ID token verification)
# ---------------------------------------------------------------------------

_GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
_GOOGLE_ISSUERS = ("https://accounts.google.com", "accounts.google.com")

# Cache: {"keys": [...], "fetched_at": float}
_jwks_cache: dict[str, object] = {}
_JWKS_CACHE_TTL_SECONDS = 3600  # Re-fetch JWKS every hour


async def _get_google_jwks() -> dict[str, object]:
    """Fetch and cache Google's public JWKS keys.

    Returns:
        The JWKS key set as a dict.

    Raises:
        HTTPException: If Google's JWKS endpoint is unreachable.
    """
    global _jwks_cache  # noqa: PLW0603

    cached_at = _jwks_cache.get("fetched_at", 0)
    if (
        _jwks_cache.get("keys")
        and isinstance(cached_at, (int, float))
        and (time.time() - cached_at) < _JWKS_CACHE_TTL_SECONDS
    ):
        return _jwks_cache  # type: ignore[return-value]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(_GOOGLE_CERTS_URL)
            resp.raise_for_status()
            jwks_data = resp.json()
    except httpx.HTTPError as exc:
        logger.error("Failed to fetch Google JWKS: %s", exc)
        # If we have stale keys, use them rather than failing
        if _jwks_cache.get("keys"):
            logger.warning("Using stale JWKS cache")
            return _jwks_cache  # type: ignore[return-value]
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to verify authentication - Google JWKS unavailable",
        ) from exc

    _jwks_cache = {
        "keys": jwks_data.get("keys", []),
        "fetched_at": time.time(),
    }
    logger.info("Refreshed Google JWKS cache (%d keys)", len(jwks_data.get("keys", [])))
    return _jwks_cache  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Google ID token verification
# ---------------------------------------------------------------------------


async def verify_google_token(token: str) -> dict[str, object]:
    """Verify a Google-issued ID token against Google's JWKS.

    Args:
        token: The raw JWT ID token from Google OAuth.

    Returns:
        Decoded token claims as a dict containing at minimum:
        sub, email, name, picture, iss, aud, exp.

    Raises:
        HTTPException: 401 if the token is invalid, expired, or has wrong audience.
    """
    jwks_data = await _get_google_jwks()
    keys = jwks_data.get("keys", [])

    # Build PyJWT key set from JWKS
    try:
        jwk_set = jwt.PyJWKSet.from_dict({"keys": keys})
    except jwt.PyJWKSetError as exc:
        logger.error("Failed to parse Google JWKS: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service error",
        ) from exc

    # Decode the header to find the key ID
    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.DecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token format",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    kid = unverified_header.get("kid")
    if not kid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing key ID",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Find the matching key
    signing_key = None
    for jwk_key in jwk_set.keys:
        if jwk_key.key_id == kid:
            signing_key = jwk_key
            break

    if signing_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token signed with unknown key",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify and decode
    try:
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.google_client_id,
            issuer=_GOOGLE_ISSUERS,
            options={
                "verify_exp": True,
                "verify_aud": True,
                "verify_iss": True,
            },
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except jwt.InvalidAudienceError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token audience mismatch",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except jwt.InvalidIssuerError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token issuer mismatch",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except jwt.PyJWTError as exc:
        logger.warning("Google token verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    return claims  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Internal JWT (issued after Google token exchange)
# ---------------------------------------------------------------------------


def create_internal_jwt(user: User) -> str:
    """Create an internal JWT for the given user.

    This token is issued after successful Google ID token verification
    and database user lookup. It avoids repeated Google JWKS lookups
    on every API call.

    Args:
        user: The authenticated user to encode into the token.

    Returns:
        A signed JWT string.
    """
    now = datetime.now(tz=UTC)
    payload = {
        "sub": user.id,
        "email": user.email,
        "name": user.name,
        "department": user.department,
        "department_id": user.department_id,
        "access_level": user.access_level,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expiration_minutes),
        "iss": "company-brain",
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def verify_internal_jwt(token: str) -> dict[str, object]:
    """Verify an internally-issued JWT.

    Args:
        token: The raw JWT string.

    Returns:
        Decoded token claims.

    Raises:
        HTTPException: 401 if the token is invalid or expired.
    """
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            issuer="company-brain",
            options={
                "verify_exp": True,
                "verify_iss": True,
                "require": ["sub", "email", "exp", "iss", "type"],
            },
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except jwt.PyJWTError as exc:
        logger.warning("Internal JWT verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if claims.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return claims  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Database user lookup
# ---------------------------------------------------------------------------


async def get_or_create_user(
    db: AsyncSession,
    google_claims: dict[str, object],
) -> User:
    """Look up an existing user by Google ID, or create a new one.

    Args:
        db: Active database session.
        google_claims: Decoded Google ID token claims (must contain sub, email, name).

    Returns:
        The auth User model populated from the database record.
    """
    from app.models.database import User as DBUser  # noqa: PLC0415

    google_id = str(google_claims["sub"])
    email = str(google_claims.get("email", ""))
    name = str(google_claims.get("name", email.split("@")[0]))

    # Look up by google_id first
    stmt = select(DBUser).where(DBUser.google_id == google_id)
    result = await db.execute(stmt)
    db_user = result.scalar_one_or_none()

    if db_user is None:
        # Try by email (user may have been pre-provisioned without google_id)
        stmt = select(DBUser).where(DBUser.email == email)
        result = await db.execute(stmt)
        db_user = result.scalar_one_or_none()

        if db_user is not None:
            # Link existing email-provisioned user to their Google ID
            db_user.google_id = google_id
            db_user.name = name
            db_user.updated_at = datetime.now(tz=UTC)
            await db.flush()
            logger.info("Linked Google ID to existing user: %s", email)
        else:
            # Create brand new user
            db_user = DBUser(
                email=email,
                name=name,
                google_id=google_id,
                access_level="restricted",
            )
            db.add(db_user)
            await db.flush()
            logger.info("Created new user: %s", email)

    # Build the department name from the relationship if available
    department_name = ""
    department_id_str: str | None = None
    if db_user.department_id is not None:
        department_id_str = str(db_user.department_id)
        if db_user.department_rel is not None:
            department_name = db_user.department_rel.name
        else:
            department_name = "unknown"

    return User(
        id=str(db_user.id),
        email=db_user.email,
        name=db_user.name,
        department=department_name,
        department_id=department_id_str,
        access_level=db_user.access_level,  # type: ignore[arg-type]
    )


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """FastAPI dependency that extracts and validates the Bearer token.

    Supports three authentication modes:
    1. Dev mode: token "dev-token" returns a mock user (development only)
    2. Internal JWT: tokens issued by our /api/v1/auth/token endpoint
    3. Google ID token: direct verification against Google JWKS

    Args:
        credentials: Injected by FastAPI from the Authorization header.
        db: Database session for user lookup.

    Returns:
        User: The authenticated user for this request.

    Raises:
        HTTPException: 401 when the Authorization header is absent or invalid.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # --- Dev mode bypass ---
    if settings.app_env == "development" and token == _DEV_TOKEN:
        return _MOCK_USER

    # --- Try internal JWT first (cheaper, no network call) ---
    try:
        claims = verify_internal_jwt(token)
        return User(
            id=str(claims["sub"]),
            email=str(claims["email"]),
            name=str(claims.get("name", "")),
            department=str(claims.get("department", "")),
            department_id=claims.get("department_id"),  # type: ignore[arg-type]
            access_level=claims.get("access_level", "restricted"),  # type: ignore[arg-type]
        )
    except HTTPException:
        pass  # Not an internal JWT, try Google token

    # --- Try Google ID token ---
    google_claims = await verify_google_token(token)
    user = await get_or_create_user(db, google_claims)
    return user
