"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, MapPin, Pencil, Plus, RefreshCcw, TriangleAlert, UserRoundX, QrCode, Check, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  attendanceStatusColor,
  correctAttendanceRecord,
  createLeaveRequest,
  createManualAttendance,
  deleteAttendanceLocation,
  fetchAttendanceAnalytics,
  fetchAttendanceRecords,
  fetchEmployeeMonthlyAttendance,
  fetchTodayPresence,
  getCurrentQRCode,
  listAttendanceLocations,
  listLeaveRequests,
  reviewLeaveRequest,
  saveAttendanceLocation,
  type AttendanceAnalyticsSummary,
  type AttendanceLogRow,
  type EmployeeMonthSummary,
  type LeaveRequest,
  type OfficeLocation,
  type QRCurrent,
  type TodayPresence,
} from "@/lib/attendance";
import { useIsMobile } from "@/lib/use-is-mobile";

export type AttendanceEmployeeOption = {
  id: number;
  full_name: string;
  department: string;
  role: string;
  status: string;
};

const cardStyle = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "14px",
  overflow: "hidden",
} as const;

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "10px",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-soft)",
  color: "var(--text-primary)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
} as const;

const labelStyle = {
  display: "block",
  marginBottom: "6px",
  fontSize: "11px",
  color: "var(--text-subtle)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontFamily: "monospace",
} as const;

const buttonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  padding: "8px 12px",
  borderRadius: "10px",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
} as const;

const primaryButtonStyle = {
  ...buttonStyle,
  background: "var(--accent)",
  border: "none",
  color: "white",
} as const;

const badgeBaseStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "4px 10px",
  borderRadius: "999px",
  fontSize: "11px",
  fontWeight: 600,
} as const;

function toDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatDateLabel(value: string | Date | undefined | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatTimeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const maybeDate = new Date(value);
  if (!Number.isNaN(maybeDate.getTime())) {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(maybeDate);
  }
  return value.slice(0, 5);
}

function monthName(month: number, year: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function statusLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildCalendar(month: number, year: number) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const leading = (firstDay.getDay() + 6) % 7;
  const total = lastDay.getDate();
  const cells: Array<{ key: string; date: Date | null }> = [];
  for (let index = 0; index < leading; index += 1) {
    cells.push({ key: `empty-${index}`, date: null });
  }
  for (let day = 1; day <= total; day += 1) {
    cells.push({ key: `${year}-${month}-${day}`, date: new Date(year, month - 1, day) });
  }
  return cells;
}

function buildManualDateTime(workDate: string, timeValue: string): string | undefined {
  const normalizedTime = timeValue.trim();
  if (!workDate || !normalizedTime) return undefined;
  return `${workDate}T${normalizedTime}`;
}

function joinWarnings(items: string[]): string {
  return items.filter(Boolean).join(" • ");
}

