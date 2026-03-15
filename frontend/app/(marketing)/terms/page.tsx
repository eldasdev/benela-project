import type { Metadata } from "next";
import MarketingPageLayout from "@/components/marketing/MarketingPageLayout";

export const metadata: Metadata = {
  title: "Terms of Service | Benela AI",
  description: "The service terms governing Benela subscriptions, usage, and account responsibilities.",
};

const summaryCards = [
  {
    title: "Trials and billing",
    body: "Every paid plan starts with a 7-day trial. Continued use after the trial requires an active paid subscription.",
  },
  {
    title: "Workspace responsibility",
    body: "Customers are responsible for the people they invite, the data they upload, and the actions taken within their workspace.",
  },
  {
    title: "Operational use",
    body: "Benela is designed for business operations. Misuse, abuse, or attempts to compromise the service are prohibited.",
  },
];

const sections = [
  {
    title: "1. Accounts and access",
    paragraphs: [
      "You must provide accurate business and account information when creating a Benela workspace. Access credentials must be kept secure and may not be shared outside your authorized team.",
      "Workspace administrators are responsible for assigning roles, approving access, and keeping their organization data current.",
    ],
  },
  {
    title: "2. Plans, trials, and payment",
    paragraphs: [
      "Benela does not offer a free plan. New customers receive a 7-day trial on paid plans. After the trial, continued access depends on the selected paid subscription and current billing status.",
      "Fees, billing cycles, seat limits, and plan entitlements are defined in the active subscription. Failure to pay may result in restricted access or suspension.",
    ],
  },
  {
    title: "3. Customer data and confidentiality",
    paragraphs: [
      "You retain responsibility for the business data, documents, messages, and files uploaded to your workspace. Benela processes that information to provide the service and secure the platform.",
      "We treat customer workspace data as confidential except where disclosure is required to operate the service, comply with law, or prevent abuse.",
    ],
  },
  {
    title: "4. AI assistance and outputs",
    paragraphs: [
      "Benela includes AI-assisted features such as workflow guidance, task generation, and operational analysis. AI outputs should be reviewed by your team before being treated as final business decisions.",
      "You remain responsible for validating sensitive legal, financial, HR, or customer-facing decisions made using platform outputs.",
    ],
  },
  {
    title: "5. Acceptable use",
    paragraphs: [
      "You may not use Benela to violate law, infringe rights, interfere with other customers, reverse engineer restricted parts of the platform, or attempt unauthorized access to systems or data.",
    ],
    bullets: [
      "No credential abuse, scraping, or disruption of the service",
      "No unlawful, deceptive, or harmful content distribution",
      "No attempts to access other clients' data or private communications",
      "No misuse of AI features for spam, fraud, or security circumvention",
    ],
  },
  {
    title: "6. Suspension and termination",
    paragraphs: [
      "Benela may suspend or restrict access where needed to protect platform security, address non-payment, investigate abuse, or comply with legal obligations.",
      "Customers may request cancellation at the end of a billing period unless otherwise stated in their commercial agreement.",
    ],
  },
  {
    title: "7. Warranty, liability, and support",
    paragraphs: [
      "The platform is provided on a commercial best-effort basis subject to your active plan and applicable service commitments. Except where required by law or contract, Benela disclaims warranties not expressly stated.",
      "To the maximum extent permitted by law, indirect, consequential, or special damages are excluded. Contact legal@benela.dev for contractual or legal questions.",
    ],
  },
];

export default function TermsPage() {
  return (
    <MarketingPageLayout
      currentPath="/terms"
      eyebrow="Terms"
      title="Terms built for serious operational software."
      subtitle="These terms govern how organizations access Benela, how subscriptions work, and the responsibilities that come with operating business workflows on the platform."
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
