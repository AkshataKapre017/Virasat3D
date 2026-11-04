from __future__ import annotations

import hmac
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select

from app.api.deps import SessionDep
from app.core.errors import AppError
from app.core.permissions import permissions_for
from app.db.base import utcnow
from app.db.models import User, UserSession
from app.services.auth import token_digest

_bearer = HTTPBearer(auto_error=False)


class UnauthorizedError(AppError):
    status_code = 401
    title = "Unauthorized"


class ForbiddenError(AppError):
    status_code = 403
    title = "Forbidden"


def token_matches(expected: str, creds: HTTPAuthorizationCredentials | None) -> bool:
    return creds is not None and hmac.compare_digest(creds.credentials.encode(), expected.encode())


def require_worker(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> None:
    """GPU/CPU workers authenticate with a shared bearer token (rotate via HL_WORKER_TOKEN)."""
    if not token_matches(request.app.state.services.settings.worker_token, creds):
        raise UnauthorizedError("invalid worker token")


async def get_current_user(request: Request, session: SessionDep) -> User:
    """Resolve the httpOnly session cookie to a user, or reject the request."""
    settings = request.app.state.services.settings
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise UnauthorizedError("sign in to continue")

    row = await session.scalar(
        select(UserSession).where(
            UserSession.token_hash == token_digest(token),
            UserSession.expires_at > utcnow(),
        )
    )
    if row is None:
        raise UnauthorizedError("your session has expired; sign in again")
    user = await session.get(User, row.user_id)
    if user is None:
        raise UnauthorizedError("your account no longer exists")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_permission(*permissions: str) -> Callable[..., Awaitable[User]]:
    """One dependency factory for every privileged API action.

    Routes name permissions, not roles, so the table in `core.permissions` is the only place that
    decides what a role may do.
    """

    async def dependency(user: CurrentUser) -> User:
        granted = permissions_for(user.role)
        missing = [permission for permission in permissions if permission not in granted]
        if missing:
            raise ForbiddenError(f"this account does not have the {missing[0]!r} permission")
        return user

    return dependency
