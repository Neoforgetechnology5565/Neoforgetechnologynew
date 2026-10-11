import { getPublishedPosts } from "@/lib/db";
import { siteUrl } from "@/lib/utils";

export const revalidate = 600;
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/** RSS 2.0 feed of published articles. */
export async function GET() {
  const base = siteUrl();
  const posts = (await getPublishedPosts()).slice(0, 30);
  const items = posts.map((p) => `<item><title>${esc(p.title)}</title><link>${base}/blog/${p.slug}</link><guid isPermaLink="true">${base}/blog/${p.slug}</guid><pubDate>${new Date(p.publishedAt || p.createdAt).toUTCString()}</pubDate><description>${esc(p.excerpt)}</description></item>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Neo Forge Technology — Blog</title><link>${base}/blog</link><description>Articles on AI, computer vision, automation and CAD/BIM engineering.</description><language>en</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } });
}
