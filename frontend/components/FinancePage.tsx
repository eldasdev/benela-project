"use client";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, TrendingUp, TrendingDown } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: "9px",
  background: "#111", border: "1px solid #2a2a2a",
  color: "#f0f0f5", fontSize: "13px", outline: "none",
  fontFamily: "inherit",
};

const labelStyle = {
  fontSize: "11px", color: "#555", marginBottom: "6px", display: "block",
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
  overdue: "#f87171", draft: "#888", income: "#34d399", expense: "#f87171",
};

export default function FinancePage() {
  const [tab, setTab]               = useState<"transactions" | "invoices">("transactions");
  const [transactions, setTx]       = useState<Transaction[]>([]);
  const [invoices, setInv]          = useState<Invoice[]>([]);
  const [summary, setSummary]       = useState<Summary | null>(null);
  const [modal, setModal]           = useState<null | "add_tx" | "edit_tx" | "add_inv" | "edit_inv">(null);
  const [selected, setSelected]     = useState<any>(null);
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
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>

      {/* KPI Cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "24px" }}>
          {[
            { label: "Total Income",      value: fmt(summary.total_income),    color: "#34d399", up: true  },
            { label: "Total Expenses",    value: fmt(summary.total_expenses),  color: "#f87171", up: false },
            { label: "Net Profit",        value: fmt(summary.net_profit),      color: summary.net_profit >= 0 ? "#34d399" : "#f87171", up: summary.net_profit >= 0 },
            { label: "Pending Invoices",  value: String(summary.pending_invoices), color: "#fbbf24", up: false },
          ].map(card => (
            <div key={card.label} style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: "12px", padding: "18px 20px", position: "relative", overflow: "hidden" }}>
              <p style={{ fontSize: "11px", color: "#444", marginBottom: "10px" }}>{card.label}</p>
              <p style={{ fontSize: "28px", fontWeight: 600, color: "#f0f0f5", lineHeight: 1, marginBottom: "6px" }}>{card.value}</p>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                {card.up ? <TrendingUp size={11} color="#34d399" /> : <TrendingDown size={11} color="#f87171" />}
              </div>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "1px", background: `linear-gradient(90deg, transparent, ${card.color}40, transparent)` }} />
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "16px", background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: "10px", padding: "4px", width: "fit-content" }}>
        {(["transactions", "invoices"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "7px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 500, cursor: "pointer", border: "none", background: tab === t ? "#1a1a1a" : "transparent", color: tab === t ? "#f0f0f5" : "#555", transition: "all 0.15s" }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Table card */}
      <div style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: "14px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #1c1c1c" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "3px", height: "16px", borderRadius: "2px", background: "#7c6aff" }} />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#e0e0e0" }}>
              {tab === "transactions" ? "Transactions" : "Invoices"}
            </span>
          </div>
          <button
            onClick={() => { setModal(tab === "transactions" ? "add_tx" : "add_inv"); setTxForm({ description: "", category: "", amount: "", type: "income", status: "pending", notes: "" }); setInvForm({ invoice_number: "", client_name: "", client_email: "", amount: "", tax: "0", status: "draft", notes: "" }); }}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "9px", background: "#7c6aff", border: "none", color: "white", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}>
            <Plus size={14} /> Add {tab === "transactions" ? "Transaction" : "Invoice"}
          </button>
        </div>

        {/* Transactions table */}
        {tab === "transactions" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 0.8fr 0.8fr 80px", padding: "10px 20px", background: "#0a0a0a", borderBottom: "1px solid #161616" }}>
              {["Description", "Category", "Amount", "Type", "Status", ""].map(h => (
                <span key={h} style={{ fontSize: "10px", fontWeight: 600, color: "#333", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>{h}</span>
              ))}
            </div>
            {transactions.map((tx, i) => (
              <div key={tx.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 0.8fr 0.8fr 80px", padding: "13px 20px", borderBottom: i < transactions.length - 1 ? "1px solid #141414" : "none", transition: "background 0.1s", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#0f0f0f"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                <span style={{ fontSize: "13px", color: "#ccc" }}>{tx.description}</span>
                <span style={{ fontSize: "13px", color: "#555" }}>{tx.category}</span>
                <span style={{ fontSize: "13px", color: tx.type === "income" ? "#34d399" : "#f87171", fontWeight: 500 }}>
                  {tx.type === "income" ? "+" : "-"}${tx.amount.toLocaleString()}
                </span>
                <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: `${STATUS_COLOR[tx.type] || "#7c6aff"}12`, color: STATUS_COLOR[tx.type] || "#7c6aff", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content" }}>
                  <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[tx.type], flexShrink: 0 }} />{tx.type}
                </span>
                <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: `${STATUS_COLOR[tx.status] || "#7c6aff"}12`, color: STATUS_COLOR[tx.status] || "#7c6aff", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content" }}>
                  <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[tx.status], flexShrink: 0 }} />{tx.status}
                </span>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => openEditTx(tx)} style={{ width: "26px", height: "26px", borderRadius: "7px", background: "#1a1a1a", border: "1px solid #222", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Pencil size={11} color="#777" />
                  </button>
                  <button onClick={() => deleteTx(tx.id)} style={{ width: "26px", height: "26px", borderRadius: "7px", background: "#1a1a1a", border: "1px solid #222", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Trash2 size={11} color="#f87171" />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Invoices table */}
        {tab === "invoices" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.5fr 1fr 0.8fr 0.8fr 80px", padding: "10px 20px", background: "#0a0a0a", borderBottom: "1px solid #161616" }}>
              {["Invoice #", "Client", "Amount", "Tax", "Status", ""].map(h => (
                <span key={h} style={{ fontSize: "10px", fontWeight: 600, color: "#333", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>{h}</span>
              ))}
            </div>
            {invoices.map((inv, i) => (
              <div key={inv.id} style={{ display: "grid", gridTemplateColumns: "0.8fr 1.5fr 1fr 0.8fr 0.8fr 80px", padding: "13px 20px", borderBottom: i < invoices.length - 1 ? "1px solid #141414" : "none", transition: "background 0.1s", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#0f0f0f"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                <span style={{ fontSize: "13px", color: "#7c6aff", fontFamily: "monospace" }}>{inv.invoice_number}</span>
                <span style={{ fontSize: "13px", color: "#ccc" }}>{inv.client_name}</span>
                <span style={{ fontSize: "13px", color: "#34d399", fontWeight: 500 }}>${inv.amount.toLocaleString()}</span>
                <span style={{ fontSize: "13px", color: "#555" }}>${inv.tax}</span>
                <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: `${STATUS_COLOR[inv.status] || "#888"}12`, color: STATUS_COLOR[inv.status] || "#888", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content" }}>
                  <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: STATUS_COLOR[inv.status] || "#888", flexShrink: 0 }} />{inv.status}
                </span>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => openEditInv(inv)} style={{ width: "26px", height: "26px", borderRadius: "7px", background: "#1a1a1a", border: "1px solid #222", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Pencil size={11} color="#777" />
                  </button>
                  <button onClick={() => deleteInv(inv.id)} style={{ width: "26px", height: "26px", borderRadius: "7px", background: "#1a1a1a", border: "1px solid #222", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Trash2 size={11} color="#f87171" />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Modals */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setModal(null)}>
          <div style={{ background: "#0d0d0d", border: "1px solid #222", borderRadius: "16px", padding: "28px", width: "460px", maxWidth: "90vw" }} onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#f0f0f5" }}>
                {modal === "add_tx" ? "Add Transaction" : modal === "edit_tx" ? "Edit Transaction" : modal === "add_inv" ? "Add Invoice" : "Edit Invoice"}
              </h2>
              <button onClick={() => setModal(null)} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "#1a1a1a", border: "1px solid #222", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={13} color="#777" />
              </button>
            </div>

            {/* Transaction form */}
            {(modal === "add_tx" || modal === "edit_tx") && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={labelStyle}>Description</label>
                  <input style={inputStyle} value={txForm.description} onChange={e => setTxForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Client Payment — Acme" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Category</label>
                    <input style={inputStyle} value={txForm.category} onChange={e => setTxForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Revenue" />
                  </div>
                  <div>
                    <label style={labelStyle}>Amount ($)</label>
                    <input style={inputStyle} type="number" value={txForm.amount} onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
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
            <div style={{ display: "flex", gap: "10px", marginTop: "24px", justifyContent: "flex-end" }}>
              <button onClick={() => setModal(null)} style={{ padding: "9px 18px", borderRadius: "9px", background: "#1a1a1a", border: "1px solid #222", color: "#777", fontSize: "13px", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={modal?.includes("tx") ? saveTx : saveInv} disabled={loading}
                style={{ padding: "9px 20px", borderRadius: "9px", background: "#7c6aff", border: "none", color: "white", fontSize: "13px", fontWeight: 500, cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
                {loading ? "Saving..." : modal?.startsWith("add") ? "Add" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}