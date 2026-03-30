# BENELA AI — QR CODE ATTENDANCE & PAYROLL ENGINE
> Use with: GPT-5.4 (Thinking mode ON) / OpenAI Codex
> Project: Benela AI ERP Platform — github.com/eldasdev/benela-project
> Feature: Phase 1 HR Attendance — Rotating QR Clock-In/Out System

---

## YOUR ROLE

You are a senior full-stack engineer on the **Benela AI** platform — a production Next.js 16 + FastAPI ERP deployed at `benela.dev`. Your task is to build a complete, production-grade **QR-based employee attendance and payroll calculation system** from scratch.

Think deeply before writing any code. This is financial and HR data — errors mean wrong salaries. Every edge case must be handled. Every calculation must be correct per Uzbek labor law.

---

## PROJECT CONTEXT

### Stack
```
Frontend:  Next.js 16 (App Router, TypeScript) — benela.dev — DigitalOcean App Platform
Backend:   FastAPI (Python 3.11) — benela-backend-vtjir.ondigitalocean.app
Database:  PostgreSQL on DigitalOcean
Auth:      Supabase (@supabase/ssr) — getSupabase() lazy pattern
AI:        Anthropic Claude (claude-haiku-4-5-20251001) via base_agent.py
Repo:      github.com/eldasdev/benela-project (frontend/ and backend/ dirs)
```

### Design System — STRICTLY FOLLOW (ALL inline styles, NO Tailwind, NO CSS modules)
```javascript
// Every component uses inline styles only — this is non-negotiable
const styles = {
  page:       { background: '#080808', minHeight: '100vh', color: '#f0f0f5' },
  card:       { background: '#0d0d0d', border: '1px solid #1c1c1c', borderRadius: '12px' },
  accent:     '#7c6aff',   // primary purple
  accentDark: '#4f3de8',   // deep purple
  green:      '#34d399',   // success / clock-in
  red:        '#f87171',   // danger / clock-out / late
  yellow:     '#fbbf24',   // warning
  blue:       '#60a5fa',   // info
  textPrimary:'#f0f0f5',
  textMid:    '#888888',
  border:     '#1c1c1c',
}
```

### Existing HR Models (backend/database/models.py) — already in codebase
```python
class Employee(Base):
    __tablename__ = "employees"
    id: int (PK)
    name: str
    position: str
    department: str
    salary: float          # monthly base salary in UZS
    hire_date: date
    is_active: bool
    # ADD these new fields via Alembic migration:
    # employee_pin: str     (4-6 digit PIN, hashed with bcrypt)
    # shift_start: time     (e.g., time(9, 0))
    # shift_end: time       (e.g., time(18, 0))
    # late_grace_minutes: int  (default 15)
    # hourly_rate: float    (nullable — for hourly workers)
    # contract_type: str    ("monthly", "hourly", "daily")
    # work_days: str        JSON array e.g. "[1,2,3,4,5]" Mon-Fri
    # phone: str            (for notifications)
    # device_fingerprint: str (nullable — set on first QR scan)
```

### Existing AI Context Pattern (CRITICAL — plug into this)
```python
# backend/agents/data_fetcher.py
# ADD this function alongside existing get_finance_context(), get_hr_context():

async def get_attendance_context(company_id: int = None) -> str:
    """Returns formatted string injected into Claude's system prompt."""
    # Example output Claude will receive:
    # "ATTENDANCE TODAY (2025-03-15):
    #  Currently in office: 23/47 employees
    #  Late arrivals: 4 (Jasur +12min, Dilnoza +8min, ...)
    #  Absent: 3 (on approved leave: 2, unexcused: 1)
    #  THIS MONTH: Avg attendance 94.2%, Total overtime: 340h
    #  PAYROLL STATUS: 12 days remaining, est. total: 187,400,000 UZS"
```

---

## COMPLETE SPECIFICATION

---

### PART 1 — DATABASE MODELS

#### `backend/database/attendance_models.py`

