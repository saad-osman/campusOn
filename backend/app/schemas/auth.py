from datetime import datetime

from typing import Annotated

from pydantic import BaseModel, EmailStr, Field, StringConstraints


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UpdateMeIn(BaseModel):
    # Surrounding whitespace is stripped before the length check, so "   " is rejected.
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)
