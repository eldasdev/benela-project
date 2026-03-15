export type AboutHighlight = {
  title: string;
  description: string;
  metric?: string | null;
};

export type AboutMissionPoint = {
  title: string;
  description: string;
};

export type AboutTeamMember = {
  name: string;
  role: string;
  bio: string;
};

export type AboutFaqItem = {
  question: string;
  answer: string;
};

export type AboutPageContent = {
  id?: number;
  hero_eyebrow: string;
  hero_title: string;
  hero_subtitle: string;
  story_title: string;
  story_body: string;
  platform_highlights: AboutHighlight[];
  mission_title: string;
  mission_body: string;
  mission_points: AboutMissionPoint[];
  team_title: string;
  team_body: string;
  team_members: AboutTeamMember[];
  faq_title: string;
  faq_body: string;
  faqs: AboutFaqItem[];
  updated_at?: string;
};

export const DEFAULT_ABOUT_CONTENT: AboutPageContent = {
  hero_eyebrow: "ABOUT BENELA",
  hero_title: "A unified AI operating system for serious businesses.",
  hero_subtitle:
    "Benela brings finance, operations, collaboration, and AI execution into one platform so teams can run the company with fewer tools, faster decisions, and stronger control.",
  story_title: "Our Platform",
  story_body:
    "Benela is built for companies that have outgrown disconnected spreadsheets, chat threads, and point solutions. We combine ERP workflows, collaboration, reporting, and AI copilots into a single command layer.",
  platform_highlights: [
    {
      title: "One operational layer",
      description: "Finance, HR, projects, support, legal, procurement, and more in a single connected system.",
      metric: "9 modules",
    },
    {
      title: "Embedded AI execution",
      description: "Assistants analyze context, generate reports, structure work, and trigger next actions.",
      metric: "24/7 AI",
    },
    {
      title: "Built for control",
      description: "Real-time visibility, approval flows, audit trails, and configurable governance for leadership teams.",
      metric: "Full traceability",
    },
  ],
  mission_title: "Our Mission",
  mission_body:
    "We help ambitious teams run faster, with better visibility and stronger discipline, by turning operational complexity into one intelligent system.",
  mission_points: [
    {
      title: "Replace fragmentation",
      description: "Unify tools, workflows, and knowledge so teams stop losing time between disconnected systems.",
    },
    {
      title: "Increase execution speed",
      description: "Give managers and operators a live command layer for decisions, follow-through, and accountability.",
    },
    {
      title: "Make AI operational",
      description: "Use AI for actual business execution, not just chat, by grounding it in company context and workflows.",
    },
  ],
  team_title: "Leadership Team",
  team_body:
    "Product, engineering, operations, and customer success leaders building the next generation of business infrastructure.",
  team_members: [
    {
      name: "Shavkat M.",
      role: "Founder & Product Lead",
      bio: "Leads product direction, market strategy, and the operating model behind Benela.",
    },
    {
      name: "Core Platform Team",
      role: "Engineering & Infrastructure",
      bio: "Builds the platform foundation across data, integrations, AI orchestration, and application performance.",
    },
    {
      name: "Client Operations Team",
      role: "Implementation & Success",
      bio: "Works with clients on onboarding, rollout design, adoption, and measurable operational improvement.",
    },
  ],
  faq_title: "Frequently Asked Questions",
  faq_body: "Answers to the most important questions prospects and clients ask before rollout.",
  faqs: [
    {
      question: "Who is Benela built for?",
      answer:
        "Benela is designed for growing and established companies that need one operating system across finance, operations, people, and AI-assisted execution.",
    },
    {
      question: "Do you offer a free plan?",
      answer:
        "No. Benela is sold on paid plans, with a limited trial window configured by platform policy for qualified new accounts.",
    },
    {
      question: "Can Benela be tailored to our workflows?",
      answer:
        "Yes. Modules, policies, AI trainers, internal assistants, and integrations can be configured around how your company actually operates.",
    },
    {
      question: "How does the AI stay useful?",
      answer:
        "Benela assistants use live platform context, trained knowledge sources, and module-specific workflows to provide grounded output and actions.",
    },
  ],
};

export const emptyAboutHighlight = (): AboutHighlight => ({
  title: "",
  description: "",
  metric: "",
});

export const emptyAboutMissionPoint = (): AboutMissionPoint => ({
  title: "",
  description: "",
});

export const emptyAboutTeamMember = (): AboutTeamMember => ({
  name: "",
  role: "",
  bio: "",
});

export const emptyAboutFaqItem = (): AboutFaqItem => ({
  question: "",
  answer: "",
});
