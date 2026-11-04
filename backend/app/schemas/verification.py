from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

ReviewTarget = Literal["needs_review", "verified", "published", "rejected"]


class VerificationOut(BaseModel):
    """Public view of a submission's review state. Curator notes are never included."""

    asset_id: int
    state: str
    reason: str | None
    flags: list[str]


class ReviewIn(BaseModel):
    to_state: ReviewTarget
    reviewer: str = Field(min_length=1, max_length=120)
    reason: str | None = Field(default=None, max_length=500)
    note: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _rejection_needs_reason(self) -> ReviewIn:
        if self.to_state == "rejected" and not (self.reason and self.reason.strip()):
            raise ValueError("a rejection needs a reason")
        return self


class ReviewEventOut(BaseModel):
    id: int
    from_state: str | None
    to_state: str
    actor: str
    reason: str | None
    note: str | None
    created_at: datetime
