"use client";
import { useEffect, useState } from "react";
import type { VideoItem } from "@/lib/video-server";

function Thumb({ v, big }: { v: VideoItem; big?: boolean }) {
  const [src, setSrc] = useState(v.thumbnail);
  return (
    <span className="relative block aspect-video w-full overflow-hidden bg-slate-900">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${v.title} — video thumbnail`} loading="lazy" decoding="async"
          onError={() => (src !== v.thumbFallback && v.thumbFallback ? setSrc(v.thumbFallback) : setSrc(null))}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
      ) : (
        <span className="flex h-full items-center justify-center text-sm font-medium capitalize text-slate-300">{v.provider} video</span>
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-slate-950/20 transition group-hover:bg-slate-950/35">
        <span className={`flex items-center justify-center rounded-full bg-white/95 text-blue-600 shadow-xl transition group-hover:scale-110 ${big ? "h-20 w-20" : "h-14 w-14"}`}>
          <svg viewBox="0 0 24 24" fill="currentColor" className={big ? "h-8 w-8" : "h-6 w-6"} aria-hidden><path d="M8 5v14l11-7z" /></svg>
        </span>
      </span>
    </span>
  );
}

/** Clickable video thumbnails. Clicking opens the video in a viewer (YouTube / Vimeo embed, autoplay). */
export default function VideoLinks({ items }: { items: VideoItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    if (open === null) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [open]);
  if (!items.length) return null;
  const cur = open !== null ? items[open] : null;
  const embed = cur ? `${cur.embedUrl}${cur.embedUrl.includes("?") ? "&" : "?"}autoplay=1` : "";

  return (
    <>
      <ul className={`grid gap-4 ${items.length === 1 ? "" : "sm:grid-cols-2"}`}>
        {items.map((v, i) => (
          <li key={v.watchUrl}>
            <button type="button" onClick={() => setOpen(i)} aria-label={`Play video: ${v.title}`} className="group block w-full overflow-hidden rounded-2xl border border-stone-200 text-left transition hover:shadow-xl">
              <Thumb v={v} big={items.length === 1} />
            </button>
            <p className="mt-2 flex items-center justify-between gap-3 text-xs text-stone-500">
              <span className="truncate">{v.title}</span>
              <a href={v.watchUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 font-medium text-blue-600 hover:underline">Open on {v.provider === "youtube" ? "YouTube" : "Vimeo"} ↗</a>
            </p>
          </li>
        ))}
      </ul>
      {cur && (
        <div role="dialog" aria-modal="true" aria-label={cur.title} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4" onClick={() => setOpen(null)}>
          <div className="aspect-video w-full max-w-5xl overflow-hidden rounded-xl bg-black shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <iframe src={embed} title={cur.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="h-full w-full" />
          </div>
          <button type="button" aria-label="Close video" onClick={() => setOpen(null)} className="absolute right-4 top-4 p-2 text-3xl leading-none text-white">✕</button>
        </div>
      )}
    </>
  );
}
