"use client";

import { useEffect, useRef, useState } from "react";
import { Section } from "@/types";
import { X, Send, Sparkles, Loader2, User, Trash2 } from "lucide-react";

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
  projects:     { label: "Projects",     icon: "📋", prompts: ["Summarize tasks by status", "Which tasks are overdue?", "Who is assigned the most work?"] },
  finance:      { label: "Finance",      icon: "💰", prompts: ["Analyze our cash flow this month", "Flag any unusual transactions", "What's our profit margin?"] },
  hr:           { label: "HR",           icon: "👥", prompts: ["Who is on leave this week?", "Summarize open positions", "Suggest hiring priorities"] },
  sales:        { label: "Sales",        icon: "📈", prompts: ["Which deals are at risk?", "What's our pipeline coverage?", "Draft a follow-up for Acme Corp"] },
  support:      { label: "Support",      icon: "🎧", prompts: ["What are the most common issues?", "Summarize open tickets", "Draft a response for an angry customer"] },
  legal:        { label: "Legal",        icon: "⚖️", prompts: ["Any compliance risks this week?", "Summarize pending contracts", "Flag overdue reviews"] },
  marketing:    { label: "Marketing",    icon: "📣", prompts: ["What's our best performing channel?", "Suggest a campaign idea", "Analyze this month's ROI"] },
  supply_chain: { label: "Supply Chain", icon: "🚚", prompts: ["Which products are low on stock?", "Flag any supplier risks", "Forecast demand for next month"] },
  procurement:  { label: "Procurement",  icon: "🛒", prompts: ["List pending purchase orders", "Compare vendor quotes", "Flag overdue approvals"] },
  insights:     { label: "Insights",     icon: "📊", prompts: ["Give me an executive summary", "What trends should I know about?", "Compare this quarter vs last"] },
  settings:     { label: "Settings",     icon: "⚙️", prompts: ["How do I change my password?", "Where are notification preferences?", "Export my data"] },
  marketplace:  { label: "Marketplace",  icon: "📦", prompts: ["What integrations are available?", "How do I install an add-on?", "List popular integrations"] },
};

const getSessionId = (sectionName: string): string => {
  const key = "benela_session_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem(key, id);
  }
  return `${id}_${sectionName}`;
};

