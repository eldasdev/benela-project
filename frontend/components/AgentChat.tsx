"use client";

import { useState, useRef, useEffect } from "react";
import { Send, ArrowLeft, Loader2, User, ArrowUpRight } from "lucide-react";

export type Agent = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  model: string;
  prompts: string[];
};

interface Props {
  agent: Agent;
  onClose: () => void;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function AgentChat({ agent, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`http://localhost:8000/agents/${agent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.response || data.detail || "Something went wrong.",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Could not connect to backend. Make sure it's running on port 8000.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex flex-col flex-1 min-h-0 min-w-0 grid-bg"
      style={{ background: "var(--bg-primary)" }}
    >
      {/* Header */}
      <div
        className="flex flex-wrap items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0"
        style={{
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent, ${agent.color}, transparent)`,
          }}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to dashboard"
          className="flex items-center gap-2 text-xs font-medium px-3 py-2 sm:py-2.5 rounded-lg min-h-[44px] sm:min-h-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] border border-[var(--border)] bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]"
        >
          <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">Back</span>
        </button>
        <div
          className="w-px h-5 sm:h-6 flex-shrink-0 bg-[var(--border)]"
          aria-hidden
        />
        <div
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-base sm:text-lg flex-shrink-0"
          style={{
            background: `${agent.color}15`,
            border: `1px solid ${agent.color}30`,
          }}
        >
          {agent.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display font-semibold text-sm text-[var(--text-primary)] truncate">
            {agent.name} Agent
          </div>
          <div
            className="text-[10px] font-medium truncate"
            style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}
          >
            {agent.description}
          </div>
        </div>
        <div
          className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg flex-shrink-0"
          style={{
            background: "rgba(0,212,170,0.05)",
            border: "1px solid rgba(0,212,170,0.15)",
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full pulse-dot bg-[var(--accent-2)]"
          />
          <span className="font-mono text-[10px] text-[var(--accent-2)] tracking-wider hidden sm:inline">
            Online · {agent.model}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-6 sm:py-8 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[280px] sm:min-h-0 sm:h-full gap-6 sm:gap-8 fade-in">
            <div
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl flex-shrink-0"
              style={{
                background: `${agent.color}12`,
                border: `1px solid ${agent.color}25`,
              }}
            >
              {agent.icon}
            </div>
            <div className="text-center min-w-0 px-2">
              <div className="font-display text-lg sm:text-xl font-bold mb-2 text-[var(--text-primary)]">
                {agent.name} Agent
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                Ask me anything. I&apos;m ready.
              </p>
            </div>
            <div className="w-full max-w-md space-y-2 px-2">
              <div className="font-mono text-[10px] text-center mb-3 text-[var(--text-muted)] tracking-wider">
                Suggested prompts
              </div>
              {agent.prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  className="w-full text-left px-4 py-3 rounded-xl group flex items-center justify-between gap-3 min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5 transition-colors"
                >
                  <span className="text-xs sm:text-sm text-[var(--text-secondary)] line-clamp-2 sm:line-clamp-1 text-left flex-1 min-w-0">
                    {prompt}
                  </span>
                  <ArrowUpRight
                    className="w-3.5 h-3.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[var(--accent)]"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-3xl mx-auto w-full min-w-0">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 sm:gap-4 fade-in ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={
                    msg.role === "user"
                      ? {
                          background: "rgba(124,106,255,0.15)",
                          border: "1px solid rgba(124,106,255,0.3)",
                        }
                      : {
                          background: `${agent.color}12`,
                          border: `1px solid ${agent.color}25`,
                        }
                  }
                >
                  {msg.role === "user" ? (
                    <User className="w-3.5 h-3.5 text-[var(--accent)]" />
                  ) : (
                    <span className="text-sm">{agent.icon}</span>
                  )}
                </div>
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 sm:px-5 py-3 sm:py-3.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    msg.role === "user" ? "rounded-br-md" : "rounded-bl-md"
                  }`}
                  style={
                    msg.role === "user"
                      ? {
                          background: "rgba(124,106,255,0.12)",
                          border: "1px solid rgba(124,106,255,0.2)",
                          color: "var(--text-primary)",
                        }
                      : {
                          background: "var(--bg-card)",
                          border: "1px solid var(--border)",
                          color: "var(--text-secondary)",
                        }
                  }
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3 sm:gap-4 fade-in">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `${agent.color}12`,
                    border: `1px solid ${agent.color}25`,
                  }}
                >
                  <span className="text-sm">{agent.icon}</span>
                </div>
                <div
                  className="px-4 sm:px-5 py-3 sm:py-3.5 rounded-2xl rounded-bl-md flex items-center gap-3 min-w-0 bg-[var(--bg-card)] border border-[var(--border)]"
                >
                  <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin text-[var(--accent)]" />
                  <span className="font-mono text-xs text-[var(--text-muted)] tracking-wide">
                    Processing…
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="flex-shrink-0 px-4 sm:px-6 py-4 sm:py-5 border-t border-[var(--border)]"
        style={{ background: "var(--bg-secondary)" }}
      >
        <div className="max-w-3xl mx-auto w-full min-w-0">
          <div
            className="flex items-end gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl focus-within:ring-2 focus-within:ring-[var(--accent)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--bg-secondary)] transition-[border-color,box-shadow] bg-[var(--bg-card)] border border-[var(--border)]"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder={`Ask ${agent.name} anything…`}
              rows={1}
              className="flex-1 bg-transparent text-sm resize-none outline-none min-w-0 py-2 placeholder:text-[var(--text-muted)] text-[var(--text-primary)]"
              style={{ lineHeight: 1.6 }}
              aria-label="Message input"
            />
            <button
              type="button"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              aria-label="Send message"
              className="min-w-[44px] min-h-[44px] w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              style={{
                background:
                  input.trim() && !loading ? "var(--accent)" : "var(--bg-tertiary)",
                border: "1px solid var(--border)",
              }}
            >
              <Send className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
          <p className="text-center mt-2 font-mono text-[10px] text-[var(--text-muted)] tracking-wide">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
