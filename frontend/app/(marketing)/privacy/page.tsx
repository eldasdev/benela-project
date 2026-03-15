import type { Metadata } from "next";
import MarketingPageLayout from "@/components/marketing/MarketingPageLayout";

export const metadata: Metadata = {
  title: "Privacy Policy | Benela AI",
  description: "How Benela collects, uses, stores, and protects customer information.",
};

const summaryCards = [
  {
    title: "What we collect",
    body: "Account, billing, workspace configuration, usage logs, uploaded files, and support communications required to operate the platform.",
  },
  {
    title: "How we use it",
    body: "To deliver the service, secure workspaces, improve reliability, support customers, and meet billing and legal obligations.",
  },
  {
    title: "Your controls",
    body: "Admins can update business details, manage documents, request exports, and contact Benela for account-level privacy requests.",
  },
];

const sections = [
  {
    title: "1. Information we collect",
    paragraphs: [
      "Benela collects information you provide directly when creating an account, setting up a workspace, managing subscriptions, uploading business documents, or contacting support.",
      "We also collect operational data needed to run the product, including authentication logs, workspace configuration, billing metadata, product usage events, and files shared within the platform or connected assistants.",
    ],
    bullets: [
      "Identity data such as name, email address, company name, country, and role",
      "Workspace data such as business profile fields, preferences, permissions, and connected integrations",
      "Operational data such as API logs, device/browser metadata, notifications, and audit events",
      "Billing and subscription data such as plan, payment status, invoices, and transaction references",
    ],
  },
  {
    title: "2. How we use information",
    paragraphs: [
      "We use information to provide and secure the platform, personalize workspace operations, respond to requests, process billing, and improve reliability and product quality.",
      "We may also use aggregated, non-identifying usage patterns to understand feature adoption and platform performance.",
    ],
  },
  {
    title: "3. Sharing and subprocessors",
    paragraphs: [
      "We do not sell customer data. Information may be shared with carefully selected infrastructure, security, analytics, communication, and payment providers only when necessary to operate Benela.",
      "Where third parties process data on our behalf, they are bound by contractual and security obligations appropriate to the service they provide.",
    ],
  },
  {
    title: "4. Security and retention",
    paragraphs: [
      "Benela uses access controls, encrypted transport, audit trails, and operational monitoring to protect platform data. No system is risk-free, but we design and operate the platform to minimize exposure and detect misuse quickly.",
      "We retain customer data only as long as needed to provide the service, meet contractual obligations, resolve disputes, or satisfy legal requirements.",
    ],
  },
  {
    title: "5. Your rights and requests",
    paragraphs: [
      "Depending on your jurisdiction, you may have rights to access, correct, export, or delete certain personal data. Workspace administrators may also manage business profile data and uploaded documents directly inside the platform.",
      "Requests that require account-level review can be sent to our privacy contact below.",
    ],
  },
  {
    title: "6. Contact",
    paragraphs: [
      "For privacy-related requests, contact privacy@benela.dev. For general support questions, contact support@benela.dev.",
      "Last updated: March 15, 2026.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <MarketingPageLayout
      currentPath="/privacy"
      eyebrow="Privacy"
      title="Privacy that matches enterprise operations."
      subtitle="This policy explains what Benela collects, how it is used, and the controls available to workspace owners and team administrators."
    >
      <section
        className="marketing-layout-card-grid"
        style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "18px", marginBottom: "24px" }}
      >
        {summaryCards.map((card) => (
          <article
            key={card.title}
            style={{
              padding: "24px",
              borderRadius: "24px",
              border: "1px solid color-mix(in srgb, var(--border-default) 82%, transparent)",
              background: "color-mix(in srgb, var(--bg-surface) 92%, var(--accent-soft) 8%)",
              boxShadow: "0 20px 54px color-mix(in srgb, var(--brand-glow) 10%, transparent)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "22px", lineHeight: 1.05, letterSpacing: "-0.03em" }}>{card.title}</h2>
            <p style={{ margin: "12px 0 0", color: "var(--text-subtle)", lineHeight: 1.75, fontSize: "15px" }}>{card.body}</p>
          </article>
        ))}
      </section>

      <section style={{ display: "grid", gap: "18px" }}>
        {sections.map((section) => (
          <article
            key={section.title}
            style={{
              padding: "28px",
              borderRadius: "26px",
              border: "1px solid color-mix(in srgb, var(--border-default) 84%, transparent)",
              background: "color-mix(in srgb, var(--bg-panel) 94%, transparent)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "24px", letterSpacing: "-0.03em" }}>{section.title}</h2>
            <div style={{ display: "grid", gap: "12px", marginTop: "14px" }}>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} style={{ margin: 0, color: "var(--text-subtle)", lineHeight: 1.8, fontSize: "15px" }}>
                  {paragraph}
                </p>
              ))}
            </div>
            {section.bullets ? (
              <ul style={{ margin: "16px 0 0", paddingLeft: "20px", display: "grid", gap: "10px", color: "var(--text-subtle)", lineHeight: 1.7 }}>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </section>
    </MarketingPageLayout>
  );
}
