"use client";
/** In-browser replacement for the video service: same ViApi contract, so the three apps run on any static host. Video never leaves the page; detection is YOLOX-tiny
 *  (ONNX Runtime Web), tracking is ByteTrack, ball finding is colour/motion + a gated tracker, and the derived results are computed by ./analytics. */
import { ByteTracker } from "@/lib/vehicle/tracker";
import type { VClass } from "@/lib/vehicle/types";
import { ViError, type Observations, type ViApi, type ViHealth, type ViSample, type VideoState } from "../api";
import * as A from "./analytics";
import { BallTracker, colourCandidates, type Cand } from "./ball";
import { ViDetector } from "./detector";
import { buildPdf } from "./pdf";

export type BrowserApi = ViApi & { browser: true; directUrl(id: string): string | null };
const LIMITS = { max_video_mb: 200, max_video_seconds: 120, max_analysed_frames: 900, max_concurrent_jobs: 1 };
interface Rec { id: string; url: string; revoke: boolean; state: VideoState; an: A.Analysis | null; abort: AbortController | null; params: Record<string, unknown> | null }
let detectorP: Promise<ViDetector> | null = null;
const detector = () => (detectorP ??= ViDetector.create().catch((e) => { detectorP = null; throw e; }));
const num = (b: Record<string, unknown>, k: string, lo: number, hi: number, d: number | null): number | null => { const v = b[k]; if (v === undefined || v === null) return d; if (typeof v !== "number" || Number.isNaN(v)) throw new ViError(400, `${k} must be a number.`); if (v < lo || v > hi) throw new ViError(400, `${k} must be between ${lo} and ${hi}.`); return v; };
const obj = (b: unknown): Record<string, unknown> => { if (b === null || b === undefined) return {}; if (typeof b !== "object" || Array.isArray(b)) throw new ViError(400, "The request body must be a JSON object."); return b as Record<string, unknown>; };
const seek = (v: HTMLVideoElement, t: number) => new Promise<void>((res) => { const d = () => { v.removeEventListener("seeked", d); res(); }; v.addEventListener("seeked", d); v.currentTime = t; });
const tick = () => new Promise((r) => setTimeout(r, 0));

