"""HR data integration: category + role fields, document_acl table, RLS updates.

Revision ID: b2c3d4e5f6a7
Revises: a7b8c9d0e1f2
Create Date: 2026-03-03 00:01:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# ---------------------------------------------------------------------------
# Alembic metadata
# ---------------------------------------------------------------------------

revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# ---------------------------------------------------------------------------
# Upgrade
# ---------------------------------------------------------------------------


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. documents: add category + related_employee_id
    # ------------------------------------------------------------------
    op.add_column(
        "documents",
        sa.Column(
            "category",
            sa.String(50),
            nullable=False,
            server_default="general",
        ),
    )
    op.add_column(
        "documents",
        sa.Column("related_employee_id", sa.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_documents_related_employee_id",
        "documents",
        "users",
        ["related_employee_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_documents_category", "documents", ["category"])
    op.create_index("ix_documents_related_employee_id", "documents", ["related_employee_id"])

    # ------------------------------------------------------------------
    # 2. users: add role
    # ------------------------------------------------------------------
    op.add_column(
        "users",
        sa.Column(
            "role",
            sa.String(50),
            nullable=False,
            server_default="employee",
        ),
    )

    # ------------------------------------------------------------------
    # 3. document_acl: new table
    # ------------------------------------------------------------------
    op.create_table(
        "document_acl",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("document_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("grantee_type", sa.String(20), nullable=False),
        sa.Column("grantee_id", sa.String(255), nullable=False),
        sa.Column(
            "permission",
            sa.String(10),
            nullable=False,
            server_default="read",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["documents.id"],
            name="fk_document_acl_document_id",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_document_acl_document_id", "document_acl", ["document_id"])
    op.create_index(
        "ix_document_acl_grantee_type_grantee_id",
        "document_acl",
        ["grantee_type", "grantee_id"],
    )

    # ------------------------------------------------------------------
    # 4. RLS: enable + grant on document_acl
    # ------------------------------------------------------------------
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON document_acl TO app_user;")
    op.execute("ALTER TABLE document_acl ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE document_acl FORCE ROW LEVEL SECURITY;")

    # ACL entries are readable by any authenticated user (application layer
    # performs finer-grained checks).  Write operations require a valid
    # user session (HR admin enforcement is done in the API layer).
    op.execute(
        """
        CREATE POLICY document_acl_select
        ON document_acl
        FOR SELECT
        USING (
            NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL
        );
        """
    )
    op.execute(
        """
        CREATE POLICY document_acl_write
        ON document_acl
        FOR ALL
        USING (
            NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL
        )
        WITH CHECK (
            NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL
        );
        """
    )

    # ------------------------------------------------------------------
    # 5. documents RLS: add HR ACL-aware select policy
    #
    #    HR documents (category LIKE 'hr_%') are visible when:
    #      a) the user has an explicit ACL entry by user ID, or
    #      b) the user's role matches a role-based ACL entry, or
    #      c) the document is linked to the requesting user as the
    #         related employee (self-service access).
    #
    #    Non-HR documents continue to fall through to the existing
    #    access_level policies defined in the previous migration.
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE POLICY documents_select_hr_acl
        ON documents
        FOR SELECT
        USING (
            category LIKE 'hr_%'
            AND (
                EXISTS (
                    SELECT 1
                    FROM document_acl acl
                    WHERE acl.document_id = documents.id
                      AND (
                          (acl.grantee_type = 'user'
                           AND acl.grantee_id
                               = NULLIF(current_setting('app.current_user_id', true), ''))
                          OR
                          (acl.grantee_type = 'role'
                           AND acl.grantee_id
                               = NULLIF(current_setting('app.current_role', true), ''))
                          OR
                          (acl.grantee_type = 'department'
                           AND acl.grantee_id
                               = NULLIF(current_setting('app.current_department_id', true), ''))
                      )
                )
                OR related_employee_id::text
                    = NULLIF(current_setting('app.current_user_id', true), '')
            )
        );
        """
    )


# ---------------------------------------------------------------------------
# Downgrade
# ---------------------------------------------------------------------------


def downgrade() -> None:
    # Drop new documents RLS policy
    op.execute("DROP POLICY IF EXISTS documents_select_hr_acl ON documents;")

    # Drop document_acl RLS policies, disable RLS, revoke grants
    op.execute("DROP POLICY IF EXISTS document_acl_write ON document_acl;")
    op.execute("DROP POLICY IF EXISTS document_acl_select ON document_acl;")
    op.execute("ALTER TABLE document_acl NO FORCE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE document_acl DISABLE ROW LEVEL SECURITY;")
    op.execute("REVOKE SELECT, INSERT, UPDATE, DELETE ON document_acl FROM app_user;")

    # Drop document_acl table + indexes
    op.drop_index("ix_document_acl_grantee_type_grantee_id", table_name="document_acl")
    op.drop_index("ix_document_acl_document_id", table_name="document_acl")
    op.drop_table("document_acl")

    # Revert users.role
    op.drop_column("users", "role")

    # Revert documents columns
    op.drop_index("ix_documents_related_employee_id", table_name="documents")
    op.drop_index("ix_documents_category", table_name="documents")
    op.drop_constraint("fk_documents_related_employee_id", "documents", type_="foreignkey")
    op.drop_column("documents", "related_employee_id")
    op.drop_column("documents", "category")
