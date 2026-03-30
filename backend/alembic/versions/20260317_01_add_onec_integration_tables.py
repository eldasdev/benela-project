"""add onec integration tables

Revision ID: 20260317_01
Revises:
Create Date: 2026-03-17 04:05:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260317_01"
down_revision = None
branch_labels = None
depends_on = None


def _table_names(inspector: sa.Inspector) -> set[str]:
    return set(inspector.get_table_names())


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = _table_names(inspector)

    if "onec_connections" not in tables:
        op.create_table(
            "onec_connections",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("connection_type", sa.String(length=40), nullable=False),
            sa.Column("connection_label", sa.String(length=120), nullable=True),
            sa.Column("db_host", sa.String(length=500), nullable=True),
            sa.Column("db_port", sa.Integer(), nullable=True),
            sa.Column("db_name", sa.String(length=255), nullable=True),
            sa.Column("db_username", sa.String(length=500), nullable=True),
            sa.Column("db_password", sa.String(length=500), nullable=True),
            sa.Column("db_type", sa.String(length=40), nullable=True),
            sa.Column("api_base_url", sa.String(length=500), nullable=True),
            sa.Column("api_username", sa.String(length=500), nullable=True),
            sa.Column("api_password", sa.String(length=500), nullable=True),
            sa.Column("api_version", sa.String(length=40), nullable=True),
            sa.Column("sync_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("sync_interval_minutes", sa.Integer(), nullable=False, server_default="1440"),
            sa.Column("last_sync_at", sa.DateTime(), nullable=True),
            sa.Column("last_sync_status", sa.String(length=40), nullable=True),
            sa.Column("last_sync_message", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_by", sa.String(length=120), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
        )

    inspector = sa.inspect(bind)
    tables = _table_names(inspector)

    if "onec_import_jobs" not in tables:
        op.create_table(
            "onec_import_jobs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("connection_id", sa.Integer(), sa.ForeignKey("onec_connections.id", ondelete="SET NULL"), nullable=True),
            sa.Column("filename", sa.String(length=255), nullable=False),
            sa.Column("storage_path", sa.String(length=500), nullable=False),
            sa.Column("mime_type", sa.String(length=120), nullable=True),
            sa.Column("source_hint", sa.String(length=50), nullable=True),
            sa.Column("file_size_bytes", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("report_type", sa.String(length=80), nullable=False, server_default="unknown"),
            sa.Column("status", sa.String(length=40), nullable=False, server_default="pending"),
            sa.Column("records_parsed", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("records_imported", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("records_skipped", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("records_failed", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("anomaly_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("period_start", sa.Date(), nullable=True),
            sa.Column("period_end", sa.Date(), nullable=True),
            sa.Column("imported_by", sa.String(length=120), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        )

    if "onec_raw_records" not in tables:
        op.create_table(
            "onec_raw_records",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("import_job_id", sa.Integer(), sa.ForeignKey("onec_import_jobs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("record_type", sa.String(length=80), nullable=False),
            sa.Column("raw_data", sa.JSON(), nullable=False),
            sa.Column("normalized_data", sa.JSON(), nullable=False),
            sa.Column("benela_record_id", sa.Integer(), nullable=True),
            sa.Column("benela_table", sa.String(length=80), nullable=True),
            sa.Column("import_hash", sa.String(length=64), nullable=False),
            sa.Column("row_status", sa.String(length=40), nullable=False, server_default="ready"),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
        )

    inspector = sa.inspect(bind)
    tables = _table_names(inspector)

    if "transactions" in tables and "company_id" not in _column_names(inspector, "transactions"):
        with op.batch_alter_table("transactions") as batch_op:
            batch_op.add_column(sa.Column("company_id", sa.Integer(), nullable=True))
            batch_op.create_foreign_key(
                "fk_transactions_company_id_client_orgs",
                "client_orgs",
                ["company_id"],
                ["id"],
                ondelete="SET NULL",
            )

    if "invoices" in tables and "company_id" not in _column_names(inspector, "invoices"):
        with op.batch_alter_table("invoices") as batch_op:
            batch_op.add_column(sa.Column("company_id", sa.Integer(), nullable=True))
            batch_op.create_foreign_key(
                "fk_invoices_company_id_client_orgs",
                "client_orgs",
                ["company_id"],
                ["id"],
                ondelete="SET NULL",
            )

    inspector = sa.inspect(bind)
    index_targets = {
        "onec_raw_records": [
            ("idx_onec_raw_records_company_id", ["company_id"]),
            ("idx_onec_raw_records_import_job", ["import_job_id"]),
            ("idx_onec_raw_records_hash", ["import_hash"]),
        ],
        "onec_import_jobs": [("idx_onec_import_jobs_company", ["company_id", "created_at"])],
        "onec_connections": [("idx_onec_connections_company", ["company_id", "is_active"])],
    }
    for table_name, definitions in index_targets.items():
        if table_name not in _table_names(inspector):
            continue
        existing_indexes = _index_names(inspector, table_name)
        for index_name, columns in definitions:
            if index_name not in existing_indexes:
                op.create_index(index_name, table_name, columns, unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = _table_names(inspector)

    for table_name, index_name in (
        ("onec_connections", "idx_onec_connections_company"),
        ("onec_import_jobs", "idx_onec_import_jobs_company"),
        ("onec_raw_records", "idx_onec_raw_records_hash"),
        ("onec_raw_records", "idx_onec_raw_records_import_job"),
        ("onec_raw_records", "idx_onec_raw_records_company_id"),
    ):
        if table_name in tables and index_name in _index_names(inspector, table_name):
            op.drop_index(index_name, table_name=table_name)

    inspector = sa.inspect(bind)
    tables = _table_names(inspector)

    if "invoices" in tables and "company_id" in _column_names(inspector, "invoices"):
        with op.batch_alter_table("invoices") as batch_op:
            batch_op.drop_column("company_id")

    if "transactions" in tables and "company_id" in _column_names(inspector, "transactions"):
        with op.batch_alter_table("transactions") as batch_op:
            batch_op.drop_column("company_id")

    inspector = sa.inspect(bind)
    tables = _table_names(inspector)

    if "onec_raw_records" in tables:
        op.drop_table("onec_raw_records")
    if "onec_import_jobs" in tables:
        op.drop_table("onec_import_jobs")
    if "onec_connections" in tables:
        op.drop_table("onec_connections")
