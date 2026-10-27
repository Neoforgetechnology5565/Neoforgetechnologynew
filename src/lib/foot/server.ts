import "server-only";
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { ZodError } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { HttpError, assertId, newId, sameOrigin } from "@/lib/cctv/server";
import { analyzeFootImage } from "./vision";
import type { Analysis, Img, PaperKind, Pt, Side } from "./types";
import { FOOT_LIMITS, type CaptureDTO, type CaptureSource, type SessionDTO, type StageEvent, type MeshAssetDTO } from "./api-types";
import type { Fit } from "./sizing";

export { HttpError, assertId, newId, sameOrigin };
export const C_FOOT = { sessions: "foot_sessions", captures: "foot_captures", images: "foot_images" } as const;
export const retentionMs = () => Math.max(1, Number(process.env.FOOT_RETENTION_HOURS) || 72) * 3600_000;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export function fail(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: "Invalid request", issues: e.issues.slice(0, 5).map((i) => `${i.path.join(".") || "body"}: ${i.message}`) }, { status: 400 });
  if (e instanceof SyntaxError) return NextResponse.json({ error: "Request body is not valid JSON" }, { status: 400 });
  console.error("[foot]", (e as Error)?.message ?? "unknown error"); // message only: never log image bytes, keys or tokens
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
export function limit(req: NextRequest, key: string, max: number, windowMs = 60_000) { if (!rateLimit(`foot:${key}:${clientIp(req)}`, max, windowMs)) throw new HttpError(429, "Too many requests. Please slow down and try again shortly."); }

export interface SessionDoc { id: string; ownerHash: string; phoneHash?: string; phoneExp?: number; name: string; paper: PaperKind; fit: Fit; status: "open" | "processed"; processedAt?: number; events: StageEvent[]; activeCapture: { left?: string; right?: string }; meshes: MeshAssetDTO[]; createdAt: number; updatedAt: number; expiresAt: number }
export const sessionsCol = () => adminDb().collection(C_FOOT.sessions);
export const capturesCol = () => adminDb().collection(C_FOOT.captures);
export const imagesCol = () => adminDb().collection(C_FOOT.images);

export async function getSession(id: string): Promise<SessionDoc> {
  const snap = await sessionsCol().doc(assertId(id)).get(); if (!snap.exists) throw new HttpError(404, "Session not found or expired");
  const s = snap.data() as SessionDoc; if (s.expiresAt < Date.now()) throw new HttpError(404, "Session not found or expired"); return s;
}
export type Role = "owner" | "phone";
/** Owner key (header x-foot-key) grants everything. A phone token (x-foot-phone) is capture-only and expires. */
export async function authorize(req: NextRequest, id: string, allowPhone = false): Promise<{ session: SessionDoc; role: Role }> {
  const s = await getSession(id); const key = req.headers.get("x-foot-key") || ""; if (key && hash(key) === s.ownerHash) return { session: s, role: "owner" };
  const ph = req.headers.get("x-foot-phone") || "";
  if (allowPhone && ph && s.phoneHash && hash(ph) === s.phoneHash) { if ((s.phoneExp ?? 0) < Date.now()) throw new HttpError(403, "This phone link has expired. Create a new QR code on the computer."); return { session: s, role: "phone" }; }
  throw new HttpError(403, "Missing or invalid session key");
}
export const newKey = () => newId(24);
export const keyHash = hash;

export function sessionDTO(s: SessionDoc, captureCount: number): SessionDTO {
  return { id: s.id, name: s.name, paper: s.paper, fit: s.fit, createdAt: s.createdAt, updatedAt: s.updatedAt, expiresAt: s.expiresAt, status: s.status, processedAt: s.processedAt, captureCount, phoneLinked: !!s.phoneHash && (s.phoneExp ?? 0) > Date.now(), phoneExpiresAt: s.phoneExp && s.phoneExp > Date.now() ? s.phoneExp : undefined, meshes: s.meshes ?? [], activeCapture: s.activeCapture ?? {}, events: s.events ?? [] };
}
export async function listCaptures(sessionId: string): Promise<CaptureDTO[]> {
  const snap = await capturesCol().where("sessionId", "==", sessionId).get();
  return snap.docs.map((d) => d.data() as CaptureDTO).sort((a, b) => a.createdAt - b.createdAt);
}
export async function touch(id: string, patch: Partial<SessionDoc> = {}) { await sessionsCol().doc(id).set({ ...patch, updatedAt: Date.now() }, { merge: true }); }

export async function deleteSession(id: string) {
  const caps = await capturesCol().where("sessionId", "==", id).get(); const batch = adminDb().batch();
  for (const d of caps.docs) { batch.delete(d.ref); batch.delete(imagesCol().doc(d.id)); } batch.delete(sessionsCol().doc(id)); await batch.commit();
}
/** Lazy retention: remove a few expired sessions (and their images) whenever a new session is created. */
export async function purgeExpired(max = 10) {
  const snap = await sessionsCol().where("expiresAt", "<", Date.now()).limit(max).get(); for (const d of snap.docs) await deleteSession(d.id); return snap.size;
}

