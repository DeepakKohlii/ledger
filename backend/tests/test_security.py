import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.core.config import get_settings
from app.core.security import (
    MAX_PASSWORD_BYTES,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

settings = get_settings()


def test_hash_is_not_the_password():
    password = "correct horse battery staple"
    hashed = hash_password(password)
    assert hashed != password
    assert hashed.startswith("$2b$")


def test_same_password_hashes_differently_each_time():
    assert hash_password("same password") != hash_password("same password")


def test_verify_accepts_correct_and_rejects_wrong():
    hashed = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", hashed) is True
    assert verify_password("Correct horse battery staple", hashed) is False
    assert verify_password("", hashed) is False


def test_verify_returns_false_for_a_malformed_hash():
    assert verify_password("anything", "not-a-bcrypt-hash") is False


def test_password_at_the_bcrypt_byte_limit_still_works():
    password = "a" * MAX_PASSWORD_BYTES
    assert verify_password(password, hash_password(password)) is True


def test_token_round_trips_the_user_id():
    user_id = uuid.uuid4()
    assert decode_access_token(create_access_token(user_id)) == user_id


def test_tampered_token_is_rejected():
    token = create_access_token(uuid.uuid4())
    head, payload, signature = token.split(".")
    forged = f"{head}.{payload}.{'x' * len(signature)}"
    assert decode_access_token(forged) is None


def test_token_signed_with_another_secret_is_rejected():
    forged = jwt.encode(
        {"sub": str(uuid.uuid4()), "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        "a-different-secret-of-a-respectable-length-0123456789",
        algorithm=settings.jwt_algorithm,
    )
    assert decode_access_token(forged) is None


def test_expired_token_is_rejected():
    expired = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    assert decode_access_token(expired) is None


@pytest.mark.parametrize("value", ["", "nonsense", "a.b.c"])
def test_garbage_tokens_are_rejected(value):
    assert decode_access_token(value) is None
