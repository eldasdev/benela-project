"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Save,
  Plus,
  Trash2,
  Sparkles,
  Users2,
  Target,
  MessageSquareQuote,
} from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import {
  AdminMetricCard,
  AdminMetricGrid,
  AdminPageHero,
  adminButtonStyle,
} from "@/components/admin/ui";
import {
  DEFAULT_ABOUT_CONTENT,
  emptyAboutFaqItem,
  emptyAboutHighlight,
  emptyAboutMissionPoint,
  emptyAboutTeamMember,
  type AboutFaqItem,
  type AboutHighlight,
  type AboutMissionPoint,
  type AboutPageContent,
  type AboutTeamMember,
} from "@/lib/platform-about";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

export default function AdminAboutPage() {
  const [content, setContent] = useState<AboutPageContent>(DEFAULT_ABOUT_CONTENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const res = await authFetch(`${API}/admin/about`);
        if (!res.ok) throw new Error("Could not load About page content.");
        const data = (await res.json()) as AboutPageContent;
        if (!cancelled) {
          setContent({
            ...DEFAULT_ABOUT_CONTENT,
            ...data,
            platform_highlights: data.platform_highlights?.length ? data.platform_highlights : DEFAULT_ABOUT_CONTENT.platform_highlights,
            mission_points: data.mission_points?.length ? data.mission_points : DEFAULT_ABOUT_CONTENT.mission_points,
            team_members: data.team_members?.length ? data.team_members : DEFAULT_ABOUT_CONTENT.team_members,
            faqs: data.faqs?.length ? data.faqs : DEFAULT_ABOUT_CONTENT.faqs,
          });
        }
      } catch (e) {
        if (!cancelled) setError(readError(e, "Could not load About page content."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateField = <K extends keyof AboutPageContent>(key: K, value: AboutPageContent[K]) => {
    setContent((prev) => ({ ...prev, [key]: value }));
  };

  const updateListItem = <T,>(key: "platform_highlights" | "mission_points" | "team_members" | "faqs", index: number, value: T) => {
    setContent((prev) => {
      const next = [...(prev[key] as T[])];
      next[index] = value;
      return { ...prev, [key]: next };
    });
  };

  const addListItem = (key: "platform_highlights" | "mission_points" | "team_members" | "faqs") => {
    const value =
      key === "platform_highlights"
        ? emptyAboutHighlight()
        : key === "mission_points"
          ? emptyAboutMissionPoint()
          : key === "team_members"
            ? emptyAboutTeamMember()
            : emptyAboutFaqItem();

    setContent((prev) => ({ ...prev, [key]: [...prev[key], value] }));
  };

  const removeListItem = (key: "platform_highlights" | "mission_points" | "team_members" | "faqs", index: number) => {
    setContent((prev) => ({ ...prev, [key]: prev[key].filter((_, itemIndex) => itemIndex !== index) }));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await authFetch(`${API}/admin/about`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail || "Could not save About page content.");
      }
      const data = (await res.json()) as AboutPageContent;
      setContent({ ...content, ...data });
      setNotice("About page updated.");
    } catch (e) {
      setError(readError(e, "Could not save About page content."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={centerStyle}>
        <div style={spinnerStyle} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="admin-page-shell" style={{ maxWidth: "1460px", margin: "0 auto", display: "grid", gap: "18px" }}>
      <AdminPageHero
        eyebrow="Public About Page"
        title="Edit platform story, mission, team, and FAQ"
        subtitle="This content powers the public `/about` page. Update your platform narrative, leadership presentation, and buyer-facing answers from one controlled admin surface."
        actions={
          <button onClick={save} disabled={saving} style={adminButtonStyle("primary")}>
            <Save size={14} />
            {saving ? "Saving..." : "Save About Page"}
          </button>
        }
      />

      {(error || notice) && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "12px",
            fontSize: "12px",
            border: error ? "1px solid rgba(248,113,113,0.28)" : "1px solid rgba(52,211,153,0.28)",
            background: error ? "rgba(248,113,113,0.08)" : "rgba(52,211,153,0.08)",
            color: error ? "#f87171" : "#34d399",
          }}
        >
          {error || notice}
        </div>
      )}

      <AdminMetricGrid>
        <AdminMetricCard label="Highlights" value={content.platform_highlights.length} detail="Public differentiator cards" tone="accent" />
        <AdminMetricCard label="Mission points" value={content.mission_points.length} detail="Operating principles on the public page" tone="success" />
        <AdminMetricCard label="Team members" value={content.team_members.length} detail="Visible leadership profiles" tone="accent" />
        <AdminMetricCard label="FAQ entries" value={content.faqs.length} detail="Buyer-facing answers" tone="warning" />
      </AdminMetricGrid>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.08fr) minmax(340px, 0.92fr)", gap: "18px" }} className="admin-about-grid">
        <div style={{ display: "grid", gap: "16px" }}>
          <section style={panelStyle}>
            <div style={panelHeader}>
              <div>
                <div style={panelTitle}>Hero</div>
                <div style={panelSubtitle}>The main headline and value proposition for the About page.</div>
              </div>
            </div>
            <div style={panelBody}>
              <Field label="Eyebrow">
                <input value={content.hero_eyebrow} onChange={(e) => updateField("hero_eyebrow", e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Title">
                <textarea value={content.hero_title} onChange={(e) => updateField("hero_title", e.target.value)} style={{ ...textareaStyle, minHeight: "92px" }} />
              </Field>
              <Field label="Subtitle">
                <textarea value={content.hero_subtitle} onChange={(e) => updateField("hero_subtitle", e.target.value)} style={{ ...textareaStyle, minHeight: "120px" }} />
              </Field>
            </div>
          </section>

          <section style={panelStyle}>
            <div style={panelHeader}>
              <div>
                <div style={panelTitle}>Platform Story</div>
                <div style={panelSubtitle}>Explain what Benela is and what operational problem it solves.</div>
              </div>
            </div>
            <div style={panelBody}>
              <Field label="Section title">
                <input value={content.story_title} onChange={(e) => updateField("story_title", e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Story body">
                <textarea value={content.story_body} onChange={(e) => updateField("story_body", e.target.value)} style={{ ...textareaStyle, minHeight: "140px" }} />
              </Field>
              <ArrayHeader
                icon={<Sparkles size={14} />}
                title="Platform highlights"
                subtitle="Short cards for the strategic advantages of the platform."
                onAdd={() => addListItem("platform_highlights")}
              />
              <div style={{ display: "grid", gap: "12px" }}>
                {content.platform_highlights.map((item, index) => (
                  <HighlightEditor
                    key={`highlight-${index}`}
                    item={item}
                    onChange={(value) => updateListItem<AboutHighlight>("platform_highlights", index, value)}
                    onRemove={() => removeListItem("platform_highlights", index)}
                  />
                ))}
              </div>
            </div>
          </section>

          <section style={panelStyle}>
            <div style={panelHeader}>
              <div>
                <div style={panelTitle}>Mission</div>
                <div style={panelSubtitle}>Define the operating mission and the principles behind the platform.</div>
              </div>
            </div>
            <div style={panelBody}>
              <Field label="Mission title">
                <input value={content.mission_title} onChange={(e) => updateField("mission_title", e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Mission body">
                <textarea value={content.mission_body} onChange={(e) => updateField("mission_body", e.target.value)} style={{ ...textareaStyle, minHeight: "120px" }} />
              </Field>
              <ArrayHeader
                icon={<Target size={14} />}
                title="Mission points"
                subtitle="Three concise mission cards work best on the public page."
                onAdd={() => addListItem("mission_points")}
              />
              <div style={{ display: "grid", gap: "12px" }}>
                {content.mission_points.map((item, index) => (
                  <MissionEditor
                    key={`mission-${index}`}
                    item={item}
                    onChange={(value) => updateListItem<AboutMissionPoint>("mission_points", index, value)}
                    onRemove={() => removeListItem("mission_points", index)}
                  />
                ))}
              </div>
            </div>
          </section>

          <section style={panelStyle}>
            <div style={panelHeader}>
              <div>
                <div style={panelTitle}>Team</div>
                <div style={panelSubtitle}>Present the leadership or founding group with clear positioning.</div>
              </div>
            </div>
            <div style={panelBody}>
              <Field label="Team title">
                <input value={content.team_title} onChange={(e) => updateField("team_title", e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Team body">
                <textarea value={content.team_body} onChange={(e) => updateField("team_body", e.target.value)} style={{ ...textareaStyle, minHeight: "120px" }} />
              </Field>
              <ArrayHeader
                icon={<Users2 size={14} />}
                title="Team members"
                subtitle="Name, role, and short biography for each visible leader."
                onAdd={() => addListItem("team_members")}
              />
              <div style={{ display: "grid", gap: "12px" }}>
                {content.team_members.map((item, index) => (
                  <TeamEditor
                    key={`team-${index}`}
                    item={item}
                    onChange={(value) => updateListItem<AboutTeamMember>("team_members", index, value)}
                    onRemove={() => removeListItem("team_members", index)}
                  />
                ))}
              </div>
            </div>
          </section>

          <section style={panelStyle}>
            <div style={panelHeader}>
              <div>
                <div style={panelTitle}>FAQ</div>
                <div style={panelSubtitle}>Answer adoption, pricing, implementation, and AI trust questions.</div>
              </div>
            </div>
            <div style={panelBody}>
              <Field label="FAQ title">
                <input value={content.faq_title} onChange={(e) => updateField("faq_title", e.target.value)} style={inputStyle} />
              </Field>
              <Field label="FAQ intro">
                <textarea value={content.faq_body} onChange={(e) => updateField("faq_body", e.target.value)} style={{ ...textareaStyle, minHeight: "110px" }} />
              </Field>
              <ArrayHeader
                icon={<MessageSquareQuote size={14} />}
                title="FAQ items"
                subtitle="Clear buyer-facing questions and concise, trustworthy answers."
                onAdd={() => addListItem("faqs")}
              />
              <div style={{ display: "grid", gap: "12px" }}>
                {content.faqs.map((item, index) => (
                  <FaqEditor
                    key={`faq-${index}`}
                    item={item}
                    onChange={(value) => updateListItem<AboutFaqItem>("faqs", index, value)}
                    onRemove={() => removeListItem("faqs", index)}
                  />
                ))}
              </div>
            </div>
          </section>
        </div>

        <aside style={{ display: "grid", gap: "16px", alignContent: "start" }}>
          <section style={panelStyle}>
            <div style={panelHeader}>
              <div>
                <div style={panelTitle}>Publishing Notes</div>
                <div style={panelSubtitle}>Use this page as a controlled public narrative asset.</div>
              </div>
            </div>
            <div style={panelBody}>
              <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "10px", color: "var(--text-subtle)", fontSize: "13px", lineHeight: 1.7 }}>
                <li>Keep the hero statement strategic, not generic.</li>
                <li>Use three to four highlights only. Too many weakens hierarchy.</li>
                <li>Present actual leaders or clearly named teams, not placeholders.</li>
                <li>FAQ answers should reduce buyer hesitation and implementation uncertainty.</li>
              </ul>
            </div>
          </section>

          <section style={panelStyle}>
            <div style={panelHeader}>
              <div>
                <div style={panelTitle}>Public Preview Summary</div>
                <div style={panelSubtitle}>Fast sanity check before you publish changes.</div>
              </div>
            </div>
            <div style={panelBody}>
              <PreviewRow label="Hero headline" value={content.hero_title} />
              <PreviewRow label="Platform highlights" value={`${content.platform_highlights.length} cards`} />
              <PreviewRow label="Mission cards" value={`${content.mission_points.length} cards`} />
              <PreviewRow label="Team members" value={`${content.team_members.length} profiles`} />
              <PreviewRow label="FAQ entries" value={`${content.faqs.length} answers`} />
              <PreviewRow label="Last updated" value={content.updated_at ? new Date(content.updated_at).toLocaleString("en-GB") : "Not saved yet"} />
            </div>
          </section>
        </aside>
      </div>

      <style>{`
        @media (max-width: 1120px) {
          .admin-about-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

function readError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: "8px" }}>
      <span style={{ fontSize: "12px", color: "var(--text-subtle)", fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function ArrayHeader({
  icon,
  title,
  subtitle,
  onAdd,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onAdd: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: "12px", marginTop: "4px" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
          <span style={{ color: "var(--accent)" }}>{icon}</span>
          {title}
        </div>
        <div style={{ marginTop: "4px", fontSize: "12px", lineHeight: 1.6, color: "var(--text-subtle)" }}>{subtitle}</div>
      </div>
      <button type="button" onClick={onAdd} style={ghostBtn}>
        <Plus size={14} />
        Add
      </button>
    </div>
  );
}

function HighlightEditor({
  item,
  onChange,
  onRemove,
}: {
  item: AboutHighlight;
  onChange: (value: AboutHighlight) => void;
  onRemove: () => void;
}) {
  return (
    <div style={arrayCardStyle}>
      <div style={arrayCardActions}>
        <button type="button" onClick={onRemove} style={dangerIconBtn}>
          <Trash2 size={14} />
        </button>
      </div>
      <div style={tripleGrid}>
        <Field label="Title">
          <input value={item.title} onChange={(e) => onChange({ ...item, title: e.target.value })} style={inputStyle} />
        </Field>
        <Field label="Metric">
          <input value={item.metric || ""} onChange={(e) => onChange({ ...item, metric: e.target.value })} style={inputStyle} />
        </Field>
      </div>
      <Field label="Description">
        <textarea value={item.description} onChange={(e) => onChange({ ...item, description: e.target.value })} style={textareaStyle} />
      </Field>
    </div>
  );
}

function MissionEditor({
  item,
  onChange,
  onRemove,
}: {
  item: AboutMissionPoint;
  onChange: (value: AboutMissionPoint) => void;
  onRemove: () => void;
}) {
  return (
    <div style={arrayCardStyle}>
      <div style={arrayCardActions}>
        <button type="button" onClick={onRemove} style={dangerIconBtn}>
          <Trash2 size={14} />
        </button>
      </div>
      <Field label="Title">
        <input value={item.title} onChange={(e) => onChange({ ...item, title: e.target.value })} style={inputStyle} />
      </Field>
      <Field label="Description">
        <textarea value={item.description} onChange={(e) => onChange({ ...item, description: e.target.value })} style={textareaStyle} />
      </Field>
    </div>
  );
}

function TeamEditor({
  item,
  onChange,
  onRemove,
}: {
  item: AboutTeamMember;
  onChange: (value: AboutTeamMember) => void;
  onRemove: () => void;
}) {
  return (
    <div style={arrayCardStyle}>
      <div style={arrayCardActions}>
        <button type="button" onClick={onRemove} style={dangerIconBtn}>
          <Trash2 size={14} />
        </button>
      </div>
      <div style={tripleGrid}>
        <Field label="Name">
          <input value={item.name} onChange={(e) => onChange({ ...item, name: e.target.value })} style={inputStyle} />
        </Field>
        <Field label="Role">
          <input value={item.role} onChange={(e) => onChange({ ...item, role: e.target.value })} style={inputStyle} />
        </Field>
      </div>
      <Field label="Biography">
        <textarea value={item.bio} onChange={(e) => onChange({ ...item, bio: e.target.value })} style={textareaStyle} />
      </Field>
    </div>
  );
}

function FaqEditor({
  item,
  onChange,
  onRemove,
}: {
  item: AboutFaqItem;
  onChange: (value: AboutFaqItem) => void;
  onRemove: () => void;
}) {
  return (
    <div style={arrayCardStyle}>
      <div style={arrayCardActions}>
        <button type="button" onClick={onRemove} style={dangerIconBtn}>
          <Trash2 size={14} />
        </button>
      </div>
      <Field label="Question">
        <input value={item.question} onChange={(e) => onChange({ ...item, question: e.target.value })} style={inputStyle} />
      </Field>
      <Field label="Answer">
        <textarea value={item.answer} onChange={(e) => onChange({ ...item, answer: e.target.value })} style={{ ...textareaStyle, minHeight: "110px" }} />
      </Field>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: "4px", padding: "12px 0", borderBottom: "1px solid color-mix(in srgb, var(--border-default) 74%, transparent)" }}>
      <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-quiet)", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.6 }}>{value}</span>
    </div>
  );
}

const panelStyle: CSSProperties = {
  borderRadius: "16px",
  border: "1px solid color-mix(in srgb, var(--border-default) 82%, transparent)",
  background: "linear-gradient(160deg, color-mix(in srgb, var(--bg-surface) 90%, var(--accent-soft) 10%), color-mix(in srgb, var(--bg-panel) 96%, transparent))",
  boxShadow: "0 18px 40px rgba(5, 10, 24, 0.12)",
  overflow: "hidden",
};

const panelHeader: CSSProperties = {
  padding: "18px 20px",
  borderBottom: "1px solid color-mix(in srgb, var(--border-default) 74%, transparent)",
  background: "color-mix(in srgb, var(--bg-panel) 88%, var(--accent-soft) 12%)",
};

const panelTitle: CSSProperties = {
  fontSize: "15px",
  fontWeight: 700,
  color: "var(--text-primary)",
};

const panelSubtitle: CSSProperties = {
  marginTop: "4px",
  fontSize: "12px",
  lineHeight: 1.6,
  color: "var(--text-subtle)",
};

const panelBody: CSSProperties = {
  padding: "18px 20px",
  display: "grid",
  gap: "14px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: "42px",
  borderRadius: "12px",
  border: "1px solid var(--border-default)",
  background: "var(--bg-panel)",
  color: "var(--text-primary)",
  padding: "0 14px",
  fontSize: "14px",
  outline: "none",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: "92px",
  padding: "12px 14px",
  resize: "vertical",
};

const primaryBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  height: "44px",
  padding: "0 16px",
  borderRadius: "12px",
  border: "1px solid color-mix(in srgb, var(--accent) 70%, transparent)",
  background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
  color: "white",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 700,
  boxShadow: "0 14px 28px color-mix(in srgb, var(--accent) 30%, transparent)",
};

const ghostBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  height: "36px",
  padding: "0 12px",
  borderRadius: "10px",
  border: "1px solid var(--border-default)",
  background: "var(--bg-panel)",
  color: "var(--text-primary)",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: 600,
};

const arrayCardStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  gap: "12px",
  padding: "16px",
  borderRadius: "14px",
  border: "1px solid color-mix(in srgb, var(--border-default) 76%, transparent)",
  background: "color-mix(in srgb, var(--bg-panel) 90%, var(--accent-soft) 10%)",
};

const arrayCardActions: CSSProperties = {
  position: "absolute",
  top: "12px",
  right: "12px",
};

const dangerIconBtn: CSSProperties = {
  width: "34px",
  height: "34px",
  borderRadius: "10px",
  border: "1px solid rgba(248,113,113,0.28)",
  background: "rgba(248,113,113,0.08)",
  color: "#f87171",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const centerStyle: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const spinnerStyle: CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "50%",
  border: "2px solid color-mix(in srgb, var(--border-default) 84%, transparent)",
  borderTopColor: "var(--accent)",
  animation: "spin 0.8s linear infinite",
};

const tripleGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "12px",
};
