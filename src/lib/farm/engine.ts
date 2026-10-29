"use client";
/** Detection → tracking → zone logic for farm footage. Every number comes from the model's detections; nothing is inferred beyond them. */
import { ByteTracker } from "@/lib/vehicle/tracker";
import type { VClass } from "@/lib/vehicle/types";
import { AnimalDetector, type Raw } from "./detector";
import { groundPoint, inPolygon } from "./geometry";
import { ANIMALS, BY_KEY, type AnimalKey, type Det, type FrameOut, type Pt, type Summary, type ZoneEvent } from "./types";

export const LIMITS = { maxSeconds: 120, maxSamples: 600, maxImageMb: 20, maxVideoMb: 200 };

export class FarmProcessor {
  private tracker: ByteTracker; private confirmed = new Map<number, AnimalKey>(); private inside = new Map<number, boolean>(); private lastSeen = new Map<number, number>();
  events: ZoneEvent[] = []; private peak: Record<string, number> = {}; private instances = 0; private n = 0;
  constructor(private p: { conf: number; fps: number; minHits: number; w: number; h: number; zone: Pt[] | null }) { this.tracker = new ByteTracker(Math.max(0.5, p.conf + 0.1), Math.min(0.1, p.conf), 0.8, Math.max(5, Math.round(p.fps * 2))); }
  step(raw: Raw[], i: number, t: number): FrameOut {
    const tracks = this.tracker.update(raw.map((d) => [d.box.x1, d.box.y1, d.box.x2, d.box.y2]), raw.map((d) => d.score), raw.map((d) => d.cls as unknown as VClass));
    const byDet = new Map(tracks.map((tr) => [tr.detIndex, tr])); const dets: Det[] = []; const vis: Record<string, number> = {}; let inZone = 0; const seen = new Set<number>();
    raw.forEach((d, k) => {
      const tr = byDet.get(k); const cls = (tr ? (tr.cls as unknown as AnimalKey) : d.cls); vis[cls] = (vis[cls] ?? 0) + 1;
      const det: Det = { cls, score: d.score, box: d.box };
      if (tr) {
        det.track = tr.trackId; if (tr.hits >= this.p.minHits) {
          this.confirmed.set(tr.trackId, cls); seen.add(tr.trackId);
          if (this.p.zone) {
            const now = inPolygon(groundPoint(d.box, this.p.w, this.p.h), this.p.zone), was = this.inside.get(tr.trackId);
            if (was === undefined) { if (now) this.events.push({ t, track: tr.trackId, cls, kind: "enter", frame: i }); }
            else if (now !== was) this.events.push({ t, track: tr.trackId, cls, kind: now ? "enter" : "exit", frame: i });
            this.inside.set(tr.trackId, now); det.inZone = now; if (now) inZone++;
          }
          this.lastSeen.set(tr.trackId, i);
        }
      } else if (this.p.zone) { det.inZone = inPolygon(groundPoint(d.box, this.p.w, this.p.h), this.p.zone); if (det.inZone) inZone++; }
      dets.push(det);
    });
    for (const [c, k] of Object.entries(vis)) this.peak[c] = Math.max(this.peak[c] ?? 0, k);
    this.instances += raw.length; this.n++;
    return { i, t: Math.round(t * 1000) / 1000, dets, inZone };
  }
  summary(seconds: number, inferMs: number): Summary {
    const unique: Record<string, number> = {}; for (const c of this.confirmed.values()) unique[c] = (unique[c] ?? 0) + 1;
    return { frames: this.n, seconds: Math.round(seconds * 100) / 100, inferMs: Math.round(inferMs), unique, peak: this.peak, instances: this.instances, zone: this.p.zone, events: this.events, zoneEntries: this.events.filter((e) => e.kind === "enter").length };
  }
}

