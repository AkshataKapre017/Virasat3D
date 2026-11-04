from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, field_validator, model_validator

Role = Literal["researcher", "academic", "tourism", "archivist"]
EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128


def normalize_email(value: str) -> str:
    value = value.strip().lower()
    if not EMAIL_RE.fullmatch(value):
        raise ValueError("enter a valid email address")
    return value


def _validate_password(value: str) -> str:
    if len(value) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"use at least {MIN_PASSWORD_LENGTH} characters")
    if len(value) > MAX_PASSWORD_LENGTH:
        raise ValueError(f"use at most {MAX_PASSWORD_LENGTH} characters")
    return value


class SignupIn(BaseModel):
    email: str
    password: str
    confirm_password: str
    role: Role

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("password")
    @classmethod
    def _password(cls, value: str) -> str:
        return _validate_password(value)

    @model_validator(mode="after")
    def _passwords_match(self) -> SignupIn:
        if self.password != self.confirm_password:
            raise ValueError("the two passwords do not match")
        return self


class LoginIn(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return normalize_email(value)


class UserOut(BaseModel):
    id: int
    email: str
    role: Role
    permissions: list[str]


class LogoutOut(BaseModel):
    ok: bool
