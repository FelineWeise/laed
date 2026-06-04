"""Explicit retrieval scope for pgvector queries."""

from __future__ import annotations

from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class RetrievalScopeLevel(str, Enum):
    GLOBAL = "global"
    PROJECT = "project"
    TOPIC = "topic"


class RetrievalScope(BaseModel):
    """Value object pushed into SQL WHERE — no implicit globals."""

    level: Literal["global", "project", "topic"] = "project"
    project_ids: list[UUID] = Field(default_factory=list)
    topic_ids: list[UUID] = Field(default_factory=list)
    folder_ids: list[UUID] = Field(default_factory=list)
    include_linked: bool = False
    include_constituent_topics: bool = False
    linked_project_ids: list[UUID] = Field(default_factory=list)
    linked_folder_ids: list[UUID] = Field(default_factory=list)
    session_scope_id: UUID | None = None

    def primary_project_ids(self) -> list[UUID]:
        return list(self.project_ids)

    def sql_project_filter(self) -> tuple[str, dict[str, object]]:
        """Project / topic primary branch (excludes linked grant expansion)."""
        clauses: list[str] = []
        params: dict[str, object] = {}

        primary = [str(pid) for pid in self.primary_project_ids()]
        if not primary:
            clauses.append("FALSE")
            return " AND ".join(clauses), params

        params["project_ids"] = primary
        clauses.append("project_id = ANY(CAST(:project_ids AS uuid[]))")

        if self.level == "topic" and self.topic_ids:
            topic_strs = [str(tid) for tid in self.topic_ids]
            params["topic_ids"] = topic_strs
            clauses.append(
                """
                (
                  topic_node_id IS NULL
                  OR topic_node_id = ANY(CAST(:topic_ids AS uuid[]))
                  OR metadata->>'topic_node_id' = ANY(:topic_ids)
                )
                """
            )

        if self.folder_ids:
            folder_strs = [str(fid) for fid in self.folder_ids]
            params["folder_ids"] = folder_strs
            clauses.append(
                "(folder_id IS NULL OR folder_id = ANY(CAST(:folder_ids AS uuid[])))"
            )

        return " AND ".join(clauses), params

    def sql_linked_filter(self) -> tuple[str, dict[str, object]]:
        """Grant-linked projects/folders when include_linked is set."""
        if not self.include_linked:
            return "", {}
        linked_projects = [str(pid) for pid in self.linked_project_ids]
        if not linked_projects:
            return "", {}

        params: dict[str, object] = {"linked_project_ids": linked_projects}
        parts = ["project_id = ANY(CAST(:linked_project_ids AS uuid[]))"]

        if self.linked_folder_ids:
            linked_folders = [str(fid) for fid in self.linked_folder_ids]
            params["linked_folder_ids"] = linked_folders
            parts.append(
                "(folder_id IS NULL OR folder_id = ANY(CAST(:linked_folder_ids AS uuid[])))"
            )

        return " AND ".join(parts), params
