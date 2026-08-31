from decimal import Decimal
from pathlib import Path

import pytest

from app.services.parsing import parse_orders, parse_payments
from app.services.reconciliation import DiscrepancyType, Severity, Tolerances, reconcile

DATA = Path(__file__).resolve().parents[2] / "data"


@pytest.fixture(scope="module")
def dataset():
    orders = parse_orders((DATA / "orders.csv").read_bytes()).rows
    payments = parse_payments((DATA / "payments.csv").read_bytes()).rows
    return orders, payments


@pytest.fixture(scope="module")
def result(dataset):
    return reconcile(*dataset)


def test_every_row_parses(dataset):
    orders, payments = dataset
    assert len(orders) == 185
    assert len(payments) == 187


EXPECTED_COUNTS = {
    DiscrepancyType.MISSING_PAYMENT: 4,
    DiscrepancyType.ORPHAN_PAYMENT: 3,
    DiscrepancyType.OVERPAYMENT: 2,
    DiscrepancyType.UNDERPAYMENT: 1,
    DiscrepancyType.DUPLICATE_PAYMENT: 2,
    DiscrepancyType.CURRENCY_MISMATCH: 2,
    DiscrepancyType.PAID_CANCELLED_ORDER: 1,
    DiscrepancyType.REFUND_MISMATCH: 2,
    DiscrepancyType.FAILED_PAYMENT: 1,
    DiscrepancyType.PENDING_PAYMENT: 1,
    DiscrepancyType.LATE_SETTLEMENT: 1,
    DiscrepancyType.ROUNDING_VARIANCE: 3,
    DiscrepancyType.DUPLICATE_ORDER: 1,
    DiscrepancyType.REFERENCE_FORMAT: 2,
    DiscrepancyType.MISSING_FIELD: 2,
}


@pytest.mark.parametrize("kind,expected", EXPECTED_COUNTS.items())
def test_expected_discrepancy_counts(result, kind, expected):
    found = [d for d in result.discrepancies if d.type is kind]
    assert len(found) == expected, [d.summary for d in found]


def test_no_discrepancies_beyond_the_expected_ones(result):
    assert result.summary.discrepancy_count == sum(EXPECTED_COUNTS.values()) == 28


def test_headline_totals(result):
    s = result.summary
    assert s.order_rows == 185
    assert s.order_count == 184
    assert s.order_value == Decimal("42269.65")
    assert s.settled_charge_value == Decimal("42123.38")
    assert s.value_at_risk == Decimal("2178.43")
    assert s.disputed_order_count == 16
    assert s.disputed_value == Decimal("2306.37")
    # Every order is either reconciled or disputed, never both and never neither.
    assert s.reconciled_value + s.disputed_value == s.order_value
    assert s.reconciled_order_count + s.disputed_order_count == s.order_count


def test_value_at_risk_is_the_sum_of_its_parts(result):
    assert result.summary.value_at_risk == sum(d.amount_at_risk for d in result.discrepancies)


def test_informational_findings_carry_no_money(result):
    for d in result.discrepancies:
        if d.severity in (Severity.INFO,) or d.type is DiscrepancyType.LATE_SETTLEMENT:
            assert d.amount_at_risk == Decimal("0.00"), d.summary


def test_reference_formatting_does_not_invent_missing_or_orphan_payments(result):
    # ' ord-1801 ' and 'ord-1802' must match their orders. Joining on the raw
    # string would report each of them twice, as both missing and orphaned.
    flagged = {d.order_id for d in result.discrepancies if d.type is DiscrepancyType.MISSING_PAYMENT}
    orphaned = {d.order_id for d in result.discrepancies if d.type is DiscrepancyType.ORPHAN_PAYMENT}
    assert flagged == {"ORD-1201", "ORD-1202", "ORD-1203", "ORD-1204"}
    assert orphaned == {"ORD-1301", "ORD-1302", "ORD-1303"}


def test_duplicate_order_row_is_not_counted_twice(result):
    assert result.summary.order_count == 184
    duplicates = [d for d in result.discrepancies if d.type is DiscrepancyType.DUPLICATE_ORDER]
    assert duplicates[0].order_id == "ORD-1004"
    assert duplicates[0].amount_at_risk == Decimal("0.00")


def test_cancelled_order_without_payment_is_not_a_discrepancy(dataset):
    orders, _ = dataset
    cancelled = next(o for o in orders if o.status == "cancelled")
    assert reconcile([cancelled], []).discrepancies == []


def test_same_input_always_gives_the_same_result(dataset):
    first = reconcile(*dataset)
    second = reconcile(*dataset)
    assert [(d.type, d.order_id, d.transaction_ref, d.amount_at_risk) for d in first.discrepancies] == [
        (d.type, d.order_id, d.transaction_ref, d.amount_at_risk) for d in second.discrepancies
    ]


def test_rounding_tolerance_boundary(dataset):
    orders, payments = dataset
    strict = reconcile(orders, payments, Tolerances(rounding=Decimal("0.00")))
    rounding = [d for d in strict.discrepancies if d.type is DiscrepancyType.ROUNDING_VARIANCE]
    assert rounding == []
    # With no tolerance the three cent level variances become real mismatches.
    over = [d for d in strict.discrepancies if d.type is DiscrepancyType.OVERPAYMENT]
    under = [d for d in strict.discrepancies if d.type is DiscrepancyType.UNDERPAYMENT]
    assert len(over) == 4 and len(under) == 2


def test_settlement_window_boundary(dataset):
    orders, payments = dataset
    relaxed = reconcile(orders, payments, Tolerances(settlement_days=30))
    assert [d for d in relaxed.discrepancies if d.type is DiscrepancyType.LATE_SETTLEMENT] == []
