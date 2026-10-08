"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { parseVideo, type ParsedVideo } from "@/lib/video";

function Preview({ v }: { v: ParsedVideo }) {
  const [src, setSrc] = useState<string | null>(v.thumbFallback ?? v.thumb);
  const [title, setTitle] = useState("");
  useEffect(() => {
    if (v.provider !== "vimeo") return;
    let alive = true;
    fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(v.watchUrl)}&width=480`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j) { setSrc(j.thumbnail_url || null); setTitle(j.title || ""); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [v]);
  return (
    <div className="relative aspect-video w-40 shrink-0 overflow-hidden bg-slate-900 sm:w-48">
      {src ? <img src={src} alt={title ? `${title} thumbnail` : "Video thumbnail"} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs capitalize text-slate-300">{v.provider}</span>}
      <span className="absolute inset-0 flex items-center justify-center"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-blue-600"><svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden><path d="M8 5v14l11-7z" /></svg></span></span>
    </div>
  );
}

/** Paste YouTube / Vimeo links → thumbnail preview + remove. Stores the original links. */
export default function VideoLinksField({ value, onChange, max = 6 }: { value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  function add() {
    const raw = text.trim();
    if (!raw) return;
    const v = parseVideo(raw);
    if (!v) { setError("That doesn't look like a YouTube or Vimeo link. Paste the video page address, e.g. https://www.youtube.com/watch?v=… or https://vimeo.com/123456789"); return; }
    if (value.some((x) => parseVideo(x)?.watchUrl === v.watchUrl)) { setError("That video is already added."); return; }
    if (value.length >= max) { setError(`You can add up to ${max} videos.`); return; }
    onChange([...value, raw]); setText(""); setError("");
  }

  return (
    <div>
      <span className="label">Video links (YouTube or Vimeo)</span>
      <div className="flex gap-2">
        <input className="field" value={text} onChange={(e) => { setText(e.target.value); setError(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          onPaste={(e) => { const t = e.clipboardData.getData("text"); if (parseVideo(t) && !text) { e.preventDefault(); setText(t.trim()); setTimeout(() => (document.getElementById("video-add") as HTMLButtonElement | null)?.focus(), 0); } }}
          placeholder="Paste a YouTube or Vimeo link, then press Add" aria-label="Video link" />
        <button id="video-add" type="button" className="btn-primary !py-2 shrink-0" onClick={add}>Add</button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      <ul className="mt-3 space-y-2">
        {value.map((l, i) => {
          const v = parseVideo(l);
          if (!v) return null;
          return (
            <li key={l + i} className="flex items-center gap-3 border border-paper/15 p-2">
              <Preview v={v} />
              <div className="min-w-0 flex-1 text-xs">
                <p className="font-medium capitalize text-paper">{v.provider}</p>
                <p className="truncate text-paper/50">{l}</p>
                <p className="mt-1 text-paper/40">Visitors see this thumbnail; clicking it plays the video.</p>
              </div>
              <div className="flex shrink-0 flex-col gap-1 text-xs">
                <button type="button" disabled={i === 0} className="hover:text-forge disabled:opacity-30" aria-label="Move up" onClick={() => { const a = [...value]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; onChange(a); }}>↑</button>
                <button type="button" disabled={i === value.length - 1} className="hover:text-forge disabled:opacity-30" aria-label="Move down" onClick={() => { const a = [...value]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; onChange(a); }}>↓</button>
                <button type="button" className="text-red-600" aria-label="Remove video" onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