const stripAssistantMarkdown = (content: string): string =>
  content
    .replace(/#{1,3} /g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .trim();

export default function AIPanel({ isOpen, section, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const ctx = SECTION_CONTEXT[section] ?? SECTION_CONTEXT.dashboard;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, historyLoading]);

  useEffect(() => {
    if (!isOpen) return;
    setShowClearConfirm(false);
    void loadHistory();
  }, [section, isOpen]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    setMessages([]);
    try {
      const sessionId = getSessionId(section);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(
        `${apiUrl}/chat/${section}?session_id=${encodeURIComponent(sessionId)}&limit=50`
      );
      if (res.ok) {
        const data = (await res.json()) as Array<{ id: number; role: "user" | "assistant"; content: string }>;
        setMessages(
          data.map((msg) => ({
            id: String(msg.id),
            role: msg.role,
            content: msg.content,
          }))
        );
      }
    } catch {
      // keep chat usable even if history fetch fails
    } finally {
      setHistoryLoading(false);
    }
  };

  const saveMessages = async (userText: string, assistantText: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const sessionId = getSessionId(section);

    await Promise.all([
      fetch(`${apiUrl}/chat/${section}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          section,
          role: "user",
          content: userText,
        }),
      }),
      fetch(`${apiUrl}/chat/${section}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          section,
          role: "assistant",
          content: assistantText,
        }),
      }),
    ]);
  };

  const send = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };
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
      const assistantText = data.response ?? data.detail ?? "Something went wrong.";

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: assistantText,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      saveMessages(text, assistantText).catch(console.error);
    } catch {
      const errMsg = "Backend not connected. Check your API configuration.";
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: errMsg,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const sessionId = getSessionId(section);
      await fetch(`${apiUrl}/chat/${section}?session_id=${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
      setMessages([]);
      setShowClearConfirm(false);
    } catch {
      setMessages([]);
      setShowClearConfirm(false);
    }
  };

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 40 }}
        />
      )}

      <div
        style={{
          position: "fixed",
          top: 0,
          right: isOpen ? 0 : "-420px",
          width: "400px",
          height: "100vh",
          background: "var(--bg-panel)",
          borderLeft: "1px solid var(--border-default)",
          display: "flex",
          flexDirection: "column",
          zIndex: 50,
          transition: "right 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: isOpen ? "-20px 0 60px rgba(0,0,0,0.5)" : "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-default)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "10px",
              background: "rgba(124,106,255,0.12)",
              border: "1px solid rgba(124,106,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Sparkles size={15} color="#a89aff" />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>AI Assistant</p>
            <p style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
              {ctx.icon} {ctx.label} context active
            </p>
          </div>

          {messages.length > 0 && (
            <span
              style={{
                fontSize: "10px",
                color: "var(--text-subtle)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                borderRadius: "6px",
                padding: "2px 7px",
                fontFamily: "monospace",
              }}
            >
              {messages.length} msgs
            </span>
          )}

          <button
            onClick={() => setShowClearConfirm(true)}
            title="Clear chat history"
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              background: "transparent",
              border: `1px solid ${showClearConfirm ? "rgba(248,113,113,0.3)" : "var(--border-default)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: showClearConfirm ? "#f87171" : "var(--text-subtle)",
            }}
          >
            <Trash2 size={12} />
          </button>

          <button
            onClick={onClose}
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              background: "transparent",
              border: "1px solid var(--border-default)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--text-subtle)",
            }}
          >
            <X size={13} />
          </button>
        </div>

        {showClearConfirm && (
          <div
            style={{
              padding: "10px 20px",
              background: "rgba(248,113,113,0.06)",
              borderBottom: "1px solid rgba(248,113,113,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "12px", color: "#f87171" }}>
              Clear all chat history for {ctx.label}?
            </span>
            <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
              <button
                onClick={() => setShowClearConfirm(false)}
                style={{
                  fontSize: "11px",
                  color: "var(--text-subtle)",
                  background: "transparent",
                  border: "1px solid var(--border-default)",
                  borderRadius: "6px",
                  padding: "3px 10px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={clearChat}
                style={{
                  fontSize: "11px",
                  color: "white",
                  background: "#ef4444",
                  border: "none",
                  borderRadius: "6px",
                  padding: "3px 10px",
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {historyLoading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                padding: "40px",
                color: "var(--text-quiet)",
                fontSize: "12px",
              }}
            >
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              Loading history...
            </div>
          ) : messages.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "20px",
                paddingTop: "20px",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "14px",
                  background: "rgba(124,106,255,0.08)",
                  border: "1px solid rgba(124,106,255,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                }}
              >
                {ctx.icon}
              </div>

              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                  {ctx.label} AI Assistant
                </p>
                <p style={{ fontSize: "12px", color: "var(--text-subtle)", lineHeight: "1.6" }}>
                  Ask anything about your {ctx.label.toLowerCase()} data, operations, or get AI-powered analysis.
                </p>
              </div>

              <div style={{ width: "100%" }}>
                <p
                  style={{
                    fontSize: "9px",
                    color: "var(--text-quiet)",
                    letterSpacing: "0.12em",
                    fontFamily: "monospace",
                    textAlign: "center",
                    marginBottom: "10px",
                  }}
                >
                  SUGGESTED
                </p>
                {ctx.prompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => send(prompt)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      marginBottom: "6px",
                      cursor: "pointer",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-default)",
                      fontSize: "13px",
                      color: "var(--text-subtle)",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "rgba(124,106,255,0.25)";
                      (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)";
                      (e.currentTarget as HTMLElement).style.color = "var(--text-subtle)";
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {messages.map((msg) => {
                const rendered =
                  msg.role === "assistant" ? stripAssistantMarkdown(msg.content) : msg.content;
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      gap: "10px",
                      flexDirection: msg.role === "user" ? "row-reverse" : "row",
                    }}
                  >
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "8px",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background:
                          msg.role === "user" ? "rgba(124,106,255,0.15)" : "rgba(255,255,255,0.04)",
                        border:
                          msg.role === "user"
                            ? "1px solid rgba(124,106,255,0.25)"
                            : "1px solid var(--border-default)",
                      }}
                    >
                      {msg.role === "user" ? (
                        <User size={12} color="#a89aff" />
                      ) : (
                        <Sparkles size={12} color="var(--text-subtle)" />
                      )}
                    </div>

                    <div
                      style={{
                        maxWidth: "82%",
                        padding: msg.role === "assistant" ? "14px 16px" : "12px 14px",
                        borderRadius:
                          msg.role === "user" ? "12px 2px 12px 12px" : "2px 12px 12px 12px",
                        fontSize: "13px",
                        lineHeight: "1.6",
                        background: msg.role === "user" ? "rgba(124,106,255,0.1)" : "#141414",
                        border:
                          msg.role === "user"
                            ? "1px solid rgba(124,106,255,0.2)"
                            : "1px solid #252525",
                        color: msg.role === "user" ? "#c4baff" : "#c8c8c8",
                      }}
                    >
                      <span style={{ whiteSpace: "pre-wrap" }}>{rendered}</span>
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div style={{ display: "flex", gap: "10px" }}>
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "8px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid var(--border-default)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Sparkles size={12} color="var(--text-subtle)" />
                  </div>
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: "2px 12px 12px 12px",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-default)",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Loader2 size={13} color="var(--text-subtle)" style={{ animation: "spin 1s linear infinite" }} />
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>Thinking...</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div style={{ padding: "16px", borderTop: "1px solid var(--border-default)", flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "10px",
              padding: "10px 14px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "12px",
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder={`Ask about ${ctx.label}...`}
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                resize: "none",
                fontSize: "13px",
                color: "var(--text-primary)",
                lineHeight: "1.5",
                fontFamily: "Geist, sans-serif",
              }}
            />

            <button
              onClick={() => void send(input)}
              disabled={!input.trim() || loading || historyLoading}
              style={{
                width: "30px",
                height: "30px",
                borderRadius: "8px",
                background: input.trim() && !loading && !historyLoading ? "var(--accent)" : "var(--bg-elevated)",
                border: "none",
                cursor: input.trim() && !loading && !historyLoading ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "background 0.15s ease",
              }}
            >
              <Send size={13} color={input.trim() && !loading && !historyLoading ? "white" : "var(--text-quiet)"} />
            </button>
          </div>

          <p
            style={{
              fontSize: "10px",
              color: "var(--border-soft)",
              textAlign: "center",
              marginTop: "8px",
              fontFamily: "monospace",
            }}
          >
            ENTER to send · SHIFT+ENTER for new line
          </p>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  );
}
