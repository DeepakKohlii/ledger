import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RowErrorOut(BaseModel):
    source_row: int
    message: str


class UploadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    filename: str
    row_count: int
    skipped_count: int
    created_at: datetime


class UploadResult(UploadOut):
    errors: list[RowErrorOut] = []
