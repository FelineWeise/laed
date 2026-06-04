"""remove legacy DEMO PROJECT seed rows

Revision ID: 0011_remove_demo_seed
Revises: 0010_project_invitations
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0011_remove_demo_seed"
down_revision: Union[str, Sequence[str], None] = "0010_project_invitations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _delete_demo_projects(connection) -> None:
    rows = connection.execute(
        sa.text(
            """
            SELECT id FROM projects
            WHERE lower(trim(name)) = 'demo project'
               OR lower(coalesce(description, '')) LIKE '%seeded for test and demo login%'
            """
        )
    ).fetchall()
    for (project_id,) in rows:
        pid = str(project_id)
        connection.execute(
            sa.text(
                "DELETE FROM ai_messages WHERE conversation_id IN "
                "(SELECT id FROM ai_conversations WHERE project_id = :pid)"
            ),
            {"pid": pid},
        )
        connection.execute(
            sa.text("DELETE FROM ai_conversations WHERE project_id = :pid"),
            {"pid": pid},
        )
        connection.execute(
            sa.text(
                "DELETE FROM file_chunks WHERE file_id IN "
                "(SELECT id FROM files WHERE project_id = :pid) OR project_id = :pid"
            ),
            {"pid": pid},
        )
        connection.execute(
            sa.text("DELETE FROM files WHERE project_id = :pid"), {"pid": pid}
        )
        connection.execute(
            sa.text("DELETE FROM messages WHERE project_id = :pid"), {"pid": pid}
        )
        connection.execute(
            sa.text("DELETE FROM thread_sessions WHERE project_id = :pid"),
            {"pid": pid},
        )
        connection.execute(
            sa.text(
                "DELETE FROM topology_edges WHERE source_node_id IN ("
                "  SELECT id FROM topology_nodes WHERE "
                "    (scope_type = 'project' AND scope_id = :pid) OR "
                "    (scope_type = 'global' AND node_type = 'project' AND ref_id = :pid)"
                ") OR target_node_id IN ("
                "  SELECT id FROM topology_nodes WHERE "
                "    (scope_type = 'project' AND scope_id = :pid) OR "
                "    (scope_type = 'global' AND node_type = 'project' AND ref_id = :pid)"
                ")"
            ),
            {"pid": pid},
        )
        connection.execute(
            sa.text(
                "DELETE FROM topic_members WHERE topic_node_id IN ("
                "  SELECT id FROM topology_nodes WHERE scope_type = 'project' AND scope_id = :pid"
                ")"
            ),
            {"pid": pid},
        )
        connection.execute(
            sa.text(
                "DELETE FROM topology_nodes WHERE "
                "(scope_type = 'project' AND scope_id = :pid) OR "
                "(scope_type = 'global' AND node_type = 'project' AND ref_id = :pid)"
            ),
            {"pid": pid},
        )
        connection.execute(
            sa.text(
                "DELETE FROM folder_inclusion_settings WHERE project_id = :pid"
            ),
            {"pid": pid},
        )
        connection.execute(
            sa.text("DELETE FROM folders WHERE project_id = :pid"), {"pid": pid}
        )
        connection.execute(
            sa.text("DELETE FROM harness_documents WHERE project_id = :pid"),
            {"pid": pid},
        )
        connection.execute(
            sa.text(
                "DELETE FROM share_grant_audit_log WHERE grant_id IN "
                "(SELECT id FROM project_share_grants WHERE project_id = :pid)"
            ),
            {"pid": pid},
        )
        connection.execute(
            sa.text("DELETE FROM project_share_grants WHERE project_id = :pid"),
            {"pid": pid},
        )
        connection.execute(
            sa.text("DELETE FROM project_invitations WHERE project_id = :pid"),
            {"pid": pid},
        )
        connection.execute(
            sa.text("DELETE FROM project_members WHERE project_id = :pid"),
            {"pid": pid},
        )
        connection.execute(
            sa.text("DELETE FROM access_log WHERE project_id = :pid"), {"pid": pid}
        )
        connection.execute(
            sa.text("DELETE FROM projects WHERE id = :pid"), {"pid": pid}
        )


def upgrade() -> None:
    _delete_demo_projects(op.get_bind())


def downgrade() -> None:
    pass