```python
from sqlalchemy import Column, Integer, String, DateTime, Date, Time, Boolean, Float, Text, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from database.base import Base
import enum

class AttendanceSource(str, enum.Enum):
    QR_CODE = "qr_code"
    MANUAL = "manual"          # HR manually adds record
    HARDWARE = "hardware"      # Future: biometric/face cam
    CORRECTION = "correction"  # HR-corrected record

class AttendanceStatus(str, enum.Enum):
    ON_TIME = "on_time"
    LATE = "late"              # arrived after shift_start + grace
    EARLY_LEAVE = "early_leave"
    OVERTIME = "overtime"
    ABSENT = "absent"
    ON_LEAVE = "on_leave"

class AttendanceRecord(Base):
    """
    Core attendance event. One row per clock-in or clock-out.
    Clock-in/out are paired by (employee_id, work_date).
    """
    __tablename__ = "attendance_records"

    id: int                     # PK
    employee_id: int            # FK → employees.id
    company_id: int             # for multi-tenant isolation
    work_date: Date             # the calendar date (not datetime)
    clock_in: DateTime          # nullable — set on first scan of the day
    clock_out: DateTime         # nullable — set on second scan
    
    # Calculated fields (computed when clock_out is set)
    hours_worked: Float         # nullable — e.g. 8.5
    overtime_hours: Float       # nullable — hours beyond shift_end
    late_minutes: int           # 0 if on time, >0 if late
    early_leave_minutes: int    # 0 if full day, >0 if left early
    
    status: AttendanceStatus    # computed on clock_out
    source: AttendanceSource    # how this record was created
    
    # Anti-abuse metadata
    clock_in_ip: str            # nullable
    clock_out_ip: str           # nullable
    clock_in_device_hash: str   # nullable — browser fingerprint hash
    clock_out_device_hash: str  # nullable
    clock_in_location_lat: Float  # nullable — if employee allowed GPS
    clock_in_location_lng: Float  # nullable
    location_verified: bool     # True if within office geofence
    is_remote_flag: bool        # True if IP didn't match office network
    
    # HR override
    is_corrected: bool          # True if HR manually edited this record
    correction_note: str        # nullable — reason for correction
    corrected_by: str           # Supabase user ID of HR who corrected
    
    notes: str                  # nullable — employee can add note on scan
    created_at: DateTime
    updated_at: DateTime


class QRToken(Base):
    """
    Rotating QR tokens. A new one is generated every 30 seconds per location.
    Old tokens are expired — never reusable.
    """
    __tablename__ = "qr_tokens"

    id: int                     # PK
    company_id: int             # FK → client_orgs.id
    location_id: int            # FK → office_locations.id
    token: str                  # UNIQUE — HMAC-SHA256 signed JWT
    token_hash: str             # SHA256(token) for fast lookup
    expires_at: DateTime        # created_at + 60 seconds
    is_used: bool               # True after first valid scan
    created_at: DateTime
    
    # Index: (token_hash, expires_at) for fast validation


class OfficeLocation(Base):
    """
    A company can have multiple office locations (branches).
    Each location has its own QR display and optionally an IP/GPS geofence.
    """
    __tablename__ = "office_locations"

    id: int                     # PK
    company_id: int             # FK → client_orgs.id
    name: str                   # "Main Office", "Warehouse", "Branch 2"
    address: str                # nullable
    
    # Geofence (optional)
    latitude: Float             # nullable
    longitude: Float            # nullable
    geofence_radius_meters: int # default 300
    
    # IP whitelist (optional — comma-separated CIDRs)
    allowed_ip_ranges: str      # nullable e.g. "192.168.1.0/24,10.0.0.0/8"
    
    # QR display settings
    qr_rotation_seconds: int    # default 30
    require_pin: bool           # default False (PIN only needed if no Supabase session)
    allow_remote_flag: bool     # default True (flag but allow remote scans)
    
    is_active: bool
    created_at: DateTime


class LeaveRequest(Base):
    """
    Employee leave requests — affects payroll calculation.
    """
    __tablename__ = "leave_requests"

    id: int                     # PK
    employee_id: int            # FK → employees.id
    company_id: int
    leave_type: str             # "annual", "sick", "unpaid", "business_trip"
    date_from: Date
    date_to: Date
    days_count: int             # calculated
    reason: str                 # nullable
    status: str                 # "pending", "approved", "rejected"
    approved_by: str            # Supabase user ID, nullable
    approved_at: DateTime       # nullable
    created_at: DateTime


class PayrollRecord(Base):
    """
    Monthly payroll calculation result per employee.
    Computed from AttendanceRecords + LeaveRequests + Employee.salary.
    """
    __tablename__ = "payroll_records"

    id: int                     # PK
    employee_id: int            # FK → employees.id
    company_id: int
    period_month: int           # 1-12
    period_year: int
    
    # Attendance summary for the period
    working_days_in_month: int  # total working days (excl. weekends/holidays)
    days_worked: int            # actual days with clock-in
    days_absent: int            # unexcused absences
    days_on_leave: int          # approved leave
    total_hours_worked: Float
    total_overtime_hours: Float
    total_late_minutes: int
    
    # Salary calculation (all amounts in UZS)
    base_salary: Float          # from employee.salary at time of calculation
    prorated_salary: Float      # base × (days_worked / working_days)
    overtime_pay: Float         # overtime_hours × overtime_rate
    late_penalty: Float         # deduction for late arrivals (if configured)
    bonus: Float                # manual bonus added by HR
    gross_salary: Float         # prorated + overtime + bonus - late_penalty
    
    # Uzbek tax deductions
    inps_employee: Float        # 4% employee INPS contribution (as of 2024 UZ law)
    jshdssh: Float              # 12% personal income tax
    total_deductions: Float     # sum of all deductions
    
    net_salary: Float           # gross - total_deductions
    
    # Status
    status: str                 # "draft", "approved", "paid"
    approved_by: str            # nullable
    approved_at: DateTime       # nullable
    paid_at: DateTime           # nullable
    payment_method: str         # "cash", "bank_transfer", "card"
    
    # Override
    is_manually_adjusted: bool
    adjustment_note: str        # nullable
    
    created_at: DateTime
    updated_at: DateTime


class UzbekHoliday(Base):
    """
    Official Uzbekistan public holidays — affects working day calculation.
    Pre-populate with known holidays, update annually.
    """
    __tablename__ = "uzbek_holidays"

    id: int
    date: Date    # UNIQUE
    name_uz: str  # "Yangi yil" 
    name_ru: str  # "Новый год"
    is_work_day: bool  # False for holidays, True for transferred workdays
```

---

### PART 2 — QR TOKEN ENGINE

#### `backend/integrations/attendance/qr_engine.py`

