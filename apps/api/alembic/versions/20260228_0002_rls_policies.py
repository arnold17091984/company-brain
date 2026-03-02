"""Row-Level Security policies for multi-tenant access control.

Revision ID: a7b8c9d0e1f2
Revises: d1a2b3c4e5f6
Create Date: 2026-02-28 00:02:00.000000

Strategy
--------
The application sets three session-local GUC variables before every query:

    SET LOCAL app.current_user_id      = '<uuid>';
    SET LOCAL app.current_department_id = '<uuid>';   -- may be empty string
    SET LOCAL app.current_access_level  = 'all' | 'department' | 'restricted';

RLS policies then read these variables to decide row visibility.

Access levels:
    all          - superuser / management; sees every row
    department   - standard employee; sees own-department rows
    restricted   - contractor / external; sees only explicitly public rows
"""

from collections.abc import Sequence

from alembic import op

# ---------------------------------------------------------------------------
# Alembic metadata
# ---------------------------------------------------------------------------

revision: str = "a7b8c9d0e1f2"
down_revision: str | None = "d1a2b3c4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Tables that receive RLS
_RLS_TABLES = (
    "documents",
    "chat_sessions",
    "chat_messages",
    "feedbacks",
)


# ---------------------------------------------------------------------------
# Upgrade
# ---------------------------------------------------------------------------


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Create app_user role (harmless if it already exists)
    #    The role is used as the grantee for all RLS policies so the
    #    application connection does NOT need superuser privileges.
    # ------------------------------------------------------------------
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
                CREATE ROLE app_user NOLOGIN;
            END IF;
        END
        $$;
        """
    )

    # Grant table-level privileges to app_user
    for table in _RLS_TABLES:
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO app_user;")
    op.execute("GRANT SELECT ON departments TO app_user;")
    op.execute("GRANT SELECT ON users TO app_user;")
    op.execute("GRANT SELECT ON audit_logs TO app_user;")
    op.execute("GRANT INSERT ON audit_logs TO app_user;")

    # ------------------------------------------------------------------
    # 2. Enable RLS on each table
    # ------------------------------------------------------------------
    for table in _RLS_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        # Superusers and table owners bypass RLS by default; make RLS apply
        # to the table owner too so local testing is realistic.
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY;")

    # ------------------------------------------------------------------
    # 3. documents policies
    #
    #    access_level = 'all'          -> see every document
    #    access_level = 'department'   -> see docs with matching dept OR access_level='public'
    #    access_level = 'restricted'   -> see only docs with access_level='public'
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE POLICY documents_select_all
        ON documents
        FOR SELECT
        USING (
            current_setting('app.current_access_level', true) = 'all'
        );
        """
    )

    op.execute(
        """
        CREATE POLICY documents_select_department
        ON documents
        FOR SELECT
        USING (
            current_setting('app.current_access_level', true) = 'department'
            AND (
                department_id::text
                    = NULLIF(current_setting('app.current_department_id', true), '')
                OR access_level = 'public'
            )
        );
        """
    )

    op.execute(
        """
        CREATE POLICY documents_select_restricted
        ON documents
        FOR SELECT
        USING (
            current_setting('app.current_access_level', true) = 'restricted'
            AND access_level = 'public'
        );
        """
    )

    # Write policy: any authenticated user may insert/update documents they
    # are responsible for.  The API layer enforces finer-grained logic;
    # RLS here is the backstop.
    op.execute(
        """
        CREATE POLICY documents_write
        ON documents
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
    # 4. chat_sessions policies
    #    Users may only see sessions they own.
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE POLICY chat_sessions_own
        ON chat_sessions
        FOR ALL
        USING (
            user_id::text
                = NULLIF(current_setting('app.current_user_id', true), '')
        )
        WITH CHECK (
            user_id::text
                = NULLIF(current_setting('app.current_user_id', true), '')
        );
        """
    )

    # ------------------------------------------------------------------
    # 5. chat_messages policies
    #    Users may only see messages belonging to their own sessions.
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE POLICY chat_messages_own
        ON chat_messages
        FOR ALL
        USING (
            EXISTS (
                SELECT 1
                FROM chat_sessions cs
                WHERE cs.id = chat_messages.session_id
                  AND cs.user_id::text
                      = NULLIF(current_setting('app.current_user_id', true), '')
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1
                FROM chat_sessions cs
                WHERE cs.id = chat_messages.session_id
                  AND cs.user_id::text
                      = NULLIF(current_setting('app.current_user_id', true), '')
            )
        );
        """
    )

    # ------------------------------------------------------------------
    # 6. feedbacks policies
    #    Users may only see / create feedback on their own messages.
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE POLICY feedbacks_own
        ON feedbacks
        FOR ALL
        USING (
            user_id::text
                = NULLIF(current_setting('app.current_user_id', true), '')
        )
        WITH CHECK (
            user_id::text
                = NULLIF(current_setting('app.current_user_id', true), '')
        );
        """
    )


# ---------------------------------------------------------------------------
# Downgrade: drop all policies, disable RLS, drop role grants
# ---------------------------------------------------------------------------


def downgrade() -> None:
    # Drop policies in reverse order
    op.execute("DROP POLICY IF EXISTS feedbacks_own ON feedbacks;")

    op.execute("DROP POLICY IF EXISTS chat_messages_own ON chat_messages;")

    op.execute("DROP POLICY IF EXISTS chat_sessions_own ON chat_sessions;")

    op.execute("DROP POLICY IF EXISTS documents_write ON documents;")
    op.execute("DROP POLICY IF EXISTS documents_select_restricted ON documents;")
    op.execute("DROP POLICY IF EXISTS documents_select_department ON documents;")
    op.execute("DROP POLICY IF EXISTS documents_select_all ON documents;")

    # Disable RLS
    for table in _RLS_TABLES:
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY;")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")

    # Revoke grants and drop role
    for table in _RLS_TABLES:
        op.execute(f"REVOKE SELECT, INSERT, UPDATE, DELETE ON {table} FROM app_user;")
    op.execute("REVOKE SELECT ON departments FROM app_user;")
    op.execute("REVOKE SELECT ON users FROM app_user;")
    op.execute("REVOKE SELECT ON audit_logs FROM app_user;")
    op.execute("REVOKE INSERT ON audit_logs FROM app_user;")

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
                DROP ROLE app_user;
            END IF;
        END
        $$;
        """
    )
