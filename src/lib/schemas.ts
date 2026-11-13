import { isCountry } from "./countries";
import { BUDGETS, BUDGET_DISCUSS, CURRENCIES, serviceInfo } from "./inquiry-options";
import { checkPhone } from "./phone";
import { z } from "zod";
import { DIVISIONS, PROJECT_TYPES } from "./divisions";
import { isVideoLink } from "./video";

/** Strip markup + control chars. React escapes output too; this is defence in depth for stored data. */
export const stripTags = (s: string) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();

const text = (max: number) => z.string().max(max).transform(stripTags);
const shortText = text(200);
const longText = text(8000);
const divisionEnum = z.enum(DIVISIONS.map((d) => d.slug) as [string, ...string[]]);

const cloudinaryUrl = z
  .string()
  .max(1000)
  .refine((u) => {
    try {
      const url = new URL(u);
      const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      return url.protocol === "https:" && url.hostname === "res.cloudinary.com" && (!cloud || url.pathname.startsWith(`/${cloud}/`));
    } catch {
      return false;
    }
  }, "Media must be hosted on Cloudinary");

export const mediaSchema = z.object({
  url: cloudinaryUrl,
  publicId: z.string().max(300),
  resourceType: z.enum(["image", "video", "raw"]),
  format: z.string().max(20).optional(),
  bytes: z.number().int().nonnegative().optional(),
  name: text(200).optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

const httpUrl = z
  .string()
  .max(500)
  .refine((u) => u === "" || /^https:\/\//i.test(u), "Must be an https:// URL");

export const categorySchema = z.object({
  name: z.string().min(1).max(80).transform(stripTags),
  slug: z.string().max(80).optional(),
  division: divisionEnum,
  description: text(1000).default(""),
  capabilities: z.array(shortText).max(40).default([]),
  enabled: z.boolean().default(true),
  order: z.number().int().default(0),
});

export const projectSchema = z.object({
  title: z.string().min(1).max(160).transform(stripTags),
  slug: z.string().max(100).optional(),
  division: divisionEnum,
  categoryId: z.string().max(100).default(""),
  summary: text(400).default(""),
  description: longText.default(""),
  cover: mediaSchema.nullable().default(null),
  gallery: z.array(mediaSchema).max(60).default([]),
  documents: z.array(mediaSchema).max(20).default([]),
  files: z.array(mediaSchema).max(20).default([]),
  videoUrl: httpUrl.default(""),
  videoLinks: z.array(z.string().trim().max(500).refine(isVideoLink, "Must be a YouTube or Vimeo link")).max(6).default([]),
  video: mediaSchema.nullable().default(null),
  technologies: z.array(shortText).max(40).default([]),
  features: z.array(shortText).max(40).default([]),
  kind: z.enum(["", "client", "demo", "prototype"]).default(""),
  industry: text(80).default(""),
  objective: longText.default(""),
  challenge: longText.default(""),
  solution: longText.default(""),
  results: longText.default(""),
  pipeline: z.array(text(40)).max(6).default([]),
  featured: z.boolean().default(false),
  status: z.enum(["draft", "published"]).default("draft"),
  order: z.number().int().default(0),
});

export const postSchema = z.object({
  title: z.string().min(1).max(160).transform(stripTags),
  slug: z.string().max(100).optional(),
  excerpt: text(300).default(""),
  // Body keeps markdown characters; raw HTML tags are stripped and never rendered.
  content: z.string().max(80000).transform((s) => s.replace(/<[^>]*>/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")).default(""),
  cover: mediaSchema.nullable().default(null),
  coverAlt: text(200).default(""),
  videoLinks: z.array(z.string().trim().max(500).refine(isVideoLink, "Must be a YouTube or Vimeo link")).max(6).default([]),
  tags: z.array(text(40).refine((t) => t.length > 0)).max(8).default([]),
  division: z.enum(["", ...DIVISIONS.map((d) => d.slug)] as [string, ...string[]]).default(""),
  author: text(80).default("Neo Forge Team"),
  seoTitle: text(70).default(""),
  seoDescription: text(170).default(""),
  status: z.enum(["draft", "published"]).default("draft"),
});

export const faqSchema = z.object({
  question: z.string().min(1).max(300).transform(stripTags),
  answer: text(3000).default(""),
  order: z.number().int().default(0),
  enabled: z.boolean().default(true),
});

export const reviewSchema = z.object({
  name: z.string().min(1).max(120).transform(stripTags),
  role: text(160).default(""),
  quote: z.string().min(10).max(1500).transform(stripTags),
  rating: z.number().int().min(0).max(5).default(0),
  source: text(60).default(""),
  sourceUrl: httpUrl.default(""),
  order: z.number().int().default(0),
  enabled: z.boolean().default(true),
  kind: z.enum(["sample", "verified"]).default("verified"),
  permission: z.boolean().default(false),
  evidence: text(300).default(""),
}).transform((r) => r.kind === "sample" ? { ...r, rating: 0, source: "", sourceUrl: "", permission: false, evidence: "" } : r)
  .refine((r) => r.kind !== "verified" || (r.permission && (r.sourceUrl || r.evidence)), { message: "A verified review needs the client's permission and either a link to the original or a note of where the proof is kept.", path: ["permission"] });

export const homeSchema = z.object({
  heroEyebrow: shortText,
  heroHeading: text(160),
  heroDescription: text(600),
  primaryCta: text(60),
  secondaryCta: text(60),
  featuredProjectIds: z.array(z.string().max(100)).max(12),
  capabilities: z.array(z.object({ title: text(80), body: text(400) })).max(9),
});

export const aboutSchema = z.object({
  headline: text(200),
  description: longText,
  approach: longText,
  capabilities: z.array(shortText).max(30),
});

export const contactSettingsSchema = z.object({
  email: z.string().max(200).refine((v) => v === "" || z.string().email().safeParse(v).success, "Invalid email"),
  phone: text(40),
  whatsapp: z.string().max(25).transform((v) => v.replace(/[^\d]/g, "")).refine((v) => v === "" || (v.length >= 8 && v.length <= 15 && !v.startsWith("0")), "WhatsApp number must include the country code (8–15 digits, no leading 0), e.g. 2348012345678"),
  location: text(120),
  linkedin: httpUrl,
  github: httpUrl,
  x: httpUrl,
  youtube: httpUrl,
  otherProfiles: z.array(z.string().trim().max(500)).max(20).transform((a) => [...new Set(a.filter(Boolean))]).refine((a) => a.every((u) => /^https:\/\/[^\s]+$/i.test(u)), "Each profile must be an https:// URL").default([]),
  chatEnabled: z.boolean(),
  chatGreeting: text(300),
  aiChatReply: z.boolean().default(true),
  aiEmailReply: z.boolean().default(true),
});

export const brandingSchema = z.object({
  logoLight: mediaSchema.nullable(),
  logoDark: mediaSchema.nullable(),
  icon: mediaSchema.nullable(),
  autoTrim: z.boolean(),
});

const legalText = z.string().max(40000).transform((s) => s.replace(/<[^>]*>/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ""));
export const legalSchema = z.object({ privacy: legalText, terms: legalText, updated: z.string().trim().max(60).transform(stripTags) });

export const contentSchemas = { home: homeSchema, about: aboutSchema, contact: contactSettingsSchema, branding: brandingSchema, legal: legalSchema } as const;
export type ContentKey = keyof typeof contentSchemas;

export const inquirySchema = z.object({
  name: z.string().min(1).max(120).transform(stripTags),
  email: z.string().email().max(200),
  company: text(160).default(""),
  /** The service the visitor needs (see inquiry-options). projectType is derived from it when not sent. */
  service: text(100).default(""),
  projectType: z.enum(PROJECT_TYPES).optional(),
  division: z.enum(["", ...DIVISIONS.map((d) => d.slug)] as [string, ...string[]]).default(""),
  country: z.string().refine(isCountry, "Choose a country"),
  /** ISO code of the dial code the number was entered with, and the number itself (validated against that country's numbering plan) */
  phoneCountry: z.string().refine(isCountry).optional(),
  phone: text(30).default(""),
  /** Compulsory: one of the form's own budget options (checked on the server so a direct request cannot skip it) */
  budget: z.string("Please select a budget").refine((v) => (BUDGETS as readonly string[]).includes(v) || v === BUDGET_DISCUSS, "Please select a budget"),
  currency: z.enum(CURRENCIES).default("USD"),
  timeline: text(80).default(""),
  preferredContact: z.enum(["email", "phone", "whatsapp", "video"]).default("email"),
  /** quote = the visitor asked for a customised quotation */
  intent: z.enum(["project", "quote"]).default("project"),
  tz: z.string().max(60).regex(/^[A-Za-z]+(\/[A-Za-z_+-]+)*$/).optional(),
  message: z.string().min(10).max(5000).transform(stripTags),
  files: z.array(mediaSchema).max(3).default([]),
  website: z.string().max(200).optional(), // honeypot
  /** When the form was shown (ms). A submission within 2.5 s of that is treated as a bot. */
  startedAt: z.number().int().optional(),
  /** Sent only when the visitor accepted statistics: links this message to their visit record. */
  vid: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/).optional(),
}).superRefine((v, ctx) => {
  if (v.phone && !checkPhone(v.phone, v.phoneCountry || v.country)) ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter a valid phone number for the selected country" });
  if ((v.preferredContact === "phone" || v.preferredContact === "whatsapp") && !v.phone) ctx.addIssue({ code: "custom", path: ["phone"], message: "Add a phone number so we can use your preferred contact method" });
}).transform((v) => {
  const ph = v.phone ? checkPhone(v.phone, v.phoneCountry || v.country) : null, svc = serviceInfo(v.service);
  return { ...v, phone: ph?.display ?? "", phoneE164: ph?.e164 ?? "", projectType: v.projectType ?? ((svc?.projectType ?? "Other") as (typeof PROJECT_TYPES)[number]), division: v.division || svc?.division || "" };
});

export const chatStartSchema = z.object({
  name: z.string().min(1).max(100).transform(stripTags),
  email: z.string().trim().email().max(200),
  message: z.string().min(1).max(2000).transform(stripTags),
});
export const chatMessageSchema = z.object({
  text: z.string().max(2000).transform(stripTags).default(""),
  file: mediaSchema.nullable().default(null),
}).refine((v) => v.text.length > 0 || v.file, "Empty message");

export const trackSchema = z.object({
  path: z.string().max(300),
  vid: z.string().min(8).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  project: z.string().max(200).optional(),
});