```python
import hmac
import hashlib
import secrets
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional

QR_SECRET_KEY = os.environ["ATTENDANCE_QR_SECRET"]  # 64-char random string
QR_EXPIRY_SECONDS = 60  # token valid for 60 seconds
QR_ALGORITHM = "HS256"


class QRTokenEngine:
    """
    Generates and validates rotating QR tokens for attendance.
    
    Token structure (JWT payload):
    {
        "company_id": 42,
        "location_id": 7,
        "token_id": "abc123...",   # unique nonce — prevents replay
        "iat": 1710000000,         # issued at
        "exp": 1710000060,         # expires in 60 seconds
        "v": 1                     # token version for future changes
    }
    
    The JWT is signed with HMAC-SHA256 using QR_SECRET_KEY.
    Even if an employee screenshots the QR, it's invalid after 60 seconds.
    """
    
    def generate_token(self, company_id: int, location_id: int) -> dict:
        """
        Generate a new QR token.
        Returns: { token: str, expires_at: datetime, qr_data: str }
        
        qr_data is the URL the QR code encodes:
        https://benela.dev/hr/scan?t={token}
        
        The token itself is the full JWT — compact, URL-safe.
        """
        nonce = secrets.token_urlsafe(16)
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=QR_EXPIRY_SECONDS)
        
        payload = {
            "company_id": company_id,
            "location_id": location_id,
            "nonce": nonce,
            "iat": int(now.timestamp()),
            "exp": int(expires_at.timestamp()),
            "v": 1
        }
        
        token = jwt.encode(payload, QR_SECRET_KEY, algorithm=QR_ALGORITHM)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        
        # Persist to DB for audit trail and replay prevention
        # await db.execute(insert(QRToken).values(...))
        
        scan_url = f"https://benela.dev/hr/scan?t={token}"
        
        return {
            "token": token,
            "token_hash": token_hash,
            "expires_at": expires_at,
            "scan_url": scan_url,
            "seconds_remaining": QR_EXPIRY_SECONDS
        }
    
    def validate_token(self, token: str, company_id: int) -> dict:
        """
        Validate an incoming QR token.
        
        Checks:
        1. JWT signature valid (not tampered)
        2. Token not expired (exp claim)
        3. company_id matches (no cross-company scans)
        4. Nonce not previously used (replay attack prevention)
        
        Returns decoded payload if valid.
        Raises: ExpiredTokenError, InvalidTokenError, ReplayAttackError
        """
        try:
            payload = jwt.decode(
                token, 
                QR_SECRET_KEY, 
                algorithms=[QR_ALGORITHM],
                options={"verify_exp": True}
            )
        except jwt.ExpiredSignatureError:
            raise ExpiredTokenError("QR code has expired. Please scan the current code.")
        except jwt.InvalidTokenError:
            raise InvalidTokenError("Invalid QR code.")
        
        if payload["company_id"] != company_id:
            raise InvalidTokenError("QR code does not belong to your company.")
        
        # Check nonce hasn't been used (query DB)
        # If token_hash exists in qr_tokens AND is_used=True → replay attack
        
        return payload
    
    def mark_token_used(self, token_hash: str):
        """Mark token as used in DB to prevent replay."""


class ExpiredTokenError(Exception): pass
class InvalidTokenError(Exception): pass  
class ReplayAttackError(Exception): pass
```

---

### PART 3 — ATTENDANCE SERVICE

#### `backend/integrations/attendance/attendance_service.py`

```python
class AttendanceService:
    """
    Core business logic for attendance operations.
    All database writes go through here — never directly from routes.
    """
    
    async def process_scan(
        self,
        employee_id: int,
        company_id: int,
        location_id: int,
        client_ip: str,
        device_fingerprint: str,    # SHA256 of browser fingerprint
        latitude: float = None,
        longitude: float = None,
        notes: str = None
    ) -> ScanResult:
        """
        THE CORE FUNCTION. Called when employee scans QR.
        
        Logic flow:
        1. Load employee (verify active, verify company match)
        2. Load today's attendance record for this employee
        3. If no clock_in today → create record, set clock_in = now → CLOCK IN
        4. If clock_in exists but no clock_out → set clock_out = now → CLOCK OUT
        5. If both exist → return error "Already completed for today"
        
        On CLOCK IN:
        - Calculate late_minutes = max(0, (now - shift_start_today).minutes - grace)
        - Set status = ON_TIME or LATE
        - Check IP against office allowed_ip_ranges
        - Check GPS against geofence (if coordinates provided)
        - Set is_remote_flag if IP/GPS check fails
        - Store device fingerprint — warn if different from stored fingerprint
        
        On CLOCK OUT:
        - Calculate hours_worked = (clock_out - clock_in).total_seconds() / 3600
        - Calculate overtime_hours = max(0, hours_worked - shift_duration - break_time)
        - Calculate early_leave_minutes = max(0, (shift_end - clock_out).minutes)
        - Update status: OVERTIME if overtime > 0, EARLY_LEAVE if early_leave > 0
        - Trigger payroll_cache_invalidation(employee_id, month, year)
        
        Returns ScanResult with:
        - action: "clock_in" | "clock_out"
        - employee_name: str
        - time: datetime
        - hours_worked: float (if clock_out)
        - status: AttendanceStatus
        - message: str (human readable, in Uzbek if possible)
        - warnings: List[str] (remote scan, different device, etc.)
        """
    
    async def get_todays_presence(self, company_id: int) -> TodayPresence:
        """
        Real-time office presence for HR dashboard.
        
        Returns:
        - currently_in: List[EmployeeSummary]  (clocked in, not clocked out)
        - clocked_out: List[EmployeeSummary]   (completed day)
        - late_arrivals: List[EmployeeSummary] (with late_minutes)
        - not_arrived: List[EmployeeSummary]   (shift started, no clock-in)
        - on_leave: List[EmployeeSummary]       (approved leave today)
        - expected_total: int
        - present_count: int
        - attendance_rate_today: float          (percentage)
        """
    
    async def get_employee_monthly_summary(
        self, 
        employee_id: int, 
        month: int, 
        year: int
    ) -> EmployeeMonthSummary:
        """
        Aggregate all attendance records for one employee for a month.
        Used as input to payroll calculation.
        
        Returns:
        - records: List[AttendanceRecord]
        - days_worked: int
        - days_absent: int
        - total_hours: float
        - total_overtime: float
        - total_late_minutes: int
        - attendance_calendar: Dict[date, AttendanceStatus]  (for calendar UI)
        """
    
    async def hr_correction(
        self,
        record_id: int,
        clock_in: datetime = None,
        clock_out: datetime = None,
        note: str = None,
        corrected_by: str = None
    ) -> AttendanceRecord:
        """
        HR manually corrects an attendance record.
        Recalculates all derived fields.
        Marks record as corrected with audit trail.
        Invalidates payroll cache.
        """
    
    async def bulk_mark_absent(
        self,
        company_id: int,
        work_date: date,
        exclude_employee_ids: List[int] = None
    ):
        """
        Called by daily scheduler at end of business day.
        For any employee with no clock-in and no approved leave,
        create an ABSENT record.
        Run at: shift_end + 2 hours for each company.
        """
    
    def calculate_shift_for_date(
        self, 
        employee: Employee, 
        work_date: date
    ) -> Optional[tuple[time, time]]:
        """
        Returns (shift_start, shift_end) for an employee on a given date.
        Returns None if it's a day off (weekend or holiday).
        
        Respects: employee.work_days, UzbekHoliday table, leave requests.
        """
    
    def is_working_day(self, date: date, company_id: int) -> bool:
        """
        Returns True if this date is a working day.
        Checks: day of week, uzbek_holidays table.
        """
```

