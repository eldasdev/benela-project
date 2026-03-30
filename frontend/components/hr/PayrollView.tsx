"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCheck, Download, Pencil, ReceiptText, RefreshCcw, WalletCards, X } from "lucide-react";
import {
  adjustPayrollRecord,
  approvePayroll,
  calculatePayroll,
  exportPayroll,
  fetchPayroll,
  formatHourValue,
  formatUzAmount,
  type CompanyPayrollSummary,
  type PayrollRecord,
} from "@/lib/attendance";
import { useIsMobile } from "@/lib/use-is-mobile";

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

const statusColor = (status: string) => {
  if (status === "approved") return "#34d399";
  if (status === "paid") return "#94a3b8";
  return "#fbbf24";
};

const monthOptions = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(2026, index, 1)),
}));

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function PayrollView() {
  const isMobile = useIsMobile(900);
  const now = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [summary, setSummary] = useState<CompanyPayrollSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [adjustingRecord, setAdjustingRecord] = useState<PayrollRecord | null>(null);
  const [breakdownRecord, setBreakdownRecord] = useState<PayrollRecord | null>(null);
  const [adjustForm, setAdjustForm] = useState({ bonus: "0", manual_penalty: "0", adjustment_note: "" });

  const draftIds = useMemo(() => records.filter((row) => row.status === "draft").map((row) => row.id), [records]);

  const loadRecords = useCallback(async () => {
    setError(null);
    try {
      const rows = await fetchPayroll(month, year);
      setRecords(rows);
      if (rows.length) {
        setSummary({
          records: rows,
          total_gross: rows.reduce((sum, row) => sum + row.gross_salary, 0),
          total_net: rows.reduce((sum, row) => sum + row.net_salary, 0),
          total_inps: rows.reduce((sum, row) => sum + row.inps_employee, 0),
          total_jshdssh: rows.reduce((sum, row) => sum + row.jshdssh, 0),
          total_deductions: rows.reduce((sum, row) => sum + row.total_deductions, 0),
          employee_count: rows.length,
          calculation_warnings: [],
        });
      } else {
        setSummary(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load payroll records.");
      setRecords([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const calculateCurrentPayroll = async () => {
    setCalculating(true);
    setError(null);
    try {
      const response = await calculatePayroll(month, year);
      setSummary(response);
      setRecords(response.records);
      setSelectedIds(response.records.filter((row) => row.status === "draft").map((row) => row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not calculate payroll.");
    } finally {
      setCalculating(false);
      setLoading(false);
    }
  };

  const approveSelected = async (ids: number[]) => {
    if (!ids.length) return;
    try {
      await approvePayroll(ids);
      await loadRecords();
      setSelectedIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve payroll.");
    }
  };

  const saveAdjustment = async () => {
    if (!adjustingRecord) return;
    try {
      await adjustPayrollRecord(adjustingRecord.id, {
        bonus: Number(adjustForm.bonus || 0),
        manual_penalty: Number(adjustForm.manual_penalty || 0),
        adjustment_note: adjustForm.adjustment_note || undefined,
      });
      setAdjustingRecord(null);
      await loadRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not adjust payroll record.");
    }
  };

  const totals = useMemo(() => ({
    gross: records.reduce((sum, row) => sum + row.gross_salary, 0),
    inps: records.reduce((sum, row) => sum + row.inps_employee, 0),
    jshdssh: records.reduce((sum, row) => sum + row.jshdssh, 0),
    net: records.reduce((sum, row) => sum + row.net_salary, 0),
  }), [records]);

  const toggleSelection = (payrollId: number) => {
    setSelectedIds((current) => current.includes(payrollId) ? current.filter((value) => value !== payrollId) : [...current, payrollId]);
  };

  const openAdjustModal = (row: PayrollRecord) => {
    setAdjustingRecord(row);
    setAdjustForm({
      bonus: String(row.bonus || 0),
      manual_penalty: String(row.manual_penalty || 0),
      adjustment_note: row.adjustment_note || "",
    });
  };

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      {error ? (
        <div style={{ ...cardStyle, padding: "14px 16px", color: "var(--danger)", borderColor: "color-mix(in srgb, var(--danger) 40%, var(--border-default) 60%)" }}>
          {error}
        </div>
      ) : null}

      <div style={cardStyle}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border-default)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "20px", color: "var(--text-primary)", fontWeight: 700 }}>Monthly payroll</div>
            <div style={{ fontSize: "13px", color: "var(--text-subtle)", marginTop: "4px" }}>Calculate, review, approve, and export payroll from attendance records.</div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" style={buttonStyle} onClick={() => void loadRecords()}>
              <RefreshCcw size={14} /> Refresh
            </button>
            <button type="button" style={buttonStyle} onClick={() => void exportPayroll(month, year)}>
              <Download size={14} /> Export Excel
            </button>
            <button type="button" style={primaryButtonStyle} onClick={() => void calculateCurrentPayroll()} disabled={calculating}>
              <ReceiptText size={14} /> {calculating ? "Calculating..." : "Calculate payroll"}
            </button>
          </div>
        </div>
        <div style={{ padding: "14px 18px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "180px 140px 1fr", gap: "10px", borderBottom: "1px solid var(--border-default)" }}>
          <div>
            <label style={labelStyle}>Month</label>
            <select style={inputStyle} value={month} onChange={(event) => setMonth(Number(event.target.value))}>
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Year</label>
            <input style={inputStyle} type="number" min={2024} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value || now.getFullYear()))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: "10px" }}>
            {[
              { label: "Gross total", value: formatUzAmount(summary?.total_gross ?? totals.gross), icon: WalletCards, color: "#60a5fa" },
              { label: "Net total", value: formatUzAmount(summary?.total_net ?? totals.net), icon: CheckCheck, color: "#34d399" },
              { label: "INPS", value: formatUzAmount(summary?.total_inps ?? totals.inps), icon: ReceiptText, color: "#fbbf24" },
              { label: "JShDSh", value: formatUzAmount(summary?.total_jshdssh ?? totals.jshdssh), icon: ReceiptText, color: "#f87171" },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} style={{ padding: "12px", borderRadius: "12px", background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>{card.label}</span>
                    <Icon size={14} color={card.color} />
                  </div>
                  <div style={{ fontSize: "18px", color: "var(--text-primary)", fontWeight: 700, marginTop: "8px" }}>{card.value}</div>
                </div>
              );
            })}
          </div>
        </div>
        {summary?.calculation_warnings?.length ? (
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-default)", display: "grid", gap: "6px" }}>
            {summary.calculation_warnings.map((warning) => (
              <div key={warning} style={{ fontSize: "12px", color: "#fbbf24" }}>{warning}</div>
            ))}
          </div>
        ) : null}

        {loading ? (
          <div style={{ padding: "16px 18px", color: "var(--text-subtle)" }}>Loading payroll records...</div>
        ) : records.length ? (
          <div style={{ padding: isMobile ? "12px" : "0" }}>
            {isMobile ? (
              <div style={{ display: "grid", gap: "10px" }}>
                {records.map((row) => (
                  <div key={row.id} style={{ padding: "12px", border: `1px solid ${statusColor(row.status)}55`, borderRadius: "12px", background: "color-mix(in srgb, var(--bg-panel) 88%, var(--bg-surface) 12%)", display: "grid", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>{row.employee_name}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "2px" }}>{row.department || row.position || "—"}</div>
                      </div>
                      <div style={{ fontSize: "11px", color: statusColor(row.status), fontWeight: 700, textTransform: "uppercase" }}>{row.status}</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px", fontSize: "12px", color: "var(--text-subtle)" }}>
                      <span>Days: {row.days_worked}/{row.working_days_in_month}</span>
                      <span>Hours: {formatHourValue(row.total_hours_worked)}</span>
                      <span>OT: {formatHourValue(row.total_overtime_hours)}</span>
                      <span>Late: {row.total_late_minutes}m</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px", fontSize: "12px", color: "var(--text-primary)" }}>
                      <span>Gross: {formatUzAmount(row.gross_salary)}</span>
                      <span>Net: {formatUzAmount(row.net_salary)}</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button type="button" style={buttonStyle} onClick={() => openAdjustModal(row)}>
                        <Pencil size={14} /> Adjust
                      </button>
                      <button type="button" style={buttonStyle} onClick={() => setBreakdownRecord(row)}>
                        <ReceiptText size={14} /> Breakdown
                      </button>
                      {row.status === "draft" ? (
                        <button type="button" style={primaryButtonStyle} onClick={() => void approveSelected([row.id])}>
                          <CheckCheck size={14} /> Approve
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "48px 1.4fr 0.7fr 0.7fr 0.7fr 0.9fr 0.9fr 0.7fr 0.7fr 0.9fr 0.8fr 160px", padding: "10px 18px", background: "var(--bg-panel)", borderBottom: "1px solid var(--border-default)" }}>
                  {["", "Employee", "Days", "Hours", "OT", "Base", "Gross", "INPS", "Tax", "Net", "Status", "Actions"].map((header) => (
                    <span key={header} style={{ fontSize: "10px", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-quiet)", fontWeight: 600 }}>{header}</span>
                  ))}
                </div>
                {records.map((row) => (
                  <div key={row.id} style={{ display: "grid", gridTemplateColumns: "48px 1.4fr 0.7fr 0.7fr 0.7fr 0.9fr 0.9fr 0.7fr 0.7fr 0.9fr 0.8fr 160px", padding: "12px 18px", borderBottom: "1px solid var(--table-row-divider)", alignItems: "center", gap: "8px" }}>
                    <label style={{ display: "flex", justifyContent: "center" }}>
                      <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleSelection(row.id)} disabled={row.status !== "draft"} />
                    </label>
                    <div>
                      <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>{row.employee_name}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "2px" }}>{row.department || row.position || "—"}</div>
                    </div>
                    <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{row.days_worked}/{row.working_days_in_month}</span>
                    <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{formatHourValue(row.total_hours_worked)}</span>
                    <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{formatHourValue(row.total_overtime_hours)}</span>
                    <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{formatUzAmount(row.base_salary)}</span>
                    <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>{formatUzAmount(row.gross_salary)}</span>
                    <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{formatUzAmount(row.inps_employee)}</span>
                    <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{formatUzAmount(row.jshdssh)}</span>
                    <span style={{ fontSize: "13px", color: "#34d399", fontWeight: 600 }}>{formatUzAmount(row.net_salary)}</span>
                    <span style={{ fontSize: "11px", color: statusColor(row.status), fontWeight: 700, textTransform: "uppercase" }}>{row.status}</span>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      <button type="button" style={buttonStyle} onClick={() => openAdjustModal(row)}>
                        <Pencil size={14} />
                      </button>
                      <button type="button" style={buttonStyle} onClick={() => setBreakdownRecord(row)}>
                        <ReceiptText size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
            <div style={{ padding: "14px 18px", borderTop: "1px solid var(--border-default)", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr", gap: "12px", alignItems: "center" }}>
              <div style={{ display: "grid", gap: "4px", fontSize: "12px", color: "var(--text-subtle)" }}>
                <span>Employees: {summary?.employee_count ?? records.length}</span>
                <span>Total gross: {formatUzAmount(summary?.total_gross ?? totals.gross)}</span>
                <span>Total net: {formatUzAmount(summary?.total_net ?? totals.net)}</span>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: isMobile ? "stretch" : "flex-end" }}>
                <button type="button" style={buttonStyle} onClick={() => setSelectedIds(draftIds)} disabled={!draftIds.length}>Select drafts</button>
                <button type="button" style={primaryButtonStyle} onClick={() => void approveSelected(selectedIds.length ? selectedIds : draftIds)} disabled={!selectedIds.length && !draftIds.length}>
                  <CheckCheck size={14} /> Approve selected
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: "18px", color: "var(--text-subtle)" }}>No payroll records for this period. Run payroll calculation to generate draft rows.</div>
        )}
      </div>

      {(adjustingRecord || breakdownRecord) ? (
        <div style={{ position: "fixed", inset: 0, background: "var(--overlay-backdrop)", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "12px" : "20px" }}>
          <div style={{ width: isMobile ? "100%" : "min(640px, 92vw)", maxHeight: "90vh", overflowY: "auto", ...cardStyle }}>
            <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
              <div style={{ fontSize: "18px", color: "var(--text-primary)", fontWeight: 700 }}>
                {adjustingRecord ? `Adjust ${adjustingRecord.employee_name}` : `Breakdown · ${breakdownRecord?.employee_name}`}
              </div>
              <button type="button" style={buttonStyle} onClick={() => { setAdjustingRecord(null); setBreakdownRecord(null); }}>
                <X size={14} /> Close
              </button>
            </div>
            <div style={{ padding: "18px", display: "grid", gap: "14px" }}>
              {adjustingRecord ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={labelStyle}>Bonus (UZS)</label>
                      <input style={inputStyle} type="number" value={adjustForm.bonus} onChange={(event) => setAdjustForm((current) => ({ ...current, bonus: event.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Manual penalty (UZS)</label>
                      <input style={inputStyle} type="number" value={adjustForm.manual_penalty} onChange={(event) => setAdjustForm((current) => ({ ...current, manual_penalty: event.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Adjustment note</label>
                    <textarea style={{ ...inputStyle, minHeight: "110px", resize: "vertical" }} value={adjustForm.adjustment_note} onChange={(event) => setAdjustForm((current) => ({ ...current, adjustment_note: event.target.value }))} placeholder="Explain the payroll adjustment." />
                  </div>
                  <button type="button" style={primaryButtonStyle} onClick={() => void saveAdjustment()}>
                    <Pencil size={14} /> Save adjustment
                  </button>
                </>
              ) : null}

              {breakdownRecord ? (
                <div style={{ display: "grid", gap: "10px" }}>
                  <div style={{ padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--border-default)", background: "var(--bg-panel)" }}>
                    <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>{breakdownRecord.employee_name}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "4px" }}>Approved: {formatDateTime(breakdownRecord.approved_at)} · Status: {breakdownRecord.status}</div>
                  </div>
                  {Array.isArray(breakdownRecord.calculation_breakdown?.formula_lines)
                    ? breakdownRecord.calculation_breakdown.formula_lines.map((line) => (
                        <div key={line as string} style={{ padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--border-default)", background: "color-mix(in srgb, var(--bg-panel) 88%, var(--bg-surface) 12%)", color: "var(--text-primary)", fontSize: "13px" }}>
                          {String(line)}
                        </div>
                      ))
                    : null}
                  <div style={{ padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--border-default)", background: "var(--bg-panel)", display: "grid", gap: "6px" }}>
                    <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>Gross salary: {formatUzAmount(breakdownRecord.gross_salary)}</span>
                    <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>INPS: {formatUzAmount(breakdownRecord.inps_employee)}</span>
                    <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>JShDSh: {formatUzAmount(breakdownRecord.jshdssh)}</span>
                    <span style={{ fontSize: "14px", color: "#34d399", fontWeight: 700 }}>Net salary: {formatUzAmount(breakdownRecord.net_salary)}</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
