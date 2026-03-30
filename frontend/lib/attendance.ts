import { authFetch } from "@/lib/auth-fetch";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const payload = await res.json();
    const detail = payload?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  } catch {
    // ignore
  }
  return fallback;
}

export type AttendanceStatus = "on_time" | "late" | "early_leave" | "overtime" | "absent" | "on_leave";

export type OfficeLocation = {
  id: number;
  company_id: number;
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius_meters: number;
  allowed_ip_ranges?: string | null;
  qr_rotation_seconds: number;
  require_pin: boolean;
  allow_remote_flag: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type QRCurrent = {
  scan_url: string;
  expires_at: string;
  seconds_remaining: number;
  location_id: number;
  location_name: string;
};

export type VerifySession = {
  authenticated: boolean;
  employee_id?: number | null;
  employee_name?: string | null;
  employee_role?: string | null;
  action?: "clock_in" | "clock_out" | null;
  location_name?: string | null;
  requires_pin: boolean;
};

export type ScanResult = {
  action: "clock_in" | "clock_out";
  employee_name: string;
  time: string;
  status: AttendanceStatus;
  late_minutes: number;
  early_leave_minutes: number;
  hours_worked?: number | null;
  overtime_hours?: number | null;
  message: string;
  message_ru: string;
  warnings: string[];
};

export type EmployeePresence = {
  employee_id: number;
  name: string;
  position: string;
  department: string;
  status: AttendanceStatus;
  clock_in?: string | null;
  clock_out?: string | null;
  hours_worked?: number | null;
  late_minutes: number;
  overtime_hours?: number | null;
};

export type TodayPresence = {
  currently_in: EmployeePresence[];
  clocked_out: EmployeePresence[];
  late_arrivals: EmployeePresence[];
  not_arrived: EmployeePresence[];
  on_leave: EmployeePresence[];
  expected_total: number;
  present_count: number;
  attendance_rate_today: number;
  done_count: number;
};

export type AttendanceLogRow = {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_role?: string | null;
  department?: string | null;
  work_date: string;
  clock_in?: string | null;
  clock_out?: string | null;
  hours_worked?: number | null;
  overtime_hours?: number | null;
  late_minutes: number;
  early_leave_minutes: number;
  status: AttendanceStatus;
  source: string;
  is_corrected: boolean;
  notes?: string | null;
};

export type AttendanceRecordPage = {
  records: AttendanceLogRow[];
  total: number;
  pages: number;
};

export type AttendanceRecord = {
  id: number;
  employee_id: number;
  company_id: number;
  location_id?: number | null;
  work_date: string;
  clock_in?: string | null;
  clock_out?: string | null;
  hours_worked?: number | null;
  overtime_hours?: number | null;
  late_minutes: number;
  early_leave_minutes: number;
  status: AttendanceStatus;
  source: string;
  location_verified: boolean;
  is_remote_flag: boolean;
  is_corrected: boolean;
  correction_note?: string | null;
  corrected_by?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeMonthSummary = {
  employee_id: number;
  employee_name: string;
  month: number;
  year: number;
  records: AttendanceRecord[];
  days_worked: number;
  days_absent: number;
  total_hours: number;
  total_overtime: number;
  total_late_minutes: number;
  attendance_calendar: Record<string, string>;
};

export type AttendanceAnalyticsSummary = {
  avg_attendance_rate: number;
  total_overtime_hours: number;
  top_overtime_employees: Array<{ name: string; hours: number }>;
  most_late_employees: Array<{ name: string; count: number }>;
  absent_trend: Array<{ date: string; count: number }>;
  department_breakdown: Array<{ dept: string; rate: number; avg_hours: number }>;
};

export type PayrollRecord = {
  id: number;
  employee_id: number;
  employee_name: string;
  department?: string | null;
  position?: string | null;
  company_id: number;
  period_month: number;
  period_year: number;
  working_days_in_month: number;
  days_worked: number;
  days_absent: number;
  days_on_leave: number;
  total_hours_worked: number;
  total_overtime_hours: number;
  total_late_minutes: number;
  base_salary: number;
  prorated_salary: number;
  overtime_pay: number;
  late_penalty: number;
  manual_penalty: number;
  bonus: number;
  gross_salary: number;
  inps_employee: number;
  jshdssh: number;
  total_deductions: number;
  net_salary: number;
  status: string;
  approved_by?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  payment_method?: string | null;
  is_manually_adjusted: boolean;
  adjustment_note?: string | null;
  calculation_breakdown: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CompanyPayrollSummary = {
  records: PayrollRecord[];
  total_gross: number;
  total_net: number;
  total_inps: number;
  total_jshdssh: number;
  total_deductions: number;
  employee_count: number;
  calculation_warnings: string[];
};

export type LeaveRequest = {
  id: number;
  employee_id: number;
  company_id: number;
  employee_name?: string | null;
  leave_type: string;
  date_from: string;
  date_to: string;
  days_count: number;
  reason?: string | null;
  status: string;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
};

export async function getCurrentQRCode(locationId?: number): Promise<QRCurrent> {
  const query = new URLSearchParams();
  if (locationId) query.set("location_id", String(locationId));
  const res = await authFetch(`${API}/hr/attendance/qr/current${query.toString() ? `?${query.toString()}` : ""}`);
  if (!res.ok) throw new Error(await parseError(res, "Could not load active QR code."));
  return res.json();
}

export async function verifyAttendanceSession(token: string, attendanceAccessToken?: string): Promise<VerifySession> {
  const query = new URLSearchParams({ token });
  if (attendanceAccessToken) query.set("attendance_access_token", attendanceAccessToken);
  const res = await authFetch(`${API}/hr/attendance/verify-session?${query.toString()}`);
  if (!res.ok) throw new Error(await parseError(res, "Could not verify attendance session."));
  return res.json();
}

export async function submitAttendanceScan(payload: {
  token: string;
  employee_pin?: string;
  attendance_access_token?: string;
  device_fingerprint: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
}): Promise<ScanResult> {
  const res = await authFetch(`${API}/hr/attendance/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Could not record attendance."));
  return res.json();
}

export async function fetchTodayPresence(): Promise<TodayPresence> {
  const res = await authFetch(`${API}/hr/attendance/today`);
  if (!res.ok) throw new Error(await parseError(res, "Could not load today's attendance."));
  return res.json();
}

export async function fetchAttendanceRecords(params: {
  employee_id?: number;
  date_from?: string;
  date_to?: string;
  status?: string;
  page?: number;
  per_page?: number;
} = {}): Promise<AttendanceRecordPage> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && `${value}`.trim()) query.set(key, String(value));
  });
  const res = await authFetch(`${API}/hr/attendance/records?${query.toString()}`);
  if (!res.ok) throw new Error(await parseError(res, "Could not load attendance records."));
  return res.json();
}

export async function fetchEmployeeMonthlyAttendance(employeeId: number, month: number, year: number): Promise<EmployeeMonthSummary> {
  const query = new URLSearchParams({ month: String(month), year: String(year) });
  const res = await authFetch(`${API}/hr/attendance/records/${employeeId}/monthly?${query.toString()}`);
  if (!res.ok) throw new Error(await parseError(res, "Could not load employee monthly attendance."));
  return res.json();
}

export async function correctAttendanceRecord(recordId: number, payload: { clock_in?: string; clock_out?: string; note?: string }): Promise<AttendanceRecord> {
  const res = await authFetch(`${API}/hr/attendance/records/${recordId}/correct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Could not correct attendance record."));
  return res.json();
}

export async function createManualAttendance(payload: { employee_id: number; work_date: string; clock_in?: string; clock_out?: string; source?: string; note?: string }): Promise<AttendanceRecord> {
  const res = await authFetch(`${API}/hr/attendance/records/manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Could not create manual attendance record."));
  return res.json();
}

export async function fetchAttendanceAnalytics(month: number, year: number): Promise<AttendanceAnalyticsSummary> {
  const query = new URLSearchParams({ month: String(month), year: String(year) });
  const res = await authFetch(`${API}/hr/attendance/analytics/summary?${query.toString()}`);
  if (!res.ok) throw new Error(await parseError(res, "Could not load attendance analytics."));
  return res.json();
}

export async function fetchPayroll(month: number, year: number): Promise<PayrollRecord[]> {
  const query = new URLSearchParams({ month: String(month), year: String(year) });
  const res = await authFetch(`${API}/hr/payroll?${query.toString()}`);
  if (!res.ok) throw new Error(await parseError(res, "Could not load payroll records."));
  return res.json();
}

export async function calculatePayroll(month: number, year: number, employeeIds?: number[]): Promise<CompanyPayrollSummary> {
  const res = await authFetch(`${API}/hr/payroll/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month, year, employee_ids: employeeIds || [] }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Could not calculate payroll."));
  return res.json();
}

export async function adjustPayrollRecord(recordId: number, payload: { bonus?: number; manual_penalty?: number; adjustment_note?: string }): Promise<PayrollRecord> {
  const res = await authFetch(`${API}/hr/payroll/${recordId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Could not adjust payroll record."));
  return res.json();
}

export async function approvePayroll(payrollIds: number[]): Promise<{ approved_count: number; payroll_ids: number[]; message: string }> {
  const res = await authFetch(`${API}/hr/payroll/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payroll_ids: payrollIds }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Could not approve payroll."));
  return res.json();
}

export async function exportPayroll(month: number, year: number): Promise<void> {
  const query = new URLSearchParams({ month: String(month), year: String(year) });
  const res = await authFetch(`${API}/hr/payroll/export?${query.toString()}`);
  if (!res.ok) throw new Error(await parseError(res, "Could not export payroll."));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `payroll-${year}-${String(month).padStart(2, "0")}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function listAttendanceLocations(): Promise<OfficeLocation[]> {
  const res = await authFetch(`${API}/hr/attendance/locations`);
  if (!res.ok) throw new Error(await parseError(res, "Could not load office locations."));
  return res.json();
}

export async function saveAttendanceLocation(payload: Partial<OfficeLocation>, locationId?: number): Promise<OfficeLocation> {
  const res = await authFetch(`${API}/hr/attendance/locations${locationId ? `/${locationId}` : ""}`, {
    method: locationId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Could not save office location."));
  return res.json();
}

export async function deleteAttendanceLocation(locationId: number): Promise<void> {
  const res = await authFetch(`${API}/hr/attendance/locations/${locationId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res, "Could not remove office location."));
}

export async function listLeaveRequests(employeeId?: number): Promise<LeaveRequest[]> {
  const query = new URLSearchParams();
  if (employeeId) query.set("employee_id", String(employeeId));
  const res = await authFetch(`${API}/hr/leave${query.toString() ? `?${query.toString()}` : ""}`);
  if (!res.ok) throw new Error(await parseError(res, "Could not load leave requests."));
  return res.json();
}

export async function createLeaveRequest(payload: { employee_id: number; leave_type: string; date_from: string; date_to: string; reason?: string }): Promise<LeaveRequest> {
  const res = await authFetch(`${API}/hr/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Could not create leave request."));
  return res.json();
}

export async function reviewLeaveRequest(leaveId: number, action: "approve" | "reject", note?: string): Promise<LeaveRequest> {
  const res = await authFetch(`${API}/hr/leave/${leaveId}/${action}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
  if (!res.ok) throw new Error(await parseError(res, `Could not ${action} leave request.`));
  return res.json();
}

export function formatUzAmount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "0 UZS";
  return `${Math.round(value).toLocaleString("en-US").replace(/,/g, " ")} UZS`;
}

export function formatHourValue(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "0.0h";
  return `${value.toFixed(1)}h`;
}

export function attendanceStatusColor(status: string): string {
  switch (status) {
    case "on_time":
      return "#34d399";
    case "late":
      return "#fbbf24";
    case "overtime":
      return "#60a5fa";
    case "early_leave":
      return "#f87171";
    case "on_leave":
      return "#7c6aff";
    case "absent":
      return "#f87171";
    default:
      return "#9ca3af";
  }
}
