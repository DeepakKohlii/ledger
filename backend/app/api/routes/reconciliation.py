from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.schemas.dashboard import DiscrepancyOut, DiscrepancyPage, SummaryOut
from app.services import ingestion
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
        ]

    page = items[offset : offset + limit]
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
            for d in page
        ],
        total=len(items),
        limit=limit,
        offset=offset,
    )
