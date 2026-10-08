import "server-only";
import { parseVideo, type ParsedVideo } from "./video";

export interface VideoItem extends ParsedVideo { title: string; thumbnail: string | null }

/** Resolves display data for each link. Vimeo thumbnails come from Vimeo's public oEmbed endpoint (cached a day). */
export async function resolveVideos(links: string[]): Promise<VideoItem[]> {
  const parsed = links.map((l) => parseVideo(l)).filter((v): v is ParsedVideo => !!v);
  return Promise.all(parsed.map(async (v) => {
    if (v.provider === "youtube") return { ...v, title: "YouTube video", thumbnail: v.thumb };
    try {
      const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(v.watchUrl)}&width=1280`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(4000) });
      if (res.ok) { const j = (await res.json()) as { thumbnail_url?: string; title?: string }; return { ...v, title: j.title || "Vimeo video", thumbnail: j.thumbnail_url || null }; }
    } catch { /* fall through to a plain placeholder */ }
    return { ...v, title: "Vimeo video", thumbnail: null };
  }));
}
