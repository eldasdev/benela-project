"use client";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Users, UserCheck, UserMinus, Briefcase } from "lucide-react";
import { useIsMobile } from "@/lib/use-is-mobile";

const API = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? `/api` : "http://localhost:8000");

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: "9px",
  background: "var(--bg-elevated)", border: "1px solid var(--border-soft)",
  color: "var(--text-primary)", fontSize: "13px", outline: "none",
  fontFamily: "inherit",
};
const labelStyle = { fontSize: "11px", color: "var(--text-subtle)", marginBottom: "6px", display: "block" };

type Employee = {
  id: number; full_name: string; email: string; phone?: string;
  department: string; role: string; salary?: number;
  status: string; start_date: string;
};

type Position = {
  id: number; title: string; department: string;
  description?: string; salary_min?: number; salary_max?: number;
  status: string; opened_date: string;
};

type Summary = {
  total_employees: number; active: number;
  on_leave: number; open_positions: number;
};

const STATUS_COLOR: Record<string, string> = {
  active: "#34d399", on_leave: "#fbbf24", terminated: "#f87171",
  open: "#34d399", closed: "#f87171", on_hold: "#fbbf24",
};

const emptyEmp = { full_name: "", email: "", phone: "", department: "", role: "", salary: "", status: "active", notes: "" };
const emptyPos = { title: "", department: "", description: "", salary_min: "", salary_max: "", status: "open" };

