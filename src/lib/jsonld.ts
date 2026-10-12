import { iconUrl, img, logoUrl } from "./cloudinary";
import type { Division } from "./divisions";
import type { Branding, ContactSettings, Faq, Post, Project, Review } from "./types";
import { siteUrl } from "./utils";

/**
 * schema.org JSON-LD builders. Rule: only describe what is visibly on the page / entered in the admin.
 * No reviews or ratings, and no postal address (it is free text in the admin, so it is not marked up).
 */
const abs = (path: string) => `${siteUrl()}${path}`;
const clean = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== undefined && v !== null && !(Array.isArray(v) && !v.length))) as T;

export function organizationLd(contact: ContactSettings, branding: Branding) {
  const logo = branding.icon ? iconUrl(branding.icon, 512) : branding.logoLight ? logoUrl(branding.logoLight, { h: 112, trim: branding.autoTrim }) : "";
  return clean({
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": abs("/#organization"),
    name: "Neo Forge Technology",
    url: abs("/"),
    logo: logo ? { "@type": "ImageObject", url: logo } : undefined,
    description: "Software engineering company building AI and computer vision systems, CRM/HRM/ERP automation platforms and CAD/BIM plugins and engineering software.",
    email: contact.email,
    telephone: contact.phone,
    sameAs: [contact.linkedin, contact.github, contact.x, contact.youtube].filter(Boolean),
    contactPoint: contact.email || contact.phone ? [clean({ "@type": "ContactPoint", contactType: "sales", email: contact.email, telephone: contact.phone })] : undefined,
    knowsAbout: ["Computer vision", "Machine learning", "Deep learning", "Business process automation", "CRM", "HRM", "ERP", "Revit plugins", "AutoCAD plugins", "SketchUp extensions", "BricsCAD", "BIM automation"],
  });
}

export const websiteLd = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": abs("/#website"),
  url: abs("/"),
  name: "Neo Forge Technology",
  publisher: { "@id": abs("/#organization") },
});

export const breadcrumbLd = (items: { name: string; path: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.path) })),
});

export const serviceLd = (d: Division) => ({
  "@context": "https://schema.org",
  "@type": "Service",
  name: d.name,
  serviceType: d.name,
  description: d.intro,
  url: abs(`/${d.slug}`),
  provider: { "@id": abs("/#organization") },
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: `${d.short} services`,
    itemListElement: d.groups.map((g) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: g.title, description: g.items.slice(0, 8).join(", ") } })),
  },
});

/** Only call with FAQs that are rendered on the same page. */
export const faqLd = (faqs: Faq[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
});

export const projectLd = (p: Project, path: string) =>
  clean({
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: p.title,
    description: p.summary || p.description.slice(0, 200),
    url: abs(path),
    image: p.cover ? img(p.cover, { w: 1200 }) : undefined,
    keywords: p.technologies.join(", "),
    dateModified: p.updatedAt ? new Date(p.updatedAt).toISOString() : undefined,
    creator: { "@id": abs("/#organization") },
  });

export const articleLd = (p: Post) =>
  clean({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title,
    description: p.seoDescription || p.excerpt,
    image: p.cover ? [img(p.cover, { w: 1200, h: 630 })] : undefined,
    datePublished: p.publishedAt ? new Date(p.publishedAt).toISOString() : undefined,
    dateModified: new Date(p.updatedAt || p.publishedAt || Date.now()).toISOString(),
    author: { "@type": "Person", name: p.author || "Neo Forge Team" },
    publisher: { "@id": abs("/#organization") },
    mainEntityOfPage: abs(`/blog/${p.slug}`),
    keywords: p.tags.join(", "),
  });

/** Service landing page. Rating markup is added only with 3+ real, visible, rated reviews (all shown on the page). */
export function serviceLandingLd(s: { name: string; slug: string; metaDescription: string }, reviews: Review[]) {
  const rated = reviews.filter((r) => r.rating > 0);
  return clean({
    "@context": "https://schema.org",
    "@type": "Service",
    name: s.name,
    serviceType: s.name,
    description: s.metaDescription,
    url: abs(`/services/${s.slug}`),
    provider: { "@id": abs("/#organization") },
    aggregateRating: rated.length >= 3 ? { "@type": "AggregateRating", ratingValue: Number((rated.reduce((n, r) => n + r.rating, 0) / rated.length).toFixed(1)), reviewCount: rated.length, bestRating: 5, worstRating: 1 } : undefined,
    review: rated.length >= 3 ? rated.slice(0, 10).map((r) => ({ "@type": "Review", author: { "@type": "Person", name: r.name }, reviewBody: r.quote, reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 } })) : undefined,
  });
}
