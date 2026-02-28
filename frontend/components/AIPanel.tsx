"use client";

import { useState, useRef, useEffect } from "react";
import { Section } from "@/app/page";
import { X, Send, Sparkles, Loader2, User } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Props {
  isOpen: boolean;
  section: Section;
  onClose: () => void;
}

const SECTION_CONTEXT: Record<Section, { label: string; icon: string; prompts: string[] }> = {
  dashboard:    { label: "Dashboard",    icon: "⊞", prompts: ["Give me a business health summary", "Which module needs attention?", "What are the top risks this week?"] },
  finance:      { label: "Finance",      icon: "💰", prompts: ["Analyze our cash flow this month", "Flag any unusual transactions", "What's our profit margin?"] },
  hr:           { label: "HR",           icon: "👥", prompts: ["Who is on leave this week?", "Summarize open positions", "Suggest hiring priorities"] },
  sales:        { label: "Sales",        icon: "📈", prompts: ["Which deals are at risk?", "What's our pipeline coverage?", "Draft a follow-up for Acme Corp"] },
  support:      { label: "Support",      icon: "🎧", prompts: ["What are the most common issues?", "Summarize open tickets", "Draft a response for an angry customer"] },
  legal:        { label: "Legal",        icon: "⚖️", prompts: ["Any compliance risks this week?", "Summarize pending contracts", "Flag overdue reviews"] },
  marketing:    { label: "Marketing",    icon: "📣", prompts: ["What's our best performing channel?", "Suggest a campaign idea", "Analyze this month's ROI"] },
  supply_chain: { label: "Supply Chain", icon: "🚚", prompts: ["Which products are low on stock?", "Flag any supplier risks", "Forecast demand for next month"] },
  procurement:  { label: "Procurement",  icon: "🛒", prompts: ["List pending purchase orders", "Compare vendor quotes", "Flag overdue approvals"] },
  insights:     { label: "Insights",     icon: "📊", prompts: ["Give me an executive summary", "What trends should I know about?", "Compare this quarter vs last"] },
};

export default function AIPanel({ isOpen, section, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const ctx = SECTION_CONTEXT[section];

  useEffect(() => { setMessages([]); }, [section]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/agents/${section}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response ?? data.detail ?? "Something went wrong.",
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Backend not connected yet. Add your API key to start chatting.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {isOpen && (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 40 }} />
      )}
      <div style={{
        position: "fixed", top: 0, right: isOpen ? 0 : "-420px", width: "400px", height: "100vh",
        background: "#0a0a0a", borderLeft: "1px solid #1c1c1c", display: "flex", flexDirection: "column",
        zIndex: 50, transition: "right 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        boxShadow: isOpen ? "-20px 0 60px rgba(0,0,0,0.5)" : "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 20px", borderBottom: "1px solid #1c1c1c", flexShrink: 0 }}>
          <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "rgba(124,106,255,0.12)", border: "1px solid rgba(124,106,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sparkles size={15} color="#a89aff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#e0e0e0" }}>AI Assistant</p>
            <p style={{ fontSize: "11px", color: "#555" }}>{ctx.icon} {ctx.label} context active</p>
          </div>
          <button onClick={onClose} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "transparent", border: "1px solid #1c1c1c", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#555" }}>
            <X size={13} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {messages.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", paddingTop: "20px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "rgba(124,106,255,0.08)", border: "1px solid rgba(124,106,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px" }}>{ctx.icon}</div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "#e0e0e0", marginBottom: "6px" }}>{ctx.label} AI Assistant</p>
                <p style={{ fontSize: "12px", color: "#444", lineHeight: "1.6" }}>Ask anything about your {ctx.label.toLowerCase()} data, operations, or get AI-powered analysis.</p>
              </div>
              <div style={{ width: "100%" }}>
                <p style={{ fontSize: "9px", color: "#2e2e2e", letterSpacing: "0.12em", fontFamily: "monospace", textAlign: "center", marginBottom: "10px" }}>SUGGESTED</p>
                {ctx.prompts.map((prompt) => (
                  <button key={prompt} onClick={() => send(prompt)} style={{ width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: "10px", marginBottom: "6px", cursor: "pointer", background: "#0d0d0d", border: "1px solid #1c1c1c", fontSize: "13px", color: "#555", transition: "all 0.15s ease" }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(124,106,255,0.25)"; (e.currentTarget as HTMLElement).style.color = "#888"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#1c1c1c"; (e.currentTarget as HTMLElement).style.color = "#555"; }}>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {messages.map((msg) => (
                <div key={msg.id} style={{ display: "flex", gap: "10px", flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
                  <div style={{ width: "28px", height: "28px", borderRadius: "8px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: msg.role === "user" ? "rgba(124,106,255,0.15)" : "rgba(255,255,255,0.04)", border: msg.role === "user" ? "1px solid rgba(124,106,255,0.25)" : "1px solid #1c1c1c" }}>
                    {msg.role === "user" ? <User size={12} color="#a89aff" /> : <Sparkles size={12} color="#555" />}
                  </div>
                  <div style={{ maxWidth: "82%", padding: "10px 14px", borderRadius: msg.role === "user" ? "12px 2px 12px 12px" : "2px 12px 12px 12px", fontSize: "13px", lineHeight: "1.6", whiteSpace: "pre-wrap", background: msg.role === "user" ? "rgba(124,106,255,0.1)" : "#111", border: msg.role === "user" ? "1px solid rgba(124,106,255,0.2)" : "1px solid #1c1c1c", color: msg.role === "user" ? "#c4baff" : "#888" }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: "flex", gap: "10px" }}>
                  <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "rgba(255,255,255,0.04)", border: "1px solid #1c1c1c", display: "flex", alignItems: "center", justifyContent: "center" }}><Sparkles size={12} color="#555" /></div>
                  <div style={{ padding: "10px 14px", borderRadius: "2px 12px 12px 12px", background: "#111", border: "1px solid #1c1c1c", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Loader2 size={13} color="#555" style={{ animation: "spin 1s linear infinite" }} />
                    <span style={{ fontSize: "12px", color: "#444" }}>Thinking...</span>
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div style={{ padding: "16px", borderTop: "1px solid #1c1c1c", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", padding: "10px 14px", background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: "12px" }}>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} placeholder={`Ask about ${ctx.label}...`} rows={1} style={{ flex: 1, background: "transparent", border: "none", outline: "none", resize: "none", fontSize: "13px", color: "#e0e0e0", lineHeight: "1.5", fontFamily: "Geist, sans-serif" }} />
            <button onClick={() => send(input)} disabled={!input.trim() || loading} style={{ width: "30px", height: "30px", borderRadius: "8px", background: input.trim() && !loading ? "#7c6aff" : "#1a1a1a", border: "none", cursor: input.trim() && !loading ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s ease" }}>
              <Send size={13} color={input.trim() && !loading ? "white" : "#333"} />
            </button>
          </div>
          <p style={{ fontSize: "10px", color: "#2a2a2a", textAlign: "center", marginTop: "8px", fontFamily: "monospace" }}>ENTER to send · SHIFT+ENTER for new line</p>
        </div>
      </div>
    </>
  );
}
