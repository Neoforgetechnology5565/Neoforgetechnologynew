/** Pure helpers shared by the admin editor, the API validator and the public page. */
export interface ParsedVideo {
  provider: "youtube" | "vimeo";
  id: string;
  /** Vimeo unlisted-link hash, if present */
  hash?: string;
  watchUrl: string;
  embedUrl: string;
  /** Direct thumbnail for YouTube. Vimeo thumbnails need an oEmbed lookup (see video-server.ts). */
  thumb: string | null;
  thumbFallback: string | null;
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseVideo(input: string): ParsedVideo | null {
  let u: URL;
  try { u = new URL(input.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");

  if (host === "youtu.be" || host === "youtube.com" || host === "youtube-nocookie.com") {
    let id = "";
    if (host === "youtu.be") id = u.pathname.split("/")[1] || "";
    else if (u.pathname === "/watch") id = u.searchParams.get("v") || "";
    else { const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?]+)/); id = m?.[1] || ""; }
    if (!YT_ID.test(id)) return null;
    return {
      provider: "youtube", id,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      thumb: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
      thumbFallback: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => /^\d+$/.test(p));
    if (idx === -1) return null;
    const id = parts[idx];
    const hash = parts[idx + 1] && /^[a-z0-9]+$/i.test(parts[idx + 1]) ? parts[idx + 1] : u.searchParams.get("h") || undefined;
    const q = hash ? `?h=${hash}` : "";
    return {
      provider: "vimeo", id, hash,
      watchUrl: `https://vimeo.com/${id}${hash ? `/${hash}` : ""}`,
      embedUrl: `https://player.vimeo.com/video/${id}${q}`,
      thumb: null, thumbFallback: null,
    };
  }
  return null;
}

export const isVideoLink = (s: string) => parseVideo(s) !== null;
