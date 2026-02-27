"""Authentication helpers and FastAPI dependencies.

Currently implements a stub that returns a mock user.  Replace
``verify_token`` with a real Google token-verification call before going
to production.
"""

from typing import Literal

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Domain model
# ---------------------------------------------------------------------------

AccessLevel = Literal["all", "department", "restricted"]


class User(BaseModel):
    """Authenticated user representation passed through the request context."""

    id: str
    email: str
    name: str
    department: str
    access_level: AccessLevel


# ---------------------------------------------------------------------------
# Token verification (stub – replace with real Google SSO verification)
# ---------------------------------------------------------------------------

_bearer_scheme = HTTPBearer(auto_error=False)

_MOCK_USER = User(
    id="00000000-0000-0000-0000-000000000001",
    email="dev@example.com",
    name="Dev User",
    department="engineering",
    access_level="all",
)


def verify_token(token: str) -> User:
    """Verify a Google-issued ID token and return the authenticated User.

    Args:
        token: Raw JWT from the ``Authorization: Bearer <token>`` header.

    Returns:
        User: Populated user record derived from token claims.

    Raises:
        HTTPException: 401 if the token is missing or invalid.

    Note:
        This is a *stub*.  Wire in ``google-auth`` library verification:

        .. code-block:: python

            from google.oauth2 import id_token
            from google.auth.transport import requests as grequests

            idinfo = id_token.verify_oauth2_token(
                token,
                grequests.Request(),
                settings.google_client_id,
            )
    """
    # TODO: replace with real Google ID token verification
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Stub: every non-empty token resolves to the mock dev user
    return _MOCK_USER


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> User:
    """FastAPI dependency that extracts and validates the Bearer token.

    Args:
        credentials: Injected by FastAPI from the Authorization header.

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
    return verify_token(credentials.credentials)