---

### PART 4 — PAYROLL CALCULATION ENGINE

#### `backend/integrations/attendance/payroll_engine.py`

```python
# Uzbek Labor Law Constants (as of 2024)
UZ_LABOR = {
    "standard_weekly_hours": 40,
    "standard_daily_hours": 8,
    "overtime_rate_first_2h": 1.5,    # 150% for first 2 overtime hours per day
    "overtime_rate_after_2h": 2.0,    # 200% for overtime beyond 2 hours per day
    "weekend_work_rate": 2.0,          # 200% for working on weekends/holidays
    "inps_employee_rate": 0.04,        # 4% employee social insurance (2024 rate)
    "jshdssh_rate": 0.12,              # 12% personal income tax
    "min_wage_uzs": 980_000,           # Minimum wage 2024 (update annually)
    "night_shift_start": 22,           # 22:00 — night shift premium starts
    "night_shift_end": 6,              # 06:00 — night shift premium ends
    "night_shift_premium": 0.20,       # +20% for night hours
}


class PayrollEngine:
    """
    Calculates monthly payroll for employees based on attendance records.
    
    IMPORTANT: All calculations must be deterministic and auditable.
    Every step must be traceable — HR must be able to see exactly why
    a salary is what it is.
    """
    
    async def calculate_monthly_payroll(
        self,
        employee_id: int,
        month: int,
        year: int,
        db: AsyncSession,
        manual_bonus: float = 0,
        manual_penalty: float = 0,
        adjustment_note: str = None
    ) -> PayrollRecord:
        """
        Full payroll calculation for one employee for one month.
        
        Step-by-step algorithm:
        
        1. LOAD DATA
           - employee = get employee with salary, contract_type, shift settings
           - attendance = all AttendanceRecords for this employee this month
           - leaves = all approved LeaveRequests overlapping this month
           - working_days = count of working days in month (excl. weekends + holidays)
        
        2. COUNT WORKED DAYS
           - days_worked = count(attendance where clock_in IS NOT NULL)
           - days_on_leave = count leave days this month (annual/sick/business)
           - days_absent = working_days - days_worked - days_on_leave
           (days_absent should never be negative — cap at 0)
        
        3. BASE SALARY CALCULATION
           if contract_type == "monthly":
               prorated = base_salary × (days_worked + days_on_leave) / working_days
               # Approved leave counts as worked for salary purposes (per UZ law)
               # Unpaid leave does NOT count
           
           elif contract_type == "hourly":
               prorated = hourly_rate × total_hours_worked
           
           elif contract_type == "daily":
               daily_rate = base_salary / working_days
               prorated = daily_rate × days_worked
        
        4. OVERTIME CALCULATION
           Group overtime by day (per UZ law, overtime is calculated per day):
           
           For each work day:
               daily_overtime = attendance_record.overtime_hours
               if daily_overtime <= 2:
                   overtime_pay += daily_overtime × hourly_equiv × 1.5
               else:
                   overtime_pay += 2 × hourly_equiv × 1.5
                   overtime_pay += (daily_overtime - 2) × hourly_equiv × 2.0
           
           hourly_equiv = base_salary / working_days / 8  (standard 8h day)
        
        5. LATE PENALTY (if company has penalty policy configured)
           if company.late_penalty_enabled:
               total_late_hours = total_late_minutes / 60
               late_penalty = total_late_hours × hourly_equiv
               # Cap penalty at 10% of base salary (configurable)
               late_penalty = min(late_penalty, base_salary × 0.10)
        
        6. GROSS SALARY
           gross = prorated + overtime_pay + manual_bonus - late_penalty - manual_penalty
           gross = max(gross, UZ_LABOR["min_wage_uzs"])  # never below minimum wage
        
        7. UZBEK TAX DEDUCTIONS
           inps_employee = gross × 0.04    # employee INPS contribution
           taxable_income = gross - inps_employee
           jshdssh = taxable_income × 0.12  # personal income tax
           total_deductions = inps_employee + jshdssh
        
        8. NET SALARY
           net = gross - total_deductions
        
        9. SAVE & RETURN PayrollRecord
           Save to DB with status="draft"
           Include full calculation breakdown in record
        """
    
    async def calculate_company_payroll(
        self,
        company_id: int,
        month: int,
        year: int,
        db: AsyncSession
    ) -> CompanyPayrollSummary:
        """
        Calculate payroll for ALL active employees in a company.
        
        Returns:
        - records: List[PayrollRecord]
        - total_gross: float
        - total_net: float  
        - total_inps: float
        - total_jshdssh: float
        - total_deductions: float
        - employee_count: int
        - calculation_warnings: List[str]  (e.g., "5 employees have incomplete attendance")
        
        Does NOT auto-approve — returns draft for HR to review.
        """
    
    async def approve_payroll(
        self,
        payroll_ids: List[int],
        approved_by: str,
        db: AsyncSession
    ) -> ApprovalResult:
        """
        HR approves a batch of payroll records.
        Changes status from "draft" → "approved".
        Locked after approval — changes require new correction record.
        """
    
    async def export_payroll_excel(
        self,
        company_id: int,
        month: int,
        year: int,
        db: AsyncSession
    ) -> bytes:
        """
        Export approved payroll to Excel (.xlsx).
        
        Sheet 1: Summary (one row per employee)
        Columns: Employee Name, Department, Position, Days Worked, 
                 Hours, Overtime, Base, Gross, INPS, JShDSh, Net, Status
        
        Sheet 2: Detailed attendance per employee
        Sheet 3: Tax summary for accounting department
        
        Formatted with company branding (purple header row).
        Numbers formatted as UZS with thousand separators.
        """
    
    def get_working_days_in_month(self, month: int, year: int, company_id: int) -> int:
        """
        Count working days in month.
        Excludes Saturdays, Sundays, and Uzbek public holidays.
        
        Uzbek Public Holidays (pre-populate uzbek_holidays table):
        Jan 1  — New Year
        Jan 14 — Defenders of Motherland Day  
        Mar 8  — International Women's Day
        Mar 21 — Navruz (Spring Festival)
        May 9  — Memory and Honour Day
        Sep 1  — Independence Day
        Oct 1  — Teachers' Day
        Dec 8  — Constitution Day
        + Eid al-Fitr (date varies)
        + Eid al-Adha (date varies)
        """
```