export function browserApi(): BrowserApi {
  const vids = new Map<string, Rec>(); let manifest: (ViSample & { file: string; file_webm?: string; fps?: number })[] | null = null; const mp4Ok = () => document.createElement("video").canPlayType('video/mp4; codecs="avc1.42E01E"') !== "";
  const need = (id: string) => { const v = vids.get(id); if (!v) throw new ViError(404, "Video not found or expired."); return v; };
  const done = (v: Rec) => { if (v.state.status === "queued" || v.state.status === "running") throw new ViError(409, "Processing is still running."); if (v.state.status !== "completed" || !v.an) throw new ViError(409, `No results: the video is ${v.state.status}.`); return v.an; };
  const loadManifest = async () => { if (manifest) return manifest; try { const r = await fetch("/vi/samples/manifest.json", { cache: "no-store" }); manifest = ((await r.json()).samples as typeof manifest) ?? []; } catch { manifest = []; } return manifest!; };
  const probe = (url: string) => new Promise<{ w: number; h: number; d: number }>((res, rej) => { const v = document.createElement("video"); v.muted = true; v.preload = "metadata"; v.src = url; v.onloadedmetadata = () => { const r = { w: v.videoWidth, h: v.videoHeight, d: v.duration }; v.removeAttribute("src"); v.load(); if (!r.w || !r.h || !isFinite(r.d) || r.d <= 0) rej(new ViError(422, "No frame could be decoded from this video. The codec may be unsupported.")); else res(r); }; v.onerror = () => rej(new ViError(422, "The video could not be opened in this browser. Try an MP4 (H.264) or WebM file.")); });
  const add = async (url: string, source: string, fps: number, assumed: boolean, revoke: boolean): Promise<VideoState> => {
    if (vids.size >= 4) throw new ViError(503, "Too many videos are open. Close one first.");
    let m; try { m = await probe(url); } catch (e) { if (revoke) URL.revokeObjectURL(url); throw e; }
    if (m.d > LIMITS.max_video_seconds) { if (revoke) URL.revokeObjectURL(url); throw new ViError(422, `The video is ${m.d.toFixed(0)} s long. The in-browser engine accepts up to ${LIMITS.max_video_seconds} s; trim the video or use the start/end fields on a shorter clip.`); }
    const id = crypto.randomUUID().replace(/-/g, "");
    const state: VideoState = { video_id: id, status: "uploaded", stage: "uploaded", source, error: null, playback: "ready", playback_formats: ["mp4"], video: { width: m.w, height: m.h, fps, duration_seconds: Math.round(m.d * 100) / 100, fps_assumed: assumed }, progress: { frames_done: 0, frames_total: 0, fraction: 0, elapsed_seconds: 0 }, params: null, summary: null };
    vids.set(id, { id, url, revoke, state, an: null, abort: null, params: null }); return { ...state };
  };

  async function run(v: Rec, p: Record<string, unknown>) {
    const mode = String(p.mode ?? "restaurant"), ball = Boolean(p.ball ?? mode !== "restaurant"), kind = (p.ball_kind ?? (mode === "basketball" ? "orange" : "white")) as "orange" | "white";
    const fps = Math.min(30, num(p, "sample_fps", 1, 30, mode === "tabletennis" ? 30 : mode === "basketball" ? 10 : 5)!), thr = num(p, "det_threshold", 0.1, 0.9, 0.35)!;
    const s0 = num(p, "start_s", 0, 1e6, 0)!, dur = v.state.video.duration_seconds, s1 = Math.min(dur, num(p, "end_s", 0, 1e6, dur)!);
    if (s1 <= s0) throw new ViError(400, "end_s must be greater than start_s.");
    const personFps = ball ? Math.min(fps, 5) : fps, stride = Math.max(1, Math.round(fps / personFps)), total = Math.floor((s1 - s0) * fps);
    if (total > LIMITS.max_analysed_frames) throw new ViError(422, `The selected range would need ${total} analysed frames; the in-browser engine allows ${LIMITS.max_analysed_frames}. Lower the sampling rate or choose a shorter range.`);
    if (total < 1) throw new ViError(422, "The selected range contains no frames.");
    const ctl = new AbortController(); v.abort = ctl; v.params = p; const st = v.state; Object.assign(st, { status: "queued", stage: "loading the detector", error: null, params: p, summary: null, progress: { frames_done: 0, frames_total: total, fraction: 0, elapsed_seconds: 0 } }); v.an = null;
    (async () => {
      const t0 = performance.now(); let nPerson = 0;
      try {
        const det = await detector(); st.status = "running"; st.stage = "analysing";
        const el = document.createElement("video"); el.muted = true; el.playsInline = true; el.preload = "auto"; el.src = v.url; await new Promise<void>((res, rej) => { el.onloadeddata = () => res(); el.onerror = () => rej(new Error("open")); });
        const W = el.videoWidth, H = el.videoHeight, sc = Math.min(1, 960 / W), cw = Math.round(W * sc), ch = Math.round(H * sc), cv = document.createElement("canvas"); cv.width = cw; cv.height = ch; const cx = cv.getContext("2d", { willReadFrequently: true })!;
        const an: A.Analysis = { effectiveFps: personFps, width: W, height: H, times: [], frames: [], tracks: new Map(), ballPoints: [], ballFrames: 0, ball, startS: s0, endS: s0 };
        const tracker = new ByteTracker(thr, 0.1, 0.8, Math.max(5, Math.round(3 * personFps))), bt = ball ? new BallTracker(1 / fps, 1.5 * W, Math.max(12, 0.04 * W)) : null;
        const minR = Math.max(1.5, 0.003 * H), maxR = 0.035 * H; let prev: Uint8Array | null = null, lastBoxes: number[][] = [];
        for (let k = 0; k < total; k++) {
          if (ctl.signal.aborted) { st.status = "cancelled"; return; }
          const t = s0 + k / fps; await seek(el, Math.min(dur - 0.001, t + 0.5 / fps)); let cands: Cand[] = [];
          if (k % stride === 0) {
            const d = await det.detect(el, W, H, 0.1, 0.15), pb = d.person.map((x) => [...x.box]), ps = d.person.map((x) => x.score), tr = tracker.update(pb, ps, ps.map(() => "car" as VClass)); lastBoxes = [];
            const persons = tr.map((s) => { const b = s.tlbr; const box: [number, number, number, number] = [Math.max(0, Math.min(W, b[0])), Math.max(0, Math.min(H, b[1])), Math.max(0, Math.min(W, b[2])), Math.max(0, Math.min(H, b[3]))]; lastBoxes.push(box); const o = { id: s.trackId, box: box.map((x) => Math.round(x * 10) / 10) as typeof box, score: Math.round(s.score * 1000) / 1000 }; an.tracks.set(o.id, [...(an.tracks.get(o.id) ?? []), { t: Math.round(t * 1000) / 1000, box: o.box, score: o.score }]); nPerson++; return o; });
            an.times.push(Math.round(t * 1000) / 1000); an.frames.push({ t: Math.round(t * 1000) / 1000, persons });
            if (ball) cands = d.ball.map((b) => ({ x: (b.box[0] + b.box[2]) / 2, y: (b.box[1] + b.box[3]) / 2, r: Math.max(b.box[2] - b.box[0], b.box[3] - b.box[1]) / 2, src: "yolox" as const, conf: Math.round(b.score * 1000) / 1000 }));
          }
          if (bt) {
            cx.drawImage(el, 0, 0, cw, ch); const px = cx.getImageData(0, 0, cw, ch), r = colourCandidates(px.data, cw, ch, kind, prev, minR, maxR, sc); prev = r.gray; cands = [...cands, ...r.cands]; an.ballFrames++;
            const seeds = kind === "white" ? cands.filter((c) => c.src === "yolox" || !lastBoxes.some((b) => b[0] - 0.05 * (b[2] - b[0]) <= c.x && c.x <= b[2] + 0.05 * (b[2] - b[0]) && b[1] <= c.y && c.y <= b[3])) : undefined;
            const pt = bt.update(t, cands, seeds); if (pt) an.ballPoints.push(pt);
          }
          st.progress = { frames_done: k + 1, frames_total: total, fraction: Math.min(0.99, (k + 1) / total), elapsed_seconds: (performance.now() - t0) / 1000 };
          if (k % 2 === 1) await tick();
        }
        el.removeAttribute("src"); el.load(); an.startS = an.times[0] ?? s0; an.endS = an.times[an.times.length - 1] ?? s0; v.an = an;
        st.summary = { analysed_frames: an.times.length, person_observations: nPerson, tracks: an.tracks.size, ball_points: an.ballPoints.length, effective_fps: personFps, range_s: [an.startS, an.endS] };
        st.status = "completed"; st.stage = "done"; st.progress = { ...st.progress, fraction: 1, elapsed_seconds: (performance.now() - t0) / 1000 };
      } catch (e) { st.status = "failed"; st.error = e instanceof Error && e.message !== "open" ? "The in-browser detector could not be loaded or run: " + e.message : "The video could not be analysed. It may be damaged or use a codec this browser cannot decode."; }
    })();
  }

  async function makeClip(v: Rec, t0: number, t1: number, ids: number[], roi: A.Pt[] | null): Promise<{ url: string; webm: boolean }> {
    const an = v.an!, el = document.createElement("video"); el.muted = true; el.playsInline = true; el.src = v.url; await new Promise<void>((res, rej) => { el.onloadeddata = () => res(); el.onerror = () => rej(new ViError(422, "The video could not be reopened.")); });
    const W = el.videoWidth, H = el.videoHeight, sc = Math.min(1, 960 / W), cv = document.createElement("canvas"); cv.width = Math.round(W * sc); cv.height = Math.round(H * sc); const g = cv.getContext("2d")!;
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((m) => MediaRecorder.isTypeSupported(m)); if (!mime) throw new ViError(503, "This browser cannot record video clips.");
    const rec = new MediaRecorder(cv.captureStream(30), { mimeType: mime, videoBitsPerSecond: 2_000_000 }), chunks: Blob[] = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    await seek(el, t0); rec.start(250); await el.play();
    await new Promise<void>((res) => {
      const draw = () => {
        const t = el.currentTime; g.drawImage(el, 0, 0, cv.width, cv.height); g.lineWidth = 3; g.font = "bold 14px Georgia";
        let j = 0, bd = Infinity; an.frames.forEach((f, i) => { const d = Math.abs(f.t - t); if (d < bd) { bd = d; j = i; } });
        if (an.frames.length && bd <= 1.5 / Math.max(an.effectiveFps, 1)) for (const p of an.frames[j].persons) { const hot = ids.includes(p.id); g.strokeStyle = hot ? "#16834A" : "#a0a0a0"; g.lineWidth = hot ? 3 : 1; g.strokeRect(p.box[0] * sc, p.box[1] * sc, (p.box[2] - p.box[0]) * sc, (p.box[3] - p.box[1]) * sc); if (hot) { g.fillStyle = "#16834A"; g.fillText(`track ${p.id}`, p.box[0] * sc, Math.max(14, p.box[1] * sc - 6)); } }
        if (roi) { g.strokeStyle = "#16834A"; g.lineWidth = 2; g.beginPath(); roi.forEach(([x, y], i) => (i ? g.lineTo(x * sc, y * sc) : g.moveTo(x * sc, y * sc))); g.closePath(); g.stroke(); }
        g.fillStyle = "#fff"; g.fillText(`${t.toFixed(2)}s`, 8, cv.height - 10);
        if (t >= t1 || el.ended) res(); else requestAnimationFrame(draw);
      }; draw();
    });
    el.pause(); await new Promise<void>((res) => { rec.onstop = () => res(); rec.stop(); }); el.removeAttribute("src");
    return { url: URL.createObjectURL(new Blob(chunks, { type: mime.split(";")[0] })), webm: mime.startsWith("video/webm") };
  }

  /** Calibration problems are the user's to fix: surface them like the server does (HTTP 422 with the reason). */
  const wrapCal = <A extends unknown[], R>(f: (...a: A) => Promise<R>) => async (...a: A): Promise<R> => { try { return await f(...a); } catch (e) { if (e instanceof A.CalibrationError) throw new ViError(422, e.message); throw e; } };
  const api: BrowserApi = {
    browser: true,
    url: (p: string) => (/^(blob:|https?:)/.test(p) ? p : p),
    health: async (): Promise<ViHealth> => ({ ok: true, ffmpeg: false, limits: LIMITS, notice: "Everything runs in your browser: the video is not uploaded anywhere. Results are fallible and meant to support human review. No faces are recognised and nobody is identified.",
      models: { detector: { name: "YOLOX-tiny (ONNX Runtime Web, in your browser)", licence: "Apache-2.0 (Megvii)", note: "COCO person and sports-ball classes; smaller and less accurate than the server's YOLOX-S" }, tracker: { name: "ByteTrack", licence: "MIT (re-implemented)", note: "no appearance model: identities are temporary and can switch after occlusion or crossing" }, ball: { name: "Colour/motion ball finder + constant-velocity gate", note: "only detected positions are reported; a missed ball is a gap, never interpolated" } } }),
    samples: async (app: string) => ({ samples: (await loadManifest()).filter((x) => (x as unknown as { apps: string[] }).apps?.includes(app)).map((x) => ({ ...x, video_url: `/vi/samples/${x.file}` })) }),
    landmarks: async () => ({ court_m: [A.COURT_L, A.COURT_W] as [number, number], table_m: [A.TABLE_L, A.TABLE_W] as [number, number], landmarks: A.COURT_LANDMARKS.map(([name, x, y]) => ({ name, x_m: x, y_m: y })) }),
    openSample: async (id: string) => { const m = (await loadManifest()).find((x) => x.id === id); if (!m) throw new ViError(404, "Unknown sample."); return add(`/vi/samples/${!mp4Ok() && m.file_webm ? m.file_webm : m.file}`, `sample:${id}`, m.fps ?? 30, !m.fps, false); },
    upload: async (file: File) => {
      if (!file.size) throw new ViError(400, "The file is empty."); if (file.size > LIMITS.max_video_mb * 1e6) throw new ViError(413, `The file is larger than the ${LIMITS.max_video_mb} MB limit.`);
      if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name)) throw new ViError(415, "Unsupported file type. Upload an MP4, MOV, WebM, MKV or AVI video.");
      const head = new Uint8Array(await file.slice(0, 12).arrayBuffer()); if (head[0] === 0x89 && head[1] === 0x50) throw new ViError(415, "Unsupported file type. That is an image; upload a video.");
      return add(URL.createObjectURL(file), "upload", 30, true, true);
    },
    state: async (id: string) => ({ ...need(id).state }),
    start: async (id: string, params: Record<string, unknown>) => { const v = need(id), b = obj(params); if (v.state.status === "queued" || v.state.status === "running") throw new ViError(429, "This video is already being processed."); await run(v, b); return { ...v.state }; },
    cancel: async (id: string) => { const v = need(id); v.abort?.abort(); return { ...v.state }; },
    remove: async (id: string) => { const v = vids.get(id); if (v) { v.abort?.abort(); if (v.revoke) URL.revokeObjectURL(v.url); vids.delete(id); } return { deleted: true }; },
    observations: async (id: string): Promise<Observations> => { const v = need(id), a = done(v); return { width: a.width, height: a.height, effective_fps: a.effectiveFps, frames: a.frames.map((f) => ({ t: f.t, persons: f.persons.map((p) => [p.id, ...p.box] as [number, number, number, number, number]), ball: null })), tracks: A.trackSummary(a), ball_points: a.ballPoints } as Observations; },
    playbackUrl: (id: string) => need(id).url, directUrl: (id: string) => vids.get(id)?.url ?? null,
    frameUrl: (id: string) => need(id).url,
    restaurant: wrapCal(async (id: string, body: unknown) => {
      const v = need(id), b = obj(body), a = done(v), poly = A.validPolygon(b.roi), res = A.presenceEvents(a, poly, num(b, "min_stay_s", 1, 36000, 60)!, num(b, "merge_gap_s", 0, 600, 3)!, Math.round(num(b, "min_observations", 1, 100, 3)!));
      const out = { ...res, occupancy: A.occupancy(a, poly, num(b, "bin_s", 1, 600, 5)!), tracks: A.trackSummary(a), limits: ["Tracks are temporary numbers. After occlusion or crossing a person can receive a new number, which splits one visit into several events.", "Presence is judged from the point where the person's feet appear to touch the floor (bottom centre of the box). Tall objects and camera angle can shift it.", "A flag means the observed time reached your threshold. It says nothing about the reason, and it must be reviewed by a person with the video."] } as import("../api").RestaurantResult;
      if (b.employees !== undefined) {
        const emp = b.employees as import("../api").Employee[]; if (!Array.isArray(emp) || emp.length > 50 || !emp.every((e) => e && typeof e.id === "string" && typeof e.name === "string")) throw new ViError(400, "employees must be a list of up to 50 objects with id, name, shift_start and shift_end.");
        const links = (b.links ?? {}) as Record<string, string>; if (typeof links !== "object" || Array.isArray(links)) throw new ViError(400, "links must map track ids to employee ids.");
        out.attendance = A.attendance(res.events, emp, links, String(b.clock_start ?? "00:00:00"), a.startS, a.endS, num(b, "tolerance_min", 0, 240, 10)!);
      } return out;
    }),
    tableTennis: wrapCal(async (id: string, body: unknown) => { const v = need(id), b = obj(body), a = done(v); if (!Array.isArray(b.corners) || b.corners.length !== 4) throw new ViError(400, "corners must list the four table corners (left-near, right-near, right-far, left-far) as [x, y] image points."); if (!a.ball) throw new ViError(409, "Ball tracking was not enabled for this analysis. Run it again with ball tracking on."); return A.tableTennis(a, b.corners as A.Pt[], num(b, "gap_s", 0.05, 5, 0.6)!, num(b, "min_len_s", 0.1, 60, 0.8)!, Math.round(num(b, "min_points", 2, 500, 4)!)); }),
    basketball: wrapCal(async (id: string, body: unknown) => { const v = need(id), b = obj(body), a = done(v), refs = b.references as { image: A.Pt; world: A.Pt }[]; if (!Array.isArray(refs) || refs.length < 4 || refs.length > 30) throw new ViError(400, "references must list at least four matches of {image: [x, y], world: [x_m, y_m]}."); return A.basketball(a, refs.map((r) => r.image), refs.map((r) => r.world), num(b, "cell_m", 0.5, 4, 1)!, (b.track_ids as number[] | undefined) ?? null, num(b, "min_possession_s", 0.1, 30, 0.6)!, num(b, "margin_frac", 0, 0.5, 0.08)!); }),
    clip: wrapCal(async (id: string, body: unknown) => {
      const v = need(id), b = obj(body), a = done(v), t0 = num(b, "t0", 0, 1e6, null), t1 = num(b, "t1", 0, 1e6, null), pad = num(b, "pad_s", 0, 10, 2)!;
      if (t0 === null || t1 === null || t1 <= t0) throw new ViError(400, "t0 and t1 are required and t1 must be greater than t0."); const a0 = Math.max(0, t0 - pad), a1 = Math.min(Math.max(a.endS, t1), t1 + pad); if (a1 - a0 > 30) throw new ViError(422, "Evidence clips are limited to 30 seconds.");
      const r = await makeClip(v, a0, a1, (b.track_ids as number[]) ?? [], b.roi ? A.validPolygon(b.roi) : null); return { clip_id: Math.random().toString(16).slice(2, 14), url: r.url, url_webm: r.webm ? r.url : null, has_mp4: !r.webm, t0: Math.round(a0 * 100) / 100, t1: Math.round(a1 * 100) / 100 };
    }),
    pdf: async (body: unknown) => { const b = obj(body), secs = b.sections as { heading: string }[]; if (!Array.isArray(secs) || !secs.length || secs.length > 20 || !secs.every((s) => s && typeof s.heading === "string")) throw new ViError(400, "Each section needs a heading and optional text, rows or lines."); return buildPdf(String(b.title ?? "Report").slice(0, 120), String(b.subtitle ?? "").slice(0, 300), secs as never, String(b.footer ?? "").slice(0, 400)); },
  };
  return api;
}