/* ───────── image intake ───────── */
export function sniff(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}
export async function decodeToImg(buf: Buffer): Promise<{ img: Img; jpeg: Buffer; thumb: string; origW: number; origH: number }> {
  const meta = await sharp(buf, { limitInputPixels: FOOT_LIMITS.maxPixels }).metadata(); const S = FOOT_LIMITS.storedMaxSide;
  const { data, info } = await sharp(buf, { limitInputPixels: FOOT_LIMITS.maxPixels }).rotate().flatten({ background: "#ffffff" }).resize({ width: S, height: S, fit: "inside", withoutEnlargement: true }).toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const rawOpt = { raw: { width: info.width, height: info.height, channels: info.channels as 3 } };
  const jpeg = await sharp(data, rawOpt).jpeg({ quality: 74, mozjpeg: true }).toBuffer();
  const th = await sharp(data, rawOpt).resize({ width: 240, height: 240, fit: "inside" }).jpeg({ quality: 60 }).toBuffer();
  return { img: { w: info.width, h: info.height, ch: 3, data: new Uint8Array(data.buffer, data.byteOffset, data.length) }, jpeg, thumb: `data:image/jpeg;base64,${th.toString("base64")}`, origW: meta.width ?? info.width, origH: meta.height ?? info.height };
}

export interface IntakeInput { sessionId: string; side: Side; source: CaptureSource; filename: string; bytes: number; paper: PaperKind | "auto"; buf: Buffer; sampleTruth?: CaptureDTO["sampleTruth"] }
/** Validate → decode → calibrate → measure. Every stage is timed for real; nothing is simulated. */
export async function intake(inp: IntakeInput): Promise<{ dto: CaptureDTO; jpeg: Buffer }> {
  const t0 = Date.now(); const events: StageEvent[] = [{ stage: "Uploading", at: t0, ms: 0, note: `${Math.round(inp.bytes / 1024)} KB received` }];
  const mark = (stage: StageEvent["stage"], note?: string) => { const now = Date.now(); events.push({ stage, at: now, ms: now - events[events.length - 1].at, note }); };
  const mime = sniff(inp.buf); if (!mime) throw new HttpError(415, "Unsupported file. Use a JPEG, PNG or WebP photo (iPhone HEIC photos must be saved as JPEG first).");
  mark("Validating", mime);
  let dec: Awaited<ReturnType<typeof decodeToImg>>;
  try { dec = await decodeToImg(inp.buf); } catch { throw new HttpError(422, "The image could not be decoded. It may be corrupt or too large."); }
  mark("Preparing", `${dec.img.w}×${dec.img.h} px analysed (original ${dec.origW}×${dec.origH})`);
  let auto: Analysis;
  try { auto = analyzeFootImage(dec.img, { paper: inp.paper, onStage: (st) => { if (st === "calibrating") { /* stage begins now */ } else mark("Calibrating"); } }).analysis; if (events[events.length - 1].stage !== "Calibrating") mark("Calibrating"); }
  catch { throw new HttpError(500, "Analysis failed unexpectedly."); }
  mark(auto.ok ? "Measuring" : "Failed", auto.ok ? `${auto.measurement!.lengthMm} × ${auto.measurement!.widthMm} mm` : auto.reason);
  if (auto.ok) mark("Completed");
  const dto: CaptureDTO = { id: newId(), sessionId: inp.sessionId, side: inp.side, view: "top", source: inp.source, filename: inp.filename.slice(0, 120), mime, bytes: inp.bytes, width: dec.img.w, height: dec.img.h, createdAt: t0, thumb: dec.thumb, auto, use: "auto", job: { status: auto.ok ? "completed" : "failed", events }, ...(inp.sampleTruth ? { sampleTruth: inp.sampleTruth } : {}) };
  return { dto, jpeg: dec.jpeg };
}
export async function saveCapture(dto: CaptureDTO, jpeg: Buffer) { await capturesCol().doc(dto.id).set(dto); await imagesCol().doc(dto.id).set({ captureId: dto.id, sessionId: dto.sessionId, mime: "image/jpeg", b64: jpeg.toString("base64") }); }
export async function getCapture(sessionId: string, cid: string): Promise<CaptureDTO> {
  const snap = await capturesCol().doc(assertId(cid)).get(); const c = snap.data() as CaptureDTO | undefined; if (!c || c.sessionId !== sessionId) throw new HttpError(404, "Capture not found"); return c;
}
export async function getImage(cid: string): Promise<Buffer> { const s = await imagesCol().doc(cid).get(); if (!s.exists) throw new HttpError(404, "Image not found"); return Buffer.from((s.data() as { b64: string }).b64, "base64"); }
export async function reanalyse(c: CaptureDTO, corners: Pt[], paper: PaperKind): Promise<Analysis> { const dec = await decodeToImg(await getImage(c.id)); return analyzeFootImage(dec.img, { paper, corners }).analysis; }