---

### PART 5 — API ROUTES

#### `backend/api/hr_attendance.py`
```python
# Router prefix: /hr/attendance
# All routes require Supabase JWT auth except /scan (employee-facing)

# ── QR MANAGEMENT (HR only) ────────────────────────────────────────────

GET /hr/attendance/qr/current
    """
    Returns current active QR token for the company's default location.
    Called by the display screen every 25 seconds via polling.
    Generates a new token if none exists or if current is >30s old.
    
    Response:
    {
        "scan_url": "https://benela.dev/hr/scan?t=eyJ...",
        "expires_at": "2025-03-15T09:32:45Z",
        "seconds_remaining": 34,
        "location_name": "Main Office"
    }
    """
    No auth required (token itself is the security)

GET /hr/attendance/qr/current?location_id={id}
    """Same but for a specific office location."""

# ── EMPLOYEE SCAN (no auth — JWT in QR token handles security) ─────────

POST /hr/attendance/scan
    """
    Called when employee taps QR link and confirms clock-in/out.
    
    Body:
    {
        "token": "eyJ...",           # QR token from URL param
        "employee_pin": "1234",       # if no Supabase session
        "device_fingerprint": "abc...", # SHA256 of navigator properties
        "latitude": 41.2995,          # optional
        "longitude": 69.2401,         # optional
        "notes": "Working from lobby" # optional
    }
    
    OR if employee has active Supabase session (recognized from cookie):
    {
        "token": "eyJ...",
        "device_fingerprint": "abc..."
        # employee_id resolved from session
    }
    
    Response (success):
    {
        "action": "clock_in",
        "employee_name": "Jasur Karimov",
        "time": "09:07:23",
        "status": "late",
        "late_minutes": 7,
        "message": "Kelganingiz qayd etildi! 7 daqiqa kechikdingiz.",
        "warnings": []
    }
    
    Response (clock_out):
    {
        "action": "clock_out",
        "employee_name": "Jasur Karimov", 
        "time": "18:15:44",
        "hours_worked": 9.14,
        "overtime_hours": 0.14,
        "status": "overtime",
        "message": "Ishdan chiqdingiz! Bugun 9 soat 8 daqiqa ishladingiz.",
        "warnings": []
    }
    
    Error cases:
    - 410 GONE: "QR kod eskirgan. Yangi kodni skaner qiling."
    - 409 CONFLICT: "Siz bugun allaqachon qayd etilgansiz."
    - 403 FORBIDDEN: "PIN noto'g'ri."
    - 404 NOT FOUND: "Xodim topilmadi."
    """
    No auth (token + PIN = auth)

GET /hr/attendance/verify-session
    """
    Called by /hr/scan page on load to check if employee has active session.
    If yes, returns employee info so they can confirm without PIN.
    """

# ── HR DASHBOARD ENDPOINTS ─────────────────────────────────────────────

GET /hr/attendance/today
    """
    Real-time office presence. Cached for 30 seconds.
    
    Response: TodayPresence object (see AttendanceService.get_todays_presence)
    """

GET /hr/attendance/records
    """
    Paginated attendance records with filters.
    
    Params:
    - employee_id (int, optional)
    - date_from (date)
    - date_to (date)  
    - status (AttendanceStatus, optional)
    - page (int, default 1)
    - per_page (int, default 50, max 200)
    
    Response: { records: List[AttendanceRecord], total: int, pages: int }
    """

GET /hr/attendance/records/{employee_id}/monthly?month=3&year=2025
    """Monthly summary for one employee."""

POST /hr/attendance/records/{record_id}/correct
    """HR correction endpoint."""
    Body: { clock_in, clock_out, note }

POST /hr/attendance/records/manual
    """
    HR manually adds attendance record (e.g., for field workers).
    Body: { employee_id, work_date, clock_in, clock_out, source: "manual", note }
    """

# ── PAYROLL ENDPOINTS ──────────────────────────────────────────────────

POST /hr/payroll/calculate
    """
    Trigger payroll calculation for a month.
    Body: { month: int, year: int, employee_ids: List[int] (optional, all if empty) }
    Returns: CompanyPayrollSummary with draft records.
    """

GET /hr/payroll?month=3&year=2025
    """Get calculated payroll records for a month."""

PATCH /hr/payroll/{record_id}
    """HR adjusts a draft payroll record (bonus, penalty, note)."""

POST /hr/payroll/approve
    """Approve a batch of draft payroll records."""
    Body: { payroll_ids: List[int] }

GET /hr/payroll/export?month=3&year=2025
    """Download Excel payroll export."""
    Returns: .xlsx file

# ── LOCATIONS ──────────────────────────────────────────────────────────

GET    /hr/attendance/locations
POST   /hr/attendance/locations
PATCH  /hr/attendance/locations/{id}
DELETE /hr/attendance/locations/{id}

# ── LEAVE MANAGEMENT ───────────────────────────────────────────────────

GET    /hr/leave
POST   /hr/leave
PATCH  /hr/leave/{id}/approve
PATCH  /hr/leave/{id}/reject

# ── ANALYTICS ─────────────────────────────────────────────────────────

GET /hr/attendance/analytics/summary?month=3&year=2025
    """
    Company-wide attendance analytics.
    
    Returns:
    {
        "avg_attendance_rate": 94.2,
        "total_overtime_hours": 340.5,
        "top_overtime_employees": [...],
        "most_late_employees": [...],
        "absent_trend": [{ date, count }],  # last 30 days
        "department_breakdown": [{ dept, rate, avg_hours }]
    }
    """
```

---

### PART 6 — FRONTEND COMPONENTS

#### `frontend/app/hr/scan/page.tsx`
**The employee-facing QR scan landing page.**

