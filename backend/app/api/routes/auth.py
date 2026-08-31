from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.security import (
    ACCESS_COOKIE_NAME,
    create_access_token,
    hash_password,
    verify_password,
    waste_password_comparison,
)
from app.core.ratelimit import SlidingWindow
from app.models import User
from app.schemas.auth import Credentials, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

# Two windows so neither dimension alone is enough to brute force: one address
# cannot be hammered from many machines, and one machine cannot sweep many
# addresses. The per-address window is the tighter of the two.
BY_ADDRESS = SlidingWindow(limit=6, window_seconds=15 * 60)
BY_CLIENT = SlidingWindow(limit=25, window_seconds=15 * 60)


def _client_key(request: Request) -> str:
    """Identify the caller, trusting the proxy header the platform sets."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _guard(request: Request, email: str) -> None:
    for key, window in ((f"email:{email}", BY_ADDRESS), (f"ip:{_client_key(request)}", BY_CLIENT)):
        retry_after = window.check(key)
        if retry_after is not None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Try again shortly.",
                headers={"Retry-After": str(int(retry_after))},
            )


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )


@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def signup(credentials: Credentials, request: Request, response: Response, db: DbSession) -> User:
    _guard(request, credentials.email)

    existing = db.scalar(select(User).where(User.email == credentials.email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists",
        )

    user = User(
        email=credentials.email,
        password_hash=hash_password(credentials.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists",
        ) from None

    db.refresh(user)
    _set_auth_cookie(response, create_access_token(user.id))
    return user


@router.post("/login", response_model=UserOut)
def login(credentials: Credentials, request: Request, response: Response, db: DbSession) -> User:
    _guard(request, credentials.email)

    user = db.scalar(select(User).where(User.email == credentials.email))

    if user is None:
        # 404 rather than 401 so the client can offer to create the account.
        # This discloses which addresses are registered, which signup already
        # does by rejecting duplicates, so nothing new is leaked.
        waste_password_comparison()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found for that email address",
        )

    if not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )

    # A correct password clears the address window so one forgotten password
    # does not lock somebody out for the rest of the period.
    BY_ADDRESS.reset(f"email:{credentials.email}")
    _set_auth_cookie(response, create_access_token(user.id))
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(key=ACCESS_COOKIE_NAME, path="/")


@router.get("/me", response_model=UserOut)
def me(current_user: CurrentUser) -> User:
    return current_user
