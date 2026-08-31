from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.api.deps import CurrentUser, DbSession
from app.models.upload import ORDERS, PAYMENTS
from app.schemas.ingestion import UploadOut, UploadResult
from app.services import ingestion
from app.services.parsing import SchemaError

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("/{kind}", response_model=UploadResult, status_code=status.HTTP_201_CREATED)
async def upload(
    kind: str,
    current_user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
) -> UploadResult:
    if kind not in (ORDERS, PAYMENTS):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown dataset '{kind}'. Expected '{ORDERS}' or '{PAYMENTS}'.",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty")

    try:
        record, errors = ingestion.ingest(
            db, current_user.id, kind, file.filename or f"{kind}.csv", content
        )
    except ingestion.UploadTooLarge as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(exc)
        ) from exc
    except SchemaError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    return UploadResult(
        **UploadOut.model_validate(record).model_dump(),
        errors=[{"source_row": e.source_row, "message": e.message} for e in errors],
    )


@router.get("", response_model=list[UploadOut])
def list_uploads(current_user: CurrentUser, db: DbSession):
    return ingestion.list_uploads(db, current_user.id)