export default function HRPage() {
  const isMobile = useIsMobile(900);
  const [tab, setTab]           = useState<"employees" | "positions">("employees");
  const [employees, setEmps]    = useState<Employee[]>([]);
  const [positions, setPos]     = useState<Position[]>([]);
  const [summary, setSummary]   = useState<Summary | null>(null);
  const [modal, setModal]       = useState<null | "add_emp" | "edit_emp" | "add_pos" | "edit_pos">(null);
  const [selected, setSelected] = useState<Employee | Position | null>(null);
  const [loading, setLoading]   = useState(false);
  const [empForm, setEmpForm]   = useState(emptyEmp);
  const [posForm, setPosForm]   = useState(emptyPos);

  const load = async () => {
    try {
      const [sRes, eRes, pRes] = await Promise.all([
        fetch(`${API}/hr/summary`),
        fetch(`${API}/hr/employees`),
        fetch(`${API}/hr/positions`),
      ]);
      const s = sRes.ok ? await sRes.json() : null;
      const e = eRes.ok ? await eRes.json() : [];
      const p = pRes.ok ? await pRes.json() : [];
      setSummary(s); setEmps(e); setPos(p);
    } catch (err) {
      console.error("Failed to load HR data:", err);
      setSummary(null); setEmps([]); setPos([]);
    }
  };

  useEffect(() => { load(); }, []);

  const openEditEmp = (emp: Employee) => {
    setSelected(emp);
    setEmpForm({ full_name: emp.full_name, email: emp.email, phone: emp.phone || "", department: emp.department, role: emp.role, salary: String(emp.salary || ""), status: emp.status, notes: "" });
    setModal("edit_emp");
  };

  const openEditPos = (pos: Position) => {
    setSelected(pos);
    setPosForm({ title: pos.title, department: pos.department, description: pos.description || "", salary_min: String(pos.salary_min || ""), salary_max: String(pos.salary_max || ""), status: pos.status });
    setModal("edit_pos");
  };

  const saveEmp = async () => {
    setLoading(true);
    const body = { ...empForm, salary: empForm.salary ? parseFloat(empForm.salary) : null };
    if (modal === "add_emp") {
      await fetch(`${API}/hr/employees`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      if (!selected) {
        setLoading(false);
        return;
      }
      await fetch(`${API}/hr/employees/${selected.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    await load(); setModal(null); setLoading(false);
  };

  const deleteEmp = async (id: number) => {
    if (!confirm("Delete this employee?")) return;
    await fetch(`${API}/hr/employees/${id}`, { method: "DELETE" });
    await load();
  };

  const savePos = async () => {
    setLoading(true);
    const body = { ...posForm, salary_min: posForm.salary_min ? parseFloat(posForm.salary_min) : null, salary_max: posForm.salary_max ? parseFloat(posForm.salary_max) : null };
    if (modal === "add_pos") {
      await fetch(`${API}/hr/positions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      if (!selected) {
        setLoading(false);
        return;
      }
      await fetch(`${API}/hr/positions/${selected.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    await load(); setModal(null); setLoading(false);
  };

  const deletePos = async (id: number) => {
    if (!confirm("Delete this position?")) return;
    await fetch(`${API}/hr/positions/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div style={{ padding: isMobile ? "12px" : "24px", maxWidth: "1200px", margin: "0 auto" }}>

      {/* KPI Cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4,1fr)", gap: "12px", marginBottom: "18px" }}>
          {[
            { label: "Total Employees",  value: summary.total_employees, icon: Users,     color: "#60a5fa" },
            { label: "Active",           value: summary.active,          icon: UserCheck, color: "#34d399" },
            { label: "On Leave",         value: summary.on_leave,        icon: UserMinus, color: "#fbbf24" },
            { label: "Open Positions",   value: summary.open_positions,  icon: Briefcase, color: "#a78bfa" },
          ].map(card => {
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

      {/* Tabs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "4px", marginBottom: "16px", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "10px", padding: "4px", width: isMobile ? "100%" : "fit-content", maxWidth: "100%" }}>
        {(["employees", "positions"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "7px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: 500, cursor: "pointer", border: "none", background: tab === t ? "var(--bg-elevated)" : "transparent", color: tab === t ? "var(--text-primary)" : "var(--text-subtle)", transition: "all 0.15s", minWidth: 0 }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "14px 12px" : "16px 20px", borderBottom: "1px solid var(--border-default)", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "3px", height: "16px", borderRadius: "2px", background: "var(--accent)" }} />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
              {tab === "employees" ? "Employees" : "Open Positions"}
            </span>
          </div>
          <button
            onClick={() => { setModal(tab === "employees" ? "add_emp" : "add_pos"); setEmpForm(emptyEmp); setPosForm(emptyPos); }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "7px 14px", borderRadius: "9px", background: "var(--accent)", border: "none", color: "white", fontSize: "13px", fontWeight: 500, cursor: "pointer", width: isMobile ? "100%" : "auto" }}>
            <Plus size={14} /> Add {tab === "employees" ? "Employee" : "Position"}
          </button>
        </div>

        {/* Employees */}
        {tab === "employees" && (
          <>
            {isMobile ? (
              <div style={{ display: "grid", gap: "10px", padding: "12px" }}>
                {employees.map((emp) => (
                  <div
                    key={emp.id}
                    style={{
                      border: "1px solid var(--border-default)",
                      borderRadius: "12px",
                      background: "color-mix(in srgb, var(--bg-panel) 90%, var(--bg-surface) 10%)",
                      padding: "10px",
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>{emp.full_name}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "2px", wordBreak: "break-word" }}>{emp.email}</div>
                      </div>
                      <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "7px", background: `${STATUS_COLOR[emp.status] || "var(--text-muted)"}12`, color: STATUS_COLOR[emp.status] || "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content" }}>
                        <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[emp.status], flexShrink: 0 }} />{emp.status.replace("_", " ")}
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "8px", fontSize: "12px", color: "var(--text-subtle)" }}>
                      <span>Department: {emp.department}</span>
                      <span>Role: {emp.role}</span>
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
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.5fr 1fr 1fr 0.8fr 80px", padding: "10px 20px", background: "var(--bg-panel)", borderBottom: "1px solid var(--border-soft)" }}>
                  {["Name", "Email", "Department", "Role", "Status", ""].map(h => (
                    <span key={h} style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>{h}</span>
                  ))}
                </div>
                {employees.map((emp, i) => (
                  <div key={emp.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1.5fr 1fr 1fr 0.8fr 80px", padding: "13px 20px", borderBottom: i < employees.length - 1 ? "1px solid var(--table-row-divider)" : "none", transition: "background 0.1s", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                    <span style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: 500 }}>{emp.full_name}</span>
                    <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{emp.email}</span>
                    <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{emp.department}</span>
                    <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{emp.role}</span>
                    <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: `${STATUS_COLOR[emp.status] || "var(--text-muted)"}12`, color: STATUS_COLOR[emp.status] || "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content" }}>
                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[emp.status], flexShrink: 0 }} />{emp.status.replace("_", " ")}
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
            )}
          </>
        )}

        {/* Positions */}
        {tab === "positions" && (
          <>
            {isMobile ? (
              <div style={{ display: "grid", gap: "10px", padding: "12px" }}>
                {positions.map((pos) => (
                  <div
                    key={pos.id}
                    style={{
                      border: "1px solid var(--border-default)",
                      borderRadius: "12px",
                      background: "color-mix(in srgb, var(--bg-panel) 90%, var(--bg-surface) 10%)",
                      padding: "10px",
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                      <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>{pos.title}</div>
                      <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "7px", background: `${STATUS_COLOR[pos.status] || "var(--text-muted)"}12`, color: STATUS_COLOR[pos.status] || "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content" }}>
                        <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[pos.status], flexShrink: 0 }} />{pos.status.replace("_", " ")}
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
                  {["Title", "Department", "Salary Min", "Salary Max", "Status", ""].map(h => (
                    <span key={h} style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>{h}</span>
                  ))}
                </div>
                {positions.map((pos, i) => (
                  <div key={pos.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 0.8fr 80px", padding: "13px 20px", borderBottom: i < positions.length - 1 ? "1px solid var(--table-row-divider)" : "none", transition: "background 0.1s", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                    <span style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: 500 }}>{pos.title}</span>
                    <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{pos.department}</span>
                    <span style={{ fontSize: "13px", color: "#34d399" }}>{pos.salary_min ? `$${pos.salary_min.toLocaleString()}` : "—"}</span>
                    <span style={{ fontSize: "13px", color: "#34d399" }}>{pos.salary_max ? `$${pos.salary_max.toLocaleString()}` : "—"}</span>
                    <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: `${STATUS_COLOR[pos.status] || "var(--text-muted)"}12`, color: STATUS_COLOR[pos.status] || "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content" }}>
                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[pos.status], flexShrink: 0 }} />{pos.status.replace("_", " ")}
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
          </>
        )}
      </div>

      {/* Modals */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "var(--overlay-backdrop)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "10px" : "18px" }} onClick={() => setModal(null)}>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "16px", padding: isMobile ? "16px 14px" : "28px", width: isMobile ? "100%" : "480px", maxWidth: "90vw", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                {modal === "add_emp" ? "Add Employee" : modal === "edit_emp" ? "Edit Employee" : modal === "add_pos" ? "Add Position" : "Edit Position"}
              </h2>
              <button onClick={() => setModal(null)} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={13} color="var(--text-muted)" />
              </button>
            </div>

            {/* Employee form */}
            {(modal === "add_emp" || modal === "edit_emp") && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Full Name</label>
                    <input style={inputStyle} value={empForm.full_name} onChange={e => setEmpForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Jane Smith" />
                  </div>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input style={inputStyle} value={empForm.email} onChange={e => setEmpForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@benela.dev" />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Department</label>
                    <input style={inputStyle} value={empForm.department} onChange={e => setEmpForm(f => ({ ...f, department: e.target.value }))} placeholder="Engineering" />
                  </div>
                  <div>
                    <label style={labelStyle}>Role</label>
                    <input style={inputStyle} value={empForm.role} onChange={e => setEmpForm(f => ({ ...f, role: e.target.value }))} placeholder="Senior Engineer" />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Salary ($)</label>
                    <input style={inputStyle} type="number" value={empForm.salary} onChange={e => setEmpForm(f => ({ ...f, salary: e.target.value }))} placeholder="80000" />
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select style={inputStyle} value={empForm.status} onChange={e => setEmpForm(f => ({ ...f, status: e.target.value }))}>
                      <option value="active">Active</option>
                      <option value="on_leave">On Leave</option>
                      <option value="terminated">Terminated</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Phone (optional)</label>
                  <input style={inputStyle} value={empForm.phone} onChange={e => setEmpForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000" />
                </div>
              </div>
            )}

            {/* Position form */}
            {(modal === "add_pos" || modal === "edit_pos") && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={labelStyle}>Job Title</label>
                  <input style={inputStyle} value={posForm.title} onChange={e => setPosForm(f => ({ ...f, title: e.target.value }))} placeholder="Senior Backend Engineer" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Department</label>
                    <input style={inputStyle} value={posForm.department} onChange={e => setPosForm(f => ({ ...f, department: e.target.value }))} placeholder="Engineering" />
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select style={inputStyle} value={posForm.status} onChange={e => setPosForm(f => ({ ...f, status: e.target.value }))}>
                      <option value="open">Open</option>
                      <option value="on_hold">On Hold</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Salary Min ($)</label>
                    <input style={inputStyle} type="number" value={posForm.salary_min} onChange={e => setPosForm(f => ({ ...f, salary_min: e.target.value }))} placeholder="70000" />
                  </div>
                  <div>
                    <label style={labelStyle}>Salary Max ($)</label>
                    <input style={inputStyle} type="number" value={posForm.salary_max} onChange={e => setPosForm(f => ({ ...f, salary_max: e.target.value }))} placeholder="100000" />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Description</label>
                  <input style={inputStyle} value={posForm.description} onChange={e => setPosForm(f => ({ ...f, description: e.target.value }))} placeholder="Key requirements and responsibilities..." />
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", marginTop: "24px", justifyContent: "flex-end", flexDirection: isMobile ? "column-reverse" : "row" }}>
              <button onClick={() => setModal(null)} style={{ padding: "9px 18px", borderRadius: "9px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-muted)", fontSize: "13px", cursor: "pointer", width: isMobile ? "100%" : "auto" }}>
                Cancel
              </button>
              <button onClick={modal?.includes("emp") ? saveEmp : savePos} disabled={loading}
                style={{ padding: "9px 20px", borderRadius: "9px", background: "var(--accent)", border: "none", color: "white", fontSize: "13px", fontWeight: 500, cursor: "pointer", opacity: loading ? 0.6 : 1, width: isMobile ? "100%" : "auto" }}>
                {loading ? "Saving..." : modal?.startsWith("add") ? "Add" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
