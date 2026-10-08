import "server-only";
import { unstable_cache, revalidatePath, revalidateTag } from "next/cache";
import { adminDb, isFirebaseConfigured } from "./firebase-admin";
import { ABOUT_DEFAULTS, CONTACT_DEFAULTS, HOME_DEFAULTS } from "./defaults";
import type { AboutContent, Category, ContactSettings, Faq, HomeContent, Project } from "./types";
import type { DivisionSlug } from "./divisions";

export const C = {
  categories: "categories",
  projects: "projects",
  faqs: "faqs",
  content: "content",
  inquiries: "inquiries",
  chats: "chats",
  meta: "meta",
  daily: "analytics_daily",
  visitors: "analytics_visitors",
  totals: "analytics_totals",
} as const;

const TAG = "data";
export function invalidate() {
  revalidateTag(TAG);
  revalidatePath("/", "layout");
}

/** Public reads must never take the site down: fall back to defaults when Firestore is unavailable. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!isFirebaseConfigured()) return fallback;
  try {
    return await fn();
  } catch (e) {
    console.error("[db] read failed", e);
    return fallback;
  }
}

const cached = <T>(key: string, fn: () => Promise<T>) => unstable_cache(fn, [key], { tags: [TAG], revalidate: 300 });

/* ---------- normalisers (also the source of truth for "backfill" migrations) ---------- */
export function toProject(id: string, d: FirebaseFirestore.DocumentData): Project {
  return {
    id,
    title: d.title ?? "",
    slug: d.slug ?? id,
    division: d.division ?? "computer-vision",
    categoryId: d.categoryId ?? "",
    categoryName: d.categoryName ?? "",
    categorySlug: d.categorySlug ?? "",
    summary: d.summary ?? "",
    description: d.description ?? "",
    cover: d.cover ?? null,
    gallery: d.gallery ?? [],
    documents: d.documents ?? [],
    files: d.files ?? [],
    videoUrl: d.videoUrl ?? "",
    videoLinks: d.videoLinks ?? (d.videoUrl ? [d.videoUrl] : []),
    video: d.video ?? null,
    technologies: d.technologies ?? [],
    features: d.features ?? [],
    challenge: d.challenge ?? "",
    solution: d.solution ?? "",
    results: d.results ?? "",
    pipeline: d.pipeline ?? [],
    featured: d.featured ?? false,
    status: d.status === "published" ? "published" : "draft",
    order: d.order ?? 0,
    createdAt: d.createdAt ?? 0,
    updatedAt: d.updatedAt ?? 0,
  };
}
export function toCategory(id: string, d: FirebaseFirestore.DocumentData): Category {
  return {
    id,
    name: d.name ?? "",
    slug: d.slug ?? id,
    division: d.division ?? "computer-vision",
    description: d.description ?? "",
    capabilities: d.capabilities ?? [],
    enabled: d.enabled !== false,
    order: d.order ?? 0,
  };
}
const toFaq = (id: string, d: FirebaseFirestore.DocumentData): Faq => ({
  id,
  question: d.question ?? "",
  answer: d.answer ?? "",
  order: d.order ?? 0,
  enabled: d.enabled !== false,
});

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;
const byProject = (a: Project, b: Project) => a.order - b.order || b.createdAt - a.createdAt;

/* ---------- admin (uncached) reads ---------- */
export async function adminListProjects(): Promise<Project[]> {
  const snap = await adminDb().collection(C.projects).get();
  return snap.docs.map((d) => toProject(d.id, d.data())).sort(byProject);
}
export async function adminListCategories(): Promise<Category[]> {
  const snap = await adminDb().collection(C.categories).get();
  return snap.docs.map((d) => toCategory(d.id, d.data())).sort(byOrder);
}
export async function adminListFaqs(): Promise<Faq[]> {
  const snap = await adminDb().collection(C.faqs).get();
  return snap.docs.map((d) => toFaq(d.id, d.data())).sort(byOrder);
}

/* ---------- public cached reads ---------- */
export const getCategories = cached("categories", () =>
  safe(async () => (await adminListCategories()).filter((c) => c.enabled), [] as Category[]),
);

export const getPublishedProjects = cached("published-projects", () =>
  safe(async () => (await adminListProjects()).filter((p) => p.status === "published"), [] as Project[]),
);

export async function getProject(division: string, slug: string): Promise<Project | null> {
  const all = await getPublishedProjects();
  return all.find((p) => p.division === division && p.slug === slug) ?? null;
}

export async function getRelated(p: Project, n = 3): Promise<Project[]> {
  const all = await getPublishedProjects();
  const same = all.filter((x) => x.id !== p.id && x.division === p.division);
  same.sort((a, b) => Number(b.categoryId === p.categoryId) - Number(a.categoryId === p.categoryId));
  return same.slice(0, n);
}

export async function getFeaturedProjects(ids: string[], n = 6): Promise<Project[]> {
  const all = await getPublishedProjects();
  const picked = ids.map((id) => all.find((p) => p.id === id)).filter((p): p is Project => !!p);
  if (picked.length) return picked.slice(0, n);
  return all.filter((p) => p.featured).slice(0, n);
}

export const getFaqs = cached("faqs", () =>
  safe(async () => (await adminListFaqs()).filter((f) => f.enabled), [] as Faq[]),
);

async function readContent<T extends object>(key: string, defaults: T): Promise<T> {
  return safe(async () => {
    const doc = await adminDb().collection(C.content).doc(key).get();
    return { ...defaults, ...(doc.data() as Partial<T> | undefined) };
  }, defaults);
}
export const getHome = cached("content-home", () => readContent<HomeContent>("home", HOME_DEFAULTS));
export const getAbout = cached("content-about", () => readContent<AboutContent>("about", ABOUT_DEFAULTS));
export const getContactSettings = cached("content-contact", () => readContent<ContactSettings>("contact", CONTACT_DEFAULTS));

export async function adminGetContent(key: "home" | "about" | "contact") {
  const defaults = { home: HOME_DEFAULTS, about: ABOUT_DEFAULTS, contact: CONTACT_DEFAULTS }[key];
  return readContent(key, defaults as object);
}

export type { DivisionSlug };
