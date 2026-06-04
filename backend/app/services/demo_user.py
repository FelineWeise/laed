"""Ensure demo user from LAED_DEMO_* env on every app startup."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.passwords import hash_password, verify_password
from app.config import settings
from app.models.user import User


async def ensure_demo_user(db: AsyncSession) -> None:
    email = settings.demo_email.strip()
    password = settings.demo_password
    if not email or not password:
        return

    display_name = settings.demo_display_name or "Demo User"
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            email=email,
            display_name=display_name,
            password_hash=hash_password(password),
        )
        db.add(user)
        await db.commit()
        return

    if not verify_password(password, user.password_hash):
        user.password_hash = hash_password(password)
        if settings.demo_display_name:
            user.display_name = settings.demo_display_name
        await db.commit()
        return

    if settings.demo_display_name and user.display_name != settings.demo_display_name:
        user.display_name = settings.demo_display_name
        await db.commit()

