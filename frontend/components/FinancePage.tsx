"use client";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, TrendingUp, TrendingDown } from "lucide-react";
import { useIsMobile } from "@/lib/use-is-mobile";

const API = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? `/api` : "http://localhost:8000");

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: "9px",
  background: "var(--bg-elevated)", border: "1px solid var(--border-soft)",
  color: "var(--text-primary)", fontSize: "13px", outline: "none",
  fontFamily: "inherit",
};

const labelStyle = {
  fontSize: "11px", color: "var(--text-subtle)", marginBottom: "6px", display: "block",
};

type Transaction = {
  id: number; date: string; description: string;
  category: string; amount: number; type: string;
  status: string; notes?: string;
};

type Invoice = {
  id: number; invoice_number: string; client_name: string;
  client_email?: string; amount: number; tax: number;
  status: string; issue_date: string;
};

type Summary = {
  total_income: number; total_expenses: number;
  net_profit: number; pending_invoices: number;
};

const STATUS_COLOR: Record<string, string> = {
  paid: "#34d399", received: "#34d399", pending: "#fbbf24",
  overdue: "#f87171", draft: "var(--text-muted)", income: "#34d399", expense: "#f87171",
};

export default function FinancePage() {
  const isMobile = useIsMobile(900);
  const [tab, setTab]               = useState<"transactions" | "invoices">("transactions");
  const [transactions, setTx]       = useState<Transaction[]>([]);
  const [invoices, setInv]          = useState<Invoice[]>([]);
  const [summary, setSummary]       = useState<Summary | null>(null);
  const [modal, setModal]           = useState<null | "add_tx" | "edit_tx" | "add_inv" | "edit_inv">(null);
  const [selected, setSelected]     = useState<Transaction | Invoice | null>(null);
  const [loading, setLoading]       = useState(false);

  const [txForm, setTxForm] = useState({ description: "", category: "", amount: "", type: "income", status: "pending", notes: "" });
  const [invForm, setInvForm] = useState({ invoice_number: "", client_name: "", client_email: "", amount: "", tax: "0", status: "draft", notes: "" });

  const load = async () => {
    try {
      const [sRes, tRes, iRes] = await Promise.all([
        fetch(`${API}/finance/summary`),
        fetch(`${API}/finance/transactions`),
        fetch(`${API}/finance/invoices`),
      ]);
      const s = sRes.ok ? await sRes.json() : null;
      const t = tRes.ok ? await tRes.json() : [];
      const i = iRes.ok ? await iRes.json() : [];
      setSummary(s); setTx(t); setInv(i);
    } catch (err) {
      console.error("Failed to load Finance data:", err);
      setSummary(null); setTx([]); setInv([]);
    }
  };

  useEffect(() => { load(); }, []);

  const openEditTx = (tx: Transaction) => {
    setSelected(tx);
    setTxForm({ description: tx.description, category: tx.category, amount: String(tx.amount), type: tx.type, status: tx.status, notes: tx.notes || "" });
    setModal("edit_tx");
  };

  const openEditInv = (inv: Invoice) => {
    setSelected(inv);
    setInvForm({ invoice_number: inv.invoice_number, client_name: inv.client_name, client_email: inv.client_email || "", amount: String(inv.amount), tax: String(inv.tax), status: inv.status, notes: "" });
    setModal("edit_inv");
  };

  const saveTx = async () => {
    setLoading(true);
    const body = { ...txForm, amount: parseFloat(txForm.amount) };
    if (modal === "add_tx") {
      await fetch(`${API}/finance/transactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      if (!selected) {
        setLoading(false);
        return;
      }
      await fetch(`${API}/finance/transactions/${selected.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    await load(); setModal(null); setLoading(false);
  };

  const deleteTx = async (id: number) => {
    if (!confirm("Delete this transaction?")) return;
    await fetch(`${API}/finance/transactions/${id}`, { method: "DELETE" });
    await load();
  };

  const saveInv = async () => {
    setLoading(true);
    const body = { ...invForm, amount: parseFloat(invForm.amount), tax: parseFloat(invForm.tax) };
    if (modal === "add_inv") {
      await fetch(`${API}/finance/invoices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      if (!selected) {
        setLoading(false);
        return;
      }
      await fetch(`${API}/finance/invoices/${selected.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    await load(); setModal(null); setLoading(false);
  };

  const deleteInv = async (id: number) => {
    if (!confirm("Delete this invoice?")) return;
    await fetch(`${API}/finance/invoices/${id}`, { method: "DELETE" });
    await load();
  };

  const fmt = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0 });

  return (
    <div style={{ padding: isMobile ? "12px" : "24px", maxWidth: "1200px", margin: "0 auto" }}>

      {/* KPI Cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(4,1fr)", gap: "12px", marginBottom: "18px" }}>
          {[
            { label: "Total Income",      value: fmt(summary.total_income),    color: "#34d399", up: true  },
            { label: "Total Expenses",    value: fmt(summary.total_expenses),  color: "#f87171", up: false },
            { label: "Net Profit",        value: fmt(summary.net_profit),      color: summary.net_profit >= 0 ? "#34d399" : "#f87171", up: summary.net_profit >= 0 },
            { label: "Pending Invoices",  value: String(summary.pending_invoices), color: "#fbbf24", up: false },
          ].map(card => (
            <div key={card.label} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: isMobile ? "14px 12px" : "18px 20px", position: "relative", overflow: "hidden", minWidth: 0 }}>
              <p style={{ fontSize: "11px", color: "var(--text-subtle)", marginBottom: "10px" }}>{card.label}</p>
              <p style={{ fontSize: isMobile ? "18px" : "28px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.15, marginBottom: "6px", wordBreak: "break-word" }}>{card.value}</p>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                {card.up ? <TrendingUp size={11} color="var(--success)" /> : <TrendingDown size={11} color="var(--danger)" />}
              </div>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "1px", background: `linear-gradient(90deg, transparent, ${card.color}40, transparent)` }} />
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "4px", marginBottom: "16px", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "10px", padding: "4px", width: isMobile ? "100%" : "fit-content", maxWidth: "100%" }}>
        {(["transactions", "invoices"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "8px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: 500, cursor: "pointer", border: "none", background: tab === t ? "var(--bg-elevated)" : "transparent", color: tab === t ? "var(--text-primary)" : "var(--text-subtle)", transition: "all 0.15s", minWidth: 0 }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Table card */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "14px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", padding: isMobile ? "14px 12px" : "16px 20px", borderBottom: "1px solid var(--border-default)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "3px", height: "16px", borderRadius: "2px", background: "var(--accent)" }} />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
              {tab === "transactions" ? "Transactions" : "Invoices"}
            </span>
          </div>
          <button
            onClick={() => { setModal(tab === "transactions" ? "add_tx" : "add_inv"); setTxForm({ description: "", category: "", amount: "", type: "income", status: "pending", notes: "" }); setInvForm({ invoice_number: "", client_name: "", client_email: "", amount: "", tax: "0", status: "draft", notes: "" }); }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "8px 14px", borderRadius: "9px", background: "var(--accent)", border: "none", color: "white", fontSize: "13px", fontWeight: 500, cursor: "pointer", width: isMobile ? "100%" : "auto" }}>
            <Plus size={14} /> Add {tab === "transactions" ? "Transaction" : "Invoice"}
          </button>
        </div>

        {/* Transactions table */}
        {tab === "transactions" && (
          <>
            {isMobile ? (
              <div style={{ display: "grid", gap: "10px", padding: "12px" }}>
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    style={{
                      border: "1px solid var(--border-default)",
                      borderRadius: "12px",
                      background: "color-mix(in srgb, var(--bg-panel) 90%, var(--bg-surface) 10%)",
                      padding: "10px",
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
                      <span style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 500, minWidth: 0 }}>
                        {tx.description}
                      </span>
                      <span style={{ fontSize: "15px", color: tx.type === "income" ? "#34d399" : "#f87171", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {tx.type === "income" ? "+" : "-"}${tx.amount.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{tx.category}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "7px", background: `${STATUS_COLOR[tx.type] || "var(--accent)"}12`, color: STATUS_COLOR[tx.type] || "var(--accent)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[tx.type], flexShrink: 0 }} />{tx.type}
                        </span>
                        <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "7px", background: `${STATUS_COLOR[tx.status] || "var(--accent)"}12`, color: STATUS_COLOR[tx.status] || "var(--accent)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[tx.status], flexShrink: 0 }} />{tx.status}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button onClick={() => openEditTx(tx)} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Pencil size={12} color="var(--text-muted)" />
                        </button>
                        <button onClick={() => deleteTx(tx.id)} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Trash2 size={12} color="var(--danger)" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 0.8fr 0.8fr 80px", padding: "10px 20px", background: "var(--bg-panel)", borderBottom: "1px solid var(--border-soft)" }}>
                  {["Description", "Category", "Amount", "Type", "Status", ""].map(h => (
                    <span key={h} style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>{h}</span>
                  ))}
                </div>
                {transactions.map((tx, i) => (
                  <div key={tx.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 0.8fr 0.8fr 80px", padding: "13px 20px", borderBottom: i < transactions.length - 1 ? "1px solid var(--table-row-divider)" : "none", transition: "background 0.1s", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                    <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{tx.description}</span>
                    <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>{tx.category}</span>
                    <span style={{ fontSize: "13px", color: tx.type === "income" ? "#34d399" : "#f87171", fontWeight: 500 }}>
                      {tx.type === "income" ? "+" : "-"}${tx.amount.toLocaleString()}
                    </span>
                    <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: `${STATUS_COLOR[tx.type] || "var(--accent)"}12`, color: STATUS_COLOR[tx.type] || "var(--accent)", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content" }}>
                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[tx.type], flexShrink: 0 }} />{tx.type}
                    </span>
                    <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: `${STATUS_COLOR[tx.status] || "var(--accent)"}12`, color: STATUS_COLOR[tx.status] || "var(--accent)", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content" }}>
                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[tx.status], flexShrink: 0 }} />{tx.status}
                    </span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button onClick={() => openEditTx(tx)} style={{ width: "26px", height: "26px", borderRadius: "7px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Pencil size={11} color="var(--text-muted)" />
                      </button>
                      <button onClick={() => deleteTx(tx.id)} style={{ width: "26px", height: "26px", borderRadius: "7px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Trash2 size={11} color="var(--danger)" />
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* Invoices table */}
        {tab === "invoices" && (
          <>
            {isMobile ? (
              <div style={{ display: "grid", gap: "10px", padding: "12px" }}>
                {invoices.map((inv) => (
                  <div
                    key={inv.id}
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
                      <span style={{ fontSize: "12px", color: "var(--accent)", fontFamily: "monospace" }}>{inv.invoice_number}</span>
                      <span style={{ fontSize: "15px", color: "#34d399", fontWeight: 600 }}>${inv.amount.toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 500 }}>{inv.client_name}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                      <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Tax: ${inv.tax}</span>
                      <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "7px", background: `${STATUS_COLOR[inv.status] || "var(--text-muted)"}12`, color: STATUS_COLOR[inv.status] || "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[inv.status] || "var(--text-muted)", flexShrink: 0 }} />{inv.status}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                      <button onClick={() => openEditInv(inv)} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Pencil size={12} color="var(--text-muted)" />
                      </button>
                      <button onClick={() => deleteInv(inv.id)} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Trash2 size={12} color="var(--danger)" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.5fr 1fr 0.8fr 0.8fr 80px", padding: "10px 20px", background: "var(--bg-panel)", borderBottom: "1px solid var(--border-soft)" }}>
                  {["Invoice #", "Client", "Amount", "Tax", "Status", ""].map(h => (
                    <span key={h} style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>{h}</span>
                  ))}
                </div>
                {invoices.map((inv, i) => (
                  <div key={inv.id} style={{ display: "grid", gridTemplateColumns: "0.8fr 1.5fr 1fr 0.8fr 0.8fr 80px", padding: "13px 20px", borderBottom: i < invoices.length - 1 ? "1px solid var(--table-row-divider)" : "none", transition: "background 0.1s", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                    <span style={{ fontSize: "13px", color: "var(--accent)", fontFamily: "monospace" }}>{inv.invoice_number}</span>
                    <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{inv.client_name}</span>
                    <span style={{ fontSize: "13px", color: "#34d399", fontWeight: 500 }}>${inv.amount.toLocaleString()}</span>
                    <span style={{ fontSize: "13px", color: "var(--text-subtle)" }}>${inv.tax}</span>
                    <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: `${STATUS_COLOR[inv.status] || "var(--text-muted)"}12`, color: STATUS_COLOR[inv.status] || "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content" }}>
                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[inv.status] || "var(--text-muted)", flexShrink: 0 }} />{inv.status}
                    </span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button onClick={() => openEditInv(inv)} style={{ width: "26px", height: "26px", borderRadius: "7px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Pencil size={11} color="var(--text-muted)" />
                      </button>
                      <button onClick={() => deleteInv(inv.id)} style={{ width: "26px", height: "26px", borderRadius: "7px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
        <div style={{ position: "fixed", inset: 0, background: "var(--overlay-backdrop)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "10px" : "20px" }} onClick={() => setModal(null)}>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "16px", padding: isMobile ? "16px 14px" : "28px", width: isMobile ? "100%" : "460px", maxWidth: "90vw", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                {modal === "add_tx" ? "Add Transaction" : modal === "edit_tx" ? "Edit Transaction" : modal === "add_inv" ? "Add Invoice" : "Edit Invoice"}
              </h2>
              <button onClick={() => setModal(null)} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={13} color="var(--text-muted)" />
              </button>
            </div>

            {/* Transaction form */}
            {(modal === "add_tx" || modal === "edit_tx") && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={labelStyle}>Description</label>
                  <input style={inputStyle} value={txForm.description} onChange={e => setTxForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Client Payment — Acme" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Category</label>
                    <input style={inputStyle} value={txForm.category} onChange={e => setTxForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Revenue" />
                  </div>
                  <div>
                    <label style={labelStyle}>Amount ($)</label>
                    <input style={inputStyle} type="number" value={txForm.amount} onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Type</label>
                    <select style={inputStyle} value={txForm.type} onChange={e => setTxForm(f => ({ ...f, type: e.target.value }))}>
                      <option value="income">Income</option>
                      <option value="expense">Expense</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select style={inputStyle} value={txForm.status} onChange={e => setTxForm(f => ({ ...f, status: e.target.value }))}>
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                      <option value="received">Received</option>
                      <option value="overdue">Overdue</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Notes (optional)</label>
                  <input style={inputStyle} value={txForm.notes} onChange={e => setTxForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes..." />
                </div>
              </div>
            )}

            {/* Invoice form */}
            {(modal === "add_inv" || modal === "edit_inv") && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Invoice Number</label>
                    <input style={inputStyle} value={invForm.invoice_number} onChange={e => setInvForm(f => ({ ...f, invoice_number: e.target.value }))} placeholder="INV-006" disabled={modal === "edit_inv"} />
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select style={inputStyle} value={invForm.status} onChange={e => setInvForm(f => ({ ...f, status: e.target.value }))}>
                      <option value="draft">Draft</option>
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                      <option value="overdue">Overdue</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Client Name</label>
                  <input style={inputStyle} value={invForm.client_name} onChange={e => setInvForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Acme Corp" />
                </div>
                <div>
                  <label style={labelStyle}>Client Email</label>
                  <input style={inputStyle} value={invForm.client_email} onChange={e => setInvForm(f => ({ ...f, client_email: e.target.value }))} placeholder="billing@acme.com" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Amount ($)</label>
                    <input style={inputStyle} type="number" value={invForm.amount} onChange={e => setInvForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
                  </div>
                  <div>
                    <label style={labelStyle}>Tax ($)</label>
                    <input style={inputStyle} type="number" value={invForm.tax} onChange={e => setInvForm(f => ({ ...f, tax: e.target.value }))} placeholder="0.00" />
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: "10px", marginTop: "24px", justifyContent: "flex-end", flexDirection: isMobile ? "column-reverse" : "row" }}>
              <button onClick={() => setModal(null)} style={{ padding: "9px 18px", borderRadius: "9px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-muted)", fontSize: "13px", cursor: "pointer", width: isMobile ? "100%" : "auto" }}>
                Cancel
              </button>
              <button onClick={modal?.includes("tx") ? saveTx : saveInv} disabled={loading}
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
