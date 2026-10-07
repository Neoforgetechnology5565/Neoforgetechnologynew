import { z } from "zod";
import { DIVISIONS, PROJECT_TYPES } from "./divisions";

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
  video: mediaSchema.nullable().default(null),
  technologies: z.array(shortText).max(40).default([]),
  features: z.array(shortText).max(40).default([]),
  challenge: longText.default(""),
  solution: longText.default(""),
  results: longText.default(""),
  pipeline: z.array(text(40)).max(6).default([]),
  featured: z.boolean().default(false),
  status: z.enum(["draft", "published"]).default("draft"),
  order: z.number().int().default(0),
});

export const faqSchema = z.object({
  question: z.string().min(1).max(300).transform(stripTags),
  answer: text(3000).default(""),
  order: z.number().int().default(0),
  enabled: z.boolean().default(true),
});

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
  whatsapp: z.string().max(20).transform((v) => v.replace(/[^\d]/g, "")),
  location: text(120),
  linkedin: httpUrl,
  github: httpUrl,
  x: httpUrl,
  youtube: httpUrl,
  chatEnabled: z.boolean(),
  chatGreeting: text(300),
});

export const contentSchemas = { home: homeSchema, about: aboutSchema, contact: contactSettingsSchema } as const;
export type ContentKey = keyof typeof contentSchemas;

export const inquirySchema = z.object({
  name: z.string().min(1).max(120).transform(stripTags),
  email: z.string().email().max(200),
  company: text(160).default(""),
  projectType: z.enum(PROJECT_TYPES),
  division: z.enum(["", ...DIVISIONS.map((d) => d.slug)] as [string, ...string[]]).default(""),
  budget: text(80).default(""),
  timeline: text(80).default(""),
  message: z.string().min(10).max(5000).transform(stripTags),
  files: z.array(mediaSchema).max(3).default([]),
  website: z.string().max(200).optional(), // honeypot
});

export const chatStartSchema = z.object({
  name: z.string().min(1).max(100).transform(stripTags),
  email: z.string().email().max(200).or(z.literal("")).default(""),
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
