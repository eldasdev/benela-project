from __future__ import annotations

import ipaddress
import math
import os
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import bcrypt
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import models
from database.attendance_models import AttendanceRecord, AttendanceSource, AttendanceStatus, LeaveRequest, OfficeLocation, QRToken, UzbekHoliday
from database.attendance_schemas import AttendanceAnalyticsSummaryOut, AttendanceContextSummary, AttendanceRecordOut, EmployeePresenceOut, EmployeeMonthSummaryOut, ScanResult, TodayPresenceOut

TASHKENT_TZ = ZoneInfo("Asia/Tashkent")
DEFAULT_LATE_GRACE_MINUTES = max(0, int(os.getenv("ATTENDANCE_LATE_GRACE_MINUTES", "15")))
DEFAULT_GEOFENCE_RADIUS_METERS = max(50, int(os.getenv("ATTENDANCE_GEOFENCE_DEFAULT_RADIUS", "300")))
DEFAULT_BREAK_MINUTES = max(0, int(os.getenv("ATTENDANCE_BREAK_MINUTES", "60")))
DEFAULT_SHIFT_START = time(9, 0)
DEFAULT_SHIFT_END = time(18, 0)


@dataclass(slots=True)
class _ShiftWindow:
    shift_start: time
    shift_end: time
    is_working_day: bool
    on_leave: bool


