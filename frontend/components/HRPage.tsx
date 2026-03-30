"use client";

import { useEffect, useMemo, useState } from "react";
import { Briefcase, BriefcaseBusiness, CalendarClock, Pencil, Plus, ReceiptText, Trash2, Users, UserCheck, UserMinus, X } from "lucide-react";
import { useIsMobile } from "@/lib/use-is-mobile";
import { authFetch } from "@/lib/auth-fetch";
import AttendanceDashboard from "@/components/hr/AttendanceDashboard";
import PayrollView from "@/components/hr/PayrollView";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "9px",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-soft)",
  color: "var(--text-primary)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
} as const;

const labelStyle = {
  fontSize: "11px",
  color: "var(--text-subtle)",
  marginBottom: "6px",
  display: "block",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontFamily: "monospace",
} as const;

export type Employee = {
  id: number;
  full_name: string;
  email: string;
  phone?: string | null;
  department: string;
  role: string;
  salary?: number | null;
  shift_start?: string | null;
  shift_end?: string | null;
  late_grace_minutes: number;
  hourly_rate?: number | null;
  contract_type: string;
  work_days: number[];
  device_fingerprint?: string | null;
  status: string;
  start_date: string;
};

type Position = {
  id: number;
  title: string;
  department: string;
  description?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  status: string;
  opened_date: string;
};

type Summary = {
  total_employees: number;
  active: number;
  on_leave: number;
  open_positions: number;
};

type Tab = "attendance" | "payroll" | "employees" | "positions";

const STATUS_COLOR: Record<string, string> = {
  active: "#34d399",
  on_leave: "#fbbf24",
  terminated: "#f87171",
  open: "#34d399",
  closed: "#f87171",
  on_hold: "#fbbf24",
};

const emptyEmp = {
  full_name: "",
  email: "",
  phone: "",
  department: "",
  role: "",
  salary: "",
  employee_pin: "",
  shift_start: "09:00",
  shift_end: "18:00",
  late_grace_minutes: "15",
  hourly_rate: "",
  contract_type: "monthly",
  work_days: "1,2,3,4,5",
  status: "active",
  notes: "",
};

const emptyPos = {
  title: "",
  department: "",
  description: "",
  salary_min: "",
  salary_max: "",
  status: "open",
};

function parseWorkDays(value: string): number[] {
  const items = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= 7);
  return Array.from(new Set(items)).sort((left, right) => left - right);
}

function formatTimeField(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 5);
}

function buildEmployeePayload(form: typeof emptyEmp, isEdit = false) {
  const payload: Record<string, unknown> = {
    full_name: form.full_name,
    email: form.email,
    phone: form.phone || null,
    department: form.department,
    role: form.role,
    salary: form.salary ? Number(form.salary) : null,
    shift_start: form.shift_start || null,
    shift_end: form.shift_end || null,
    late_grace_minutes: Number(form.late_grace_minutes || 15),
    hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
    contract_type: form.contract_type,
    work_days: parseWorkDays(form.work_days),
    status: form.status,
    notes: form.notes || null,
  };
  if (form.employee_pin.trim()) {
    payload.employee_pin = form.employee_pin.trim();
  } else if (!isEdit) {
    payload.employee_pin = null;
  }
  return payload;
}

