from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import ACCESS_COOKIE_NAME, decode_access_token
from app.models import User

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DbSession,
    token: Annotated[str | None, Cookie(alias=ACCESS_COOKIE_NAME)] = None,
) -> User:
    unauthorised = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
    )
    if not token:
        raise unauthorised

    user_id = decode_access_token(token)
    if user_id is None:
        raise unauthorised

    user = db.get(User, user_id)
    if user is None:
        raise unauthorised

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