```typescript
// This page is what opens on the employee's phone when they scan the QR.
// Must work perfectly on mobile Safari and Chrome on Android.
// No sidebar, no header — fullscreen mobile-first design.
// URL: /hr/scan?t={token}

// Layout (mobile-optimized):
// ┌─────────────────────────┐
// │   [Benela Logo small]   │
// │                         │
// │  ┌───────────────────┐  │
// │  │  Jasur Karimov    │  │  ← employee name (if session recognized)
// │  │  Senior Developer │  │  ← position
// │  └───────────────────┘  │
// │                         │
// │   🟢 CLOCK IN           │  ← big colored action button
// │   Today, 09:06          │
// │                         │
// │  [Add a note (optional)]│  ← textarea, collapsed by default
// │                         │
// │  [Confirm Clock In]     │  ← purple button
// └─────────────────────────┘

// States:
// 1. Loading — checking token validity + session
// 2. PIN Entry — if no session, show PIN numpad (6 large buttons)
// 3. Confirm — show employee info + clock in/out action + optional note
// 4. Success — big animated checkmark, action (Clock In/Out), time, message
// 5. Error — expired token / wrong PIN / already scanned

// Success animation: CSS keyframe — green circle expands from center, checkmark draws in
// Error animation: red shake, clear error message in Uzbek + Russian

// Language: Show messages in BOTH Uzbek and Russian simultaneously
// "Kelganingiz qayd etildi!" (uz) / "Ваш приход зафиксирован!" (ru)

// PIN numpad design:
// Large circular buttons (80px diameter), #1c1c1c background, #7c6aff on tap
// Numbers 1-9, then [clear] [0] [submit]
// Show asterisks for entered digits: ● ● ● _
// Auto-submit when 4th digit entered (if company uses 4-digit PINs)

// After success — auto-close after 4 seconds or show "Done" button
// No navigation back — this is a one-action page

export default function ScanPage() {
  // Extract token from URL: useSearchParams()
  // On mount: POST /hr/attendance/verify-session (check Supabase session)
  // If session: show employee info, skip PIN
  // If no session: show PIN entry
  // On PIN submit or confirm: POST /hr/attendance/scan
  // Handle all error states gracefully
}
```

#### `frontend/app/hr/attendance/display/page.tsx`
**The entrance display screen — shown on office TV/tablet.**

```typescript
// Fullscreen page, no navigation, no sidebar
// Designed for 1080p screens and tablets
// URL: /hr/attendance/display?location_id={id}
// HR logs in once, navigates here, leaves it running

// Layout:
// ┌─────────────────────────────────────────────────┐
// │  BENELA               Main Office    09:07:23   │  ← header bar
// │─────────────────────────────────────────────────│
// │                                                  │
// │              [HUGE QR CODE - 400x400px]          │
// │                                                  │
// │         Scan to Clock In / Clock Out             │
// │                                                  │
// │         ████████████████████  28s              │  ← progress bar countdown
// │                                                  │
// │  ● 23 in office    ⚠ 4 late    ✗ 3 absent      │  ← live stats
// └─────────────────────────────────────────────────┘

// QR Code:
// Use 'qrcode' npm package to generate QR from scan_url
// QR rendered as SVG, centered, with purple finder squares (match brand)
// Countdown ring around QR: SVG circle stroke-dashoffset animation
// Auto-fetch new token every 25 seconds (5s before expiry)
// Smooth QR transition: fade out → new QR fades in (no jarring flash)

// Live stats bar at bottom:
// Polls GET /hr/attendance/today every 30 seconds
// Shows: in office, late, absent counts
// Click on stat → opens HR dashboard (new tab)

// Error handling:
// If API unreachable → show "Connecting..." with pulsing animation
// If token fetch fails → retry every 5 seconds
// Never show a broken or expired QR — always show loading state

// The page must work when left running for 8+ hours without memory leaks
// Use cleanup in useEffect, clear all intervals on unmount

import QRCode from 'qrcode'

export default function AttendanceDisplayPage() {
  // setInterval(fetchNewToken, 25000)
  // setInterval(fetchTodayStats, 30000)
  // Countdown timer: decrements every second from QR_EXPIRY_SECONDS
}
```

#### `frontend/components/hr/AttendanceDashboard.tsx`
**HR manager's attendance overview — part of HRPage.tsx.**

```typescript
// This component replaces or extends the existing HRPage.tsx
// Add as a new tab/section: "Attendance" alongside existing Employees tab

// Section 1: TODAY'S OVERVIEW (real-time)
// ┌──────────┬──────────┬──────────┬──────────┐
// │ 23 In    │ 4 Late   │ 3 Absent │ 17 Done  │
// │ Office   │ Today    │ Today    │ Full Day │
// └──────────┴──────────┴──────────┴──────────┘
// Below: scrollable list of employees with their status
// Each row: Avatar | Name | Position | Status badge | Clock-in time | Hours worked
// Status badges: ON TIME (green) | LATE +Xmin (yellow) | ABSENT (red) | ON LEAVE (blue)
// Filter buttons: All | In Office | Late | Absent | Clocked Out

// Section 2: ATTENDANCE LOG TABLE
// Date range picker (default: current month)
// Employee filter dropdown
// Columns: Employee | Date | Clock In | Clock Out | Hours | Overtime | Status | Actions
// Actions: Edit (HR correction) | Delete (soft delete)
// Inline editing: click clock-in time → editable input → save

// Section 3: MONTHLY CALENDAR VIEW (per employee)
// When HR clicks an employee name → show their month calendar
// Each day cell: colored by status
//   Green = on time | Yellow = late | Red = absent | Blue = leave | Gray = weekend/holiday
// Click a day → see exact times

// Section 4: ANALYTICS MINI-CHARTS
// Attendance rate trend (line chart, last 30 days)
// Department comparison bar chart
// Late arrival frequency per employee

// Section 5: PAYROLL PREVIEW
// Button: "Calculate Payroll for [Current Month]"
// Shows table with calculated salaries (draft state)
// Approve button per row or bulk
// Export to Excel button
```

#### `frontend/components/hr/PayrollView.tsx`
**Monthly payroll management.**

