from __future__ import annotations

from datetime import timedelta
from typing import cast

from fastapi import APIRouter, Request, Response, status
from sqlalchemy import delete, select

from app.api.deps import ServicesDep, SessionDep
from app.core.errors import ConflictError
from app.core.permissions import permissions_for
from app.core.security import CurrentUser, UnauthorizedError
from app.db.base import utcnow
from app.db.models import User, UserSession
from app.schemas.auth import LoginIn, LogoutOut, Role, SignupIn, UserOut
from app.services.auth import (
    DUMMY_PASSWORD_HASH,
    hash_password,
    new_session_token,
    token_digest,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        role=cast(Role, user.role),
        permissions=sorted(permissions_for(user.role)),
    )


def _start_session(services: ServicesDep, session: SessionDep, response: Response, user: User) -> None:
    token = new_session_token()
    session.add(
        UserSession(
            user_id=user.id,
            token_hash=token_digest(token),
            expires_at=utcnow() + timedelta(seconds=services.settings.session_ttl_seconds),
        )
    )
    settings = services.settings
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_ttl_seconds,
        path="/",
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite="lax",
    )


@router.post(
    "/signup",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account with an email and password",
)
async def signup(
    services: ServicesDep, session: SessionDep, response: Response, body: SignupIn
) -> UserOut:
    existing = await session.scalar(select(User).where(User.email == body.email))
    if existing is not None:
        raise ConflictError("an account already exists for this email; sign in instead")

    user = User(email=body.email, role=body.role, password_hash=hash_password(body.password))
    session.add(user)
    await session.flush()
    _start_session(services, session, response, user)
    await session.commit()
    return _user_out(user)


@router.post("/login", response_model=UserOut, summary="Sign in with an email and password")
async def login(
    services: ServicesDep, session: SessionDep, response: Response, body: LoginIn
) -> UserOut:
    user = await session.scalar(select(User).where(User.email == body.email))
    # Always run the password check so an unknown email and a wrong password take a similar time.
    matches = verify_password(body.password, user.password_hash if user else DUMMY_PASSWORD_HASH)
    if user is None or not matches:
        raise UnauthorizedError("email or password is incorrect")

    _start_session(services, session, response, user)
    await session.commit()
    return _user_out(user)


@router.post("/logout", response_model=LogoutOut, summary="End the current session")
async def logout(services: ServicesDep, session: SessionDep, request: Request, response: Response) -> LogoutOut:
    settings = services.settings
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        await session.execute(delete(UserSession).where(UserSession.token_hash == token_digest(token)))
        await session.commit()
    response.delete_cookie(
        settings.session_cookie_name,
        path="/",
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite="lax",
    )
    return LogoutOut(ok=True)


@router.get("/me", response_model=UserOut, summary="The signed-in account and its permissions")
async def me(user: CurrentUser) -> UserOut:
    return _user_out(user)
