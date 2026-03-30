from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Literal

from pydantic import BaseModel, Field

from database.attendance_models import AttendanceSource, AttendanceStatus


class OfficeLocationBase(BaseModel):
    name: str
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    geofence_radius_meters: int = Field(default=300, ge=50, le=10000)
    allowed_ip_ranges: str | None = None
    qr_rotation_seconds: int = Field(default=30, ge=15, le=300)
    require_pin: bool = False
    allow_remote_flag: bool = True
    is_active: bool = True


class OfficeLocationCreate(OfficeLocationBase):
    pass


class OfficeLocationUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    geofence_radius_meters: int | None = Field(default=None, ge=50, le=10000)
    allowed_ip_ranges: str | None = None
    qr_rotation_seconds: int | None = Field(default=None, ge=15, le=300)
    require_pin: bool | None = None
    allow_remote_flag: bool | None = None
    is_active: bool | None = None


class OfficeLocationOut(OfficeLocationBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class QRCurrentOut(BaseModel):
    scan_url: str
    expires_at: datetime
    seconds_remaining: int
    location_id: int
    location_name: str


class VerifySessionOut(BaseModel):
    authenticated: bool
    employee_id: int | None = None
    employee_name: str | None = None
    employee_role: str | None = None
    action: Literal["clock_in", "clock_out"] | None = None
    location_name: str | None = None
    requires_pin: bool = True


class ScanBody(BaseModel):
    token: str
    employee_pin: str | None = None
    attendance_access_token: str | None = None
    device_fingerprint: str
    latitude: float | None = None
    longitude: float | None = None
    notes: str | None = Field(default=None, max_length=400)


class ScanResult(BaseModel):
    action: Literal["clock_in", "clock_out"]
    employee_name: str
    time: str
    status: AttendanceStatus
    late_minutes: int = 0
    early_leave_minutes: int = 0
    hours_worked: float | None = None
    overtime_hours: float | None = None
    message: str
    message_ru: str
    warnings: list[str] = Field(default_factory=list)


class AttendanceRecordOut(BaseModel):
    id: int
    employee_id: int
    company_id: int
    location_id: int | None = None
    work_date: date
    clock_in: datetime | None = None
    clock_out: datetime | None = None
    hours_worked: float | None = None
    overtime_hours: float | None = None
    late_minutes: int
    early_leave_minutes: int
    status: AttendanceStatus
    source: AttendanceSource
    location_verified: bool
    is_remote_flag: bool
    is_corrected: bool
    correction_note: str | None = None
    corrected_by: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AttendanceLogRow(BaseModel):
    id: int
    employee_id: int
    employee_name: str
    employee_role: str | None = None
    department: str | None = None
    work_date: date
    clock_in: datetime | None = None
    clock_out: datetime | None = None
    hours_worked: float | None = None
    overtime_hours: float | None = None
    late_minutes: int
    early_leave_minutes: int
    status: AttendanceStatus
    source: AttendanceSource
    is_corrected: bool
    notes: str | None = None


class AttendanceRecordPage(BaseModel):
    records: list[AttendanceLogRow]
    total: int
    pages: int


class AttendanceCorrectionBody(BaseModel):
    clock_in: datetime | None = None
    clock_out: datetime | None = None
    note: str | None = Field(default=None, max_length=400)


class ManualAttendanceBody(BaseModel):
    employee_id: int
    work_date: date
    clock_in: datetime | None = None
    clock_out: datetime | None = None
    source: AttendanceSource = AttendanceSource.manual
    note: str | None = Field(default=None, max_length=400)


class EmployeePresenceOut(BaseModel):
    employee_id: int
    name: str
    position: str
    department: str
    status: AttendanceStatus
    clock_in: str | None = None
    clock_out: str | None = None
    hours_worked: float | None = None
    late_minutes: int = 0
    overtime_hours: float | None = None


class TodayPresenceOut(BaseModel):
    currently_in: list[EmployeePresenceOut] = Field(default_factory=list)
    clocked_out: list[EmployeePresenceOut] = Field(default_factory=list)
    late_arrivals: list[EmployeePresenceOut] = Field(default_factory=list)
    not_arrived: list[EmployeePresenceOut] = Field(default_factory=list)
    on_leave: list[EmployeePresenceOut] = Field(default_factory=list)
    expected_total: int
    present_count: int
    attendance_rate_today: float
    done_count: int


class EmployeeMonthSummaryOut(BaseModel):
    employee_id: int
    employee_name: str
    month: int
    year: int
    records: list[AttendanceRecordOut]
    days_worked: int
    days_absent: int
    total_hours: float
    total_overtime: float
    total_late_minutes: int
    attendance_calendar: dict[str, str]


class LeaveRequestCreate(BaseModel):
    employee_id: int
    leave_type: Literal["annual", "sick", "unpaid", "business_trip"]
    date_from: date
    date_to: date
    reason: str | None = Field(default=None, max_length=400)


class LeaveReviewBody(BaseModel):
    note: str | None = Field(default=None, max_length=400)


class LeaveRequestOut(BaseModel):
    id: int
    employee_id: int
    company_id: int
    employee_name: str | None = None
    leave_type: str
    date_from: date
    date_to: date
    days_count: int
    reason: str | None = None
    status: str
    approved_by: str | None = None
    approved_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PayrollRecordOut(BaseModel):
    id: int
    employee_id: int
    employee_name: str
    department: str | None = None
    position: str | None = None
    company_id: int
    period_month: int
    period_year: int
    working_days_in_month: int
    days_worked: int
    days_absent: int
    days_on_leave: int
    total_hours_worked: float
    total_overtime_hours: float
    total_late_minutes: int
    base_salary: float
    prorated_salary: float
    overtime_pay: float
    late_penalty: float
    manual_penalty: float
    bonus: float
    gross_salary: float
    inps_employee: float
    jshdssh: float
    total_deductions: float
    net_salary: float
    status: str
    approved_by: str | None = None
    approved_at: datetime | None = None
    paid_at: datetime | None = None
    payment_method: str | None = None
    is_manually_adjusted: bool
    adjustment_note: str | None = None
    calculation_breakdown: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PayrollCalculationRequest(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2020, le=2100)
    employee_ids: list[int] = Field(default_factory=list)


class PayrollAdjustmentBody(BaseModel):
    bonus: float | None = None
    manual_penalty: float | None = None
    adjustment_note: str | None = Field(default=None, max_length=400)


class PayrollApproveBody(BaseModel):
    payroll_ids: list[int] = Field(min_length=1)


class PayrollApprovalResult(BaseModel):
    approved_count: int
    payroll_ids: list[int]
    message: str


class CompanyPayrollSummaryOut(BaseModel):
    records: list[PayrollRecordOut]
    total_gross: float
    total_net: float
    total_inps: float
    total_jshdssh: float
    total_deductions: float
    employee_count: int
    calculation_warnings: list[str] = Field(default_factory=list)


class AttendanceAnalyticsSummaryOut(BaseModel):
    avg_attendance_rate: float
    total_overtime_hours: float
    top_overtime_employees: list[dict[str, Any]] = Field(default_factory=list)
    most_late_employees: list[dict[str, Any]] = Field(default_factory=list)
    absent_trend: list[dict[str, Any]] = Field(default_factory=list)
    department_breakdown: list[dict[str, Any]] = Field(default_factory=list)


class AttendanceContextSummary(BaseModel):
    avg_rate: float
    total_overtime: float
    most_late_employee: str
    most_late_count: int
    perfect_attendance_count: int
    working_days_total: int
    working_days_remaining: int
    estimated_payroll_uzs: float
    last_approved_month: str
