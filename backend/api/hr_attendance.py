from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from core.auth import get_request_user, require_authenticated_user, resolve_request_user
from database import models
from database.attendance_models import AttendanceRecord, AttendanceSource, AttendanceStatus, LeaveRequest, OfficeLocation, PayrollRecord, QRToken
from database.attendance_schemas import (
    AttendanceAnalyticsSummaryOut,
    AttendanceCorrectionBody,
    AttendanceLogRow,
    AttendanceRecordPage,
    AttendanceRecordOut,
    CompanyPayrollSummaryOut,
    EmployeeMonthSummaryOut,
    LeaveRequestCreate,
    LeaveRequestOut,
    LeaveReviewBody,
    ManualAttendanceBody,
    OfficeLocationCreate,
    OfficeLocationOut,
    OfficeLocationUpdate,
    PayrollAdjustmentBody,
    PayrollApproveBody,
    PayrollApprovalResult,
    PayrollCalculationRequest,
    PayrollRecordOut,
    QRCurrentOut,
    ScanBody,
    ScanResult,
    TodayPresenceOut,
    VerifySessionOut,
)
from database.connection import get_db
from integrations.attendance.attendance_service import attendance_service
from integrations.attendance.payroll_engine import payroll_engine
from integrations.attendance.qr_engine import (
    ExpiredTokenError,
    InvalidAttendanceAccessError,
    InvalidTokenError,
    qr_token_engine,
)
from integrations.onec.service import resolve_company_account

router = APIRouter(prefix="/hr", tags=["Attendance", "Payroll"])


def _current_user_optional(request: Request):
    auth_header = (request.headers.get("authorization") or "").strip()
    if not auth_header.lower().startswith("bearer "):
        return None
    try:
        return resolve_request_user(request)
    except Exception:
        return None


def _client_ip(request: Request) -> str | None:
    forwarded = (request.headers.get("x-forwarded-for") or "").strip()
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else None


def _employee_from_attendance_access(
    db: Session,
    *,
    qr_payload: dict[str, Any],
    attendance_access_token: str | None,
):
    raw_token = (attendance_access_token or "").strip()
    if not raw_token:
        return None
    try:
        access_payload = qr_token_engine.validate_attendance_access_token(
            raw_token,
            company_id=int(qr_payload["company_id"]),
            location_id=int(qr_payload["location_id"]),
            qr_token_hash=str(qr_payload["token_hash"]),
        )
    except ExpiredTokenError:
        raise HTTPException(status_code=410, detail="Telegram attendance link expired. Request a new link from the bot.")
    except InvalidAttendanceAccessError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    employee = (
        db.query(models.Employee)
        .filter(
            models.Employee.id == int(access_payload["employee_id"]),
            models.Employee.company_id == int(qr_payload["company_id"]),
            models.Employee.status != models.EmployeeStatus.terminated,
        )
        .first()
    )
    if not employee:
        raise HTTPException(status_code=404, detail="Linked employee not found.")
    return employee


@router.get("/attendance/qr/current", response_model=QRCurrentOut)
def get_current_qr(
    request: Request,
    location_id: int | None = Query(default=None),
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    location = attendance_service.get_location(db, account.client_org_id, location_id)
    generated = qr_token_engine.get_or_generate_token(
        db,
        company_id=account.client_org_id,
        location_id=location.id,
        rotation_seconds=int(location.qr_rotation_seconds or 30),
    )
    return QRCurrentOut(
        scan_url=generated.scan_url,
        expires_at=generated.expires_at,
        seconds_remaining=generated.seconds_remaining,
        location_id=location.id,
        location_name=location.name,
    )


@router.get("/attendance/verify-session", response_model=VerifySessionOut)
def verify_attendance_session(
    token: str,
    request: Request,
    attendance_access_token: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    try:
        payload = qr_token_engine.validate_token(db, token)
    except ExpiredTokenError:
        raise HTTPException(status_code=410, detail="QR kod eskirgan. Yangi kodni skaner qiling.")
    except InvalidTokenError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    user = _current_user_optional(request)
    location = attendance_service.get_location(db, int(payload["company_id"]), int(payload["location_id"]))
    employee = _employee_from_attendance_access(db, qr_payload=payload, attendance_access_token=attendance_access_token)
    if not employee and user:
        employee = attendance_service.find_employee_by_email(db, int(payload["company_id"]), user.email)
    if not employee:
        return VerifySessionOut(authenticated=False, location_name=location.name, requires_pin=True)
    today_record = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.employee_id == employee.id, AttendanceRecord.work_date == attendance_service.local_now().date())
        .first()
    )
    action = "clock_out" if today_record and today_record.clock_in and not today_record.clock_out else "clock_in"
    return VerifySessionOut(
        authenticated=True,
        employee_id=employee.id,
        employee_name=employee.full_name,
        employee_role=employee.role,
        action=action,
        location_name=location.name,
        requires_pin=False,
    )


