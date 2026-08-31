from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.dashboard import (
    DiscrepancyOut,
    DiscrepancyPage,
    Evidence,
    OrderRow,
    Overview,
    PaymentRow,
    SummaryOut,
)
from app.schemas.ingestion import UploadOut
from app.schemas.explanation import ExplanationOut, SummaryExplanationOut
from app.services import explaining, ingestion
from app.services.llm import LLMUnavailable
from app.services.reconciliation import reconcile

router = APIRouter(prefix="/reconciliation", tags=["reconciliation"])


def _run(db, user_id):
    orders, payments = ingestion.load_records(db, user_id)
    return orders, payments, reconcile(orders, payments)


@router.get("/summary", response_model=SummaryOut)
def summary(current_user: CurrentUser, db: DbSession) -> SummaryOut:
    orders, payments, result = _run(db, current_user.id)
    return SummaryOut(
        **result.summary.__dict__,
        has_orders=bool(orders),
        has_payments=bool(payments),
    )


@router.get("/overview", response_model=Overview)
def overview(
    current_user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=500),
) -> Overview:
    """One reconciliation run serving the whole first paint.

    The dashboard previously called summary, uploads and discrepancies
    separately, which loaded every row and re-ran the engine three times.
    """
    orders, payments, result = _run(db, current_user.id)
    return Overview(
        summary=SummaryOut(
            **result.summary.__dict__, has_orders=bool(orders), has_payments=bool(payments)
        ),
        uploads=[UploadOut.model_validate(u) for u in ingestion.list_uploads(db, current_user.id)],
        discrepancies=_page(result.discrepancies, limit, 0),
    )


def _page(items, limit: int, offset: int) -> DiscrepancyPage:
    window = items[offset : offset + limit]
    return DiscrepancyPage(
        items=[
            DiscrepancyOut(
                key=d.key,
                type=d.type.value,
                severity=d.severity.value,
                summary=d.summary,
                amount_at_risk=d.amount_at_risk,
                currency=d.currency,
                order_id=d.order_id,
                transaction_ref=d.transaction_ref,
                details=d.details,
            )
            for d in window
        ],
        total=len(items),
        limit=limit,
        offset=offset,
    )


@router.get("/discrepancies", response_model=DiscrepancyPage)
def discrepancies(
    current_user: CurrentUser,
    db: DbSession,
    type: list[str] | None = Query(default=None),
    severity: list[str] | None = Query(default=None),
    search: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> DiscrepancyPage:
    _, _, result = _run(db, current_user.id)
    items = result.discrepancies

    if type:
        wanted = {t.lower() for t in type}
        items = [d for d in items if d.type.value in wanted]
    if severity:
        wanted = {s.lower() for s in severity}
        items = [d for d in items if d.severity.value in wanted]
    if search:
        needle = search.strip().lower()
        items = [
            d
            for d in items
            if needle in (d.order_id or "").lower()
            or needle in (d.transaction_ref or "").lower()
            or needle in d.summary.lower()
            # The classification is stored as failed_payment; a person types
            # "failed payment", so it is matched in both forms.
            or needle in d.type.value
            or needle in d.type.value.replace("_", " ")
        ]

    return _page(items, limit, offset)


def _summary_payload(result) -> dict:
    data = dict(result.summary.__dict__)
    data["by_type"] = {
        k: {"count": v["count"], "value_at_risk": str(v["value_at_risk"]), "severity": v["severity"]}
        for k, v in data["by_type"].items()
    }
    return data


@router.post("/discrepancies/{cache_key}/explain", response_model=ExplanationOut)
def explain_discrepancy(
    cache_key: str,
    current_user: CurrentUser,
    db: DbSession,
    refresh: bool = Query(default=False),
) -> ExplanationOut:
    _, _, result = _run(db, current_user.id)
    found = next((d for d in result.discrepancies if d.key == cache_key), None)
    if found is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown discrepancy")

    payload = {
        "cache_key": found.key,
        "type": found.type.value,
        "severity": found.severity.value,
        "order_id": found.order_id,
        "transaction_ref": found.transaction_ref,
        "amount_at_risk": str(found.amount_at_risk),
        "currency": found.currency,
        "summary": found.summary,
        "details": found.details,
    }

    try:
        explanation, cached, model = explaining.explain_discrepancy(
            db, current_user.id, payload, refresh=refresh
        )
    except LLMUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    return ExplanationOut(
        cache_key=found.key, cached=cached, model=model, explanation=explanation
    )


@router.post("/summary/explain", response_model=SummaryExplanationOut)
def explain_summary(
    current_user: CurrentUser,
    db: DbSession,
    refresh: bool = Query(default=False),
) -> SummaryExplanationOut:
    orders, payments, result = _run(db, current_user.id)
    if not orders and not payments:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Upload both datasets first"
        )

    summary = _summary_payload(result)
    try:
        explanation, cached, model = explaining.explain_summary(
            db, current_user.id, summary, refresh=refresh
        )
    except LLMUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    return SummaryExplanationOut(
        cache_key=explaining.summary_cache_key(summary),
        cached=cached,
        model=model,
        explanation=explanation,
    )


@router.get("/llm/status")
def llm_status(current_user: CurrentUser) -> dict:
    return {
        "enabled": explaining.client.enabled,
        "model": explaining.client.model,
        "temperature": explaining.client.temperature,
        "keys": explaining.client.pool.status(),
    }


@router.get("/discrepancies/{cache_key}/evidence", response_model=Evidence)
def evidence(cache_key: str, current_user: CurrentUser, db: DbSession) -> Evidence:
    """The raw rows behind one finding, exactly as they were ingested."""
    orders, payments, result = _run(db, current_user.id)
    found = next((d for d in result.discrepancies if d.key == cache_key), None)
    if found is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown discrepancy")

    reference = found.order_id
    matched_orders = [o for o in orders if reference and o.order_id == reference]
    matched_payments = [
        p
        for p in payments
        if (reference and p.order_reference == reference)
        or (found.transaction_ref and p.transaction_ref == found.transaction_ref)
    ]

    return Evidence(
        cache_key=cache_key,
        orders=[
            OrderRow(
                source_row=o.source_row,
                order_id=o.order_id,
                order_date=o.order_date.isoformat() if o.order_date else None,
                customer_email=o.customer_email,
                currency=o.currency,
                gross_amount=o.gross_amount,
                discount=o.discount,
                net_amount=o.net_amount,
                status=o.status,
            )
            for o in matched_orders
        ],
        payments=[
            PaymentRow(
                source_row=p.source_row,
                transaction_ref=p.transaction_ref,
                processed_at=p.processed_at.isoformat() if p.processed_at else None,
                order_reference=p.order_reference,
                raw_order_reference=p.raw_order_reference,
                currency=p.currency,
                amount=p.amount,
                fee=p.fee,
                net_settled=p.net_settled,
                type=p.type,
                status=p.status,
            )
            for p in sorted(matched_payments, key=lambda x: x.source_row)
        ],
    )