```typescript
// Month/Year selector at top
// "Calculate Payroll" button → calls POST /hr/payroll/calculate → shows loading
// 
// Results table:
// Employee | Days | Hours | OT Hours | Base | Gross | INPS | JShDSh | Net | Status | Actions
// Color-coded: draft (yellow border) | approved (green) | paid (gray)
//
// Per-row actions: Adjust (add bonus/penalty) | Approve | View Breakdown
//
// "View Breakdown" modal:
// Shows step-by-step calculation for one employee
// "Base salary: 3,500,000 UZS × (21/22 days) = 3,340,909 UZS"
// "Overtime: 4.5h × 159,090/h × 1.5x = 1,074,375 UZS"
// "INPS (4%): -176,313 UZS"
// "JShDSh (12%): -499,613 UZS"
// "NET: 3,739,358 UZS"
// This transparency builds trust with clients
//
// Bulk actions: Approve All | Export Excel
// Total row at bottom: sum of all columns
//
// Format all UZS amounts: "3 500 000 UZS" (space as thousands separator, per UZ convention)
```

---

### PART 7 — AI INTEGRATION

#### Add to `backend/agents/data_fetcher.py`

```python
async def get_attendance_context(company_id: int = None) -> str:
    """
    Builds AI context string from attendance and payroll data.
    Called by get_context_for_section("hr").
    """
    today = date.today()
    current_month = today.month
    current_year = today.year
    
    # Query attendance data
    today_stats = await attendance_service.get_todays_presence(company_id)
    monthly_stats = await get_monthly_attendance_stats(company_id, current_month, current_year)
    
    return f"""
ATTENDANCE DATA (as of {today.strftime('%d.%m.%Y %H:%M')}):

TODAY:
- Employees in office: {today_stats.present_count}/{today_stats.expected_total}
- Late arrivals: {len(today_stats.late_arrivals)} employees
  {chr(10).join(f"  • {e.name}: +{e.late_minutes} min" for e in today_stats.late_arrivals[:5])}
- Absent (unexcused): {len([e for e in today_stats.not_arrived])}
- On approved leave: {len(today_stats.on_leave)}

THIS MONTH ({today.strftime('%B %Y')}):
- Average attendance rate: {monthly_stats.avg_rate:.1f}%
- Total overtime hours logged: {monthly_stats.total_overtime:.1f}h
- Most late employee: {monthly_stats.most_late_employee} ({monthly_stats.most_late_count} times)
- Perfect attendance so far: {monthly_stats.perfect_attendance_count} employees

PAYROLL STATUS:
- Working days this month: {monthly_stats.working_days_total}
- Days remaining: {monthly_stats.working_days_remaining}
- Estimated total payroll: {monthly_stats.estimated_payroll_uzs:,.0f} UZS
- Last approved payroll: {monthly_stats.last_approved_month}
"""


# Update get_context_for_section to include attendance:
async def get_context_for_section(section: str) -> str:
    if section == "hr":
        hr_context = await get_hr_context()
        attendance_context = await get_attendance_context()
        return hr_context + "\n\n" + attendance_context
    # ... existing sections
```

#### Update `backend/api/agents.py` HR system prompt

```python
# Add to HR section system prompt:
HR_ATTENDANCE_PROMPT_ADDITION = """
You have access to real-time attendance data. You can answer:
- Who is in the office right now
- Which employees are late or absent today
- Monthly attendance statistics and trends
- Payroll calculations and salary breakdowns
- Leave requests and balances

When discussing attendance, use employee names not IDs.
Format times as HH:MM (24-hour) and dates as DD.MM.YYYY (Uzbek standard).
Format currency as "X UZS" with spaces as thousand separators.
"""
```

---

### PART 8 — ENVIRONMENT VARIABLES

```bash
# Add to backend .env and DigitalOcean environment variables:
ATTENDANCE_QR_SECRET=          # 64-char random string: python -c "import secrets; print(secrets.token_hex(32))"
ATTENDANCE_QR_EXPIRY_SECONDS=60
ATTENDANCE_GEOFENCE_DEFAULT_RADIUS=300    # meters
ATTENDANCE_LATE_GRACE_MINUTES=15          # default grace period
ATTENDANCE_MAX_SCAN_DISTANCE_KM=0.5      # max GPS distance to flag remote
```

---

### PART 9 — DATABASE MIGRATION

```bash
alembic revision --autogenerate -m "add_attendance_system"
```

**Tables to create:** `attendance_records`, `qr_tokens`, `office_locations`, `leave_requests`, `payroll_records`, `uzbek_holidays`

**Columns to add to employees:** `employee_pin` (hashed), `shift_start`, `shift_end`, `late_grace_minutes`, `hourly_rate`, `contract_type`, `work_days`, `phone`, `device_fingerprint`

**Indexes:**
```sql
CREATE INDEX idx_attendance_employee_date ON attendance_records(employee_id, work_date DESC);
CREATE INDEX idx_attendance_company_date ON attendance_records(company_id, work_date DESC);
CREATE INDEX idx_qr_tokens_hash ON qr_tokens(token_hash);
CREATE INDEX idx_qr_tokens_expiry ON qr_tokens(expires_at) WHERE is_used = false;
CREATE INDEX idx_payroll_company_period ON payroll_records(company_id, period_year, period_month);
CREATE INDEX idx_leave_employee_dates ON leave_requests(employee_id, date_from, date_to);
```

**Seed Uzbek holidays** (insert after migration):
```sql
INSERT INTO uzbek_holidays (date, name_uz, name_ru, is_work_day) VALUES
('2025-01-01', 'Yangi yil', 'Новый год', false),
('2025-01-14', 'Vatan himoyachilari kuni', 'День защитников Отечества', false),
('2025-03-08', 'Xalqaro xotin-qizlar kuni', 'Международный женский день', false),
('2025-03-21', 'Navro''z', 'Навруз', false),
('2025-05-09', 'Xotira va qadrlash kuni', 'День памяти и почестей', false),
('2025-09-01', 'Mustaqillik kuni', 'День независимости', false),
('2025-10-01', 'O''qituvchilar kuni', 'День учителя', false),
('2025-12-08', 'Konstitutsiya kuni', 'День Конституции', false);
-- Add Eid dates annually
```

---

### PART 10 — REQUIRED PACKAGES

