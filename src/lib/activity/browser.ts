"use client";
/** In-browser engine for the activity review demo: same API shape as activityApi (the FastAPI service), so the UI is unchanged. Person detection (YOLOX-tiny), ByteTrack, BlazePose and the candidate-event rules (rules.ts) all run in the page; nothing is uploaded. */
import { ByteTracker } from "@/lib/vehicle/tracker";
import type { VClass } from "@/lib/vehicle/types";
import { poseOne } from "@/lib/ml/browser/vision";
import { Yolox } from "@/lib/vision/yolox";
import { ActivityApiError } from "./api";
import { AGGR_DEFAULTS, FALL_DEFAULTS, criteria, detectAggression, detectFalls, type AggressionParams, type Candidate, type FallParams, type KP, type Sample, type Track } from "./rules";
import type { Alert, AlertStatus, FrameObs, Health, Params, SampleInfo, Summary, VideoStatus } from "./types";

const NOTICE = "Alerts are candidates produced by simple rules over person detections and pose estimates. They are fallible: they miss real events and flag harmless ones. A person must review every alert. This is not an emergency, safety or security system and must not be relied on to detect falls or violence. It does not identify people.";
const LIMITS_TEXT = [
  "No face recognition or identification: track numbers are temporary labels for this video only, and they can switch after occlusion or crossings.",
  "The fall rule looks for an upright-to-lying change in torso tilt, hip height and box shape that then persists. It has not been validated on a labelled fall dataset; sensitivity and false-alarm rates are unknown.",
  "Falls out of view, behind objects, toward or away from the camera, from a seated position, or under a ceiling-mounted camera are likely to be missed or mis-measured.",
  "People lying down deliberately, bending, crouching, sitting down quickly, exercising or playing can satisfy the fall rule.",
  "The rapid close-contact rule flags two people who stay close while a wrist moves fast relative to the person's own hips. Dancing, sport, play, hugging and handshakes do the same; nothing measures intent or contact.",
  "Pose estimates are unreliable for small, blurred, partly hidden or horizontal people. Analysis is at a reduced frame rate (default 5 fps), so very fast motion is under-sampled.",
  "In this browser engine people are found by a small YOLOX-tiny model at 416 px (the server uses YOLOX-S at 640 px), so small or distant people are missed more often.",
];
const MODELS: Health["models"] = {
  detector: { name: "YOLOX-tiny (browser engine)", licence: "Apache-2.0 (Megvii)", trained_on: "COCO (person class used)" },
  tracker: { name: "ByteTrack", licence: "MIT (reference implementation; re-implemented here)", note: "no appearance model: identities can switch after occlusion or crossing" },
  pose: { name: "BlazePose full (33 body keypoints)", licence: "Apache-2.0 (Google MediaPipe)", note: "run per tracked person on a square crop, no body-axis rotation of the crop" },
};
const MAX_SECONDS = 120, MAX_SAMPLES = 240, MAX_MB = 300, MAX_POSE = 12;
const fail = (s: number, m: string): never => { throw new ActivityApiError(s, m); };
const r2 = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