export default function HRPage() {
  const isMobile = useIsMobile(900);
  const [tab, setTab] = useState<Tab>("attendance");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [modal, setModal] = useState<null | "add_emp" | "edit_emp" | "add_pos" | "edit_pos">(null);
  const [selected, setSelected] = useState<Employee | Position | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [empForm, setEmpForm] = useState(emptyEmp);
  const [posForm, setPosForm] = useState(emptyPos);

  const load = async () => {
    try {
      setLoadError(null);
      const [sRes, eRes, pRes] = await Promise.all([
        authFetch(`${API}/hr/summary`),
        authFetch(`${API}/hr/employees`),
        authFetch(`${API}/hr/positions`),
      ]);
      const s = sRes.ok ? await sRes.json() : null;
      const e = eRes.ok ? await eRes.json() : [];
      const p = pRes.ok ? await pRes.json() : [];
      setSummary(s);
      setEmployees(e);
      setPositions(p);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load HR workspace.");
      setSummary(null);
      setEmployees([]);
      setPositions([]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openEditEmp = (emp: Employee) => {
    setSelected(emp);
    setEmpForm({
      full_name: emp.full_name,
      email: emp.email,
      phone: emp.phone || "",
      department: emp.department,
      role: emp.role,
      salary: emp.salary != null ? String(emp.salary) : "",
      employee_pin: "",
      shift_start: formatTimeField(emp.shift_start),
      shift_end: formatTimeField(emp.shift_end),
      late_grace_minutes: String(emp.late_grace_minutes || 15),
      hourly_rate: emp.hourly_rate != null ? String(emp.hourly_rate) : "",
      contract_type: emp.contract_type || "monthly",
      work_days: Array.isArray(emp.work_days) && emp.work_days.length ? emp.work_days.join(",") : "1,2,3,4,5",
      status: emp.status,
      notes: "",
    });
    setModal("edit_emp");
  };

  const openEditPos = (pos: Position) => {
    setSelected(pos);
    setPosForm({
      title: pos.title,
      department: pos.department,
      description: pos.description || "",
      salary_min: pos.salary_min != null ? String(pos.salary_min) : "",
      salary_max: pos.salary_max != null ? String(pos.salary_max) : "",
      status: pos.status,
    });
    setModal("edit_pos");
  };

  const saveEmp = async () => {
    setLoading(true);
    try {
      const body = buildEmployeePayload(empForm, modal === "edit_emp");
      if (modal === "add_emp") {
        await authFetch(`${API}/hr/employees`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        if (!selected) {
          setLoading(false);
          return;
        }
        await authFetch(`${API}/hr/employees/${selected.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      await load();
      setModal(null);
    } finally {
      setLoading(false);
    }
  };

  const deleteEmp = async (id: number) => {
    if (!confirm("Delete this employee?")) return;
    await authFetch(`${API}/hr/employees/${id}`, { method: "DELETE" });
    await load();
  };

  const savePos = async () => {
    setLoading(true);
    try {
      const body = {
        ...posForm,
        salary_min: posForm.salary_min ? parseFloat(posForm.salary_min) : null,
        salary_max: posForm.salary_max ? parseFloat(posForm.salary_max) : null,
      };
      if (modal === "add_pos") {
        await authFetch(`${API}/hr/positions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        if (!selected) {
          setLoading(false);
          return;
        }
        await authFetch(`${API}/hr/positions/${selected.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      await load();
      setModal(null);
    } finally {
      setLoading(false);
    }
  };

  const deletePos = async (id: number) => {
    if (!confirm("Delete this position?")) return;
    await authFetch(`${API}/hr/positions/${id}`, { method: "DELETE" });
    await load();
  };

  const tabs = useMemo(
    () => [
      { id: "attendance" as const, label: "Attendance", icon: CalendarClock },
      { id: "payroll" as const, label: "Payroll", icon: ReceiptText },
      { id: "employees" as const, label: "Employees", icon: Users },
      { id: "positions" as const, label: "Positions", icon: BriefcaseBusiness },
    ],
    [],
  );

  const showCrudSurface = tab === "employees" || tab === "positions";

  return (
    <div style={{ padding: isMobile ? "12px" : "24px", maxWidth: "1240px", margin: "0 auto" }}>
      {loadError ? (
        <div style={{ marginBottom: "16px", padding: "14px 16px", borderRadius: "12px", border: "1px solid color-mix(in srgb, var(--danger) 40%, var(--border-default) 60%)", background: "color-mix(in srgb, var(--danger) 8%, var(--bg-surface) 92%)", color: "var(--danger)" }}>
          {loadError}
        </div>
      ) : null}

      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4,1fr)", gap: "12px", marginBottom: "18px" }}>
          {[
            { label: "Total Employees", value: summary.total_employees, icon: Users, color: "#60a5fa" },
            { label: "Active", value: summary.active, icon: UserCheck, color: "#34d399" },
            { label: "On Leave", value: summary.on_leave, icon: UserMinus, color: "#fbbf24" },
            { label: "Open Positions", value: summary.open_positions, icon: Briefcase, color: "#a78bfa" },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: isMobile ? "14px 12px" : "18px 20px", position: "relative", overflow: "hidden", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <p style={{ fontSize: "11px", color: "var(--text-subtle)" }}>{card.label}</p>
                  <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: `${card.color}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={14} color={card.color} />
                  </div>
                </div>
                <p style={{ fontSize: isMobile ? "20px" : "28px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.1 }}>{card.value}</p>
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "1px", background: `linear-gradient(90deg, transparent, ${card.color}40, transparent)` }} />
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`, gap: "4px", marginBottom: "16px", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "10px", padding: "4px", width: isMobile ? "100%" : "fit-content", maxWidth: "100%" }}>
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{ padding: "8px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: 500, cursor: "pointer", border: "none", background: tab === item.id ? "var(--bg-elevated)" : "transparent", color: tab === item.id ? "var(--text-primary)" : "var(--text-subtle)", transition: "all 0.15s", minWidth: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
            >
              <Icon size={14} /> {item.label}
            </button>
          );
        })}
      </div>

      {tab === "attendance" ? (
        <AttendanceDashboard employees={employees.map((employee) => ({ id: employee.id, full_name: employee.full_name, department: employee.department, role: employee.role, status: employee.status }))} />
      ) : tab === "payroll" ? (
        <PayrollView />
      ) : (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "14px 12px" : "16px 20px", borderBottom: "1px solid var(--border-default)", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "3px", height: "16px", borderRadius: "2px", background: "var(--accent)" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                {tab === "employees" ? "Employees" : "Open Positions"}
              </span>
            </div>
            <button
              onClick={() => {
                setModal(tab === "employees" ? "add_emp" : "add_pos");
                setEmpForm(emptyEmp);
                setPosForm(emptyPos);
              }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "7px 14px", borderRadius: "9px", background: "var(--accent)", border: "none", color: "white", fontSize: "13px", fontWeight: 500, cursor: "pointer", width: isMobile ? "100%" : "auto" }}
            >
              <Plus size={14} /> Add {tab === "employees" ? "Employee" : "Position"}
            </button>
          </div>

          {tab === "employees" ? (
            isMobile ? (
              <div style={{ display: "grid", gap: "10px", padding: "12px" }}>
                {employees.map((emp) => (
                  <div key={emp.id} style={{ border: "1px solid var(--border-default)", borderRadius: "12px", background: "color-mix(in srgb, var(--bg-panel) 90%, var(--bg-surface) 10%)", padding: "10px", display: "grid", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>{emp.full_name}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "2px", wordBreak: "break-word" }}>{emp.email}</div>
                      </div>
                      <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "7px", background: `${STATUS_COLOR[emp.status] || "var(--text-muted)"}12`, color: STATUS_COLOR[emp.status] || "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content" }}>
                        <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[emp.status] || "var(--text-muted)", flexShrink: 0 }} />{emp.status.replace("_", " ")}
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px", fontSize: "12px", color: "var(--text-subtle)" }}>
                      <span>Department: {emp.department}</span>
                      <span>Role: {emp.role}</span>
                      <span>Shift: {formatTimeField(emp.shift_start) || "09:00"} - {formatTimeField(emp.shift_end) || "18:00"}</span>
                      <span>Contract: {emp.contract_type}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                      <button onClick={() => openEditEmp(emp)} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Pencil size={12} color="var(--text-muted)" />
                      </button>
                      <button onClick={() => deleteEmp(emp.id)} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Trash2 size={12} color="var(--danger)" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.3fr 1fr 1fr 0.8fr 90px", padding: "10px 20px", background: "var(--bg-panel)", borderBottom: "1px solid var(--border-soft)" }}>
                  {["Name", "Email", "Department", "Shift / Contract", "Status", ""].map((header) => (
                    <span key={header} style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>{header}</span>
                  ))}
                </div>
                {employees.map((emp, index) => (
                  <div key={emp.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.3fr 1fr 1fr 0.8fr 90px", padding: "13px 20px", borderBottom: index < employees.length - 1 ? "1px solid var(--table-row-divider)" : "none", transition: "background 0.1s" }}>
                    <div>
                      <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>{emp.full_name}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "2px" }}>{emp.role}</div>
                    </div>
                    <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{emp.email}</span>
                    <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{emp.department}</span>
                    <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{formatTimeField(emp.shift_start) || "09:00"}-{formatTimeField(emp.shift_end) || "18:00"} · {emp.contract_type}</span>
                    <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: `${STATUS_COLOR[emp.status] || "var(--text-muted)"}12`, color: STATUS_COLOR[emp.status] || "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content" }}>
                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[emp.status] || "var(--text-muted)", flexShrink: 0 }} />{emp.status.replace("_", " ")}
                    </span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button onClick={() => openEditEmp(emp)} style={{ width: "26px", height: "26px", borderRadius: "7px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Pencil size={11} color="var(--text-muted)" />
                      </button>
                      <button onClick={() => deleteEmp(emp.id)} style={{ width: "26px", height: "26px", borderRadius: "7px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Trash2 size={11} color="var(--danger)" />
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )
          ) : isMobile ? (
            <div style={{ display: "grid", gap: "10px", padding: "12px" }}>
              {positions.map((pos) => (
                <div key={pos.id} style={{ border: "1px solid var(--border-default)", borderRadius: "12px", background: "color-mix(in srgb, var(--bg-panel) 90%, var(--bg-surface) 10%)", padding: "10px", display: "grid", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                    <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>{pos.title}</div>
                    <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "7px", background: `${STATUS_COLOR[pos.status] || "var(--text-muted)"}12`, color: STATUS_COLOR[pos.status] || "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content" }}>
                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[pos.status] || "var(--text-muted)", flexShrink: 0 }} />{pos.status.replace("_", " ")}
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Department: {pos.department}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "8px", fontSize: "12px", color: "#34d399" }}>
                    <span>Min: {pos.salary_min ? `$${pos.salary_min.toLocaleString()}` : "—"}</span>
                    <span>Max: {pos.salary_max ? `$${pos.salary_max.toLocaleString()}` : "—"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                    <button onClick={() => openEditPos(pos)} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Pencil size={12} color="var(--text-muted)" />
                    </button>
                    <button onClick={() => deletePos(pos.id)} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Trash2 size={12} color="var(--danger)" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 0.8fr 80px", padding: "10px 20px", background: "var(--bg-panel)", borderBottom: "1px solid var(--border-soft)" }}>
                {["Title", "Department", "Salary Min", "Salary Max", "Status", ""].map((header) => (
                  <span key={header} style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>{header}</span>
                ))}
              </div>
              {positions.map((pos, index) => (
                <div key={pos.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 0.8fr 80px", padding: "13px 20px", borderBottom: index < positions.length - 1 ? "1px solid var(--table-row-divider)" : "none" }}>
                  <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>{pos.title}</span>
                  <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{pos.department}</span>
                  <span style={{ fontSize: "13px", color: "#34d399" }}>{pos.salary_min ? `$${pos.salary_min.toLocaleString()}` : "—"}</span>
                  <span style={{ fontSize: "13px", color: "#34d399" }}>{pos.salary_max ? `$${pos.salary_max.toLocaleString()}` : "—"}</span>
                  <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: `${STATUS_COLOR[pos.status] || "var(--text-muted)"}12`, color: STATUS_COLOR[pos.status] || "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content" }}>
                    <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[pos.status] || "var(--text-muted)", flexShrink: 0 }} />{pos.status.replace("_", " ")}
                  </span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => openEditPos(pos)} style={{ width: "26px", height: "26px", borderRadius: "7px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Pencil size={11} color="var(--text-muted)" />
                    </button>
                    <button onClick={() => deletePos(pos.id)} style={{ width: "26px", height: "26px", borderRadius: "7px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Trash2 size={11} color="var(--danger)" />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {modal && showCrudSurface ? (
        <div style={{ position: "fixed", inset: 0, background: "var(--overlay-backdrop)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "10px" : "18px" }} onClick={() => setModal(null)}>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "16px", padding: isMobile ? "16px 14px" : "28px", width: isMobile ? "100%" : "560px", maxWidth: "92vw", maxHeight: "92vh", overflowY: "auto" }} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                {modal === "add_emp" ? "Add Employee" : modal === "edit_emp" ? "Edit Employee" : modal === "add_pos" ? "Add Position" : "Edit Position"}
              </h2>
              <button onClick={() => setModal(null)} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={13} color="var(--text-muted)" />
              </button>
            </div>

            {(modal === "add_emp" || modal === "edit_emp") ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Full name</label>
                    <input style={inputStyle} value={empForm.full_name} onChange={(event) => setEmpForm((current) => ({ ...current, full_name: event.target.value }))} placeholder="Jasur Karimov" />
                  </div>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input style={inputStyle} value={empForm.email} onChange={(event) => setEmpForm((current) => ({ ...current, email: event.target.value }))} placeholder="jasur@benela.dev" />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Department</label>
                    <input style={inputStyle} value={empForm.department} onChange={(event) => setEmpForm((current) => ({ ...current, department: event.target.value }))} placeholder="Engineering" />
                  </div>
                  <div>
                    <label style={labelStyle}>Role</label>
                    <input style={inputStyle} value={empForm.role} onChange={(event) => setEmpForm((current) => ({ ...current, role: event.target.value }))} placeholder="Senior Developer" />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Salary (UZS)</label>
                    <input style={inputStyle} type="number" value={empForm.salary} onChange={(event) => setEmpForm((current) => ({ ...current, salary: event.target.value }))} placeholder="3500000" />
                  </div>
                  <div>
                    <label style={labelStyle}>Hourly rate (optional)</label>
                    <input style={inputStyle} type="number" value={empForm.hourly_rate} onChange={(event) => setEmpForm((current) => ({ ...current, hourly_rate: event.target.value }))} placeholder="25000" />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Shift start</label>
                    <input style={inputStyle} type="time" value={empForm.shift_start} onChange={(event) => setEmpForm((current) => ({ ...current, shift_start: event.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Shift end</label>
                    <input style={inputStyle} type="time" value={empForm.shift_end} onChange={(event) => setEmpForm((current) => ({ ...current, shift_end: event.target.value }))} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Grace minutes</label>
                    <input style={inputStyle} type="number" value={empForm.late_grace_minutes} onChange={(event) => setEmpForm((current) => ({ ...current, late_grace_minutes: event.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Contract type</label>
                    <select style={inputStyle} value={empForm.contract_type} onChange={(event) => setEmpForm((current) => ({ ...current, contract_type: event.target.value }))}>
                      <option value="monthly">Monthly</option>
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select style={inputStyle} value={empForm.status} onChange={(event) => setEmpForm((current) => ({ ...current, status: event.target.value }))}>
                      <option value="active">Active</option>
                      <option value="on_leave">On Leave</option>
                      <option value="terminated">Terminated</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Work days</label>
                    <input style={inputStyle} value={empForm.work_days} onChange={(event) => setEmpForm((current) => ({ ...current, work_days: event.target.value }))} placeholder="1,2,3,4,5" />
                  </div>
                  <div>
                    <label style={labelStyle}>{modal === "edit_emp" ? "New PIN (optional)" : "Employee PIN"}</label>
                    <input style={inputStyle} value={empForm.employee_pin} onChange={(event) => setEmpForm((current) => ({ ...current, employee_pin: event.target.value }))} placeholder={modal === "edit_emp" ? "Leave blank to keep existing PIN" : "1234"} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Phone (optional)</label>
                  <input style={inputStyle} value={empForm.phone} onChange={(event) => setEmpForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+998 90 123 45 67" />
                </div>
              </div>
            ) : null}

            {(modal === "add_pos" || modal === "edit_pos") ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={labelStyle}>Job title</label>
                  <input style={inputStyle} value={posForm.title} onChange={(event) => setPosForm((current) => ({ ...current, title: event.target.value }))} placeholder="Senior Backend Engineer" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Department</label>
                    <input style={inputStyle} value={posForm.department} onChange={(event) => setPosForm((current) => ({ ...current, department: event.target.value }))} placeholder="Engineering" />
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select style={inputStyle} value={posForm.status} onChange={(event) => setPosForm((current) => ({ ...current, status: event.target.value }))}>
                      <option value="open">Open</option>
                      <option value="on_hold">On Hold</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Salary min</label>
                    <input style={inputStyle} type="number" value={posForm.salary_min} onChange={(event) => setPosForm((current) => ({ ...current, salary_min: event.target.value }))} placeholder="7000000" />
                  </div>
                  <div>
                    <label style={labelStyle}>Salary max</label>
                    <input style={inputStyle} type="number" value={posForm.salary_max} onChange={(event) => setPosForm((current) => ({ ...current, salary_max: event.target.value }))} placeholder="12000000" />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea style={{ ...inputStyle, minHeight: "110px", resize: "vertical" }} value={posForm.description} onChange={(event) => setPosForm((current) => ({ ...current, description: event.target.value }))} placeholder="Responsibilities and requirements" />
                </div>
              </div>
            ) : null}

            <div style={{ display: "flex", gap: "10px", marginTop: "24px", justifyContent: "flex-end", flexDirection: isMobile ? "column-reverse" : "row" }}>
              <button onClick={() => setModal(null)} style={{ padding: "9px 18px", borderRadius: "9px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-muted)", fontSize: "13px", cursor: "pointer", width: isMobile ? "100%" : "auto" }}>
                Cancel
              </button>
              <button onClick={modal?.includes("emp") ? saveEmp : savePos} disabled={loading} style={{ padding: "9px 20px", borderRadius: "9px", background: "var(--accent)", border: "none", color: "white", fontSize: "13px", fontWeight: 500, cursor: "pointer", opacity: loading ? 0.6 : 1, width: isMobile ? "100%" : "auto" }}>
                {loading ? "Saving..." : modal?.startsWith("add") ? "Add" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
