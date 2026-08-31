import csv
import io
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation

ORDER_COLUMNS = (
    "order_id",
    "order_date",
    "customer_email",
    "currency",
    "gross_amount",
    "discount",
    "net_amount",
    "status",
)

PAYMENT_COLUMNS = (
    "transaction_ref",
    "processed_at",
    "order_reference",
    "currency",
    "amount",
    "fee",
    "net_settled",
    "type",
    "status",
)

# Order exports use ISO timestamps, payment exports use day-first. Both are
# tried in a fixed order so parsing is deterministic; day-first is attempted
# first because ISO is unambiguous and never misreads as day-first.
DATE_FORMATS = ("%d/%m/%Y %H:%M", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y", "%Y-%m-%d")

CENTS = Decimal("0.01")


class SchemaError(ValueError):
    pass


@dataclass(frozen=True)
class RowError:
    source_row: int
    message: str


@dataclass(frozen=True)
class ParsedOrder:
    source_row: int
    order_id: str
    order_date: datetime | None
    customer_email: str | None
    currency: str | None
    gross_amount: Decimal | None
    discount: Decimal | None
    net_amount: Decimal | None
    status: str | None


@dataclass(frozen=True)
class ParsedPayment:
    source_row: int
    transaction_ref: str
    processed_at: datetime | None
    order_reference: str | None
    raw_order_reference: str | None
    currency: str | None
    amount: Decimal | None
    fee: Decimal | None
    net_settled: Decimal | None
    type: str | None
    status: str | None


@dataclass
class ParseResult:
    rows: list = field(default_factory=list)
    errors: list[RowError] = field(default_factory=list)


def clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def normalise_reference(value: str | None) -> str | None:
    value = clean(value)
    return value.upper() if value else None


def normalise_email(value: str | None) -> str | None:
    value = clean(value)
    return value.lower() if value else None


def normalise_code(value: str | None) -> str | None:
    value = clean(value)
    return value.lower() if value else None


def parse_money(value: str | None) -> Decimal | None:
    value = clean(value)
    if value is None:
        return None
    try:
        return Decimal(value.replace(",", "")).quantize(CENTS)
    except (InvalidOperation, ArithmeticError) as exc:
        raise ValueError(f"{value!r} is not a valid amount") from exc


def parse_timestamp(value: str | None) -> datetime | None:
    value = clean(value)
    if value is None:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    raise ValueError(f"{value!r} is not a recognised date")


def _reader(content: bytes, expected: tuple[str, ...]) -> csv.DictReader:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise SchemaError("File must be UTF-8 encoded text") from exc

    reader = csv.DictReader(io.StringIO(text))
    headers = [h.strip().lower() for h in (reader.fieldnames or [])]
    missing = [c for c in expected if c not in headers]
    if missing:
        raise SchemaError(f"Missing required column(s): {', '.join(missing)}")
    return reader


def parse_orders(content: bytes) -> ParseResult:
    reader = _reader(content, ORDER_COLUMNS)
    result = ParseResult()

    for offset, raw in enumerate(reader, start=2):
        row = {(k or "").strip().lower(): v for k, v in raw.items()}
        order_id = normalise_reference(row.get("order_id"))
        if not order_id:
            result.errors.append(RowError(offset, "order_id is empty"))
            continue
        try:
            result.rows.append(
                ParsedOrder(
                    source_row=offset,
                    order_id=order_id,
                    order_date=parse_timestamp(row.get("order_date")),
                    customer_email=normalise_email(row.get("customer_email")),
                    currency=normalise_reference(row.get("currency")),
                    gross_amount=parse_money(row.get("gross_amount")),
                    discount=parse_money(row.get("discount")),
                    net_amount=parse_money(row.get("net_amount")),
                    status=normalise_code(row.get("status")),
                )
            )
        except ValueError as exc:
            result.errors.append(RowError(offset, str(exc)))

    return result


def parse_payments(content: bytes) -> ParseResult:
    reader = _reader(content, PAYMENT_COLUMNS)
    result = ParseResult()

    for offset, raw in enumerate(reader, start=2):
        row = {(k or "").strip().lower(): v for k, v in raw.items()}
        transaction_ref = normalise_reference(row.get("transaction_ref"))
        if not transaction_ref:
            result.errors.append(RowError(offset, "transaction_ref is empty"))
            continue
        try:
            result.rows.append(
                ParsedPayment(
                    source_row=offset,
                    transaction_ref=transaction_ref,
                    processed_at=parse_timestamp(row.get("processed_at")),
                    order_reference=normalise_reference(row.get("order_reference")),
                    raw_order_reference=row.get("order_reference"),
                    currency=normalise_reference(row.get("currency")),
                    amount=parse_money(row.get("amount")),
                    fee=parse_money(row.get("fee")),
                    net_settled=parse_money(row.get("net_settled")),
                    type=normalise_code(row.get("type")),
                    status=normalise_code(row.get("status")),
                )
            )
        except ValueError as exc:
            result.errors.append(RowError(offset, str(exc)))

    return result
