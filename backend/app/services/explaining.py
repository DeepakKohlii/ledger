import hashlib
import json
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ExplanationCache
from app.services.llm import (
    Explanation,
    GroqClient,
    PortfolioSummary,
    build_discrepancy_prompt,
    build_summary_prompt,
)

# Module level so key cooldowns survive across requests. A per request client
# would forget that a key is rate limited and hammer it again.
client = GroqClient()

DISCREPANCY = "discrepancy"
SUMMARY = "summary"


def summary_cache_key(summary: dict[str, Any]) -> str:
    material = json.dumps(
        {
            "orders": summary["order_count"],
            "payments": summary["payment_count"],
            "at_risk": str(summary["value_at_risk"]),
            "findings": summary["discrepancy_count"],
            "by_type": {k: v["count"] for k, v in summary["by_type"].items()},
        },
        sort_keys=True,
    )
    return hashlib.sha256(material.encode()).hexdigest()[:16]


def _cached(db: Session, user_id: uuid.UUID, cache_key: str) -> ExplanationCache | None:
    return db.scalar(
        select(ExplanationCache).where(
            ExplanationCache.user_id == user_id, ExplanationCache.cache_key == cache_key
        )
    )


def _store(db: Session, user_id: uuid.UUID, cache_key: str, kind: str, payload: dict) -> None:
    existing = _cached(db, user_id, cache_key)
    if existing is not None:
        existing.payload = payload
        existing.model = client.model
    else:
        db.add(
            ExplanationCache(
                user_id=user_id,
                cache_key=cache_key,
                kind=kind,
                model=client.model,
                payload=payload,
            )
        )
    db.commit()


def explain_discrepancy(
    db: Session, user_id: uuid.UUID, discrepancy: dict[str, Any], refresh: bool = False
) -> tuple[dict, bool, str]:
    cache_key = discrepancy["cache_key"]
    if not refresh:
        hit = _cached(db, user_id, cache_key)
        if hit is not None:
            return hit.payload, True, hit.model

    parsed = client.complete(build_discrepancy_prompt(discrepancy), Explanation)
    payload = parsed.model_dump()
    _store(db, user_id, cache_key, DISCREPANCY, payload)
    return payload, False, client.model


def explain_summary(
    db: Session, user_id: uuid.UUID, summary: dict[str, Any], refresh: bool = False
) -> tuple[dict, bool, str]:
    cache_key = summary_cache_key(summary)
    if not refresh:
        hit = _cached(db, user_id, cache_key)
        if hit is not None:
            return hit.payload, True, hit.model

    parsed = client.complete(build_summary_prompt(summary), PortfolioSummary)
    payload = parsed.model_dump()
    _store(db, user_id, cache_key, SUMMARY, payload)
    return payload, False, client.model
