from fastapi import APIRouter, HTTPException, Response, status
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
from app.models import User
from app.schemas.auth import Credentials, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


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
def signup(credentials: Credentials, response: Response, db: DbSession) -> User:
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
def login(credentials: Credentials, response: Response, db: DbSession) -> User:
    user = db.scalar(select(User).where(User.email == credentials.email))

    if user is None:
        waste_password_comparison()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    if not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    _set_auth_cookie(response, create_access_token(user.id))
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(key=ACCESS_COOKIE_NAME, path="/")


@router.get("/me", response_model=UserOut)
def me(current_user: CurrentUser) -> User:
    return current_user