interface Obs { id: number; box: [number, number, number, number]; score: number; kp: KP | null }
interface AlertRec { id: string; cand: Candidate; status: AlertStatus; note: string; reviewed_at: number | null }
interface Vid {
  id: string; source: string; url: string; revoke: boolean; formats: ("mp4" | "webm")[]; info: { width: number; height: number; fps: number; frames_estimate: number; duration_seconds: number; fps_assumed: boolean };
  status: VideoStatus["status"]; stage: string; error: string | null; done: number; total: number; started: number; finished: number; cancel: boolean;
  params: Params | null; times: number[]; frameIdx: number[]; frames: Obs[][]; tracks: Map<number, Track>; timing: { detect: number; pose: number; total: number }; counts: { analysed_frames: number; person_observations: number; pose_runs: number; tracks: number }; effFps: number; alerts: AlertRec[];
}
const store = new Map<string, Vid>(); const alertIndex = new Map<string, Vid>();
let det: Promise<Yolox> | null = null; const detector = () => (det ??= Yolox.create());
const need = (id: string) => store.get(id) ?? fail(404, "Video not found or expired.");
const seek = (v: HTMLVideoElement, t: number) => new Promise<void>((res) => { const d = () => { v.removeEventListener("seeked", d); res(); }; v.addEventListener("seeked", d); v.currentTime = t; });
const num = (d: Record<string, unknown>, k: string, lo: number, hi: number, def: number): number => { const v = d[k] ?? def; if (typeof v === "boolean" || isNaN(Number(v))) fail(400, `${k} must be a number.`); const n = Number(v); if (n < lo || n > hi) fail(400, `${k} must be between ${lo} and ${hi}.`); return n; };
function rules(d: Partial<Params>): { fall: FallParams; aggression: AggressionParams } {
  const f = (d.fall ?? {}) as unknown as Record<string, unknown>, a = (d.aggression ?? {}) as unknown as Record<string, unknown>, fd = FALL_DEFAULTS, ad = AGGR_DEFAULTS;
  return { fall: { min_upright_s: num(f, "min_upright_s", 0.2, 10, fd.min_upright_s), window_s: num(f, "window_s", 0.3, 5, fd.window_s), upright_tilt_deg: num(f, "upright_tilt_deg", 5, 60, fd.upright_tilt_deg), lying_tilt_deg: num(f, "lying_tilt_deg", 40, 120, fd.lying_tilt_deg), lying_aspect: num(f, "lying_aspect", 0.8, 3, fd.lying_aspect), min_drop_torso: num(f, "min_drop_torso", 0.1, 3, fd.min_drop_torso), drop_height_ratio: num(f, "drop_height_ratio", 0.2, 0.95, fd.drop_height_ratio), min_lying_s: num(f, "min_lying_s", 0.2, 20, fd.min_lying_s), min_visibility: num(f, "min_visibility", 0.1, 0.95, fd.min_visibility) },
    aggression: { max_distance: num(a, "max_distance", 0.2, 3, ad.max_distance), min_arm_speed: num(a, "min_arm_speed", 1, 30, ad.min_arm_speed), min_duration_s: num(a, "min_duration_s", 0.3, 20, ad.min_duration_s), min_fraction: num(a, "min_fraction", 0.1, 1, ad.min_fraction), min_visibility: num(a, "min_visibility", 0.1, 0.95, ad.min_visibility) } };
}
const publicAlert = (a: AlertRec): Alert => { const c = criteria(a.cand); return { id: a.id, kind: a.cand.kind, title: a.cand.kind === "fall" ? "Possible fall (candidate)" : "Possible rapid close-contact motion (candidate)", tracks: a.cand.tracks, t_start: a.cand.t_start, t_end: a.cand.t_end, t_peak: a.cand.t_peak, evidence: a.cand.evidence, notes: a.cand.notes, criteria_met: c.met, criteria_total: c.total, status: a.status, note: a.note, reviewed_at: a.reviewed_at }; };
function derive(v: Vid) {
  const p = v.params!, cands = [...detectFalls(v.tracks, p.fall, v.times[v.times.length - 1] ?? 0), ...detectAggression(v.tracks, p.aggression)].sort((a, b) => a.t_peak - b.t_peak);
  for (const a of v.alerts) alertIndex.delete(a.id); v.alerts = cands.map((c, i) => ({ id: `${v.id}-${i + 1}`, cand: c, status: "pending" as AlertStatus, note: "", reviewed_at: null })); for (const a of v.alerts) alertIndex.set(a.id, v);
}
function videoJson(v: Vid): VideoStatus {
  const done = ["completed", "cancelled", "failed"].includes(v.status), el = v.started ? ((v.finished || Date.now()) - v.started) / 1000 : 0;
  return { video_id: v.id, status: v.status, stage: v.stage, source: v.source, error: v.error, error_detail: null, video: { width: v.info.width, height: v.info.height, fps: r2(v.info.fps, 3), frames_estimate: v.info.frames_estimate, duration_seconds: r2(v.info.duration_seconds), fps_assumed: v.info.fps_assumed },
    progress: { frames_done: v.done, frames_total: v.total, fraction: v.status === "completed" ? 1 : v.total ? Math.min(0.99, v.done / v.total) : 0, elapsed_seconds: r2(el) }, preview: "ready", preview_done: true, preview_formats: v.formats, alert_count: done ? v.alerts.length : null, notice: NOTICE };
}
function needDone(v: Vid) { if (v.status === "queued" || v.status === "running") fail(409, "Processing is still running."); if (v.status !== "completed") fail(409, `No results: the video is ${v.status}.`); }
function summaryJson(v: Vid): Summary {
  const byKind: Record<string, number> = {}, byStatus: Record<AlertStatus, number> = { pending: 0, confirmed: 0, dismissed: 0, uncertain: 0 }; for (const a of v.alerts) { byKind[a.cand.kind] = (byKind[a.cand.kind] ?? 0) + 1; byStatus[a.status]++; }
  const tracks = [...v.tracks].sort((a, b) => a[0] - b[0]).map(([id, tr]) => ({ id, first_s: tr[0].t, last_s: tr[tr.length - 1].t, observations: tr.length, with_pose: tr.filter((x) => x.kp).length })), p = v.params!;
  return { ...videoJson(v), counts: { ...v.counts, tracks: tracks.length, tracks_with_pose: tracks.filter((t) => t.with_pose).length, pose_runs: v.counts.pose_runs, alerts: v.alerts.length, alerts_by_kind: byKind, alerts_by_status: byStatus } as Summary["counts"], analysed_fps: r2(v.effFps), timing_seconds: v.timing, tracks, models: MODELS, limitations: LIMITS_TEXT, params: p,
    warnings: tracks.length ? (tracks.filter((t) => t.observations < 5).length ? [`${tracks.filter((t) => t.observations < 5).length} of ${tracks.length} tracks lasted fewer than 5 analysed frames; identity switches and fragmentation are likely in crowded or distant scenes.`] : []) : ["No people were detected in the analysed frames."] };
}
async function run(v: Vid, p: Params) {
  const el = document.createElement("video"); el.muted = true; el.playsInline = true; el.preload = "auto"; el.src = v.url;
  try {
    v.status = "running"; v.stage = "loading models"; const [yx] = await Promise.all([detector(), new Promise<void>((res, rej) => { el.onloadeddata = () => res(); el.onerror = () => rej(new Error("The video could not be opened in this browser. Try an MP4 (H.264) or WebM file.")); })]);
    const W = el.videoWidth, H = el.videoHeight, dur = el.duration, step = 1 / p.sample_fps, t0v = p.start_s ?? 0, t1v = Math.min(p.end_s ?? dur, dur), total = Math.min(MAX_SAMPLES, Math.max(1, Math.floor((t1v - t0v) * p.sample_fps)));
    v.total = total; v.stage = "analysing"; v.effFps = p.sample_fps; v.times = []; v.frameIdx = []; v.frames = []; v.tracks = new Map(); let tDet = 0, tPose = 0, nPose = 0, nPers = 0; const t00 = performance.now();
    const tracker = new ByteTracker(p.det_threshold, 0.1, 0.8, Math.max(5, Math.round(3 * p.sample_fps))), cv = document.createElement("canvas"); cv.width = W; cv.height = H; const g = cv.getContext("2d", { willReadFrequently: true })!;
    for (let i = 0; i < total; i++) {
      if (v.cancel) { v.status = "cancelled"; v.stage = "cancelled"; v.finished = Date.now(); return; }
      const t = Math.min(dur - 0.001, t0v + i * step); await seek(el, t + 0.5 / (v.info.fps || 30)); g.drawImage(el, 0, 0, W, H);
      let a = performance.now(); const dets = await yx.detect(cv, W, H, [0], 0.1); tDet += performance.now() - a;
      const tr = tracker.update(dets.map((d) => d.box), dets.map((d) => d.score), dets.map(() => "person" as unknown as VClass)), order = [...tr].sort((x, y) => y.tlbr[3] - y.tlbr[1] - (x.tlbr[3] - x.tlbr[1])), persons: Obs[] = [];
      for (let rank = 0; rank < order.length; rank++) {
        const st = order[rank], tl = st.tlbr, box: [number, number, number, number] = [Math.min(Math.max(tl[0], 0), W), Math.min(Math.max(tl[1], 0), H), Math.min(Math.max(tl[2], 0), W), Math.min(Math.max(tl[3], 0), H)]; let kp: KP | null = null;
        if (p.pose && rank < MAX_POSE && box[3] - box[1] >= 48) { a = performance.now(); const r = await poseOne(cv, box); tPose += performance.now() - a; nPose++; kp = r.kp.map((k) => [k.x, k.y, k.visibility, k.visibility]); }
        const o: Obs = { id: st.trackId, box: box.map((x) => r2(x, 1)) as Obs["box"], score: r2(st.score, 3), kp }; persons.push(o); const s: Sample = { t: r2(t, 3), box, score: st.score, kp }; (v.tracks.get(st.trackId) ?? v.tracks.set(st.trackId, []).get(st.trackId)!).push(s); nPers++;
      }
      v.times.push(r2(t, 3)); v.frameIdx.push(Math.round(t * (v.info.fps || 30))); v.frames.push(persons); v.done = i + 1; if (i % 2 === 1) await new Promise((r) => setTimeout(r, 0));
    }
    v.timing = { detect: r2(tDet / 1000), pose: r2(tPose / 1000), total: r2((performance.now() - t00) / 1000) }; v.counts = { analysed_frames: v.times.length, person_observations: nPers, pose_runs: nPose, tracks: v.tracks.size };
    v.stage = "deriving"; v.params = p; derive(v); v.status = "completed"; v.stage = "done"; v.finished = Date.now();
  } catch (e) { v.status = "failed"; v.error = e instanceof Error ? e.message : "Processing failed."; v.finished = Date.now(); } finally { el.removeAttribute("src"); el.load(); }
}
async function probe(url: string): Promise<Vid["info"]> {
  const el = document.createElement("video"); el.preload = "metadata"; el.src = url;
  try { await new Promise<void>((res, rej) => { el.onloadedmetadata = () => res(); el.onerror = () => rej(new Error("This video could not be read. Use an MP4 (H.264) or WebM file.")); }); } catch (e) { fail(422, e instanceof Error ? e.message : "This video could not be read."); }
  if (!isFinite(el.duration) || el.duration <= 0 || !el.videoWidth) fail(422, "The video has no readable duration or frame size.");
  if (el.duration > MAX_SECONDS) fail(422, `The video is ${el.duration.toFixed(0)} s long. The browser engine analyses up to ${MAX_SECONDS} s per video; trim it first.`);
  return { width: el.videoWidth, height: el.videoHeight, fps: 30, frames_estimate: Math.round(el.duration * 30), duration_seconds: el.duration, fps_assumed: true };
}
let manifest: { samples: (SampleInfo & { file_webm?: string })[] } | null = null;
const getManifest = async () => (manifest ??= (await (await fetch("/activity/samples/manifest.json")).json()) as { samples: (SampleInfo & { file_webm?: string })[] });
const mp4Ok = () => { const v = document.createElement("video"); return !!v.canPlayType('video/mp4; codecs="avc1.42E01E"'); };

