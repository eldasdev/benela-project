import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  Clock3,
  LifeBuoy,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import MarketingPageLayout from "@/components/marketing/MarketingPageLayout";

export const metadata: Metadata = {
  title: "Contact | Benela AI",
  description: "Contact Benela for onboarding, support, privacy, commercial, and operational questions.",
};

type Channel = {
  title: string;
  icon: typeof BriefcaseBusiness;
  email: string;
  detail: string;
  sla: string;
  label: string;
  subject: string;
  bestFor: string[];
};

const contactChannels: Channel[] = [
  {
    title: "Sales and rollout",
    icon: BriefcaseBusiness,
    email: "hello@benela.dev",
    detail:
      "Use this lane for pricing, enterprise rollout planning, plan selection, commercial scope, and onboarding design.",
    sla: "Typical response within 1 business day",
    label: "New business",
    subject: "Benela rollout inquiry",
    bestFor: ["Pricing questions", "Enterprise rollout scope", "Demo and onboarding planning"],
  },
  {
    title: "Support and operations",
    icon: LifeBuoy,
    email: "support@benela.dev",
    detail:
      "Use this lane for workspace access issues, billing questions, broken flows, configuration help, and live platform troubleshooting.",
    sla: "Typical response the same business day",
    label: "Active customers",
    subject: "Benela support request",
    bestFor: ["Account access", "Billing issues", "Workspace and product troubleshooting"],
  },
  {
    title: "Legal and privacy",
    icon: ShieldCheck,
    email: "legal@benela.dev",
    detail:
      "Use this lane for privacy requests, compliance review, contractual questions, business document handling, and policy matters.",
    sla: "Typical response within 2 business days",
    label: "Compliance",
    subject: "Benela legal or privacy request",
    bestFor: ["Privacy requests", "Compliance review", "Contract and legal questions"],
  },
];

const intakeChecklist = [
  "Company or workspace name",
  "Email address linked to the affected account",
  "Short description of the request, issue, or desired outcome",
  "Relevant invoice number, transaction reference, or date if applicable",
  "Screenshots or files only when they materially help reproduce the issue",
];

const routingSteps = [
  {
    title: "Choose the right lane",
    body: "Route your request to sales, support, or legal first. That reduces internal handoff time.",
  },
  {
    title: "Send context once",
    body: "A short, complete first message is better than multiple fragmented follow-ups.",
  },
  {
    title: "We triage and respond",
    body: "The request is reviewed, routed if needed, and answered by the responsible team.",
  },
];

