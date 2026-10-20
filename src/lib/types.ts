import type { DivisionSlug } from "./divisions";

export interface MediaRef {
  url: string;
  publicId: string;
  resourceType: "image" | "video" | "raw";
  format?: string;
  bytes?: number;
  name?: string;
  width?: number;
  height?: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  division: DivisionSlug;
  description: string;
  capabilities: string[];
  enabled: boolean;
  order: number;
}

export interface Project {
  id: string;
  title: string;
  slug: string;
  division: DivisionSlug;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  summary: string;
  description: string;
  cover: MediaRef | null;
  gallery: MediaRef[];
  documents: MediaRef[];
  files: MediaRef[];
  videoUrl: string;
  /** YouTube / Vimeo links shown as clickable thumbnails */
  videoLinks: string[];
  video: MediaRef | null;
  technologies: string[];
  features: string[];
  challenge: string;
  solution: string;
  results: string;
  pipeline: string[];
  featured: boolean;
  status: "draft" | "published";
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  /** Markdown-style body (rendered without raw HTML) */
  content: string;
  cover: MediaRef | null;
  coverAlt: string;
  videoLinks: string[];
  tags: string[];
  /** Optional division this article relates to — used for internal links */
  division: DivisionSlug | "";
  author: string;
  seoTitle: string;
  seoDescription: string;
  status: "draft" | "published";
  publishedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  order: number;
  enabled: boolean;
}

export interface Review {
  id: string;
  name: string;
  /** Job title and/or company */
  role: string;
  quote: string;
  /** 1–5, or 0 when the review has no star rating */
  rating: number;
  /** Where the review is published, e.g. Clutch or LinkedIn (optional) */
  source: string;
  sourceUrl: string;
  order: number;
  enabled: boolean;
}

export interface HomeContent {
  heroEyebrow: string;
  heroHeading: string;
  heroDescription: string;
  primaryCta: string;
  secondaryCta: string;
  featuredProjectIds: string[];
  capabilities: { title: string; body: string }[];
}

export interface LegalContent {
  privacy: string;
  terms: string;
  /** Shown as "Last updated" (free text, e.g. 12 October 2026) */
  updated: string;
}

export interface AboutContent {
  headline: string;
  description: string;
  approach: string;
  capabilities: string[];
}

export interface ContactSettings {
  email: string;
  phone: string;
  whatsapp: string;
  location: string;
  linkedin: string;
  github: string;
  x: string;
  youtube: string;
  chatEnabled: boolean;
  chatGreeting: string;
  /** Answer live-chat messages automatically with an AI assistant (needs ANTHROPIC_API_KEY) */
  aiChatReply: boolean;
  /** Email an automatic acknowledgement to people who send the contact form (needs SMTP) */
  aiEmailReply: boolean;
}

export interface Branding {
  /** Logo for LIGHT backgrounds (dark lettering) — used in the header */
  logoLight: MediaRef | null;
  /** Logo for DARK backgrounds (white lettering) — used in the footer */
  logoDark: MediaRef | null;
  /** Square icon — favicon, app icon, browser tab */
  icon: MediaRef | null;
  /** Crop uniform empty margins around the logos automatically (Cloudinary e_trim) */
  autoTrim: boolean;
}

export interface Inquiry {
  id: string;
  name: string;
  email: string;
  company: string;
  projectType: string;
  division: string;
  budget: string;
  timeline: string;
  message: string;
  files: MediaRef[];
  status: "unread" | "read";
  createdAt: number;
  /** Set when an automatic acknowledgement email was sent to the visitor */
  autoReply?: { at: number; ai: boolean };
}
