"""add attendance system

Revision ID: 20260317_02
Revises: 20260317_01
Create Date: 2026-03-17 12:40:00
"""
from __future__ import annotations

from datetime import date

from alembic import op
import sqlalchemy as sa


revision = "20260317_02"
down_revision = "20260317_01"
branch_labels = None
depends_on = None


attendance_status_enum = sa.Enum(
    "on_time",
    "late",
    "early_leave",
    "overtime",
    "absent",
    "on_leave",
    name="attendancestatus",
)
attendance_source_enum = sa.Enum(
    "qr_code",
    "manual",
    "hardware",
    "correction",
    name="attendancesource",
)
employee_status_enum = sa.Enum("active", "on_leave", "terminated", name="employeestatus")


def _table_names(inspector: sa.Inspector) -> set[str]:
    return set(inspector.get_table_names())


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _attendance_holiday_rows() -> list[dict[str, object]]:
    return [
        {"date": date(2025, 1, 1), "name_uz": "Yangi yil", "name_ru": "Новый год", "is_work_day": False},
        {"date": date(2025, 1, 14), "name_uz": "Vatan himoyachilari kuni", "name_ru": "День защитников Отечества", "is_work_day": False},
        {"date": date(2025, 3, 8), "name_uz": "Xalqaro xotin-qizlar kuni", "name_ru": "Международный женский день", "is_work_day": False},
        {"date": date(2025, 3, 21), "name_uz": "Navro'z", "name_ru": "Навруз", "is_work_day": False},
        {"date": date(2025, 3, 30), "name_uz": "Ramazon hayiti", "name_ru": "Ид аль-Фитр", "is_work_day": False},
        {"date": date(2025, 5, 9), "name_uz": "Xotira va qadrlash kuni", "name_ru": "День памяти и почестей", "is_work_day": False},
        {"date": date(2025, 6, 6), "name_uz": "Qurbon hayiti", "name_ru": "Ид аль-Адха", "is_work_day": False},
        {"date": date(2025, 9, 1), "name_uz": "Mustaqillik kuni", "name_ru": "День независимости", "is_work_day": False},
        {"date": date(2025, 10, 1), "name_uz": "O'qituvchi va murabbiylar kuni", "name_ru": "День учителя", "is_work_day": False},
        {"date": date(2025, 12, 8), "name_uz": "Konstitutsiya kuni", "name_ru": "День Конституции", "is_work_day": False},
        {"date": date(2026, 1, 1), "name_uz": "Yangi yil", "name_ru": "Новый год", "is_work_day": False},
        {"date": date(2026, 1, 14), "name_uz": "Vatan himoyachilari kuni", "name_ru": "День защитников Отечества", "is_work_day": False},
        {"date": date(2026, 3, 8), "name_uz": "Xalqaro xotin-qizlar kuni", "name_ru": "Международный женский день", "is_work_day": False},
        {"date": date(2026, 3, 20), "name_uz": "Ramazon hayiti", "name_ru": "Ид аль-Фитр", "is_work_day": False},
        {"date": date(2026, 3, 21), "name_uz": "Navro'z", "name_ru": "Навруз", "is_work_day": False},
        {"date": date(2026, 5, 9), "name_uz": "Xotira va qadrlash kuni", "name_ru": "День памяти и почестей", "is_work_day": False},
        {"date": date(2026, 5, 27), "name_uz": "Qurbon hayiti", "name_ru": "Ид аль-Адха", "is_work_day": False},
        {"date": date(2026, 9, 1), "name_uz": "Mustaqillik kuni", "name_ru": "День независимости", "is_work_day": False},
        {"date": date(2026, 10, 1), "name_uz": "O'qituvchi va murabbiylar kuni", "name_ru": "День учителя", "is_work_day": False},
        {"date": date(2026, 12, 8), "name_uz": "Konstitutsiya kuni", "name_ru": "День Конституции", "is_work_day": False},
    ]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = _table_names(inspector)

    if bind.dialect.name == "postgresql":
        attendance_status_enum.create(bind, checkfirst=True)
        attendance_source_enum.create(bind, checkfirst=True)
        employee_status_enum.create(bind, checkfirst=True)

    if "office_locations" not in tables:
        op.create_table(
            "office_locations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("address", sa.String(length=255), nullable=True),
            sa.Column("latitude", sa.Float(), nullable=True),
            sa.Column("longitude", sa.Float(), nullable=True),
            sa.Column("geofence_radius_meters", sa.Integer(), nullable=False, server_default="300"),
            sa.Column("allowed_ip_ranges", sa.Text(), nullable=True),
            sa.Column("qr_rotation_seconds", sa.Integer(), nullable=False, server_default="30"),
            sa.Column("require_pin", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("allow_remote_flag", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
        )

    if "qr_tokens" not in tables:
        op.create_table(
            "qr_tokens",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("location_id", sa.Integer(), sa.ForeignKey("office_locations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("token", sa.Text(), nullable=False),
            sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("is_used", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
        )

    if "attendance_records" not in tables:
        op.create_table(
            "attendance_records",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("location_id", sa.Integer(), sa.ForeignKey("office_locations.id", ondelete="SET NULL"), nullable=True),
            sa.Column("work_date", sa.Date(), nullable=False),
            sa.Column("clock_in", sa.DateTime(), nullable=True),
            sa.Column("clock_out", sa.DateTime(), nullable=True),
            sa.Column("hours_worked", sa.Float(), nullable=True),
            sa.Column("overtime_hours", sa.Float(), nullable=True),
            sa.Column("late_minutes", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("early_leave_minutes", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status", attendance_status_enum, nullable=False, server_default="on_time"),
            sa.Column("source", attendance_source_enum, nullable=False, server_default="qr_code"),
            sa.Column("clock_in_ip", sa.String(length=120), nullable=True),
            sa.Column("clock_out_ip", sa.String(length=120), nullable=True),
            sa.Column("clock_in_device_hash", sa.String(length=255), nullable=True),
            sa.Column("clock_out_device_hash", sa.String(length=255), nullable=True),
            sa.Column("clock_in_location_lat", sa.Float(), nullable=True),
            sa.Column("clock_in_location_lng", sa.Float(), nullable=True),
            sa.Column("clock_out_location_lat", sa.Float(), nullable=True),
            sa.Column("clock_out_location_lng", sa.Float(), nullable=True),
            sa.Column("location_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("is_remote_flag", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("is_corrected", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("correction_note", sa.Text(), nullable=True),
            sa.Column("corrected_by", sa.String(length=120), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.UniqueConstraint("employee_id", "work_date", name="uq_attendance_employee_work_date"),
        )

    if "leave_requests" not in tables:
        op.create_table(
            "leave_requests",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("leave_type", sa.String(length=40), nullable=False),
            sa.Column("date_from", sa.Date(), nullable=False),
            sa.Column("date_to", sa.Date(), nullable=False),
            sa.Column("days_count", sa.Integer(), nullable=False),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("status", sa.String(length=40), nullable=False, server_default="pending"),
            sa.Column("approved_by", sa.String(length=120), nullable=True),
            sa.Column("approved_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
        )

    if "payroll_records" not in tables:
        op.create_table(
            "payroll_records",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("period_month", sa.Integer(), nullable=False),
            sa.Column("period_year", sa.Integer(), nullable=False),
            sa.Column("working_days_in_month", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("days_worked", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("days_absent", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("days_on_leave", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_hours_worked", sa.Float(), nullable=False, server_default="0"),
            sa.Column("total_overtime_hours", sa.Float(), nullable=False, server_default="0"),
            sa.Column("total_late_minutes", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("base_salary", sa.Float(), nullable=False, server_default="0"),
            sa.Column("prorated_salary", sa.Float(), nullable=False, server_default="0"),
            sa.Column("overtime_pay", sa.Float(), nullable=False, server_default="0"),
            sa.Column("late_penalty", sa.Float(), nullable=False, server_default="0"),
            sa.Column("manual_penalty", sa.Float(), nullable=False, server_default="0"),
            sa.Column("bonus", sa.Float(), nullable=False, server_default="0"),
            sa.Column("gross_salary", sa.Float(), nullable=False, server_default="0"),
            sa.Column("inps_employee", sa.Float(), nullable=False, server_default="0"),
            sa.Column("jshdssh", sa.Float(), nullable=False, server_default="0"),
            sa.Column("total_deductions", sa.Float(), nullable=False, server_default="0"),
            sa.Column("net_salary", sa.Float(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(length=40), nullable=False, server_default="draft"),
            sa.Column("approved_by", sa.String(length=120), nullable=True),
            sa.Column("approved_at", sa.DateTime(), nullable=True),
            sa.Column("paid_at", sa.DateTime(), nullable=True),
            sa.Column("payment_method", sa.String(length=40), nullable=True),
            sa.Column("is_manually_adjusted", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("adjustment_note", sa.Text(), nullable=True),
            sa.Column("calculation_breakdown", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.UniqueConstraint("employee_id", "period_month", "period_year", name="uq_payroll_employee_period"),
        )

    if "uzbek_holidays" not in tables:
        op.create_table(
            "uzbek_holidays",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("date", sa.Date(), nullable=False, unique=True),
            sa.Column("name_uz", sa.String(length=160), nullable=False),
            sa.Column("name_ru", sa.String(length=160), nullable=False),
            sa.Column("is_work_day", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    inspector = sa.inspect(bind)
    employee_columns = _column_names(inspector, "employees") if "employees" in _table_names(inspector) else set()
    if "employees" in _table_names(inspector):
        with op.batch_alter_table("employees") as batch_op:
            if "company_id" not in employee_columns:
                batch_op.add_column(sa.Column("company_id", sa.Integer(), nullable=True))
            if "employee_pin" not in employee_columns:
                batch_op.add_column(sa.Column("employee_pin", sa.String(length=255), nullable=True))
            if "shift_start" not in employee_columns:
                batch_op.add_column(sa.Column("shift_start", sa.Time(), nullable=True))
            if "shift_end" not in employee_columns:
                batch_op.add_column(sa.Column("shift_end", sa.Time(), nullable=True))
            if "late_grace_minutes" not in employee_columns:
                batch_op.add_column(sa.Column("late_grace_minutes", sa.Integer(), nullable=False, server_default="15"))
            if "hourly_rate" not in employee_columns:
                batch_op.add_column(sa.Column("hourly_rate", sa.Float(), nullable=True))
            if "contract_type" not in employee_columns:
                batch_op.add_column(sa.Column("contract_type", sa.String(length=40), nullable=False, server_default="monthly"))
            if "work_days" not in employee_columns:
                batch_op.add_column(sa.Column("work_days", sa.JSON(), nullable=False, server_default="[1, 2, 3, 4, 5]"))
            if "device_fingerprint" not in employee_columns:
                batch_op.add_column(sa.Column("device_fingerprint", sa.String(length=255), nullable=True))
            if "telegram_chat_id" not in employee_columns:
                batch_op.add_column(sa.Column("telegram_chat_id", sa.String(length=80), nullable=True))
            if "telegram_username" not in employee_columns:
                batch_op.add_column(sa.Column("telegram_username", sa.String(length=120), nullable=True))
            if "telegram_first_name" not in employee_columns:
                batch_op.add_column(sa.Column("telegram_first_name", sa.String(length=120), nullable=True))
            if "telegram_linked_at" not in employee_columns:
                batch_op.add_column(sa.Column("telegram_linked_at", sa.DateTime(), nullable=True))

    inspector = sa.inspect(bind)
    index_targets = {
        "attendance_records": [
            ("idx_attendance_employee_date", ["employee_id", "work_date"]),
            ("idx_attendance_company_date", ["company_id", "work_date"]),
        ],
        "qr_tokens": [
            ("idx_qr_tokens_hash", ["token_hash"]),
            ("idx_qr_tokens_expiry", ["expires_at", "is_used"]),
        ],
        "payroll_records": [
            ("idx_payroll_company_period", ["company_id", "period_year", "period_month"]),
        ],
        "leave_requests": [
            ("idx_leave_employee_dates", ["employee_id", "date_from", "date_to"]),
        ],
    }
    for table_name, definitions in index_targets.items():
        if table_name not in _table_names(inspector):
            continue
        existing_indexes = _index_names(inspector, table_name)
        for index_name, columns in definitions:
            if index_name not in existing_indexes:
                op.create_index(index_name, table_name, columns, unique=False)

    holiday_table = sa.table(
        "uzbek_holidays",
        sa.column("date", sa.Date()),
        sa.column("name_uz", sa.String(length=160)),
        sa.column("name_ru", sa.String(length=160)),
        sa.column("is_work_day", sa.Boolean()),
    )
    existing_holiday_dates = {row[0] for row in bind.execute(sa.select(holiday_table.c.date)).fetchall()} if "uzbek_holidays" in _table_names(sa.inspect(bind)) else set()
    missing_rows = [row for row in _attendance_holiday_rows() if row["date"] not in existing_holiday_dates]
    if missing_rows:
        op.bulk_insert(holiday_table, missing_rows)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = _table_names(inspector)

    for table_name, index_name in (
        ("leave_requests", "idx_leave_employee_dates"),
        ("payroll_records", "idx_payroll_company_period"),
        ("qr_tokens", "idx_qr_tokens_expiry"),
        ("qr_tokens", "idx_qr_tokens_hash"),
        ("attendance_records", "idx_attendance_company_date"),
        ("attendance_records", "idx_attendance_employee_date"),
    ):
        if table_name in tables and index_name in _index_names(inspector, table_name):
            op.drop_index(index_name, table_name=table_name)

    inspector = sa.inspect(bind)
    tables = _table_names(inspector)
    if "employees" in tables:
        employee_columns = _column_names(inspector, "employees")
        with op.batch_alter_table("employees") as batch_op:
            for column_name in (
                "device_fingerprint",
                "work_days",
                "contract_type",
                "hourly_rate",
                "late_grace_minutes",
                "shift_end",
                "shift_start",
                "employee_pin",
                "company_id",
                "telegram_linked_at",
                "telegram_first_name",
                "telegram_username",
                "telegram_chat_id",
            ):
                if column_name in employee_columns:
                    batch_op.drop_column(column_name)

    inspector = sa.inspect(bind)
    tables = _table_names(inspector)
    for table_name in ("uzbek_holidays", "payroll_records", "leave_requests", "attendance_records", "qr_tokens", "office_locations"):
        if table_name in tables:
            op.drop_table(table_name)

    if bind.dialect.name == "postgresql":
        attendance_source_enum.drop(bind, checkfirst=True)
        attendance_status_enum.drop(bind, checkfirst=True)
