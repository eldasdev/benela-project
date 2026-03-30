from __future__ import annotations

import enum

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from database.connection import Base


class AttendanceSource(str, enum.Enum):
    qr_code = "qr_code"
    manual = "manual"
    hardware = "hardware"
    correction = "correction"


class AttendanceStatus(str, enum.Enum):
    on_time = "on_time"
    late = "late"
    early_leave = "early_leave"
    overtime = "overtime"
    absent = "absent"
    on_leave = "on_leave"


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (
        UniqueConstraint("employee_id", "work_date", name="uq_attendance_employee_work_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False, index=True)
    location_id = Column(Integer, ForeignKey("office_locations.id", ondelete="SET NULL"), nullable=True, index=True)
    work_date = Column(Date, nullable=False, index=True)
    clock_in = Column(DateTime, nullable=True)
    clock_out = Column(DateTime, nullable=True)

    hours_worked = Column(Float, nullable=True)
    overtime_hours = Column(Float, nullable=True)
    late_minutes = Column(Integer, nullable=False, default=0)
    early_leave_minutes = Column(Integer, nullable=False, default=0)

    status = Column(Enum(AttendanceStatus), nullable=False, default=AttendanceStatus.on_time, index=True)
    source = Column(Enum(AttendanceSource), nullable=False, default=AttendanceSource.qr_code)

    clock_in_ip = Column(String(120), nullable=True)
    clock_out_ip = Column(String(120), nullable=True)
    clock_in_device_hash = Column(String(255), nullable=True)
    clock_out_device_hash = Column(String(255), nullable=True)
    clock_in_location_lat = Column(Float, nullable=True)
    clock_in_location_lng = Column(Float, nullable=True)
    clock_out_location_lat = Column(Float, nullable=True)
    clock_out_location_lng = Column(Float, nullable=True)
    location_verified = Column(Boolean, nullable=False, default=False)
    is_remote_flag = Column(Boolean, nullable=False, default=False)

    is_corrected = Column(Boolean, nullable=False, default=False)
    correction_note = Column(Text, nullable=True)
    corrected_by = Column(String(120), nullable=True)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class QRToken(Base):
    __tablename__ = "qr_tokens"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False, index=True)
    location_id = Column(Integer, ForeignKey("office_locations.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(Text, nullable=False)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    is_used = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime, default=func.now())


class OfficeLocation(Base):
    __tablename__ = "office_locations"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(160), nullable=False)
    address = Column(String(255), nullable=True)

    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    geofence_radius_meters = Column(Integer, nullable=False, default=300)

    allowed_ip_ranges = Column(Text, nullable=True)

    qr_rotation_seconds = Column(Integer, nullable=False, default=30)
    require_pin = Column(Boolean, nullable=False, default=False)
    allow_remote_flag = Column(Boolean, nullable=False, default=True)

    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False, index=True)
    leave_type = Column(String(40), nullable=False)
    date_from = Column(Date, nullable=False)
    date_to = Column(Date, nullable=False)
    days_count = Column(Integer, nullable=False)
    reason = Column(Text, nullable=True)
    status = Column(String(40), nullable=False, default="pending", index=True)
    approved_by = Column(String(120), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class PayrollRecord(Base):
    __tablename__ = "payroll_records"
    __table_args__ = (
        UniqueConstraint("employee_id", "period_month", "period_year", name="uq_payroll_employee_period"),
    )

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("client_orgs.id", ondelete="CASCADE"), nullable=False, index=True)
    period_month = Column(Integer, nullable=False)
    period_year = Column(Integer, nullable=False)

    working_days_in_month = Column(Integer, nullable=False, default=0)
    days_worked = Column(Integer, nullable=False, default=0)
    days_absent = Column(Integer, nullable=False, default=0)
    days_on_leave = Column(Integer, nullable=False, default=0)
    total_hours_worked = Column(Float, nullable=False, default=0)
    total_overtime_hours = Column(Float, nullable=False, default=0)
    total_late_minutes = Column(Integer, nullable=False, default=0)

    base_salary = Column(Float, nullable=False, default=0)
    prorated_salary = Column(Float, nullable=False, default=0)
    overtime_pay = Column(Float, nullable=False, default=0)
    late_penalty = Column(Float, nullable=False, default=0)
    manual_penalty = Column(Float, nullable=False, default=0)
    bonus = Column(Float, nullable=False, default=0)
    gross_salary = Column(Float, nullable=False, default=0)

    inps_employee = Column(Float, nullable=False, default=0)
    jshdssh = Column(Float, nullable=False, default=0)
    total_deductions = Column(Float, nullable=False, default=0)
    net_salary = Column(Float, nullable=False, default=0)

    status = Column(String(40), nullable=False, default="draft", index=True)
    approved_by = Column(String(120), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    paid_at = Column(DateTime, nullable=True)
    payment_method = Column(String(40), nullable=True)

    is_manually_adjusted = Column(Boolean, nullable=False, default=False)
    adjustment_note = Column(Text, nullable=True)
    calculation_breakdown = Column(JSON, nullable=False, default=dict)

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class UzbekHoliday(Base):
    __tablename__ = "uzbek_holidays"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, unique=True, index=True)
    name_uz = Column(String(160), nullable=False)
    name_ru = Column(String(160), nullable=False)
    is_work_day = Column(Boolean, nullable=False, default=False)


Index("idx_attendance_employee_date", AttendanceRecord.employee_id, AttendanceRecord.work_date)
Index("idx_attendance_company_date", AttendanceRecord.company_id, AttendanceRecord.work_date)
Index("idx_qr_tokens_hash", QRToken.token_hash)
Index("idx_qr_tokens_expiry", QRToken.expires_at, QRToken.is_used)
Index("idx_payroll_company_period", PayrollRecord.company_id, PayrollRecord.period_year, PayrollRecord.period_month)
Index("idx_leave_employee_dates", LeaveRequest.employee_id, LeaveRequest.date_from, LeaveRequest.date_to)
