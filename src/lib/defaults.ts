import type { AboutContent, ContactSettings, HomeContent } from "./types";

export const HOME_DEFAULTS: HomeContent = {
  heroEyebrow: "Software engineering · AI · Automation · CAD/BIM",
  heroHeading: "SOFTWARE. AI. AUTOMATION. ENGINEERING.",
  heroDescription:
    "Neo Forge Technology builds intelligent software, AI systems, business automation platforms and specialized CAD/BIM solutions for complex real-world workflows.",
  primaryCta: "Start a Project",
  secondaryCta: "Explore Our Work",
  featuredProjectIds: [],
  capabilities: [
    { title: "Perception", body: "Models that detect, track, read and measure what cameras see." },
    { title: "Automation", body: "Workflows and AI agents that take repetitive operational work off people." },
    { title: "Engineering tooling", body: "Plugins and parametric tools inside Revit, AutoCAD, SketchUp and BricsCAD." },
  ],
};

export const ABOUT_DEFAULTS: AboutContent = {
  headline: "A technology engineering company.",
  description:
    "Neo Forge Technology is a software engineering company working at the intersection of artificial intelligence, enterprise software and engineering technology. We build systems that run in production — not demonstrations.",
  approach:
    "We start from the client's actual workflow, define what must be measurably better, and build the smallest architecture that can grow. Data, models, interfaces and integrations are engineered together so the result can be deployed, maintained and extended.",
  capabilities: [
    "Artificial Intelligence", "Computer Vision", "Machine Learning", "Deep Learning", "Enterprise Software",
    "Business Automation", "CRM", "HRM", "ERP", "CAD / BIM", "Engineering Software", "Plugin Development",
  ],
};

export const CONTACT_DEFAULTS: ContactSettings = {
  email: "",
  phone: "",
  whatsapp: "",
  location: "",
  linkedin: "",
  github: "",
  x: "",
  youtube: "",
  chatEnabled: true,
  chatGreeting: "Hi — tell us what you're building and an engineer will reply here.",
};

export const DEFAULT_FAQS = [
  { question: "What kinds of projects do you take on?", answer: "Custom software across three areas: computer vision / machine learning, business platforms with AI automation (CRM, HRM, ERP), and CAD/BIM plugins and engineering software." },
  { question: "How does a project start?", answer: "Send us a short description through the contact form. We review the workflow, ask clarifying questions and propose scope, approach and timeline before any commitment." },
  { question: "Can you extend or integrate with our existing systems?", answer: "Yes. Most work involves integrating with existing databases, APIs, CAD platforms or business tools rather than replacing them." },
  { question: "Do you build for production or only prototypes?", answer: "Production. We focus on deployable, maintainable software, including deployment, monitoring and handover." },
];