@router.post("/attendance/scan", response_model=ScanResult)
def process_attendance_scan(body: ScanBody, request: Request, db: Session = Depends(get_db)):
    try:
        payload = qr_token_engine.validate_token(db, body.token)
    except ExpiredTokenError:
        raise HTTPException(status_code=410, detail="QR kod eskirgan. Yangi kodni skaner qiling.")
    except InvalidTokenError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    location = attendance_service.get_location(db, int(payload["company_id"]), int(payload["location_id"]))
    user = _current_user_optional(request)
    employee = _employee_from_attendance_access(db, qr_payload=payload, attendance_access_token=body.attendance_access_token)
    if not employee:
        employee = attendance_service.find_employee_by_email(db, int(payload["company_id"]), user.email if user else None)
    if not employee:
        if not body.employee_pin:
            raise HTTPException(status_code=403, detail="PIN noto'g'ri.")
        employee = attendance_service.find_employee_by_pin(db, int(payload["company_id"]), body.employee_pin)
    if not employee:
        raise HTTPException(status_code=404, detail="Xodim topilmadi.")
    result = attendance_service.process_scan(
        db,
        employee=employee,
        location=location,
        client_ip=_client_ip(request),
        device_fingerprint=body.device_fingerprint,
        latitude=body.latitude,
        longitude=body.longitude,
        notes=body.notes,
    )
    qr_token_engine.mark_token_used(db, payload["token_hash"])
    return result