function buildMailto(email: string, subject: string) {
  const body = [
    "Company / workspace:",
    "",
    "Account email:",
    "",
    "Request summary:",
    "",
    "Relevant details:",
    "",
  ].join("\n");
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function ContactPage() {
  return (
    <MarketingPageLayout
      currentPath="/contact"
      eyebrow="Contact"
      title="A cleaner route to the right team."
      subtitle="Benela is structured around real operational work. Use the correct contact lane and your request reaches the people who can actually move it forward."
    >
      <section className="contact-page-shell">
        <div className="contact-command-grid marketing-layout-main-grid">
          <article className="contact-command-card">
            <div className="contact-command-badge">
              <Sparkles size={14} />
              Contact routing
            </div>
            <h2>Choose the fastest path in one glance.</h2>
            <p>
              The contact page should do one job well: reduce ambiguity. Each lane below is mapped to the type of request it should receive,
              the response window you can expect, and the best information to include in the first message.
            </p>

            <div className="contact-command-stats">
              <div className="contact-command-stat">
                <strong>3</strong>
                <span>clear contact lanes</span>
              </div>
              <div className="contact-command-stat">
                <strong>Same day</strong>
                <span>support response target</span>
              </div>
              <div className="contact-command-stat">
                <strong>7-day trial</strong>
                <span>for every paid plan</span>
              </div>
            </div>
          </article>

          <article className="contact-routing-card">
            <div className="contact-routing-head">
              <div>
                <span className="contact-routing-kicker">Response desk</span>
                <h3>How requests move inside Benela</h3>
              </div>
              <span className="contact-routing-pill">
                <Clock3 size={14} />
                Business-hours triage
              </span>
            </div>

            <div className="contact-routing-steps">
              {routingSteps.map((step, index) => (
                <div key={step.title} className="contact-routing-step">
                  <div className="contact-routing-index">0{index + 1}</div>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>

        <section className="contact-channel-grid marketing-layout-card-grid">
          {contactChannels.map((channel) => {
            const Icon = channel.icon;
            return (
              <article key={channel.title} className="contact-channel-card">
                <div className="contact-channel-head">
                  <div className="contact-channel-icon">
                    <Icon size={20} />
                  </div>
                  <span className="contact-channel-label">{channel.label}</span>
                </div>

                <h3>{channel.title}</h3>
                <p className="contact-channel-detail">{channel.detail}</p>

                <div className="contact-channel-tags">
                  {channel.bestFor.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>

                <div className="contact-channel-footer">
                  <a href={buildMailto(channel.email, channel.subject)} className="contact-channel-email">
                    <Mail size={16} />
                    {channel.email}
                  </a>
                  <span className="contact-channel-sla">{channel.sla}</span>
                </div>
              </article>
            );
          })}
        </section>

        <div className="contact-detail-grid marketing-layout-split-grid">
          <article className="contact-checklist-card">
            <div className="contact-section-head">
              <span className="contact-section-kicker">Before you send</span>
              <h3>Include enough detail to avoid a slow back-and-forth.</h3>
            </div>
            <p>
              Strong first messages are short, specific, and actionable. If your request is about a client workspace, billing event, or broken workflow,
              include the reference details once and let the team investigate from there.
            </p>
            <ul>
              {intakeChecklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="contact-action-card">
            <div className="contact-section-head">
              <span className="contact-section-kicker">New customers</span>
              <h3>Start with the commercial lane if you are evaluating Benela.</h3>
            </div>
            <p>
              Sales can help you align the plan, rollout expectations, onboarding sequence, and commercial scope before your team creates a long-term
              workspace.
            </p>

            <div className="contact-action-rows">
              <a href={buildMailto("hello@benela.dev", "Benela rollout inquiry")} className="contact-primary-action">
                Email sales
                <ArrowRight size={16} />
              </a>
              <Link href="/signup" className="contact-secondary-action">
                Start 7-day trial
              </Link>
            </div>

            <div className="contact-action-links">
              <Link href="/about">About the platform</Link>
              <Link href="/privacy">Privacy policy</Link>
              <Link href="/terms">Terms of service</Link>
            </div>
          </article>
        </div>
      </section>

      <style>{`
        .contact-page-shell {
          display: grid;
          gap: 22px;
        }

        .contact-command-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
          gap: 18px;
        }

        .contact-command-card,
        .contact-routing-card,
        .contact-channel-card,
        .contact-checklist-card,
        .contact-action-card {
          border-radius: 28px;
          border: 1px solid color-mix(in srgb, var(--border-default) 82%, transparent);
          background: color-mix(in srgb, var(--bg-panel) 94%, transparent);
          box-shadow: 0 24px 60px color-mix(in srgb, var(--brand-glow) 8%, transparent);
        }

        .contact-command-card {
          padding: 32px;
          background:
            radial-gradient(480px 180px at 100% 0%, color-mix(in srgb, var(--accent-soft) 32%, transparent), transparent 72%),
            color-mix(in srgb, var(--bg-surface) 92%, transparent);
        }

        .contact-command-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 14px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--accent-soft) 84%, white 16%);
          border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
          color: var(--accent);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .contact-command-card h2 {
          margin: 18px 0 0;
          font-size: clamp(28px, 3.4vw, 42px);
          line-height: 0.98;
          letter-spacing: -0.05em;
        }

        .contact-command-card p,
        .contact-checklist-card p,
        .contact-action-card p {
          margin: 14px 0 0;
          color: var(--text-subtle);
          font-size: 16px;
          line-height: 1.8;
        }

        .contact-command-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 24px;
        }

        .contact-command-stat {
          padding: 16px 14px;
          border-radius: 20px;
          border: 1px solid color-mix(in srgb, var(--border-default) 78%, transparent);
          background: color-mix(in srgb, var(--bg-panel) 92%, transparent);
        }

        .contact-command-stat strong {
          display: block;
          font-size: 18px;
          letter-spacing: -0.03em;
          color: var(--text-primary);
        }

        .contact-command-stat span {
          display: block;
          margin-top: 6px;
          font-size: 12px;
          line-height: 1.5;
          color: var(--text-subtle);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .contact-routing-card {
          padding: 28px;
          display: grid;
          gap: 18px;
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 94%, var(--accent-soft) 6%), color-mix(in srgb, var(--bg-panel) 96%, transparent));
        }

        .contact-routing-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .contact-routing-kicker,
        .contact-section-kicker {
          display: inline-block;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--accent);
        }

        .contact-routing-head h3,
        .contact-section-head h3 {
          margin: 10px 0 0;
          font-size: 28px;
          line-height: 1.02;
          letter-spacing: -0.04em;
        }

        .contact-routing-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--border-default) 82%, transparent);
          color: var(--text-primary);
          background: color-mix(in srgb, var(--bg-panel) 92%, transparent);
          font-size: 13px;
          font-weight: 600;
        }

        .contact-routing-steps {
          display: grid;
          gap: 14px;
        }

        .contact-routing-step {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 14px;
          align-items: start;
          padding-top: 14px;
          border-top: 1px solid color-mix(in srgb, var(--border-default) 76%, transparent);
        }

        .contact-routing-index {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: color-mix(in srgb, var(--accent-soft) 84%, white 16%);
          color: var(--accent);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .contact-routing-step strong {
          display: block;
          font-size: 16px;
          letter-spacing: -0.02em;
        }

        .contact-routing-step p {
          margin: 6px 0 0;
          color: var(--text-subtle);
          line-height: 1.75;
          font-size: 14px;
        }

        .contact-channel-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .contact-channel-card {
          padding: 26px;
          display: grid;
          gap: 16px;
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 92%, var(--accent-soft) 8%), color-mix(in srgb, var(--bg-panel) 96%, transparent));
        }

        .contact-channel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .contact-channel-icon {
          width: 48px;
          height: 48px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: color-mix(in srgb, var(--accent-soft) 84%, white 16%);
          border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
          color: var(--accent);
        }

        .contact-channel-label {
          padding: 8px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-subtle);
          background: color-mix(in srgb, var(--bg-panel) 94%, transparent);
          border: 1px solid color-mix(in srgb, var(--border-default) 82%, transparent);
        }

        .contact-channel-card h3 {
          margin: 0;
          font-size: 29px;
          line-height: 1;
          letter-spacing: -0.04em;
        }

        .contact-channel-detail {
          margin: 0;
          color: var(--text-subtle);
          line-height: 1.8;
          font-size: 15px;
          min-height: 112px;
        }

        .contact-channel-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .contact-channel-tags span {
          padding: 8px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-subtle);
          background: color-mix(in srgb, var(--bg-panel) 96%, transparent);
          border: 1px solid color-mix(in srgb, var(--border-default) 78%, transparent);
        }

        .contact-channel-footer {
          display: grid;
          gap: 10px;
          margin-top: 6px;
        }

        .contact-channel-email {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          width: fit-content;
          padding: 12px 16px;
          border-radius: 14px;
          text-decoration: none;
          color: white;
          font-weight: 700;
          background: linear-gradient(135deg, var(--accent), var(--accent-2));
          box-shadow: 0 16px 34px color-mix(in srgb, var(--accent) 24%, transparent);
        }

        .contact-channel-sla {
          font-size: 13px;
          color: var(--text-quiet);
        }

        .contact-detail-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.12fr) minmax(320px, 0.88fr);
          gap: 18px;
        }

        .contact-checklist-card,
        .contact-action-card {
          padding: 30px;
        }

        .contact-checklist-card ul {
          margin: 18px 0 0;
          padding-left: 22px;
          display: grid;
          gap: 10px;
          color: var(--text-subtle);
          line-height: 1.75;
        }

        .contact-action-card {
          background:
            radial-gradient(340px 160px at 100% 0%, color-mix(in srgb, var(--accent-soft) 30%, transparent), transparent 72%),
            color-mix(in srgb, var(--bg-surface) 92%, transparent);
        }

        .contact-action-rows {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 22px;
        }

        .contact-primary-action,
        .contact-secondary-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 50px;
          padding: 0 18px;
          border-radius: 16px;
          text-decoration: none;
          font-weight: 700;
          transition: transform 0.18s ease, border-color 0.18s ease;
        }

        .contact-primary-action {
          color: white;
          background: linear-gradient(135deg, var(--accent), var(--accent-2));
          box-shadow: 0 18px 34px color-mix(in srgb, var(--accent) 24%, transparent);
        }

        .contact-secondary-action {
          color: var(--text-primary);
          background: color-mix(in srgb, var(--bg-panel) 94%, transparent);
          border: 1px solid color-mix(in srgb, var(--border-default) 84%, transparent);
        }

        .contact-primary-action:hover,
        .contact-secondary-action:hover {
          transform: translateY(-1px);
        }

        .contact-action-links {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          margin-top: 20px;
        }

        .contact-action-links a {
          color: var(--text-subtle);
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
        }

        @media (max-width: 980px) {
          .contact-command-stats,
          .contact-channel-grid,
          .contact-detail-grid,
          .contact-command-grid {
            grid-template-columns: 1fr !important;
          }

          .contact-channel-detail {
            min-height: auto;
          }
        }

        @media (max-width: 720px) {
          .contact-command-card,
          .contact-routing-card,
          .contact-channel-card,
          .contact-checklist-card,
          .contact-action-card {
            padding: 22px;
            border-radius: 22px;
          }

          .contact-command-card h2,
          .contact-routing-head h3,
          .contact-section-head h3,
          .contact-channel-card h3 {
            font-size: 26px;
          }

          .contact-action-rows {
            flex-direction: column;
          }

          .contact-primary-action,
          .contact-secondary-action {
            width: 100%;
          }
        }
      `}</style>
    </MarketingPageLayout>
  );
}