export function drawFrame(ctx: CanvasRenderingContext2D, dets: Det[], w: number, h: number, zone: Pt[] | null, opts: { labels?: boolean } = {}) {
  const lw = Math.max(2, Math.round(Math.max(w, h) / 450)), fs = Math.max(12, Math.round(Math.max(w, h) / 55));
  if (zone && zone.length >= 3) {
    ctx.beginPath(); zone.forEach(([x, y], k) => (k ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h))); ctx.closePath();
    ctx.fillStyle = "rgba(22,131,74,0.18)"; ctx.fill(); ctx.setLineDash([lw * 3, lw * 2]); ctx.strokeStyle = "#11643A"; ctx.lineWidth = lw; ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.font = `${fs}px Georgia, serif`; ctx.textBaseline = "top";
  for (const d of dets) {
    const c = BY_KEY[d.cls].color, { x1, y1, x2, y2 } = d.box; ctx.strokeStyle = d.inZone ? "#ef4444" : c; ctx.lineWidth = lw + (d.inZone ? 1 : 0); ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    if (opts.labels === false) continue;
    const txt = `${d.track !== undefined ? "#" + d.track + " " : ""}${BY_KEY[d.cls].label} ${(d.score * 100).toFixed(0)}%${d.inZone ? " · IN ZONE" : ""}`, tw = ctx.measureText(txt).width + 8, ty = Math.max(0, y1 - fs - 4);
    ctx.fillStyle = d.inZone ? "#ef4444" : c; ctx.fillRect(x1, ty, tw, fs + 4); ctx.fillStyle = "#fff"; ctx.fillText(txt, x1 + 4, ty + 2);
  }
}

export interface RunOpts { conf: number; sampleFps: number; minHits: number; zone: Pt[] | null; signal: AbortSignal; onFrame: (f: FrameOut, done: number, total: number) => void }
export async function runVideo(src: string, det: AnimalDetector, o: RunOpts): Promise<{ summary: Summary; frames: FrameOut[]; stopped: boolean; width: number; height: number; duration: number }> {
  const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = src;
  await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error("This video could not be opened in the browser. Try an MP4 (H.264) or WebM file.")); });
  const dur = v.duration, w = v.videoWidth, h = v.videoHeight;
  if (!isFinite(dur) || dur <= 0 || !w || !h) throw new Error("The video has no readable duration or frame size.");
  if (dur > LIMITS.maxSeconds) throw new Error(`The browser engine analyses clips up to ${LIMITS.maxSeconds} s; this one is ${dur.toFixed(0)} s. Trim it first.`);
  const total = Math.min(LIMITS.maxSamples, Math.max(1, Math.floor(dur * o.sampleFps)));
  const proc = new FarmProcessor({ conf: o.conf, fps: o.sampleFps, minHits: o.minHits, w, h, zone: o.zone }); const frames: FrameOut[] = [];
  const t0 = performance.now(); let infer = 0, stopped = false;
  for (let k = 0; k < total; k++) {
    if (o.signal.aborted) { stopped = true; break; }
    const t = Math.min(dur - 0.001, (k + 0.5) / o.sampleFps);
    await new Promise<void>((res) => { const done = () => { v.removeEventListener("seeked", done); res(); }; v.addEventListener("seeked", done); v.currentTime = t; });
    const a = performance.now(); const raw = await det.detect(v, w, h, o.conf); infer += performance.now() - a;
    const f = proc.step(raw, k, t); frames.push(f); o.onFrame(f, k + 1, total);
    if (k % 3 === 2) await new Promise((r) => setTimeout(r, 0));
  }
  v.removeAttribute("src"); v.load();
  return { summary: proc.summary((performance.now() - t0) / 1000, frames.length ? infer / frames.length : 0), frames, stopped, width: w, height: h, duration: dur };
}

export function eventsCsv(ev: ZoneEvent[]) { return ["time_s,frame,track,animal,event", ...ev.map((e) => `${e.t.toFixed(2)},${e.frame},${e.track},${e.cls},${e.kind}`)].join("\n"); }
export const labelOf = (k: string) => (ANIMALS.find((a) => a.key === k)?.label ?? k);
