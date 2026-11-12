import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE } from "./seo";
import type { LandingPage } from "./landing-types";
import { siteUrl } from "./utils";

const abs = (p: string) => `${siteUrl()}${p}`;
export const landingPath = (p: LandingPage) => `/${p.slug}`;

export function landingMetadata(p: LandingPage): Metadata {
  return {
    title: { absolute: p.metaTitle }, description: p.metaDescription, keywords: [p.primary, ...p.keywords],
    alternates: { canonical: landingPath(p) },
    robots: { index: true, follow: true },
    openGraph: { type: "website", siteName: "NeoForge Technologies", title: p.metaTitle, description: p.metaDescription, url: landingPath(p), images: [DEFAULT_OG_IMAGE] },
    twitter: { card: "summary_large_image", title: p.metaTitle, description: p.metaDescription, images: [DEFAULT_OG_IMAGE.url] },
  };
}

/** WebPage + Service + BreadcrumbList + FAQPage. Everything described here is visible on the page. */
export function landingLd(p: LandingPage) {
  const url = abs(landingPath(p));
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${url}#webpage`, url, name: p.metaTitle, description: p.metaDescription, inLanguage: "en", isPartOf: { "@id": abs("/#website") }, about: { "@id": `${url}#service` }, breadcrumb: { "@id": `${url}#breadcrumb` }, primaryImageOfPage: { "@type": "ImageObject", url: abs(DEFAULT_OG_IMAGE.url) } },
      { "@type": "Service", "@id": `${url}#service`, name: p.name, serviceType: p.primary, description: p.metaDescription, url, provider: { "@id": abs("/#organization") }, keywords: p.keywords.join(", "), mainEntityOfPage: { "@id": `${url}#webpage` } },
      { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [{ name: "Home", path: "/" }, { name: "Services", path: "/services" }, { name: p.name, path: landingPath(p) }].map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.path) })) },
      { "@type": "FAQPage", "@id": `${url}#faq`, mainEntity: p.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };
}
