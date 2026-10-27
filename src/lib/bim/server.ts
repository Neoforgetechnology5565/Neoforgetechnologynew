import "server-only";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { HttpError, assertId, newId, sameOrigin } from "@/lib/cctv/server";

export { HttpError, assertId, newId, sameOrigin };
export const C_BIM = { projects: "bim_projects", blobs: "bim_blobs", jobs: "bim_jobs" } as const;
export const DEMOS = ["plan3d", "cad-analysis", "bim-viewer", "point-cloud", "interop", "floorplan", "structural", "mep", "bim-qc", "qto", "collab"] as const;
export type DemoKey = (typeof DEMOS)[number];
export const retentionMs = () => Math.max(1, Number(process.env.BIM_RETENTION_HOURS) || 72) * 3600_000;
export const MAX_PROJECT_BYTES = 80 * 1024 * 1024;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
export const keyHash = hash;
export const newKey = () => newId(24);

export function fail(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: "Invalid request", issues: e.issues.slice(0, 5).map((i) => `${i.path.join(".") || "body"}: ${i.message}`) }, { status: 400 });
  if (e instanceof SyntaxError) return NextResponse.json({ error: "Request body is not valid JSON" }, { status: 400 });
  console.error("[bim]", (e as Error)?.message ?? "unknown error"); // message only: never file contents, keys or tokens
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
export function limit(req: NextRequest, key: string, max: number, windowMs = 60_000) { if (!rateLimit(`bim:${key}:${clientIp(req)}`, max, windowMs)) throw new HttpError(429, "Too many requests. Please slow down and try again shortly."); }

export interface FileMeta { id: string; name: string; format: string; role: string; size: number; blob: string; sample: boolean; sampleId?: string; uploadedAt: number; validation: { ok: boolean; support: string; warnings: string[]; info: Record<string, string | number | boolean> } }
export interface ArtifactMeta { id: string; name: string; format: string; mime: string; size: number; blob: string; createdAt: number; kind: string; sample: boolean }
export interface JobStage { stage: string; at: number; ms: number; note?: string }
export interface JobMeta { id: string; kind: string; status: "running" | "completed" | "failed"; stages: JobStage[]; startedAt: number; finishedAt?: number; error?: string; summary?: Record<string, unknown> }
/** One reviewed revision of the model (demonstration 11). `modelBlob` holds the processed model of that revision. */
export interface VersionMeta { id: string; label: string; note: string; fileId: string; fileName: string; uploadedAt: number; by: string; elements: number; triangles: number; schema: string; modelBlob: string; sample: boolean }
export interface ActivityRec { at: number; by: string; action: string; detail: string }
export interface ProjectDoc {
  id: string; demo: DemoKey; name: string; ownerHash: string; settings: Record<string, unknown>; files: FileMeta[]; artifacts: ArtifactMeta[]; jobs: JobMeta[]; modelBlob?: string; modelMeta?: Record<string, unknown>;
  shares?: { hash: string; role: "viewer" | "reviewer"; name: string; createdAt: number }[]; versions?: VersionMeta[]; activity?: ActivityRec[]; version: number; createdAt: number; updatedAt: number; expiresAt: number; sampleOnly: boolean;
}
export const projectsCol = () => adminDb().collection(C_BIM.projects);
const blobsCol = () => adminDb().collection(C_BIM.blobs);

/* ───────── blobs: gzip + chunked base64 documents (Firestore documents are limited to 1 MiB) ───────── */
const CHUNK = 600 * 1024;
export async function putBlob(data: Buffer, opts: { gzip?: boolean; mime?: string } = {}): Promise<string> {
  const id = newId(); const payload = opts.gzip === false ? data : gzipSync(data, { level: 6 }); const n = Math.max(1, Math.ceil(payload.length / CHUNK));
  const batch = adminDb().batch(); batch.set(blobsCol().doc(id), { id, n, size: data.length, stored: payload.length, gz: opts.gzip !== false, mime: opts.mime ?? "application/octet-stream", sha256: hash(data.toString("latin1")).slice(0, 16), createdAt: Date.now() });
  for (let i = 0; i < n; i++) batch.set(blobsCol().doc(`${id}~${i}`), { b64: payload.subarray(i * CHUNK, (i + 1) * CHUNK).toString("base64") });
  await batch.commit(); return id;
}
export async function getBlob(id: string, raw = false): Promise<{ data: Buffer; gz: boolean; mime: string }> {
  const m = await blobsCol().doc(assertId(id)).get(); if (!m.exists) throw new HttpError(404, "Stored data not found"); const meta = m.data() as { n: number; gz: boolean; mime: string };
  const docs = await Promise.all(Array.from({ length: meta.n }, (_, i) => blobsCol().doc(`${id}~${i}`).get())); const payload = Buffer.concat(docs.map((d) => Buffer.from((d.data() as { b64: string }).b64, "base64")));
  return { data: meta.gz && !raw ? gunzipSync(payload) : payload, gz: meta.gz, mime: meta.mime };
}
export async function deleteBlob(id: string) { const m = await blobsCol().doc(id).get(); if (!m.exists) return; const n = (m.data() as { n: number }).n; const batch = adminDb().batch(); batch.delete(blobsCol().doc(id)); for (let i = 0; i < n; i++) batch.delete(blobsCol().doc(`${id}~${i}`)); await batch.commit(); }

