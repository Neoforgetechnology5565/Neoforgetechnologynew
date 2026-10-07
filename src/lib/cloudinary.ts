import type { MediaRef } from "./types";

const cloud = () => process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "";

/** Optimised delivery URL for an image stored in Cloudinary. Falls back to the stored URL. */
export function img(m: MediaRef | null | undefined, opts: { w?: number; h?: number; crop?: "fill" | "limit" | "fit" } = {}): string {
  if (!m) return "";
  if (m.resourceType !== "image" || !m.url.includes("/upload/")) return m.url;
  const t = ["f_auto", "q_auto", opts.w ? `w_${opts.w}` : "", opts.h ? `h_${opts.h}` : "", opts.w || opts.h ? `c_${opts.crop || (opts.h ? "fill" : "limit")}` : ""]
    .filter(Boolean)
    .join(",");
  return m.url.replace("/upload/", `/upload/${t}/`);
}

export const isPdf = (m: MediaRef) => (m.format || "").toLowerCase() === "pdf" || /\.pdf($|\?)/i.test(m.url);

/** First-page thumbnail of a PDF — Cloudinary renders it on the fly (PDFs are uploaded as image resources). */
export function pdfThumb(m: MediaRef, w = 480): string {
  if (m.resourceType === "image" && m.url.includes("/upload/")) {
    return m.url.replace("/upload/", `/upload/pg_1,f_jpg,q_auto,w_${w},c_limit/`).replace(/\.pdf($|\?)/i, ".jpg$1");
  }
  return "";
}

export function videoPoster(m: MediaRef, w = 960): string {
  if (m.resourceType !== "video" || !m.url.includes("/upload/")) return "";
  return m.url.replace("/upload/", `/upload/so_1,f_jpg,q_auto,w_${w}/`).replace(/\.[a-z0-9]+($|\?)/i, ".jpg$1");
}

/** Convert a YouTube / Vimeo link into an embeddable URL; returns "" for anything else. */
export function embedUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (host === "youtube.com" && u.searchParams.get("v")) return `https://www.youtube-nocookie.com/embed/${u.searchParams.get("v")}`;
    if (host === "vimeo.com" && /^\/\d+/.test(u.pathname)) return `https://player.vimeo.com/video/${u.pathname.split("/")[1]}`;
  } catch {
    /* ignore */
  }
  return "";
}

export const cloudName = cloud;