```
# backend/requirements.txt additions:
PyJWT>=2.8.0          # QR token signing
qrcode[pil]>=7.4.2    # QR generation (for server-side if needed)
bcrypt>=4.1.0          # Employee PIN hashing
openpyxl>=3.1.0        # Payroll Excel export (may already be present)
pytz>=2024.1           # Timezone handling (Tashkent = UTC+5)
```

```json
// frontend/package.json additions:
"qrcode": "^1.5.3",
"qrcode.react": "^3.1.0"
```

---

### PART 11 — SCHEDULER JOBS

```python
# Add to backend startup scheduler (APScheduler):

# Mark absent employees at end of each business day
scheduler.add_job(
    mark_absent_employees,
    'cron',
    hour=20,          # 8 PM Tashkent time — well after any shift ends
    minute=0,
    timezone='Asia/Tashkent',
    id='mark_absent'
)

# Clean up expired QR tokens (keep DB clean)
scheduler.add_job(
    cleanup_expired_qr_tokens,
    'interval',
    hours=1,
    id='cleanup_qr_tokens'
)

# Monthly payroll reminder notification
scheduler.add_job(
    send_payroll_reminder,
    'cron',
    day='last',       # last day of month
    hour=10,
    timezone='Asia/Tashkent',
    id='payroll_reminder'
)
```

---

### PART 12 — FUTURE HARDWARE BRIDGE (scaffold now, implement later)

```python
# backend/integrations/attendance/hardware_bridge.py
# Scaffold this file now — don't implement, just define the interface

class HardwareBridge:
    """
    Abstract base for hardware attendance devices.
    When a client upgrades from QR → biometric hardware,
    they configure a hardware adapter. The rest of Benela
    doesn't change — same AttendanceRecord, same payroll engine.
    
    Adapters to implement in Phase 2:
    - ZKTecoAdapter     (most common in Uzbekistan — 80% market share)
    - HikvisionAdapter  (face recognition terminals)
    - DahuaAdapter      (similar to Hikvision)
    - RFIDAdapter       (generic NFC card readers)
    """
    
    async def push_attendance_event(self, raw_event: dict) -> AttendanceRecord:
        """
        Called when hardware device pushes an event to Benela.
        Normalizes device-specific format → AttendanceRecord.
        Then calls AttendanceService.process_scan() to apply business logic.
        """
        raise NotImplementedError
    
    async def get_pending_events(self) -> List[dict]:
        """
        Pull-mode: fetch events from device that weren't pushed.
        Used for devices that batch-send logs.
        """
        raise NotImplementedError

# ZKTeco push endpoint (register in main.py):
# POST /hr/attendance/device/zkteco
# This endpoint accepts ZKTeco's proprietary push format
# and converts it to a standard scan event
```

---

## DELIVERY CHECKLIST

Before marking this done, verify every single item:

**QR System:**
- [ ] Token expires in exactly 60 seconds
- [ ] Expired token returns clear error message in Uzbek + Russian
- [ ] Screenshot abuse prevented (token hash checked in DB)
- [ ] QR display page refreshes every 25s without page reload
- [ ] Countdown animation shows remaining time accurately
- [ ] Mobile scan page works on iPhone Safari and Android Chrome
- [ ] PIN numpad is touch-friendly (large buttons, no zoom on input)
- [ ] Auto-detect clock-in vs clock-out based on last record

**Attendance Logic:**
- [ ] Late minutes calculated correctly with grace period
- [ ] Overtime hours calculated per-day (not cumulative)
- [ ] Absent marked automatically at end of day via scheduler
- [ ] Weekend/holiday days excluded from working day count
- [ ] Approved leave does not count as absent

**Payroll Calculation:**
- [ ] Pro-rated salary correct for partial months
- [ ] Overtime at 1.5x for first 2 hours, 2.0x after
- [ ] INPS deducted at 4% from gross
- [ ] JShDSh at 12% from (gross - INPS)
- [ ] Net never falls below UZ minimum wage
- [ ] Excel export includes all columns with UZS formatting

**Security:**
- [ ] QR secret key stored in env var, never in code
- [ ] Employee PINs hashed with bcrypt (never stored plain)
- [ ] company_id isolation on every query
- [ ] Device fingerprint stored and change-flagged
- [ ] All routes except /scan require Supabase JWT

**Frontend:**
- [ ] Display page works on TV screens (1080p) and tablets (768px)
- [ ] Scan page works on mobile (375px min-width)
- [ ] All styles are inline — no Tailwind, no CSS modules
- [ ] Dark theme (#080808 background) on all new pages
- [ ] UZS amounts formatted with spaces: "3 500 000 UZS"
- [ ] Attendance calendar shows correct colors per status

**Database:**
- [ ] Alembic migration runs cleanly
- [ ] All indexes created
- [ ] Uzbek holidays pre-populated for 2025 and 2026
- [ ] employee_pin column added to employees table

**AI Integration:**
- [ ] get_attendance_context() returns real data
- [ ] HR agent answers "who is late today?" correctly
- [ ] Payroll data visible to AI for financial queries

---

## BUILD ORDER

Implement in exactly this sequence:

1. Database models + Alembic migration + seed holidays
2. QRTokenEngine (generate + validate)
3. AttendanceService.process_scan()
4. API route: GET /hr/attendance/qr/current
5. API route: POST /hr/attendance/scan
6. Frontend: /hr/scan page (employee mobile page)
7. Frontend: /hr/attendance/display page (office screen)
8. AttendanceService remaining methods (today's presence, monthly summary)
9. PayrollEngine (full calculation)
10. API routes: GET /hr/attendance/today + records + payroll
11. Frontend: AttendanceDashboard.tsx + PayrollView.tsx
12. AI context integration (get_attendance_context)
13. Scheduler jobs
14. HardwareBridge scaffold

Each step must be fully working and tested before moving to the next. Financial calculations especially — write unit tests with known inputs and expected outputs before implementing.

This feature will make Benela the only ERP in Uzbekistan where a company can go from zero to a fully automated attendance and payroll system in under 10 minutes, with no hardware purchase required. Build it like it's the feature that closes deals.
