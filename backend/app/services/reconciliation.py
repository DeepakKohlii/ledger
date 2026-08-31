import hashlib
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import timedelta
from decimal import Decimal
from enum import StrEnum
from typing import Any, Iterable, Sequence

ZERO = Decimal("0.00")


class DiscrepancyType(StrEnum):
    MISSING_PAYMENT = "missing_payment"
    ORPHAN_PAYMENT = "orphan_payment"
    FAILED_PAYMENT = "failed_payment"
    PENDING_PAYMENT = "pending_payment"
    PAID_CANCELLED_ORDER = "paid_cancelled_order"
    DUPLICATE_PAYMENT = "duplicate_payment"
    OVERPAYMENT = "overpayment"
    UNDERPAYMENT = "underpayment"
    CURRENCY_MISMATCH = "currency_mismatch"
    REFUND_MISMATCH = "refund_mismatch"
    LATE_SETTLEMENT = "late_settlement"
    ROUNDING_VARIANCE = "rounding_variance"
    DUPLICATE_ORDER = "duplicate_order"
    REFERENCE_FORMAT = "reference_format"
    MISSING_FIELD = "missing_field"


class Severity(StrEnum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


SEVERITY_ORDER = {
    Severity.CRITICAL: 0,
    Severity.HIGH: 1,
    Severity.MEDIUM: 2,
    Severity.LOW: 3,
    Severity.INFO: 4,
}

PAID_STATUSES = {"completed", "refunded"}


@dataclass(frozen=True)
class Tolerances:
    # Observed rounding noise is at most 0.02 and the smallest genuine mismatch
    # is 18.50, so anything in that gap gives an identical result.
    rounding: Decimal = Decimal("0.05")
    # Median settlement lag is 40 minutes and p95 is 86 minutes.
    settlement_days: int = 2


@dataclass(frozen=True)
class Discrepancy:
    type: DiscrepancyType
    severity: Severity
    summary: str
    amount_at_risk: Decimal = ZERO
    currency: str | None = None
    order_id: str | None = None
    transaction_ref: str | None = None
    details: dict[str, Any] = field(default_factory=dict)

    @property
    def key(self) -> str:
        raw = "|".join(
            [self.type.value, self.order_id or "", self.transaction_ref or "", str(self.amount_at_risk)]
        )
        return hashlib.sha256(raw.encode()).hexdigest()[:16]


@dataclass
class Summary:
    order_rows: int = 0
    order_count: int = 0
    payment_count: int = 0
    order_value: Decimal = ZERO
    settled_charge_value: Decimal = ZERO
    refund_value: Decimal = ZERO
    fee_value: Decimal = ZERO
    reconciled_order_count: int = 0
    reconciled_value: Decimal = ZERO
    disputed_order_count: int = 0
    disputed_value: Decimal = ZERO
    discrepancy_count: int = 0
    value_at_risk: Decimal = ZERO
    by_type: dict[str, dict[str, Any]] = field(default_factory=dict)
    by_severity: dict[str, int] = field(default_factory=dict)


@dataclass
class ReconciliationResult:
    discrepancies: list[Discrepancy]
    summary: Summary


def _money(value: Decimal | None) -> Decimal:
    return ZERO if value is None else value


def _is_refund(payment: Any) -> bool:
    return payment.type == "refund"


def _dedupe_orders(orders: Sequence[Any]) -> tuple[list[Any], list[Discrepancy]]:
    grouped: dict[str, list[Any]] = defaultdict(list)
    for order in orders:
        grouped[order.order_id].append(order)

    kept: list[Any] = []
    found: list[Discrepancy] = []

    for order_id, rows in grouped.items():
        kept.append(rows[0])
        if len(rows) == 1:
            continue

        fields = ("order_date", "customer_email", "currency", "gross_amount", "net_amount", "status")
        identical = all(
            tuple(getattr(row, f) for f in fields) == tuple(getattr(rows[0], f) for f in fields)
            for row in rows[1:]
        )
        found.append(
            Discrepancy(
                type=DiscrepancyType.DUPLICATE_ORDER,
                severity=Severity.LOW if identical else Severity.HIGH,
                order_id=order_id,
                currency=rows[0].currency,
                amount_at_risk=ZERO if identical else _money(rows[0].net_amount),
                summary=(
                    f"{order_id} appears {len(rows)} times in the order export "
                    + ("with identical values" if identical else "with conflicting values")
                ),
                details={
                    "occurrences": len(rows),
                    "identical": identical,
                    "source_rows": [row.source_row for row in rows],
                    "order_value": str(_money(rows[0].net_amount)),
                },
            )
        )

    return kept, found


def _order_field_checks(order: Any) -> list[Discrepancy]:
    missing = [
        name
        for name in ("order_date", "customer_email", "currency", "net_amount", "status")
        if getattr(order, name) is None
    ]
    if not missing:
        return []
    return [
        Discrepancy(
            type=DiscrepancyType.MISSING_FIELD,
            severity=Severity.LOW,
            order_id=order.order_id,
            currency=order.currency,
            summary=f"{order.order_id} is missing {', '.join(missing)}",
            details={"entity": "order", "fields": missing},
        )
    ]


def _payment_field_checks(payment: Any) -> list[Discrepancy]:
    missing = [
        name
        for name in ("processed_at", "order_reference", "currency", "amount", "type", "status")
        if getattr(payment, name) is None
    ]
    if not missing:
        return []
    return [
        Discrepancy(
            type=DiscrepancyType.MISSING_FIELD,
            severity=Severity.LOW,
            transaction_ref=payment.transaction_ref,
            order_id=payment.order_reference,
            currency=payment.currency,
            summary=f"{payment.transaction_ref} is missing {', '.join(missing)}",
            details={"entity": "payment", "fields": missing},
        )
    ]


def _reference_format_checks(payment: Any) -> list[Discrepancy]:
    raw = payment.raw_order_reference
    if raw is None or payment.order_reference is None or raw == payment.order_reference:
        return []
    return [
        Discrepancy(
            type=DiscrepancyType.REFERENCE_FORMAT,
            severity=Severity.INFO,
            order_id=payment.order_reference,
            transaction_ref=payment.transaction_ref,
            currency=payment.currency,
            summary=(
                f"{payment.transaction_ref} references {raw!r}, matched to "
                f"{payment.order_reference} after trimming and upper casing"
            ),
            details={"raw_reference": raw, "normalised_reference": payment.order_reference},
        )
    ]


def _compare_amounts(order: Any, charge: Any, tolerances: Tolerances) -> list[Discrepancy]:
    if order.net_amount is None or charge.amount is None:
        return []

    difference = charge.amount - order.net_amount
    if difference == ZERO:
        return []

    magnitude = abs(difference)
    shared = {
        "order_id": order.order_id,
        "transaction_ref": charge.transaction_ref,
        "currency": order.currency,
        "details": {
            "order_net_amount": str(order.net_amount),
            "payment_amount": str(charge.amount),
            "difference": str(difference),
        },
    }

    if magnitude <= tolerances.rounding:
        return [
            Discrepancy(
                type=DiscrepancyType.ROUNDING_VARIANCE,
                severity=Severity.INFO,
                amount_at_risk=ZERO,
                summary=f"{order.order_id} differs by {difference}, within the rounding tolerance",
                **shared,
            )
        ]

    if difference > ZERO:
        return [
            Discrepancy(
                type=DiscrepancyType.OVERPAYMENT,
                severity=Severity.HIGH,
                amount_at_risk=magnitude,
                summary=f"{order.order_id} was charged {difference} more than the order value",
                **shared,
            )
        ]

    return [
        Discrepancy(
            type=DiscrepancyType.UNDERPAYMENT,
            severity=Severity.HIGH,
            amount_at_risk=magnitude,
            summary=f"{order.order_id} was charged {magnitude} less than the order value",
            **shared,
        )
    ]


def _reconcile_order(order: Any, payments: list[Any], tolerances: Tolerances) -> list[Discrepancy]:
    found = _order_field_checks(order)

    if not payments:
        if order.status in PAID_STATUSES:
            found.append(
                Discrepancy(
                    type=DiscrepancyType.MISSING_PAYMENT,
                    severity=Severity.CRITICAL,
                    order_id=order.order_id,
                    currency=order.currency,
                    amount_at_risk=_money(order.net_amount),
                    summary=f"{order.order_id} is {order.status} but has no payment record",
                    details={"order_status": order.status, "order_value": str(_money(order.net_amount))},
                )
            )
        return found

    charges = [p for p in payments if not _is_refund(p)]
    refunds = [p for p in payments if _is_refund(p)]
    settled = [c for c in charges if c.status == "settled"]

    for charge in (c for c in charges if c.status == "failed"):
        found.append(
            Discrepancy(
                type=DiscrepancyType.FAILED_PAYMENT,
                severity=Severity.CRITICAL,
                order_id=order.order_id,
                transaction_ref=charge.transaction_ref,
                currency=order.currency,
                amount_at_risk=_money(order.net_amount),
                summary=(
                    f"{order.order_id} is {order.status} but its only charge failed"
                    if not settled
                    else f"{order.order_id} has a failed charge"
                ),
                details={"order_status": order.status, "payment_status": charge.status},
            )
        )

    for charge in (c for c in charges if c.status == "pending"):
        found.append(
            Discrepancy(
                type=DiscrepancyType.PENDING_PAYMENT,
                severity=Severity.MEDIUM,
                order_id=order.order_id,
                transaction_ref=charge.transaction_ref,
                currency=order.currency,
                amount_at_risk=_money(charge.amount),
                summary=f"{order.order_id} has a charge that has not settled",
                details={"order_status": order.status, "payment_status": charge.status},
            )
        )

    if len(settled) > 1:
        extra = sum((_money(c.amount) for c in settled[1:]), ZERO)
        found.append(
            Discrepancy(
                type=DiscrepancyType.DUPLICATE_PAYMENT,
                severity=Severity.HIGH,
                order_id=order.order_id,
                transaction_ref=settled[1].transaction_ref,
                currency=order.currency,
                amount_at_risk=extra,
                summary=f"{order.order_id} was charged {len(settled)} times",
                details={
                    "charge_count": len(settled),
                    "transaction_refs": [c.transaction_ref for c in settled],
                    "amounts": [str(_money(c.amount)) for c in settled],
                    "duplicate_value": str(extra),
                },
            )
        )

    mismatched_currency = [
        c for c in settled if order.currency and c.currency and c.currency != order.currency
    ]
    for charge in mismatched_currency:
        found.append(
            Discrepancy(
                type=DiscrepancyType.CURRENCY_MISMATCH,
                severity=Severity.HIGH,
                order_id=order.order_id,
                transaction_ref=charge.transaction_ref,
                currency=order.currency,
                amount_at_risk=_money(charge.amount),
                summary=(
                    f"{order.order_id} was placed in {order.currency} but charged in {charge.currency}"
                ),
                details={"order_currency": order.currency, "payment_currency": charge.currency},
            )
        )

    if len(settled) == 1 and not mismatched_currency:
        found.extend(_compare_amounts(order, settled[0], tolerances))

    if order.status == "cancelled" and settled:
        found.append(
            Discrepancy(
                type=DiscrepancyType.PAID_CANCELLED_ORDER,
                severity=Severity.CRITICAL,
                order_id=order.order_id,
                transaction_ref=settled[0].transaction_ref,
                currency=order.currency,
                amount_at_risk=sum((_money(c.amount) for c in settled), ZERO),
                summary=f"{order.order_id} was cancelled but the charge settled",
                details={"order_status": order.status},
            )
        )

    charged_total = sum((_money(c.amount) for c in settled), ZERO)
    refunded_total = sum((_money(r.amount) for r in refunds if r.status == "settled"), ZERO)

    if order.status == "refunded" and refunded_total < charged_total:
        found.append(
            Discrepancy(
                type=DiscrepancyType.REFUND_MISMATCH,
                severity=Severity.HIGH,
                order_id=order.order_id,
                transaction_ref=refunds[0].transaction_ref if refunds else None,
                currency=order.currency,
                amount_at_risk=charged_total - refunded_total,
                summary=(
                    f"{order.order_id} is marked refunded but only {refunded_total} of "
                    f"{charged_total} was returned"
                ),
                details={
                    "charged": str(charged_total),
                    "refunded": str(refunded_total),
                    "outstanding": str(charged_total - refunded_total),
                },
            )
        )
    elif order.status == "completed" and refunded_total > ZERO:
        found.append(
            Discrepancy(
                type=DiscrepancyType.REFUND_MISMATCH,
                severity=Severity.MEDIUM,
                order_id=order.order_id,
                transaction_ref=refunds[0].transaction_ref,
                currency=order.currency,
                amount_at_risk=refunded_total,
                summary=f"{order.order_id} still reads completed but {refunded_total} was refunded",
                details={"charged": str(charged_total), "refunded": str(refunded_total)},
            )
        )

    if order.order_date is not None:
        limit = timedelta(days=tolerances.settlement_days)
        for charge in settled:
            if charge.processed_at is None:
                continue
            lag = charge.processed_at - order.order_date
            if lag > limit:
                found.append(
                    Discrepancy(
                        type=DiscrepancyType.LATE_SETTLEMENT,
                        severity=Severity.LOW,
                        order_id=order.order_id,
                        transaction_ref=charge.transaction_ref,
                        currency=order.currency,
                        summary=f"{order.order_id} settled {lag.days} days after the order",
                        details={
                            "lag_days": lag.days,
                            "order_date": order.order_date.isoformat(),
                            "processed_at": charge.processed_at.isoformat(),
                        },
                    )
                )

    return found


def reconcile(
    orders: Sequence[Any],
    payments: Sequence[Any],
    tolerances: Tolerances | None = None,
) -> ReconciliationResult:
    tolerances = tolerances or Tolerances()

    unique_orders, discrepancies = _dedupe_orders(orders)
    order_index = {order.order_id: order for order in unique_orders}

    by_reference: dict[str | None, list[Any]] = defaultdict(list)
    for payment in payments:
        by_reference[payment.order_reference].append(payment)
        discrepancies.extend(_payment_field_checks(payment))
        discrepancies.extend(_reference_format_checks(payment))

    per_order: dict[str, list[Discrepancy]] = {}
    for order in unique_orders:
        found = _reconcile_order(order, by_reference.get(order.order_id, []), tolerances)
        per_order[order.order_id] = found
        discrepancies.extend(found)

    for reference, group in by_reference.items():
        if reference in order_index:
            continue
        for payment in group:
            discrepancies.append(
                Discrepancy(
                    type=DiscrepancyType.ORPHAN_PAYMENT,
                    severity=Severity.HIGH,
                    order_id=reference,
                    transaction_ref=payment.transaction_ref,
                    currency=payment.currency,
                    amount_at_risk=_money(payment.amount),
                    summary=(
                        f"{payment.transaction_ref} references {reference or 'no order'}, "
                        "which is not in the order export"
                    ),
                    details={"referenced_order": reference, "payment_type": payment.type},
                )
            )

    discrepancies.sort(
        key=lambda d: (
            SEVERITY_ORDER[d.severity],
            -d.amount_at_risk,
            d.order_id or "",
            d.transaction_ref or "",
            d.type.value,
        )
    )

    return ReconciliationResult(
        discrepancies=discrepancies,
        summary=_summarise(orders, unique_orders, payments, per_order, discrepancies),
    )


def _summarise(
    order_rows: Sequence[Any],
    unique_orders: Sequence[Any],
    payments: Sequence[Any],
    per_order: dict[str, list[Discrepancy]],
    discrepancies: Iterable[Discrepancy],
) -> Summary:
    blocking = {Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM}
    reconciled = [
        order
        for order in unique_orders
        if not any(d.severity in blocking for d in per_order.get(order.order_id, []))
    ]
    settled_ids = {o.order_id for o in reconciled}
    disputed = [o for o in unique_orders if o.order_id not in settled_ids]

    settled_charges = [p for p in payments if not _is_refund(p) and p.status == "settled"]
    settled_refunds = [p for p in payments if _is_refund(p) and p.status == "settled"]

    summary = Summary(
        order_rows=len(order_rows),
        order_count=len(unique_orders),
        payment_count=len(payments),
        order_value=sum((_money(o.net_amount) for o in unique_orders), ZERO),
        settled_charge_value=sum((_money(p.amount) for p in settled_charges), ZERO),
        refund_value=sum((_money(p.amount) for p in settled_refunds), ZERO),
        fee_value=sum((_money(p.fee) for p in settled_charges), ZERO),
        reconciled_order_count=len(reconciled),
        reconciled_value=sum((_money(o.net_amount) for o in reconciled), ZERO),
        disputed_order_count=len(disputed),
        # The order value tied up in orders that did not reconcile. Distinct
        # from value_at_risk, which is the exposure each finding carries: an
        # order can be disputed for more or less than its own value.
        disputed_value=sum((_money(o.net_amount) for o in disputed), ZERO),
    )

    for discrepancy in discrepancies:
        summary.discrepancy_count += 1
        summary.value_at_risk += discrepancy.amount_at_risk
        bucket = summary.by_type.setdefault(
            discrepancy.type.value, {"count": 0, "value_at_risk": ZERO, "severity": discrepancy.severity.value}
        )
        bucket["count"] += 1
        bucket["value_at_risk"] += discrepancy.amount_at_risk
        summary.by_severity[discrepancy.severity.value] = (
            summary.by_severity.get(discrepancy.severity.value, 0) + 1
        )

    return summary
