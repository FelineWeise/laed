"""Ensure demo user from LAED_DEMO_* env on every app startup."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.passwords import hash_password, verify_password
from app.config import settings
from app.models.project import Project, ProjectMember
from app.models.user import User
from app.services.project_hooks import on_project_created

DEMO_PROJECT_NAME = "Demo Project"


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
        await db.flush()

        project = Project(
            name=DEMO_PROJECT_NAME,
            description="Seeded for test and demo login",
            created_by=user.id,
            ownership_model="owned",
        )
        db.add(project)
        await db.flush()

        db.add(
            ProjectMember(
                project_id=project.id,
                user_id=user.id,
                role="owner",
            )
        )
        await db.flush()
        await on_project_created(db, project, user)
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

    membership = await db.execute(
        select(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user.id)
        .where(Project.archived_at.is_(None))
        .limit(1)
    )
    if membership.scalar_one_or_none() is None:
        project = Project(
            name=DEMO_PROJECT_NAME,
            description="Seeded for test and demo login",
            created_by=user.id,
            ownership_model="owned",
        )
        db.add(project)
        await db.flush()
        db.add(
            ProjectMember(
                project_id=project.id,
                user_id=user.id,
                role="owner",
            )
        )
        await db.flush()
        await on_project_created(db, project, user)
        await db.commit()
