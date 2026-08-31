import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Order, Payment, Upload
from app.models.upload import ORDERS, PAYMENTS
from app.services import parsing

MAX_UPLOAD_BYTES = 5 * 1024 * 1024


class UploadTooLarge(ValueError):
    pass


def ingest(db: Session, user_id: uuid.UUID, kind: str, filename: str, content: bytes) -> tuple[Upload, list[parsing.RowError]]:
    if len(content) > MAX_UPLOAD_BYTES:
        raise UploadTooLarge(f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit")

    parsed = parsing.parse_orders(content) if kind == ORDERS else parsing.parse_payments(content)

    # Re-uploading replaces the previous dataset of that kind, so the dashboard
    # is never a blend of two exports.
    _clear(db, user_id, kind)

    upload = Upload(
        user_id=user_id,
        kind=kind,
        filename=filename,
        row_count=len(parsed.rows),
        skipped_count=len(parsed.errors),
    )
    db.add(upload)
    db.flush()

    if kind == ORDERS:
        db.add_all(
            Order(
                user_id=user_id,
                upload_id=upload.id,
                source_row=row.source_row,
                order_id=row.order_id,
                order_date=row.order_date,
                customer_email=row.customer_email,
                currency=row.currency,
                gross_amount=row.gross_amount,
                discount=row.discount,
                net_amount=row.net_amount,
                status=row.status,
            )
            for row in parsed.rows
        )
    else:
        db.add_all(
            Payment(
                user_id=user_id,
                upload_id=upload.id,
                source_row=row.source_row,
                transaction_ref=row.transaction_ref,
                processed_at=row.processed_at,
                order_reference=row.order_reference,
                raw_order_reference=row.raw_order_reference,
                currency=row.currency,
                amount=row.amount,
                fee=row.fee,
                net_settled=row.net_settled,
                type=row.type,
                status=row.status,
            )
            for row in parsed.rows
        )

    db.commit()
    db.refresh(upload)
    return upload, parsed.errors


def _clear(db: Session, user_id: uuid.UUID, kind: str) -> None:
    model = Order if kind == ORDERS else Payment
    db.execute(delete(model).where(model.user_id == user_id))
    db.execute(delete(Upload).where(Upload.user_id == user_id, Upload.kind == kind))


def list_uploads(db: Session, user_id: uuid.UUID) -> list[Upload]:
    return list(
        db.scalars(
            select(Upload).where(Upload.user_id == user_id).order_by(Upload.created_at.desc())
        )
    )


def load_records(db: Session, user_id: uuid.UUID) -> tuple[list[Order], list[Payment]]:
    orders = list(
        db.scalars(select(Order).where(Order.user_id == user_id).order_by(Order.source_row))
    )
    payments = list(
        db.scalars(select(Payment).where(Payment.user_id == user_id).order_by(Payment.source_row))
    )
    return orders, payments