/* ───────── projects ───────── */
export async function getProject(id: string): Promise<ProjectDoc> {
  const s = await projectsCol().doc(assertId(id)).get(); if (!s.exists) throw new HttpError(404, "Project not found or expired"); const p = s.data() as ProjectDoc; if (p.expiresAt < Date.now()) throw new HttpError(404, "Project not found or expired"); return p;
}
export type Role = "owner" | "reviewer" | "viewer";
/** Owner key (x-bim-key) = full access. Share keys (x-bim-share) give viewer/reviewer access where a demo allows it. */
export async function authorize(req: NextRequest, id: string, need: Role = "owner"): Promise<{ project: ProjectDoc; role: Role; shareName?: string }> {
  const p = await getProject(id); const key = req.headers.get("x-bim-key") || ""; if (key && hash(key) === p.ownerHash) return { project: p, role: "owner" };
  const sk = req.headers.get("x-bim-share") || ""; if (sk && need !== "owner") { const sh = p.shares?.find((s) => s.hash === hash(sk)); if (sh && (need === "viewer" || sh.role === "reviewer")) return { project: p, role: sh.role, shareName: sh.name }; }
  throw new HttpError(403, "Missing or invalid project key");
}
export async function saveProject(p: ProjectDoc, patch: Partial<ProjectDoc> = {}) { Object.assign(p, patch, { updatedAt: Date.now() }); await projectsCol().doc(p.id).set(p); }
export async function projectBytes(p: ProjectDoc) { return p.files.reduce((s, f) => s + f.size, 0) + p.artifacts.reduce((s, a) => s + a.size, 0); }
export async function deleteProject(p: ProjectDoc) {
  for (const f of p.files) await deleteBlob(f.blob); for (const a of p.artifacts) await deleteBlob(a.blob); for (const id of new Set([p.modelBlob, ...(p.versions ?? []).map((v) => v.modelBlob)])) if (id) await deleteBlob(id);
  const extra = await adminDb().collection("bim_issues").where("projectId", "==", p.id).get(); for (const d of extra.docs) await d.ref.delete(); await projectsCol().doc(p.id).delete();
}
export async function purgeExpired(max = 6) { const snap = await projectsCol().where("expiresAt", "<", Date.now()).limit(max).get(); for (const d of snap.docs) await deleteProject(d.data() as ProjectDoc); return snap.size; }
export function publicProject(p: ProjectDoc, role: Role = "owner") { const { ownerHash: _o, shares, versions, ...rest } = p; void _o; return { ...rest, versions: (versions ?? []).map(({ modelBlob: _m, ...v }) => (void _m, v)), role, shares: role === "owner" ? (shares ?? []).map((s) => ({ role: s.role, name: s.name, createdAt: s.createdAt })) : undefined }; }

/** Stage timer used by processors: records real wall-clock time per stage. */
export function stager(kind: string) {
  const job: JobMeta = { id: newId(), kind, status: "running", stages: [], startedAt: Date.now() }; let last = job.startedAt;
  return { job, stage(name: string, note?: string) { const now = Date.now(); job.stages.push({ stage: name, at: now, ms: now - last, note }); last = now; }, done(summary?: Record<string, unknown>) { job.status = "completed"; job.finishedAt = Date.now(); job.summary = summary; return job; }, fail(err: string) { job.status = "failed"; job.finishedAt = Date.now(); job.error = err; return job; } };
}
