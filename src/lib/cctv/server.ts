import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { C_CCTV } from "./collections";
import { adminDb } from "@/lib/firebase-admin";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import type { Frame, Review, Settings } from "./types";
import { LIMITS } from "./types";

export const JOB_TTL_MS = 24 * 3600_000;
export const UPLOAD_TTL_MS = 3600_000;
export const UPLOAD_DIR = path.join(os.tmpdir(), "neoforge-cctv");
export const DETECTOR_INFO = { name: "MB3-CenterNet (COCO)", runtime: "@vladmandic/human 3.3.6 (TensorFlow.js)", license: "MIT (Human); model weights from @vladmandic/human-models (MIT)", classes: 80 };

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function fail(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: "Invalid request", issues: e.issues.slice(0, 5).map((i) => `${i.path.join(".") || "body"}: ${i.message}`) }, { status: 400 });
  if (e instanceof SyntaxError) return NextResponse.json({ error: "Request body is not valid JSON" }, { status: 400 });
  console.error("[cctv]", e);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  let ok = false;
  try { ok = !!origin && new URL(origin).host === host; } catch { /* malformed origin */ }
  if (!ok) throw new HttpError(403, "Bad origin");
}
export function limit(req: NextRequest, key: string, max: number, windowMs = 60_000) {
  if (!rateLimit(`cctv:${key}:${clientIp(req)}`, max, windowMs)) throw new HttpError(429, "Too many requests. Please slow down and try again shortly.");
}

export const newId = (bytes = 16) => randomBytes(bytes).toString("hex");
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
export const ID_RE = /^[a-f0-9]{32}$/;
export function assertId(id: string) { if (!ID_RE.test(id)) throw new HttpError(400, "Invalid id"); return id; }

export interface JobDoc {
  id: string; tokenHash: string; source: { type: "sample" | "upload"; id?: string; videoId?: string; name?: string };
  mode: "browser" | "worker" | "reference"; meta: { durationSec: number; width: number; height: number };
  settings: Settings; status: "created" | "receiving" | "processing" | "ready" | "failed"; error?: string;
  framesReceived: number; expectedFrames: number; createdAt: number; updatedAt: number; expiresAt: number;
  reviews: Record<string, Review>; notes: Record<string, string>; detector: typeof DETECTOR_INFO | { name: string; runtime: string; license: string; note: string };
}
export const jobsCol = () => adminDb().collection(C_CCTV.jobs);
export const framesCol = () => adminDb().collection(C_CCTV.frames);
export async function getJob(id: string): Promise<JobDoc> {
  const snap = await jobsCol().doc(assertId(id)).get();
  if (!snap.exists) throw new HttpError(404, "Job not found or expired");
  const j = snap.data() as JobDoc;
  if (j.expiresAt < Date.now()) throw new HttpError(404, "Job not found or expired");
  return j;
}
export async function requireToken(req: NextRequest, id: string): Promise<JobDoc> {
  const j = await getJob(id);
  const t = req.headers.get("x-job-token") || "";
  if (!t || hash(t) !== j.tokenHash) throw new HttpError(403, "Missing or invalid job token");
  return j;
}
export const tokenHash = hash;
/** Public projection: never leaks the token hash. */
export const publicJob = ({ tokenHash: _t, ...rest }: JobDoc) => rest;

export async function loadFrames(jobId: string): Promise<Frame[]> {
  const snap = await framesCol().where("jobId", "==", jobId).get();
  const all: Frame[] = [];
  for (const d of snap.docs) all.push(...(d.data().frames as Frame[]));
  const byIndex = new Map<number, Frame>();
  for (const f of all) byIndex.set(f.i, f);
  return [...byIndex.values()].sort((a, b) => a.i - b.i).slice(0, LIMITS.maxFrames);
}

export async function deleteJob(id: string) {
  const snap = await framesCol().where("jobId", "==", id).get();
  const batch = adminDb().batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(jobsCol().doc(id));
  await batch.commit();
}

/** Retention: expired jobs and stale upload files are removed opportunistically on every job creation. */
export async function cleanupExpired() {
  try {
    const old = await jobsCol().where("expiresAt", "<", Date.now()).limit(10).get();
    for (const d of old.docs) await deleteJob(d.id);
  } catch (e) { console.error("[cctv] cleanup", e); }
  cleanupUploads();
}
export function cleanupUploads() {
  try {
    if (!existsSync(UPLOAD_DIR)) return;
    for (const f of readdirSync(UPLOAD_DIR)) {
      const p = path.join(UPLOAD_DIR, f);
      if (Date.now() - statSync(p).mtimeMs > UPLOAD_TTL_MS) unlinkSync(p);
    }
  } catch { /* best effort */ }
}
export function uploadPath(videoId: string, ext: string) {
  assertId(videoId);
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const p = path.join(UPLOAD_DIR, `${videoId}.${ext}`);
  if (path.dirname(p) !== UPLOAD_DIR) throw new HttpError(400, "Invalid path");
  return p;
}
export function findUpload(videoId: string): string | null {
  assertId(videoId);
  for (const ext of ["mp4", "webm"]) { const p = path.join(UPLOAD_DIR, `${videoId}.${ext}`); if (existsSync(p)) return p; }
  return null;
}

let capCache: { ffmpeg: boolean; ffprobe: boolean } | null = null;
const has = (bin: string) => { try { return spawnSync(bin, ["-version"], { timeout: 5000 }).status === 0; } catch { return false; } };
export function capabilities() {
  capCache ??= { ffmpeg: has("ffmpeg"), ffprobe: has("ffprobe") };
  const serverless = !!process.env.VERCEL;
  const workerScript = existsSync(path.join(process.cwd(), "scripts", "cctv-worker.mjs"));
  const worker = !serverless && capCache.ffmpeg && workerScript && existsSync(path.join(process.cwd(), "node_modules", "@vladmandic", "human", "dist", "human.node-wasm.js"));
  return {
    ...capCache, serverless, workerInference: worker,
    workerReason: worker ? "ffmpeg and the Node worker are available on this host." : serverless ? "Serverless host: no ffmpeg and no long-running worker. Use in-browser inference, or run the worker on your own machine." : "ffmpeg or the worker script is missing on this host.",
    browserInference: true, referenceAnnotations: true,
    rtsp: { available: false, reason: "Live RTSP ingest is not implemented in this demo. It needs a server-side stream worker, and credentials must never reach the browser." },
    weaponDetection: { available: false, reason: "No validated weapon-detection model is bundled. This demo never reports weapon detections; a human review workflow exists for any event you choose to flag." },
    gpu: false, realtime: false,
    limits: { ...LIMITS, jobTtlHours: JOB_TTL_MS / 3600_000, uploadTtlMinutes: UPLOAD_TTL_MS / 60_000 },
    detector: DETECTOR_INFO,
  };
}