export function browserActivity() {
  return {
    url: (p: string) => p,
    health: async (): Promise<Health> => ({ ok: true, ffmpeg: false, notice: NOTICE, models: MODELS, active_jobs: [...store.values()].filter((v) => v.status === "running").length, limits: { max_video_mb: MAX_MB, max_video_seconds: MAX_SECONDS, max_analysed_frames: MAX_SAMPLES, max_concurrent_jobs: 1 } }),
    samples: async () => ({ samples: (await getManifest()).samples.map((s) => ({ ...s, video_url: `/activity/samples/${s.file}` })) }),
    upload: async (src: File | { sampleId: string }): Promise<VideoStatus> => {
      let url: string, source: string, formats: ("mp4" | "webm")[];
      if (src instanceof File) {
        if (!src.size) fail(400, "The file is empty."); if (src.size > MAX_MB * 1e6) fail(413, `The file is larger than the ${MAX_MB} MB limit.`);
        if (!/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(src.name) && !src.type.startsWith("video/")) fail(415, "Unsupported file type. Upload an MP4, MOV, WebM, MKV or AVI video.");
        url = URL.createObjectURL(src); source = src.name; formats = /\.webm$/i.test(src.name) ? ["webm"] : ["mp4"];
      } else {
        const s = (await getManifest()).samples.find((x) => x.id === src.sampleId) ?? fail(404, "Unknown sample."); const useWebm = !!s.file_webm && !mp4Ok(); url = `/activity/samples/${useWebm ? s.file_webm : s.file}`; source = `sample: ${s.title}`; formats = [useWebm ? "webm" : "mp4"];
      }
      const info = await probe(url).catch((e) => { if (src instanceof File) URL.revokeObjectURL(url); throw e; }), id = crypto.randomUUID().replace(/-/g, "");
      const v: Vid = { id, source, url, revoke: src instanceof File, formats, info, status: "uploaded", stage: "uploaded", error: null, done: 0, total: 0, started: 0, finished: 0, cancel: false, params: null, times: [], frameIdx: [], frames: [], tracks: new Map(), timing: { detect: 0, pose: 0, total: 0 }, counts: { analysed_frames: 0, person_observations: 0, pose_runs: 0, tracks: 0 }, effFps: 0, alerts: [] };
      store.set(id, v); return videoJson(v);
    },
    process: async (id: string, body: Partial<Params>): Promise<VideoStatus> => {
      const v = need(id), d = body as Record<string, unknown>, { fall, aggression } = rules(body), start = d.start_s === undefined ? 0 : num(d, "start_s", 0, 86400, 0), end = d.end_s == null ? null : num(d, "end_s", 0.5, 86400, 0);
      const p: Params = { sample_fps: num(d, "sample_fps", 1, 12, 5), det_threshold: num(d, "det_threshold", 0.15, 0.95, 0.35), pose: d.pose === undefined ? true : !!d.pose, start_s: start, end_s: end, fall, aggression };
      if (end !== null && end <= start) fail(400, "end_s must be greater than start_s."); if (start >= v.info.duration_seconds) fail(400, "start_s is beyond the end of the video.");
      const window = Math.min(end ?? v.info.duration_seconds, v.info.duration_seconds) - start; if (window > MAX_SECONDS) fail(422, `The selected part is ${window.toFixed(0)} s long; use start_s and end_s to choose up to ${MAX_SECONDS} s.`);
      if (window * p.sample_fps > MAX_SAMPLES) fail(422, `That would analyse about ${Math.round(window * p.sample_fps)} frames; the browser engine limit is ${MAX_SAMPLES}. Lower sample_fps (for example to ${Math.max(1, Math.floor(MAX_SAMPLES / window))}) or choose a shorter part.`);
      if ([...store.values()].some((x) => x.status === "running")) fail(503, "Another analysis is running in this page. Wait for it or cancel it.");
      v.status = "queued"; v.stage = "queued"; v.cancel = false; v.error = null; v.done = 0; v.total = 0; v.started = Date.now(); v.finished = 0; v.alerts = []; void run(v, p); return videoJson(v);
    },
    status: async (id: string) => videoJson(need(id)),
    cancel: async (id: string) => { const v = need(id); if (v.status === "queued" || v.status === "running") v.cancel = true; return { status: v.status }; },
    remove: async (id: string) => { const v = store.get(id); if (v) { for (const a of v.alerts) alertIndex.delete(a.id); if (v.revoke) URL.revokeObjectURL(v.url); store.delete(id); } return { deleted: true }; },
    summary: async (id: string) => { const v = need(id); needDone(v); return summaryJson(v); },
    alerts: async (id: string) => { const v = need(id); needDone(v); return { alerts: v.alerts.map(publicAlert) }; },
    frames: async (id: string) => { const v = need(id); needDone(v); const frames: FrameObs[] = v.times.map((t, i) => ({ t, f: v.frameIdx[i], persons: v.frames[i].map((p) => ({ id: p.id, box: p.box, score: p.score, kp: p.kp ? p.kp.map(([x, y, vis]) => [r2(x, 1), r2(y, 1), r2(vis)] as [number, number, number]) : null })) })); return { width: v.info.width, height: v.info.height, analysed_fps: r2(v.effFps), frames }; },
    reanalyse: async (id: string, p: Pick<Params, "fall" | "aggression">, discard: boolean) => {
      const v = need(id); needDone(v); if (v.alerts.some((a) => a.status !== "pending") && !discard) fail(409, "Some alerts have been reviewed. Re-analysing replaces them; confirm to proceed.");
      const { fall, aggression } = rules(p); v.params = { ...v.params!, fall, aggression }; derive(v); return { alerts: v.alerts.map(publicAlert) };
    },
    review: async (alertId: string, status: AlertStatus, note: string) => {
      const v = alertIndex.get(alertId) ?? fail(404, "Alert not found or expired."), a = v.alerts.find((x) => x.id === alertId)!; if (!["pending", "confirmed", "dismissed", "uncertain"].includes(status)) fail(400, "status must be pending, confirmed, dismissed or uncertain.");
      a.status = status; a.note = (note ?? "").trim().slice(0, 1000); a.reviewed_at = status === "pending" ? null : Date.now() / 1000; return publicAlert(a);
    },
    /** The playable source: the uploaded or bundled file itself (no server-side re-encode). */
    videoUrl: (id: string, format: "mp4" | "webm" = "mp4") => { const v = store.get(id); return v && v.formats.includes(format) ? v.url : v ? v.url : ""; },
    /** Annotated video files are rendered by the server; the browser engine draws the boxes and skeletons live over the playing video instead. */
    annotatedUrl: (_id: string, _alertId?: string) => "",
    exportUrl: (id: string, kind: "alerts.json" | "alerts.csv") => {
      const v = store.get(id); if (!v) return ""; const rows = v.alerts.map(publicAlert);
      if (kind === "alerts.json") return `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ video_id: v.id, source: v.source, notice: NOTICE, alerts: rows }, null, 1))}`;
      const q = (x: unknown) => `"${String(x).replace(/"/g, '""')}"`, lines = [["alert_id", "kind", "tracks", "start_s", "end_s", "peak_s", "criteria_met", "criteria_total", "status", "reviewer_note", "evidence"].join(","), ...rows.map((r) => [r.id, r.kind, r.tracks.join(" "), r2(r.t_start), r2(r.t_end), r2(r.t_peak), r.criteria_met, r.criteria_total, r.status, q(r.note), q(r.evidence.map((e) => `${e.name}=${e.value} (threshold ${e.threshold})`).join("; "))].join(","))];
      return `data:text/csv;charset=utf-8,${encodeURIComponent(lines.join("\n"))}`;
    },
  };
}
export type ActivityClient = ReturnType<typeof browserActivity>;