export default function AttendanceDashboard({ employees }: { employees: AttendanceEmployeeOption[] }) {
  const isMobile = useIsMobile(900);
  const now = useMemo(() => new Date(), []);
  const [todayPresence, setTodayPresence] = useState<TodayPresence | null>(null);
  const [records, setRecords] = useState<AttendanceLogRow[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsPages, setRecordsPages] = useState(0);
  const [analytics, setAnalytics] = useState<AttendanceAnalyticsSummary | null>(null);
  const [monthSummary, setMonthSummary] = useState<EmployeeMonthSummary | null>(null);
  const [locations, setLocations] = useState<OfficeLocation[]>([]);
  const [activeQr, setActiveQr] = useState<QRCurrent | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [presenceFilter, setPresenceFilter] = useState<"all" | "in_office" | "late" | "absent" | "done" | "leave">("all");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | "">(employees[0]?.id ?? "");
  const [dateFrom, setDateFrom] = useState<string>(toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [dateTo, setDateTo] = useState<string>(toDateInput(now));
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [logEmployeeId, setLogEmployeeId] = useState<number | "">("");
  const [page, setPage] = useState(1);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [correctionRow, setCorrectionRow] = useState<AttendanceLogRow | null>(null);
  const [locationModal, setLocationModal] = useState<OfficeLocation | null | { id?: undefined }>(null);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [manualForm, setManualForm] = useState({
    employee_id: employees[0]?.id ? String(employees[0].id) : "",
    work_date: toDateInput(now),
    clock_in: "09:00",
    clock_out: "18:00",
    note: "",
  });
  const [correctionForm, setCorrectionForm] = useState({ clock_in: "", clock_out: "", note: "" });
  const [locationForm, setLocationForm] = useState({
    name: "",
    address: "",
    latitude: "",
    longitude: "",
    geofence_radius_meters: "300",
    allowed_ip_ranges: "",
    qr_rotation_seconds: "30",
    require_pin: false,
    allow_remote_flag: true,
    is_active: true,
  });
  const [leaveForm, setLeaveForm] = useState({
    employee_id: employees[0]?.id ? String(employees[0].id) : "",
    leave_type: "annual",
    date_from: toDateInput(now),
    date_to: toDateInput(now),
    reason: "",
  });

  const loadOverview = useCallback(async () => {
    const [presence, stats, locationRows, leaveRows] = await Promise.all([
      fetchTodayPresence(),
      fetchAttendanceAnalytics(month, year),
      listAttendanceLocations(),
      listLeaveRequests(),
    ]);
    setTodayPresence(presence);
    setAnalytics(stats);
    setLocations(locationRows);
    setLeaveRequests(leaveRows);
    if (locationRows[0]) {
      const qr = await getCurrentQRCode(locationRows[0].id);
      setActiveQr(qr);
    } else {
      setActiveQr(null);
    }
  }, [month, year]);

  const loadRecords = useCallback(async () => {
    const response = await fetchAttendanceRecords({
      employee_id: logEmployeeId === "" ? undefined : Number(logEmployeeId),
      date_from: dateFrom,
      date_to: dateTo,
      status: statusFilter || undefined,
      page,
      per_page: 20,
    });
    setRecords(response.records);
    setRecordsTotal(response.total);
    setRecordsPages(response.pages);
  }, [dateFrom, dateTo, logEmployeeId, page, statusFilter]);

  const loadMonthSummary = useCallback(async () => {
    if (!selectedEmployeeId) {
      setMonthSummary(null);
      return;
    }
    const summary = await fetchEmployeeMonthlyAttendance(Number(selectedEmployeeId), month, year);
    setMonthSummary(summary);
  }, [month, selectedEmployeeId, year]);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await Promise.all([loadOverview(), loadRecords(), loadMonthSummary()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load attendance dashboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadMonthSummary, loadOverview, loadRecords]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const handle = window.setInterval(() => {
      void loadOverview().catch(() => undefined);
    }, 30000);
    return () => window.clearInterval(handle);
  }, [loadOverview]);

  const mergedPresenceRows = useMemo(() => {
    const map = new Map<number, { key: number; name: string; position: string; department: string; status: string; clock_in?: string | null; clock_out?: string | null; hours_worked?: number | null; late_minutes?: number; overtime_hours?: number | null }>();
    const push = (rows: TodayPresence["currently_in"], fallbackStatus?: string) => {
      rows.forEach((row) => {
        map.set(row.employee_id, {
          key: row.employee_id,
          name: row.name,
          position: row.position,
          department: row.department,
          status: fallbackStatus || row.status,
          clock_in: row.clock_in,
          clock_out: row.clock_out,
          hours_worked: row.hours_worked,
          late_minutes: row.late_minutes,
          overtime_hours: row.overtime_hours,
        });
      });
    };
    if (todayPresence) {
      push(todayPresence.currently_in, "on_time");
      push(todayPresence.late_arrivals, "late");
      push(todayPresence.not_arrived, "absent");
      push(todayPresence.clocked_out, "clocked_out");
      push(todayPresence.on_leave, "on_leave");
    }
    return Array.from(map.values());
  }, [todayPresence]);

  const filteredPresenceRows = useMemo(() => {
    return mergedPresenceRows.filter((row) => {
      if (presenceFilter === "all") return true;
      if (presenceFilter === "in_office") return row.status === "on_time" || row.status === "overtime";
      if (presenceFilter === "late") return row.status === "late";
      if (presenceFilter === "absent") return row.status === "absent";
      if (presenceFilter === "done") return row.status === "clocked_out";
      if (presenceFilter === "leave") return row.status === "on_leave";
      return true;
    });
  }, [mergedPresenceRows, presenceFilter]);

  const calendarCells = useMemo(() => buildCalendar(month, year), [month, year]);
  const selectedEmployee = useMemo(() => employees.find((row) => row.id === Number(selectedEmployeeId)) || null, [employees, selectedEmployeeId]);

  const openCorrection = (row: AttendanceLogRow) => {
    setCorrectionRow(row);
    setCorrectionForm({
      clock_in: row.clock_in ? new Date(row.clock_in).toISOString().slice(0, 16) : "",
      clock_out: row.clock_out ? new Date(row.clock_out).toISOString().slice(0, 16) : "",
      note: row.notes || "",
    });
  };

  const submitManualRecord = async () => {
    setSubmitting(true);
    try {
      await createManualAttendance({
        employee_id: Number(manualForm.employee_id),
        work_date: manualForm.work_date,
        clock_in: buildManualDateTime(manualForm.work_date, manualForm.clock_in),
        clock_out: buildManualDateTime(manualForm.work_date, manualForm.clock_out),
        note: manualForm.note || undefined,
      });
      setManualModalOpen(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create manual attendance record.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitCorrection = async () => {
    if (!correctionRow) return;
    setSubmitting(true);
    try {
      await correctAttendanceRecord(correctionRow.id, {
        clock_in: correctionForm.clock_in || undefined,
        clock_out: correctionForm.clock_out || undefined,
        note: correctionForm.note || undefined,
      });
      setCorrectionRow(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not correct attendance record.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitLocation = async () => {
    setSubmitting(true);
    try {
      await saveAttendanceLocation(
        {
          name: locationForm.name,
          address: locationForm.address || null,
          latitude: locationForm.latitude ? Number(locationForm.latitude) : null,
          longitude: locationForm.longitude ? Number(locationForm.longitude) : null,
          geofence_radius_meters: Number(locationForm.geofence_radius_meters || 300),
          allowed_ip_ranges: locationForm.allowed_ip_ranges || null,
          qr_rotation_seconds: Number(locationForm.qr_rotation_seconds || 30),
          require_pin: locationForm.require_pin,
          allow_remote_flag: locationForm.allow_remote_flag,
          is_active: locationForm.is_active,
        },
        locationModal && "id" in locationModal && locationModal.id ? locationModal.id : undefined,
      );
      setLocationModal(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save office location.");
    } finally {
      setSubmitting(false);
    }
  };

  const openLocationEditor = (location?: OfficeLocation) => {
    setLocationModal(location || {});
    setLocationForm({
      name: location?.name || "",
      address: location?.address || "",
      latitude: location?.latitude != null ? String(location.latitude) : "",
      longitude: location?.longitude != null ? String(location.longitude) : "",
      geofence_radius_meters: String(location?.geofence_radius_meters ?? 300),
      allowed_ip_ranges: location?.allowed_ip_ranges || "",
      qr_rotation_seconds: String(location?.qr_rotation_seconds ?? 30),
      require_pin: Boolean(location?.require_pin),
      allow_remote_flag: location?.allow_remote_flag ?? true,
      is_active: location?.is_active ?? true,
    });
  };

  const removeLocation = async (locationId: number) => {
    if (!window.confirm("Delete this office location?")) return;
    try {
      await deleteAttendanceLocation(locationId);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove office location.");
    }
  };

  const submitLeave = async () => {
    setSubmitting(true);
    try {
      await createLeaveRequest({
        employee_id: Number(leaveForm.employee_id),
        leave_type: leaveForm.leave_type,
        date_from: leaveForm.date_from,
        date_to: leaveForm.date_to,
        reason: leaveForm.reason || undefined,
      });
      setLeaveModalOpen(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create leave request.");
    } finally {
      setSubmitting(false);
    }
  };

  const reviewLeave = async (leaveId: number, action: "approve" | "reject") => {
    try {
      await reviewLeaveRequest(leaveId, action);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${action} leave request.`);
    }
  };

  const openDisplayPage = () => {
    if (typeof window === "undefined") return;
    const query = activeQr?.location_id ? `?location_id=${activeQr.location_id}` : "";
    window.open(`/hr/attendance/display${query}`, "_blank", "noopener,noreferrer");
  };

  const todayStats = [
    {
      label: "In Office",
      value: todayPresence?.present_count ?? 0,
      detail: `${todayPresence?.expected_total ?? 0} expected`,
      color: "#34d399",
      icon: CheckCircle2,
    },
    {
      label: "Late Today",
      value: todayPresence?.late_arrivals.length ?? 0,
      detail: "after grace window",
      color: "#fbbf24",
      icon: Clock3,
    },
    {
      label: "Absent",
      value: todayPresence?.not_arrived.length ?? 0,
      detail: "unconfirmed arrival",
      color: "#f87171",
      icon: UserRoundX,
    },
    {
      label: "Full Day",
      value: todayPresence?.done_count ?? 0,
      detail: "clocked out",
      color: "#60a5fa",
      icon: CalendarDays,
    },
  ];

  if (loading) {
    return <div style={{ padding: "18px", color: "var(--text-subtle)" }}>Loading attendance workspace...</div>;
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      {error ? (
        <div style={{ ...cardStyle, padding: "14px 16px", color: "var(--danger)", borderColor: "color-mix(in srgb, var(--danger) 40%, var(--border-default) 60%)" }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: "12px" }}>
        {todayStats.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} style={{ ...cardStyle, padding: isMobile ? "14px 12px" : "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>{card.label}</span>
                <div style={{ width: "30px", height: "30px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", background: `${card.color}12` }}>
                  <Icon size={14} color={card.color} />
                </div>
              </div>
              <div style={{ fontSize: isMobile ? "24px" : "30px", color: "var(--text-primary)", fontWeight: 700, lineHeight: 1 }}>{card.value}</div>
              <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "6px" }}>{card.detail}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 0.8fr", gap: "16px" }}>
        <div style={cardStyle}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border-default)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "20px", color: "var(--text-primary)", fontWeight: 700 }}>Today&apos;s attendance</div>
              <div style={{ fontSize: "13px", color: "var(--text-subtle)", marginTop: "4px" }}>Real-time office presence and arrival status.</div>
            </div>
            <button type="button" style={buttonStyle} onClick={() => void loadAll()} disabled={refreshing}>
              <RefreshCcw size={14} /> {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div style={{ padding: "14px 18px", display: "flex", gap: "8px", flexWrap: "wrap", borderBottom: "1px solid var(--border-default)" }}>
            {[
              ["all", "All"],
              ["in_office", "In Office"],
              ["late", "Late"],
              ["absent", "Absent"],
              ["done", "Clocked Out"],
              ["leave", "On Leave"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPresenceFilter(key as typeof presenceFilter)}
                style={{
                  ...buttonStyle,
                  padding: "6px 10px",
                  fontSize: "12px",
                  background: presenceFilter === key ? "var(--bg-panel)" : "var(--bg-elevated)",
                  borderColor: presenceFilter === key ? "var(--accent)" : "var(--border-default)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gap: "10px", padding: "14px 18px" }}>
            {filteredPresenceRows.length ? (
              filteredPresenceRows.map((row) => (
                <div key={row.key} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.6fr 1fr 1fr auto", gap: "10px", padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--border-default)", background: "color-mix(in srgb, var(--bg-panel) 88%, var(--bg-surface) 12%)" }}>
                  <div>
                    <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>{row.name}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "3px" }}>{row.position} · {row.department}</div>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>
                    <div>In: {formatTimeLabel(row.clock_in || null)}</div>
                    <div>Out: {formatTimeLabel(row.clock_out || null)}</div>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>
                    <div>{row.hours_worked != null ? `${row.hours_worked.toFixed(1)}h worked` : "Shift active"}</div>
                    <div>{row.late_minutes ? `Late +${row.late_minutes}m` : row.overtime_hours ? `OT ${row.overtime_hours.toFixed(1)}h` : "Within schedule"}</div>
                  </div>
                  <div style={{ ...badgeBaseStyle, background: `${attendanceStatusColor(row.status === "clocked_out" ? "on_time" : row.status)}18`, color: attendanceStatusColor(row.status === "clocked_out" ? "on_time" : row.status), justifySelf: isMobile ? "flex-start" : "end" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: attendanceStatusColor(row.status === "clocked_out" ? "on_time" : row.status) }} />
                    {row.status === "clocked_out" ? "Done" : statusLabel(row.status)}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: "var(--text-subtle)", fontSize: "13px" }}>No employees match the selected filter.</div>
            )}
          </div>
        </div>

        <div style={{ ...cardStyle, display: "grid", alignContent: "start" }}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border-default)" }}>
            <div style={{ fontSize: "20px", color: "var(--text-primary)", fontWeight: 700 }}>QR & location controls</div>
            <div style={{ fontSize: "13px", color: "var(--text-subtle)", marginTop: "4px" }}>Keep the office display live and manage geofenced scan points.</div>
          </div>
          <div style={{ padding: "16px 18px", display: "grid", gap: "14px" }}>
            <div style={{ padding: "14px", borderRadius: "14px", border: "1px solid var(--border-default)", background: "var(--bg-panel)", display: "grid", justifyItems: "center", gap: "10px" }}>
              {activeQr ? <QRCodeSVG value={activeQr.scan_url} size={isMobile ? 180 : 200} bgColor="transparent" fgColor="#1f57ff" includeMargin /> : <div style={{ color: "var(--text-subtle)", fontSize: "13px" }}>No active QR token.</div>}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>{activeQr?.location_name || "Main Office"}</div>
                <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "4px" }}>QR refreshes automatically. Employees scan this to clock in or out.</div>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                <button type="button" style={primaryButtonStyle} onClick={openDisplayPage}>
                  <QrCode size={14} /> Open display
                </button>
                <button type="button" style={buttonStyle} onClick={() => void loadOverview()}>
                  <RefreshCcw size={14} /> Refresh QR
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>Office locations</div>
                <button type="button" style={buttonStyle} onClick={() => openLocationEditor()}>
                  <Plus size={14} /> Add location
                </button>
              </div>
              {locations.map((location) => (
                <div key={location.id} style={{ padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--border-default)", background: "color-mix(in srgb, var(--bg-panel) 88%, var(--bg-surface) 12%)", display: "grid", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                    <div>
                      <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>{location.name}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "3px" }}>{location.address || "Address not set"}</div>
                    </div>
                    <div style={{ ...badgeBaseStyle, background: location.is_active ? "#34d39918" : "#f8717118", color: location.is_active ? "#34d399" : "#f87171" }}>
                      {location.is_active ? "Active" : "Inactive"}
                    </div>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <span><MapPin size={12} style={{ marginRight: 4, verticalAlign: "text-bottom" }} /> {location.geofence_radius_meters}m</span>
                    <span>Rotate every {location.qr_rotation_seconds}s</span>
                    <span>{location.require_pin ? "PIN required" : "Session scan allowed"}</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button type="button" style={buttonStyle} onClick={() => openLocationEditor(location)}>
                      <Pencil size={14} /> Edit
                    </button>
                    <button type="button" style={{ ...buttonStyle, color: "var(--danger)" }} onClick={() => void removeLocation(location.id)}>
                      <X size={14} /> Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "20px", color: "var(--text-primary)", fontWeight: 700 }}>Attendance log</div>
            <div style={{ fontSize: "13px", color: "var(--text-subtle)", marginTop: "4px" }}>Review records, apply corrections, and create manual entries when necessary.</div>
          </div>
          <button type="button" style={primaryButtonStyle} onClick={() => setManualModalOpen(true)}>
            <Plus size={14} /> Add manual record
          </button>
        </div>
        <div style={{ padding: "14px 18px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr 0.9fr auto", gap: "10px", borderBottom: "1px solid var(--border-default)" }}>
          <div>
            <label style={labelStyle}>Employee</label>
            <select style={inputStyle} value={logEmployeeId} onChange={(event) => { setLogEmployeeId(event.target.value ? Number(event.target.value) : ""); setPage(1); }}>
              <option value="">All employees</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Date from</label>
            <input style={inputStyle} type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} />
          </div>
          <div>
            <label style={labelStyle}>Date to</label>
            <input style={inputStyle} type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} />
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select style={inputStyle} value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
              <option value="">Any status</option>
              <option value="on_time">On time</option>
              <option value="late">Late</option>
              <option value="overtime">Overtime</option>
              <option value="early_leave">Early leave</option>
              <option value="absent">Absent</option>
              <option value="on_leave">On leave</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "end" }}>
            <button type="button" style={buttonStyle} onClick={() => void loadRecords()}>
              <RefreshCcw size={14} /> Apply
            </button>
          </div>
        </div>
        <div style={{ padding: isMobile ? "12px" : "0" }}>
          {isMobile ? (
            <div style={{ display: "grid", gap: "10px" }}>
              {records.map((row) => (
                <div key={row.id} style={{ padding: "12px", border: "1px solid var(--border-default)", borderRadius: "12px", background: "color-mix(in srgb, var(--bg-panel) 88%, var(--bg-surface) 12%)", display: "grid", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>{row.employee_name}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "2px" }}>{formatDateLabel(row.work_date)} · {row.department || row.employee_role || "—"}</div>
                    </div>
                    <div style={{ ...badgeBaseStyle, background: `${attendanceStatusColor(row.status)}18`, color: attendanceStatusColor(row.status) }}>{statusLabel(row.status)}</div>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
                    <span>In: {formatTimeLabel(row.clock_in)}</span>
                    <span>Out: {formatTimeLabel(row.clock_out)}</span>
                    <span>Hours: {row.hours_worked?.toFixed(1) || "—"}</span>
                    <span>OT: {row.overtime_hours?.toFixed(1) || "0.0"}h</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{joinWarnings([row.late_minutes ? `Late +${row.late_minutes}m` : "", row.is_corrected ? "Corrected" : "", row.notes || ""]) || "No notes"}</span>
                    <button type="button" style={buttonStyle} onClick={() => openCorrection(row)}>
                      <Pencil size={14} /> Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 80px", padding: "10px 18px", background: "var(--bg-panel)", borderBottom: "1px solid var(--border-default)" }}>
                {["Employee", "Date", "Clock In", "Clock Out", "Hours", "OT", "Status", ""].map((header) => (
                  <span key={header} style={{ fontSize: "10px", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-quiet)", fontWeight: 600 }}>{header}</span>
                ))}
              </div>
              {records.map((row) => (
                <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 80px", padding: "12px 18px", borderBottom: "1px solid var(--table-row-divider)", alignItems: "center", gap: "8px" }}>
                  <div>
                    <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>{row.employee_name}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "2px" }}>{row.department || row.employee_role || "—"}</div>
                  </div>
                  <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{formatDateLabel(row.work_date)}</span>
                  <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{formatTimeLabel(row.clock_in)}</span>
                  <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{formatTimeLabel(row.clock_out)}</span>
                  <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{row.hours_worked?.toFixed(1) || "—"}</span>
                  <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{row.overtime_hours?.toFixed(1) || "0.0"}h</span>
                  <span style={{ ...badgeBaseStyle, background: `${attendanceStatusColor(row.status)}18`, color: attendanceStatusColor(row.status), width: "fit-content" }}>{statusLabel(row.status)}</span>
                  <button type="button" style={buttonStyle} onClick={() => openCorrection(row)}>
                    <Pencil size={14} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
        <div style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", borderTop: "1px solid var(--border-default)" }}>
          <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{recordsTotal} records · page {page} of {recordsPages || 1}</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" style={buttonStyle} onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Previous</button>
            <button type="button" style={buttonStyle} onClick={() => setPage((current) => (recordsPages && current < recordsPages ? current + 1 : current))} disabled={!recordsPages || page >= recordsPages}>Next</button>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "16px" }}>
        <div style={cardStyle}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border-default)", display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "20px", color: "var(--text-primary)", fontWeight: 700 }}>Employee month view</div>
              <div style={{ fontSize: "13px", color: "var(--text-subtle)", marginTop: "4px" }}>Inspect one employee&apos;s attendance calendar and totals.</div>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <select style={inputStyle} value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value ? Number(event.target.value) : "") }>
                <option value="">Select employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.full_name}</option>
                ))}
              </select>
              <button type="button" style={buttonStyle} onClick={() => void loadMonthSummary()}>
                <RefreshCcw size={14} /> Load
              </button>
            </div>
          </div>
          <div style={{ padding: "16px 18px", display: "grid", gap: "14px" }}>
            {selectedEmployee && monthSummary ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: "10px" }}>
                  {[
                    ["Days worked", monthSummary.days_worked],
                    ["Absent", monthSummary.days_absent],
                    ["Hours", monthSummary.total_hours.toFixed(1)],
                    ["Late minutes", monthSummary.total_late_minutes],
                  ].map(([label, value]) => (
                    <div key={String(label)} style={{ padding: "12px", borderRadius: "12px", background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
                      <div style={{ fontSize: "11px", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>{label}</div>
                      <div style={{ fontSize: "22px", color: "var(--text-primary)", fontWeight: 700, marginTop: "8px" }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>{selectedEmployee.full_name} · {monthName(month, year)}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "8px" }}>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div key={day} style={{ fontSize: "11px", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace", textAlign: "center" }}>{day}</div>
                  ))}
                  {calendarCells.map((cell) => {
                    if (!cell.date) {
                      return <div key={cell.key} style={{ minHeight: isMobile ? "54px" : "74px" }} />;
                    }
                    const key = cell.date.toISOString().slice(0, 10);
                    const status = monthSummary.attendance_calendar[key];
                    const isWeekend = cell.date.getDay() === 0 || cell.date.getDay() === 6;
                    const background = status ? `${attendanceStatusColor(status)}18` : isWeekend ? "var(--bg-panel)" : "var(--bg-elevated)";
                    const borderColor = status ? `${attendanceStatusColor(status)}60` : "var(--border-default)";
                    return (
                      <div key={cell.key} style={{ minHeight: isMobile ? "54px" : "74px", borderRadius: "12px", border: `1px solid ${borderColor}`, background, padding: "8px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600 }}>{cell.date.getDate()}</span>
                        <span style={{ fontSize: "11px", color: status ? attendanceStatusColor(status) : "var(--text-subtle)" }}>{status ? statusLabel(status) : isWeekend ? "Weekend" : "—"}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div style={{ fontSize: "13px", color: "var(--text-subtle)" }}>Select an employee to load the monthly attendance calendar.</div>
            )}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border-default)" }}>
            <div style={{ fontSize: "20px", color: "var(--text-primary)", fontWeight: 700 }}>Analytics & leave</div>
            <div style={{ fontSize: "13px", color: "var(--text-subtle)", marginTop: "4px" }}>Watch attendance quality and manage leave requests from the same workspace.</div>
          </div>
          <div style={{ padding: "16px 18px", display: "grid", gap: "16px" }}>
            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>Analytics snapshot</div>
              <div style={{ display: "grid", gap: "10px" }}>
                <div style={{ padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--border-default)", background: "var(--bg-panel)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>Average attendance rate</div>
                  <div style={{ fontSize: "24px", color: "var(--text-primary)", fontWeight: 700, marginTop: "8px" }}>{analytics?.avg_attendance_rate.toFixed(1) || "0.0"}%</div>
                </div>
                <div style={{ padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--border-default)", background: "var(--bg-panel)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>Top overtime employees</div>
                  <div style={{ display: "grid", gap: "8px", marginTop: "10px" }}>
                    {(analytics?.top_overtime_employees || []).slice(0, 4).map((item) => (
                      <div key={item.name} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", alignItems: "center" }}>
                        <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>{item.name}</span>
                        <span style={{ fontSize: "12px", color: "#60a5fa", fontWeight: 600 }}>{Number(item.hours || 0).toFixed(1)}h</span>
                      </div>
                    ))}
                    {!analytics?.top_overtime_employees?.length ? <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>No overtime data yet.</span> : null}
                  </div>
                </div>
                <div style={{ padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--border-default)", background: "var(--bg-panel)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>Most late employees</div>
                  <div style={{ display: "grid", gap: "8px", marginTop: "10px" }}>
                    {(analytics?.most_late_employees || []).slice(0, 4).map((item) => (
                      <div key={item.name} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", alignItems: "center" }}>
                        <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>{item.name}</span>
                        <span style={{ fontSize: "12px", color: "#fbbf24", fontWeight: 600 }}>{Number(item.count || 0)} times</span>
                      </div>
                    ))}
                    {!analytics?.most_late_employees?.length ? <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>No late-arrival trend data yet.</span> : null}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>Leave requests</div>
                <button type="button" style={buttonStyle} onClick={() => setLeaveModalOpen(true)}>
                  <Plus size={14} /> Add request
                </button>
              </div>
              {(leaveRequests || []).slice(0, 6).map((row) => (
                <div key={row.id} style={{ padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--border-default)", background: "color-mix(in srgb, var(--bg-panel) 88%, var(--bg-surface) 12%)", display: "grid", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>{row.employee_name || `Employee #${row.employee_id}`}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "3px" }}>{statusLabel(row.leave_type)} · {row.days_count} day(s)</div>
                    </div>
                    <div style={{ ...badgeBaseStyle, background: row.status === "approved" ? "#34d39918" : row.status === "rejected" ? "#f8717118" : "#fbbf2418", color: row.status === "approved" ? "#34d399" : row.status === "rejected" ? "#f87171" : "#fbbf24" }}>{statusLabel(row.status)}</div>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{formatDateLabel(row.date_from)} → {formatDateLabel(row.date_to)}</div>
                  {row.reason ? <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{row.reason}</div> : null}
                  {row.status === "pending" ? (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button type="button" style={{ ...buttonStyle, color: "#34d399" }} onClick={() => void reviewLeave(row.id, "approve")}>
                        <Check size={14} /> Approve
                      </button>
                      <button type="button" style={{ ...buttonStyle, color: "#f87171" }} onClick={() => void reviewLeave(row.id, "reject")}>
                        <X size={14} /> Reject
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              {!leaveRequests.length ? <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>No leave requests yet.</div> : null}
            </div>
          </div>
        </div>
      </div>

      {(manualModalOpen || correctionRow || locationModal || leaveModalOpen) ? (
        <div style={{ position: "fixed", inset: 0, background: "var(--overlay-backdrop)", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "12px" : "20px" }}>
          <div style={{ width: isMobile ? "100%" : "min(560px, 92vw)", maxHeight: "90vh", overflowY: "auto", ...cardStyle }}>
            <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border-default)", display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
              <div style={{ fontSize: "18px", color: "var(--text-primary)", fontWeight: 700 }}>
                {manualModalOpen ? "Manual attendance record" : correctionRow ? "Correct attendance" : locationModal ? (("id" in locationModal) && locationModal.id ? "Edit office location" : "New office location") : "Create leave request"}
              </div>
              <button type="button" style={buttonStyle} onClick={() => { setManualModalOpen(false); setCorrectionRow(null); setLocationModal(null); setLeaveModalOpen(false); }}>
                <X size={14} /> Close
              </button>
            </div>
            <div style={{ padding: "18px", display: "grid", gap: "14px" }}>
              {manualModalOpen ? (
                <>
                  <div>
                    <label style={labelStyle}>Employee</label>
                    <select style={inputStyle} value={manualForm.employee_id} onChange={(event) => setManualForm((current) => ({ ...current, employee_id: event.target.value }))}>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>{employee.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={labelStyle}>Work date</label>
                      <input style={inputStyle} type="date" value={manualForm.work_date} onChange={(event) => setManualForm((current) => ({ ...current, work_date: event.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Note</label>
                      <input style={inputStyle} value={manualForm.note} onChange={(event) => setManualForm((current) => ({ ...current, note: event.target.value }))} placeholder="Reason for manual entry" />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={labelStyle}>Clock in</label>
                      <input style={inputStyle} type="time" value={manualForm.clock_in} onChange={(event) => setManualForm((current) => ({ ...current, clock_in: event.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Clock out</label>
                      <input style={inputStyle} type="time" value={manualForm.clock_out} onChange={(event) => setManualForm((current) => ({ ...current, clock_out: event.target.value }))} />
                    </div>
                  </div>
                  <button type="button" style={primaryButtonStyle} onClick={() => void submitManualRecord()} disabled={submitting}>{submitting ? "Saving..." : "Create manual record"}</button>
                </>
              ) : null}

              {correctionRow ? (
                <>
                  <div style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{correctionRow.employee_name} · {formatDateLabel(correctionRow.work_date)}</div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={labelStyle}>Clock in</label>
                      <input style={inputStyle} type="datetime-local" value={correctionForm.clock_in} onChange={(event) => setCorrectionForm((current) => ({ ...current, clock_in: event.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Clock out</label>
                      <input style={inputStyle} type="datetime-local" value={correctionForm.clock_out} onChange={(event) => setCorrectionForm((current) => ({ ...current, clock_out: event.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Correction note</label>
                    <textarea style={{ ...inputStyle, minHeight: "110px", resize: "vertical" }} value={correctionForm.note} onChange={(event) => setCorrectionForm((current) => ({ ...current, note: event.target.value }))} placeholder="Explain the correction." />
                  </div>
                  <button type="button" style={primaryButtonStyle} onClick={() => void submitCorrection()} disabled={submitting}>{submitting ? "Saving..." : "Save correction"}</button>
                </>
              ) : null}

              {locationModal ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={labelStyle}>Location name</label>
                      <input style={inputStyle} value={locationForm.name} onChange={(event) => setLocationForm((current) => ({ ...current, name: event.target.value }))} placeholder="Main office" />
                    </div>
                    <div>
                      <label style={labelStyle}>Address</label>
                      <input style={inputStyle} value={locationForm.address} onChange={(event) => setLocationForm((current) => ({ ...current, address: event.target.value }))} placeholder="Tashkent City" />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={labelStyle}>Latitude</label>
                      <input style={inputStyle} value={locationForm.latitude} onChange={(event) => setLocationForm((current) => ({ ...current, latitude: event.target.value }))} placeholder="41.2995" />
                    </div>
                    <div>
                      <label style={labelStyle}>Longitude</label>
                      <input style={inputStyle} value={locationForm.longitude} onChange={(event) => setLocationForm((current) => ({ ...current, longitude: event.target.value }))} placeholder="69.2401" />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={labelStyle}>Geofence radius (m)</label>
                      <input style={inputStyle} type="number" value={locationForm.geofence_radius_meters} onChange={(event) => setLocationForm((current) => ({ ...current, geofence_radius_meters: event.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>QR rotation seconds</label>
                      <input style={inputStyle} type="number" value={locationForm.qr_rotation_seconds} onChange={(event) => setLocationForm((current) => ({ ...current, qr_rotation_seconds: event.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Allowed IP ranges</label>
                    <input style={inputStyle} value={locationForm.allowed_ip_ranges} onChange={(event) => setLocationForm((current) => ({ ...current, allowed_ip_ranges: event.target.value }))} placeholder="192.168.1.0/24,10.0.0.0/8" />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-primary)" }}>
                    <input type="checkbox" checked={locationForm.require_pin} onChange={(event) => setLocationForm((current) => ({ ...current, require_pin: event.target.checked }))} /> Require PIN if no session
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-primary)" }}>
                    <input type="checkbox" checked={locationForm.allow_remote_flag} onChange={(event) => setLocationForm((current) => ({ ...current, allow_remote_flag: event.target.checked }))} /> Allow remote scan but flag it
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-primary)" }}>
                    <input type="checkbox" checked={locationForm.is_active} onChange={(event) => setLocationForm((current) => ({ ...current, is_active: event.target.checked }))} /> Active location
                  </label>
                  <button type="button" style={primaryButtonStyle} onClick={() => void submitLocation()} disabled={submitting}>{submitting ? "Saving..." : "Save location"}</button>
                </>
              ) : null}

              {leaveModalOpen ? (
                <>
                  <div>
                    <label style={labelStyle}>Employee</label>
                    <select style={inputStyle} value={leaveForm.employee_id} onChange={(event) => setLeaveForm((current) => ({ ...current, employee_id: event.target.value }))}>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>{employee.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Leave type</label>
                    <select style={inputStyle} value={leaveForm.leave_type} onChange={(event) => setLeaveForm((current) => ({ ...current, leave_type: event.target.value }))}>
                      <option value="annual">Annual</option>
                      <option value="sick">Sick</option>
                      <option value="unpaid">Unpaid</option>
                      <option value="business_trip">Business trip</option>
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={labelStyle}>From</label>
                      <input style={inputStyle} type="date" value={leaveForm.date_from} onChange={(event) => setLeaveForm((current) => ({ ...current, date_from: event.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>To</label>
                      <input style={inputStyle} type="date" value={leaveForm.date_to} onChange={(event) => setLeaveForm((current) => ({ ...current, date_to: event.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Reason</label>
                    <textarea style={{ ...inputStyle, minHeight: "110px", resize: "vertical" }} value={leaveForm.reason} onChange={(event) => setLeaveForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Reason for leave" />
                  </div>
                  <button type="button" style={primaryButtonStyle} onClick={() => void submitLeave()} disabled={submitting}>{submitting ? "Saving..." : "Create leave request"}</button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