@router.get("/attendance/today", response_model=TodayPresenceOut)
def get_today_presence(
    request: Request,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    return attendance_service.get_todays_presence(db, account.client_org_id)


@router.get("/attendance/records", response_model=AttendanceRecordPage)
def list_attendance_records(
    request: Request,
    employee_id: int | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    status: AttendanceStatus | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    query = db.query(AttendanceRecord, models.Employee).join(models.Employee, models.Employee.id == AttendanceRecord.employee_id).filter(AttendanceRecord.company_id == account.client_org_id)
    if employee_id is not None:
        query = query.filter(AttendanceRecord.employee_id == employee_id)
    if date_from is not None:
        query = query.filter(AttendanceRecord.work_date >= date_from)
    if date_to is not None:
        query = query.filter(AttendanceRecord.work_date <= date_to)
    if status is not None:
        query = query.filter(AttendanceRecord.status == status)
    total = query.count()
    rows = query.order_by(AttendanceRecord.work_date.desc(), AttendanceRecord.id.desc()).offset((page - 1) * per_page).limit(per_page).all()
    payload = [
        AttendanceLogRow(
            id=record.id,
            employee_id=employee.id,
            employee_name=employee.full_name,
            employee_role=employee.role,
            department=employee.department,
            work_date=record.work_date,
            clock_in=record.clock_in,
            clock_out=record.clock_out,
            hours_worked=record.hours_worked,
            overtime_hours=record.overtime_hours,
            late_minutes=int(record.late_minutes or 0),
            early_leave_minutes=int(record.early_leave_minutes or 0),
            status=record.status,
            source=record.source,
            is_corrected=bool(record.is_corrected),
            notes=record.notes,
        )
        for record, employee in rows
    ]
    pages = (total + per_page - 1) // per_page if total else 0
    return AttendanceRecordPage(records=payload, total=total, pages=pages)


@router.get("/attendance/records/{employee_id}/monthly", response_model=EmployeeMonthSummaryOut)
def get_employee_monthly_attendance(
    employee_id: int,
    request: Request,
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020, le=2100),
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    employee = db.query(models.Employee).filter(models.Employee.id == employee_id, models.Employee.company_id == account.client_org_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")
    return attendance_service.get_employee_monthly_summary(db, employee, month, year)


@router.post("/attendance/records/{record_id}/correct", response_model=AttendanceRecordOut)
def correct_attendance_record(
    record_id: int,
    body: AttendanceCorrectionBody,
    request: Request,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    auth_user = get_request_user(request)
    record = db.query(AttendanceRecord).filter(AttendanceRecord.id == record_id, AttendanceRecord.company_id == account.client_org_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found.")
    employee = db.query(models.Employee).filter(models.Employee.id == record.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")
    return attendance_service.hr_correction(db, record=record, employee=employee, clock_in=body.clock_in, clock_out=body.clock_out, note=body.note, corrected_by=auth_user.user_id)


@router.post("/attendance/records/manual", response_model=AttendanceRecordOut)
def create_manual_attendance(
    body: ManualAttendanceBody,
    request: Request,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    auth_user = get_request_user(request)
    employee = db.query(models.Employee).filter(models.Employee.id == body.employee_id, models.Employee.company_id == account.client_org_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")
    return attendance_service.create_manual_record(
        db,
        employee=employee,
        work_date=body.work_date,
        clock_in=body.clock_in,
        clock_out=body.clock_out,
        note=body.note,
        corrected_by=auth_user.user_id,
        source=body.source,
    )


@router.post("/payroll/calculate", response_model=CompanyPayrollSummaryOut)
def calculate_payroll(
    body: PayrollCalculationRequest,
    request: Request,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    return payroll_engine.calculate_company_payroll(account.client_org_id, body.month, body.year, db, employee_ids=body.employee_ids)


@router.get("/payroll", response_model=list[PayrollRecordOut])
def list_payroll(
    request: Request,
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020, le=2100),
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    return payroll_engine.list_payroll(db, account.client_org_id, month, year)


@router.patch("/payroll/{record_id}", response_model=PayrollRecordOut)
def adjust_payroll_record(
    record_id: int,
    body: PayrollAdjustmentBody,
    request: Request,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    record = db.query(PayrollRecord).filter(PayrollRecord.id == record_id, PayrollRecord.company_id == account.client_org_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Payroll record not found.")
    try:
        updated = payroll_engine.adjust_payroll_record(db, record, body.bonus, body.manual_penalty, body.adjustment_note)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    employee = db.query(models.Employee).filter(models.Employee.id == updated.employee_id).first()
    return payroll_engine._serialize_record(updated, employee)


@router.post("/payroll/approve", response_model=PayrollApprovalResult)
def approve_payroll(
    body: PayrollApproveBody,
    request: Request,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    rows = db.query(PayrollRecord).filter(PayrollRecord.id.in_(body.payroll_ids), PayrollRecord.company_id == account.client_org_id).all()
    if len(rows) != len(body.payroll_ids):
        raise HTTPException(status_code=404, detail="Some payroll records were not found.")
    auth_user = get_request_user(request)
    return payroll_engine.approve_payroll(body.payroll_ids, auth_user.user_id, db)


@router.get("/payroll/export")
def export_payroll(
    request: Request,
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020, le=2100),
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    workbook = payroll_engine.export_payroll_excel(account.client_org_id, month, year, db)
    file_name = f"payroll-{year}-{month:02d}.xlsx"
    return StreamingResponse(
        iter([workbook]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
    )


@router.get("/attendance/locations", response_model=list[OfficeLocationOut])
def list_locations(
    request: Request,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    rows = db.query(OfficeLocation).filter(OfficeLocation.company_id == account.client_org_id).order_by(OfficeLocation.id.asc()).all()
    if not rows:
        rows = [attendance_service.default_location(db, account.client_org_id)]
    return rows


@router.post("/attendance/locations", response_model=OfficeLocationOut)
def create_location(
    payload: OfficeLocationCreate,
    request: Request,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    row = OfficeLocation(company_id=account.client_org_id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/attendance/locations/{location_id}", response_model=OfficeLocationOut)
def update_location(
    location_id: int,
    payload: OfficeLocationUpdate,
    request: Request,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    row = db.query(OfficeLocation).filter(OfficeLocation.id == location_id, OfficeLocation.company_id == account.client_org_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Office location not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/attendance/locations/{location_id}")
def delete_location(
    location_id: int,
    request: Request,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    row = db.query(OfficeLocation).filter(OfficeLocation.id == location_id, OfficeLocation.company_id == account.client_org_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Office location not found.")
    active_count = (
        db.query(OfficeLocation)
        .filter(OfficeLocation.company_id == account.client_org_id, OfficeLocation.is_active.is_(True))
        .count()
    )
    if active_count <= 1 and row.is_active:
        raise HTTPException(status_code=400, detail="At least one active office location is required.")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/leave", response_model=list[LeaveRequestOut])
def list_leave_requests(
    request: Request,
    employee_id: int | None = Query(default=None),
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    query = db.query(LeaveRequest, models.Employee).join(models.Employee, models.Employee.id == LeaveRequest.employee_id).filter(LeaveRequest.company_id == account.client_org_id)
    if employee_id is not None:
        query = query.filter(LeaveRequest.employee_id == employee_id)
    rows = query.order_by(LeaveRequest.created_at.desc()).all()
    return [
        LeaveRequestOut.model_validate(
            {
                **request_row.__dict__,
                "employee_name": employee.full_name,
            }
        )
        for request_row, employee in rows
    ]


@router.post("/leave", response_model=LeaveRequestOut)
def create_leave_request(
    payload: LeaveRequestCreate,
    request: Request,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    employee = db.query(models.Employee).filter(models.Employee.id == payload.employee_id, models.Employee.company_id == account.client_org_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")
    if payload.date_to < payload.date_from:
        raise HTTPException(status_code=400, detail="date_to must be on or after date_from.")
    days_count = (payload.date_to - payload.date_from).days + 1
    row = LeaveRequest(company_id=account.client_org_id, days_count=days_count, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return LeaveRequestOut.model_validate({**row.__dict__, "employee_name": employee.full_name})


@router.patch("/leave/{leave_id}/approve", response_model=LeaveRequestOut)
def approve_leave_request(
    leave_id: int,
    body: LeaveReviewBody,
    request: Request,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    auth_user = get_request_user(request)
    row = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id, LeaveRequest.company_id == account.client_org_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Leave request not found.")
    row.status = "approved"
    row.approved_by = auth_user.user_id
    row.approved_at = attendance_service.utcnow()
    db.commit()
    db.refresh(row)
    employee = db.query(models.Employee).filter(models.Employee.id == row.employee_id).first()
    return LeaveRequestOut.model_validate({**row.__dict__, "employee_name": employee.full_name if employee else None})


@router.patch("/leave/{leave_id}/reject", response_model=LeaveRequestOut)
def reject_leave_request(
    leave_id: int,
    body: LeaveReviewBody,
    request: Request,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    row = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id, LeaveRequest.company_id == account.client_org_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Leave request not found.")
    row.status = "rejected"
    db.commit()
    db.refresh(row)
    employee = db.query(models.Employee).filter(models.Employee.id == row.employee_id).first()
    return LeaveRequestOut.model_validate({**row.__dict__, "employee_name": employee.full_name if employee else None})


@router.get("/attendance/analytics/summary", response_model=AttendanceAnalyticsSummaryOut)
def attendance_analytics_summary(
    request: Request,
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020, le=2100),
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_authenticated_user),
):
    account = resolve_company_account(request, db, company_id=company_id)
    return attendance_service.analytics_summary(db, account.client_org_id, month, year)