class AttendanceService:
    @staticmethod
    def utcnow() -> datetime:
        return datetime.now(UTC).replace(tzinfo=None)

    @staticmethod
    def local_now() -> datetime:
        return datetime.now(TASHKENT_TZ)

    @staticmethod
    def utc_to_local(value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC).astimezone(TASHKENT_TZ)
        return value.astimezone(TASHKENT_TZ)

    @staticmethod
    def local_to_utc_naive(value: datetime) -> datetime:
        if value.tzinfo is None:
            value = value.replace(tzinfo=TASHKENT_TZ)
        return value.astimezone(UTC).replace(tzinfo=None)

    @staticmethod
    def format_local_hhmm(value: datetime | None) -> str | None:
        local = AttendanceService.utc_to_local(value)
        return local.strftime("%H:%M") if local else None

    def default_location(self, db: Session, company_id: int) -> OfficeLocation:
        location = (
            db.query(OfficeLocation)
            .filter(OfficeLocation.company_id == company_id, OfficeLocation.is_active.is_(True))
            .order_by(OfficeLocation.id.asc())
            .first()
        )
        if location:
            return location
        location = OfficeLocation(
            company_id=company_id,
            name="Main Office",
            geofence_radius_meters=DEFAULT_GEOFENCE_RADIUS_METERS,
            qr_rotation_seconds=30,
            require_pin=False,
            allow_remote_flag=True,
            is_active=True,
        )
        db.add(location)
        db.commit()
        db.refresh(location)
        return location

    def get_location(self, db: Session, company_id: int, location_id: int | None = None) -> OfficeLocation:
        if location_id is None:
            return self.default_location(db, company_id)
        location = (
            db.query(OfficeLocation)
            .filter(OfficeLocation.id == location_id, OfficeLocation.company_id == company_id)
            .first()
        )
        if not location:
            raise HTTPException(status_code=404, detail="Office location not found.")
        return location

    def _hash_matches(self, pin_hash: str | None, pin: str | None) -> bool:
        if not pin_hash or not pin:
            return False
        try:
            return bcrypt.checkpw(pin.encode("utf-8"), pin_hash.encode("utf-8"))
        except Exception:
            return False

    def find_employee_by_pin(self, db: Session, company_id: int, pin: str) -> models.Employee | None:
        employees = (
            db.query(models.Employee)
            .filter(
                models.Employee.company_id == company_id,
                models.Employee.status != models.EmployeeStatus.terminated,
            )
            .all()
        )
        for employee in employees:
            if self._hash_matches(employee.employee_pin, pin):
                return employee
        return None

    def find_employee_by_email(self, db: Session, company_id: int, email: str | None) -> models.Employee | None:
        normalized = (email or "").strip().lower()
        if not normalized:
            return None
        return (
            db.query(models.Employee)
            .filter(
                func.lower(models.Employee.email) == normalized,
                models.Employee.company_id == company_id,
                models.Employee.status != models.EmployeeStatus.terminated,
            )
            .first()
        )

    def find_employee_by_email_and_pin(self, db: Session, email: str | None, pin: str | None) -> models.Employee | None:
        normalized = (email or "").strip().lower()
        if not normalized or not pin:
            return None
        employee = (
            db.query(models.Employee)
            .filter(
                func.lower(models.Employee.email) == normalized,
                models.Employee.status != models.EmployeeStatus.terminated,
            )
            .first()
        )
        if not employee or not self._hash_matches(employee.employee_pin, pin):
            return None
        return employee

    def find_employee_by_telegram_chat(self, db: Session, chat_id: str | None) -> models.Employee | None:
        normalized = (chat_id or "").strip()
        if not normalized:
            return None
        return (
            db.query(models.Employee)
            .filter(
                models.Employee.telegram_chat_id == normalized,
                models.Employee.status != models.EmployeeStatus.terminated,
            )
            .first()
        )

    def link_employee_telegram(
        self,
        db: Session,
        *,
        employee: models.Employee,
        chat_id: str,
        username: str | None,
        first_name: str | None,
    ) -> models.Employee:
        normalized_chat_id = (chat_id or "").strip()
        if not normalized_chat_id:
            raise HTTPException(status_code=400, detail="Telegram chat ID is required.")
        (
            db.query(models.Employee)
            .filter(
                models.Employee.telegram_chat_id == normalized_chat_id,
                models.Employee.id != employee.id,
            )
            .update(
                {
                    models.Employee.telegram_chat_id: None,
                    models.Employee.telegram_username: None,
                    models.Employee.telegram_first_name: None,
                    models.Employee.telegram_linked_at: None,
                },
                synchronize_session=False,
            )
        )
        employee.telegram_chat_id = normalized_chat_id
        employee.telegram_username = (username or "").strip() or None
        employee.telegram_first_name = (first_name or "").strip() or None
        employee.telegram_linked_at = self.utcnow()
        db.commit()
        db.refresh(employee)
        return employee

    def unlink_employee_telegram(self, db: Session, employee: models.Employee) -> models.Employee:
        employee.telegram_chat_id = None
        employee.telegram_username = None
        employee.telegram_first_name = None
        employee.telegram_linked_at = None
        db.commit()
        db.refresh(employee)
        return employee

    def _distance_meters(self, lat1: float, lng1: float, lat2: float, lng2: float) -> float:
        radius = 6_371_000.0
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lng2 - lng1)
        a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
        return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(max(1 - a, 0)))

    def _ip_allowed(self, client_ip: str | None, allowed_ranges: str | None) -> bool | None:
        ranges = [item.strip() for item in (allowed_ranges or "").split(",") if item.strip()]
        if not ranges:
            return None
        if not client_ip:
            return False
        try:
            address = ipaddress.ip_address(client_ip)
        except ValueError:
            return False
        for value in ranges:
            try:
                if address in ipaddress.ip_network(value, strict=False):
                    return True
            except ValueError:
                continue
        return False

    def _location_allowed(
        self,
        location: OfficeLocation,
        latitude: float | None,
        longitude: float | None,
    ) -> bool | None:
        if location.latitude is None or location.longitude is None:
            return None
        if latitude is None or longitude is None:
            return False
        distance = self._distance_meters(location.latitude, location.longitude, latitude, longitude)
        return distance <= max(50, int(location.geofence_radius_meters or DEFAULT_GEOFENCE_RADIUS_METERS))

    def _verification_state(
        self,
        location: OfficeLocation,
        client_ip: str | None,
        latitude: float | None,
        longitude: float | None,
    ) -> tuple[bool, bool, list[str]]:
        warnings: list[str] = []
        ip_allowed = self._ip_allowed(client_ip, location.allowed_ip_ranges)
        gps_allowed = self._location_allowed(location, latitude, longitude)
        checks = [value for value in (ip_allowed, gps_allowed) if value is not None]
        verified = True if not checks else any(checks)
        is_remote = not verified
        if is_remote:
            warnings.append("Scan was flagged as remote or outside office verification range.")
        return verified, is_remote, warnings

    def _approved_leave_for_date(self, db: Session, employee_id: int, company_id: int, work_date: date) -> LeaveRequest | None:
        return (
            db.query(LeaveRequest)
            .filter(
                LeaveRequest.employee_id == employee_id,
                LeaveRequest.company_id == company_id,
                LeaveRequest.status == "approved",
                LeaveRequest.date_from <= work_date,
                LeaveRequest.date_to >= work_date,
            )
            .order_by(LeaveRequest.id.desc())
            .first()
        )

    def is_working_day(self, db: Session, work_date: date, company_id: int, work_days: list[int] | None = None) -> bool:
        holiday = db.query(UzbekHoliday).filter(UzbekHoliday.date == work_date).first()
        if holiday:
            return bool(holiday.is_work_day)
        day_values = work_days or [1, 2, 3, 4, 5]
        return work_date.isoweekday() in {int(item) for item in day_values}

    def calculate_shift_for_date(self, db: Session, employee: models.Employee, work_date: date) -> _ShiftWindow:
        leave = self._approved_leave_for_date(db, employee.id, int(employee.company_id or 0), work_date)
        is_work_day = self.is_working_day(db, work_date, int(employee.company_id or 0), list(employee.work_days or [1, 2, 3, 4, 5]))
        return _ShiftWindow(
            shift_start=employee.shift_start or DEFAULT_SHIFT_START,
            shift_end=employee.shift_end or DEFAULT_SHIFT_END,
            is_working_day=is_work_day,
            on_leave=leave is not None,
        )

    def _shift_bounds_local(self, work_date: date, shift: _ShiftWindow) -> tuple[datetime, datetime]:
        start = datetime.combine(work_date, shift.shift_start, tzinfo=TASHKENT_TZ)
        end = datetime.combine(work_date, shift.shift_end, tzinfo=TASHKENT_TZ)
        if end <= start:
            end += timedelta(days=1)
        return start, end

    def _recompute_metrics(self, db: Session, employee: models.Employee, record: AttendanceRecord) -> None:
        shift = self.calculate_shift_for_date(db, employee, record.work_date)
        if shift.on_leave and record.clock_in is None and record.clock_out is None:
            record.status = AttendanceStatus.on_leave
            record.hours_worked = 0
            record.overtime_hours = 0
            record.late_minutes = 0
            record.early_leave_minutes = 0
            return
        if not record.clock_in:
            record.status = AttendanceStatus.absent
            record.hours_worked = 0
            record.overtime_hours = 0
            record.late_minutes = 0
            record.early_leave_minutes = 0
            return

        clock_in_local = self.utc_to_local(record.clock_in)
        clock_out_local = self.utc_to_local(record.clock_out) if record.clock_out else None
        shift_start_local, shift_end_local = self._shift_bounds_local(record.work_date, shift)
        grace = max(0, int(employee.late_grace_minutes or DEFAULT_LATE_GRACE_MINUTES))
        late_delta = int(max(0, ((clock_in_local - shift_start_local).total_seconds() // 60) - grace)) if clock_in_local else 0
        record.late_minutes = late_delta
        if not clock_out_local:
            record.status = AttendanceStatus.late if late_delta > 0 else AttendanceStatus.on_time
            record.hours_worked = None
            record.overtime_hours = None
            record.early_leave_minutes = 0
            return

        total_hours = max(0.0, (clock_out_local - clock_in_local).total_seconds() / 3600.0)
        scheduled_hours = max(0.0, (shift_end_local - shift_start_local).total_seconds() / 3600.0)
        if scheduled_hours >= 8:
            scheduled_hours = max(0.0, scheduled_hours - (DEFAULT_BREAK_MINUTES / 60.0))
        overtime = max(0.0, total_hours - scheduled_hours)
        early_leave = int(max(0, (shift_end_local - clock_out_local).total_seconds() // 60)) if shift.is_working_day else 0
        record.hours_worked = round(total_hours, 2)
        record.overtime_hours = round(overtime, 2)
        record.early_leave_minutes = early_leave
        if overtime > 0:
            record.status = AttendanceStatus.overtime
        elif early_leave > 0:
            record.status = AttendanceStatus.early_leave
        elif late_delta > 0:
            record.status = AttendanceStatus.late
        else:
            record.status = AttendanceStatus.on_time

    def process_scan(
        self,
        db: Session,
        *,
        employee: models.Employee,
        location: OfficeLocation,
        client_ip: str | None,
        device_fingerprint: str,
        latitude: float | None = None,
        longitude: float | None = None,
        notes: str | None = None,
    ) -> ScanResult:
        if employee.status == models.EmployeeStatus.terminated:
            raise HTTPException(status_code=403, detail="Employee is inactive.")
        now_local = self.local_now()
        now_utc = self.local_to_utc_naive(now_local)
        work_date = now_local.date()
        record = (
            db.query(AttendanceRecord)
            .filter(AttendanceRecord.employee_id == employee.id, AttendanceRecord.work_date == work_date)
            .first()
        )
        warnings: list[str] = []
        verified, is_remote, verification_warnings = self._verification_state(location, client_ip, latitude, longitude)
        warnings.extend(verification_warnings)

        if employee.device_fingerprint and employee.device_fingerprint != device_fingerprint:
            warnings.append("Device fingerprint differs from the employee's last verified device.")
        elif not employee.device_fingerprint:
            employee.device_fingerprint = device_fingerprint

        if record and record.clock_in and record.clock_out:
            raise HTTPException(status_code=409, detail="You have already completed attendance for today.")

        if not record:
            record = AttendanceRecord(
                employee_id=employee.id,
                company_id=int(employee.company_id or 0),
                location_id=location.id,
                work_date=work_date,
                clock_in=now_utc,
                source=AttendanceSource.qr_code,
                clock_in_ip=client_ip,
                clock_in_device_hash=device_fingerprint,
                clock_in_location_lat=latitude,
                clock_in_location_lng=longitude,
                location_verified=verified,
                is_remote_flag=is_remote,
                notes=notes,
            )
            db.add(record)
            self._recompute_metrics(db, employee, record)
            db.commit()
            db.refresh(record)
            return ScanResult(
                action="clock_in",
                employee_name=employee.full_name,
                time=now_local.strftime("%H:%M:%S"),
                status=record.status,
                late_minutes=int(record.late_minutes or 0),
                message=(
                    "Kelganingiz qayd etildi!"
                    if int(record.late_minutes or 0) == 0
                    else f"Kelganingiz qayd etildi! {int(record.late_minutes or 0)} daqiqa kechikdingiz."
                ),
                message_ru=(
                    "Ваш приход зафиксирован!"
                    if int(record.late_minutes or 0) == 0
                    else f"Ваш приход зафиксирован! Вы опоздали на {int(record.late_minutes or 0)} минут."
                ),
                warnings=warnings,
            )

        record.clock_out = now_utc
        record.clock_out_ip = client_ip
        record.clock_out_device_hash = device_fingerprint
        record.clock_out_location_lat = latitude
        record.clock_out_location_lng = longitude
        record.notes = notes or record.notes
        record.location_verified = bool(record.location_verified and verified)
        record.is_remote_flag = bool(record.is_remote_flag or is_remote)
        self._recompute_metrics(db, employee, record)
        db.commit()
        db.refresh(record)
        hours_label = record.hours_worked or 0
        return ScanResult(
            action="clock_out",
            employee_name=employee.full_name,
            time=now_local.strftime("%H:%M:%S"),
            status=record.status,
            late_minutes=int(record.late_minutes or 0),
            early_leave_minutes=int(record.early_leave_minutes or 0),
            hours_worked=round(float(record.hours_worked or 0), 2),
            overtime_hours=round(float(record.overtime_hours or 0), 2),
            message=(
                f"Ishdan chiqdingiz! Bugun {hours_label:.2f} soat ishladingiz."
            ),
            message_ru=(
                f"Ваш уход зафиксирован! Сегодня вы отработали {hours_label:.2f} часов."
            ),
            warnings=warnings,
        )

    def serialize_presence(self, employee: models.Employee, record: AttendanceRecord | None, fallback_status: AttendanceStatus) -> EmployeePresenceOut:
        return EmployeePresenceOut(
            employee_id=employee.id,
            name=employee.full_name,
            position=employee.role,
            department=employee.department,
            status=record.status if record else fallback_status,
            clock_in=self.format_local_hhmm(record.clock_in) if record else None,
            clock_out=self.format_local_hhmm(record.clock_out) if record else None,
            hours_worked=record.hours_worked if record else None,
            late_minutes=int(record.late_minutes or 0) if record else 0,
            overtime_hours=record.overtime_hours if record else None,
        )

    def get_todays_presence(self, db: Session, company_id: int) -> TodayPresenceOut:
        today = self.local_now().date()
        employees = (
            db.query(models.Employee)
            .filter(models.Employee.company_id == company_id, models.Employee.status != models.EmployeeStatus.terminated)
            .order_by(models.Employee.full_name)
            .all()
        )
        records = (
            db.query(AttendanceRecord)
            .filter(AttendanceRecord.company_id == company_id, AttendanceRecord.work_date == today)
            .all()
        )
        record_map = {row.employee_id: row for row in records}
        currently_in: list[EmployeePresenceOut] = []
        clocked_out: list[EmployeePresenceOut] = []
        late_arrivals: list[EmployeePresenceOut] = []
        not_arrived: list[EmployeePresenceOut] = []
        on_leave: list[EmployeePresenceOut] = []
        expected_total = 0
        now_local = self.local_now()
        for employee in employees:
            shift = self.calculate_shift_for_date(db, employee, today)
            if shift.on_leave:
                on_leave.append(self.serialize_presence(employee, record_map.get(employee.id), AttendanceStatus.on_leave))
                continue
            if not shift.is_working_day:
                continue
            expected_total += 1
            record = record_map.get(employee.id)
            if record and record.clock_in and not record.clock_out:
                currently_in.append(self.serialize_presence(employee, record, AttendanceStatus.on_time))
            elif record and record.clock_in and record.clock_out:
                item = self.serialize_presence(employee, record, record.status)
                clocked_out.append(item)
                if int(record.late_minutes or 0) > 0:
                    late_arrivals.append(item)
            else:
                shift_start_local, _ = self._shift_bounds_local(today, shift)
                if now_local >= shift_start_local:
                    not_arrived.append(self.serialize_presence(employee, record, AttendanceStatus.absent))
        present_count = len(currently_in) + len(clocked_out)
        attendance_rate = round((present_count / expected_total) * 100, 1) if expected_total else 100.0
        return TodayPresenceOut(
            currently_in=currently_in,
            clocked_out=clocked_out,
            late_arrivals=late_arrivals,
            not_arrived=not_arrived,
            on_leave=on_leave,
            expected_total=expected_total,
            present_count=present_count,
            attendance_rate_today=attendance_rate,
            done_count=len(clocked_out),
        )

    def get_employee_monthly_summary(self, db: Session, employee: models.Employee, month: int, year: int) -> EmployeeMonthSummaryOut:
        start = date(year, month, 1)
        end = (date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)) - timedelta(days=1)
        records = (
            db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.employee_id == employee.id,
                AttendanceRecord.work_date >= start,
                AttendanceRecord.work_date <= end,
            )
            .order_by(AttendanceRecord.work_date.asc())
            .all()
        )
        record_map = {row.work_date: row for row in records}
        calendar: dict[str, str] = {}
        days_worked = 0
        days_absent = 0
        total_hours = 0.0
        total_overtime = 0.0
        total_late_minutes = 0
        current = start
        while current <= end:
            shift = self.calculate_shift_for_date(db, employee, current)
            key = current.isoformat()
            if shift.on_leave:
                calendar[key] = AttendanceStatus.on_leave.value
            elif not shift.is_working_day:
                calendar[key] = "weekend"
            else:
                record = record_map.get(current)
                if record and record.clock_in:
                    calendar[key] = record.status.value
                    days_worked += 1
                    total_hours += float(record.hours_worked or 0)
                    total_overtime += float(record.overtime_hours or 0)
                    total_late_minutes += int(record.late_minutes or 0)
                elif record and record.status == AttendanceStatus.absent:
                    calendar[key] = AttendanceStatus.absent.value
                    days_absent += 1
                else:
                    calendar[key] = "pending"
            current += timedelta(days=1)
        return EmployeeMonthSummaryOut(
            employee_id=employee.id,
            employee_name=employee.full_name,
            month=month,
            year=year,
            records=[AttendanceRecordOut.model_validate(row) for row in records],
            days_worked=days_worked,
            days_absent=days_absent,
            total_hours=round(total_hours, 2),
            total_overtime=round(total_overtime, 2),
            total_late_minutes=total_late_minutes,
            attendance_calendar=calendar,
        )

    def hr_correction(
        self,
        db: Session,
        *,
        record: AttendanceRecord,
        employee: models.Employee,
        clock_in: datetime | None = None,
        clock_out: datetime | None = None,
        note: str | None = None,
        corrected_by: str | None = None,
    ) -> AttendanceRecord:
        if clock_in is not None:
            record.clock_in = self.local_to_utc_naive(clock_in)
        if clock_out is not None:
            record.clock_out = self.local_to_utc_naive(clock_out)
        record.is_corrected = True
        record.source = AttendanceSource.correction
        record.correction_note = note
        record.corrected_by = corrected_by
        self._recompute_metrics(db, employee, record)
        db.commit()
        db.refresh(record)
        return record

    def create_manual_record(
        self,
        db: Session,
        *,
        employee: models.Employee,
        work_date: date,
        clock_in: datetime | None,
        clock_out: datetime | None,
        note: str | None,
        corrected_by: str | None,
        source: AttendanceSource = AttendanceSource.manual,
    ) -> AttendanceRecord:
        record = (
            db.query(AttendanceRecord)
            .filter(AttendanceRecord.employee_id == employee.id, AttendanceRecord.work_date == work_date)
            .first()
        )
        if record:
            raise HTTPException(status_code=409, detail="Attendance record already exists for this employee and date.")
        record = AttendanceRecord(
            employee_id=employee.id,
            company_id=int(employee.company_id or 0),
            work_date=work_date,
            location_id=None,
            clock_in=self.local_to_utc_naive(clock_in) if clock_in else None,
            clock_out=self.local_to_utc_naive(clock_out) if clock_out else None,
            source=source,
            notes=note,
            is_corrected=source in {AttendanceSource.manual, AttendanceSource.correction},
            corrected_by=corrected_by,
            correction_note=note,
        )
        db.add(record)
        self._recompute_metrics(db, employee, record)
        db.commit()
        db.refresh(record)
        return record

    def bulk_mark_absent(self, db: Session, company_id: int, work_date: date, exclude_employee_ids: list[int] | None = None) -> int:
        exclude = set(exclude_employee_ids or [])
        employees = (
            db.query(models.Employee)
            .filter(models.Employee.company_id == company_id, models.Employee.status != models.EmployeeStatus.terminated)
            .all()
        )
        created = 0
        for employee in employees:
            if employee.id in exclude:
                continue
            shift = self.calculate_shift_for_date(db, employee, work_date)
            if not shift.is_working_day or shift.on_leave:
                continue
            exists = (
                db.query(AttendanceRecord.id)
                .filter(AttendanceRecord.employee_id == employee.id, AttendanceRecord.work_date == work_date)
                .first()
            )
            if exists:
                continue
            row = AttendanceRecord(
                employee_id=employee.id,
                company_id=company_id,
                work_date=work_date,
                source=AttendanceSource.manual,
                status=AttendanceStatus.absent,
                notes="Automatically marked absent by scheduler.",
            )
            db.add(row)
            created += 1
        if created:
            db.commit()
        return created

    def get_monthly_stats(self, db: Session, company_id: int, month: int, year: int) -> AttendanceContextSummary:
        start = date(year, month, 1)
        end = (date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)) - timedelta(days=1)
        employees = (
            db.query(models.Employee)
            .filter(models.Employee.company_id == company_id, models.Employee.status != models.EmployeeStatus.terminated)
            .all()
        )
        records = (
            db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.company_id == company_id,
                AttendanceRecord.work_date >= start,
                AttendanceRecord.work_date <= end,
            )
            .all()
        )
        worked_employee_days = len([row for row in records if row.clock_in])
        total_expected_days = 0
        perfect_attendance = 0
        late_counter: dict[str, int] = {}
        total_overtime = 0.0
        estimated_payroll = 0.0
        remaining = 0
        today = self.local_now().date()
        for employee in employees:
            employee_working_days = 0
            employee_present_days = 0
            current = start
            while current <= end:
                shift = self.calculate_shift_for_date(db, employee, current)
                if shift.is_working_day and not shift.on_leave:
                    total_expected_days += 1
                    employee_working_days += 1
                    if current >= today:
                        remaining += 1
                current += timedelta(days=1)
            employee_records = [row for row in records if row.employee_id == employee.id and row.clock_in]
            employee_present_days = len(employee_records)
            if employee_working_days and employee_present_days == employee_working_days:
                perfect_attendance += 1
            employee_lates = sum(1 for row in employee_records if int(row.late_minutes or 0) > 0)
            if employee_lates:
                late_counter[employee.full_name] = employee_lates
            total_overtime += sum(float(row.overtime_hours or 0) for row in employee_records)
            if employee.salary:
                estimated_payroll += float(employee.salary)
        avg_rate = round((worked_employee_days / total_expected_days) * 100, 1) if total_expected_days else 100.0
        most_late_name = max(late_counter, key=late_counter.get) if late_counter else "N/A"
        most_late_count = late_counter.get(most_late_name, 0) if late_counter else 0
        last_approved = (
            db.query(func.max(models.ClientActivity.created_at))
            .filter(models.ClientActivity.client_id == company_id, models.ClientActivity.action == "payroll_approved")
            .scalar()
        )
        return AttendanceContextSummary(
            avg_rate=avg_rate,
            total_overtime=round(total_overtime, 1),
            most_late_employee=most_late_name,
            most_late_count=most_late_count,
            perfect_attendance_count=perfect_attendance,
            working_days_total=total_expected_days,
            working_days_remaining=remaining,
            estimated_payroll_uzs=round(estimated_payroll, 2),
            last_approved_month=last_approved.strftime("%m.%Y") if last_approved else "Not approved yet",
        )

    def analytics_summary(self, db: Session, company_id: int, month: int, year: int) -> AttendanceAnalyticsSummaryOut:
        start = date(year, month, 1)
        end = (date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)) - timedelta(days=1)
        employees = (
            db.query(models.Employee)
            .filter(models.Employee.company_id == company_id, models.Employee.status != models.EmployeeStatus.terminated)
            .all()
        )
        records = (
            db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.company_id == company_id,
                AttendanceRecord.work_date >= start,
                AttendanceRecord.work_date <= end,
            )
            .all()
        )
        monthly_stats = self.get_monthly_stats(db, company_id, month, year)
        overtime_by_employee: dict[str, float] = {}
        late_by_employee: dict[str, int] = {}
        absent_trend: list[dict[str, object]] = []
        department_counts: dict[str, dict[str, float]] = {}
        for row in records:
            employee = next((item for item in employees if item.id == row.employee_id), None)
            if not employee:
                continue
            overtime_by_employee[employee.full_name] = overtime_by_employee.get(employee.full_name, 0.0) + float(row.overtime_hours or 0)
            late_by_employee[employee.full_name] = late_by_employee.get(employee.full_name, 0) + (1 if int(row.late_minutes or 0) > 0 else 0)
            dept = employee.department or "Unassigned"
            bucket = department_counts.setdefault(dept, {"days": 0.0, "worked": 0.0, "hours": 0.0})
            bucket["days"] += 1
            if row.clock_in:
                bucket["worked"] += 1
                bucket["hours"] += float(row.hours_worked or 0)
        current = max(start, end - timedelta(days=29))
        while current <= end:
            absent_count = (
                db.query(func.count(AttendanceRecord.id))
                .filter(
                    AttendanceRecord.company_id == company_id,
                    AttendanceRecord.work_date == current,
                    AttendanceRecord.status == AttendanceStatus.absent,
                )
                .scalar()
                or 0
            )
            absent_trend.append({"date": current.isoformat(), "count": int(absent_count)})
            current += timedelta(days=1)
        department_breakdown = []
        for dept, bucket in department_counts.items():
            days = bucket["days"] or 1.0
            department_breakdown.append(
                {
                    "dept": dept,
                    "rate": round((bucket["worked"] / days) * 100, 1),
                    "avg_hours": round(bucket["hours"] / max(bucket["worked"], 1), 2),
                }
            )
        top_overtime = [
            {"name": name, "hours": round(hours, 2)}
            for name, hours in sorted(overtime_by_employee.items(), key=lambda item: item[1], reverse=True)[:5]
        ]
        most_late = [
            {"name": name, "count": count}
            for name, count in sorted(late_by_employee.items(), key=lambda item: item[1], reverse=True)[:5]
        ]
        return AttendanceAnalyticsSummaryOut(
            avg_attendance_rate=monthly_stats.avg_rate,
            total_overtime_hours=monthly_stats.total_overtime,
            top_overtime_employees=top_overtime,
            most_late_employees=most_late,
            absent_trend=absent_trend,
            department_breakdown=department_breakdown,
        )

    def cleanup_expired_qr_tokens(self, db: Session) -> int:
        expired = (
            db.query(QRToken)
            .filter(QRToken.expires_at < self.utcnow() - timedelta(hours=24))
            .delete(synchronize_session=False)
        )
        if expired:
            db.commit()
        return int(expired or 0)


attendance_service = AttendanceService()
