import { NextResponse, type NextRequest } from "next/server";
import { FOOT_LIMITS } from "@/lib/foot/api-types";
import { HttpError, authorize, fail, intake, limit, listCaptures, saveCapture, sameOrigin, touch } from "@/lib/foot/server";

export const runtime = "nodejs";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try { limit(req, "caps", 240); const { session } = await authorize(req, (await params).id, true); return NextResponse.json({ captures: await listCaptures(session.id), activeCapture: session.activeCapture }); } catch (e) { return fail(e); }
}
/** multipart/form-data: file, side (left|right), source (camera|upload), paper (a4|letter|auto, optional). Analysed immediately; the result is part of the response. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    sameOrigin(req); limit(req, "upload", 40, 10 * 60_000);
    const { session, role } = await authorize(req, (await params).id, true);
    const len = Number(req.headers.get("content-length") || 0); if (len > FOOT_LIMITS.maxFileBytes + 64 * 1024) throw new HttpError(413, `File too large. The limit is ${FOOT_LIMITS.maxFileBytes / 1048576} MB.`);
    const form = await req.formData().catch(() => { throw new HttpError(400, "Expected multipart form data"); });
    const file = form.get("file"); if (!(file instanceof File)) throw new HttpError(400, "No file was sent");
    if (file.size > FOOT_LIMITS.maxFileBytes) throw new HttpError(413, `File too large. The limit is ${FOOT_LIMITS.maxFileBytes / 1048576} MB.`);
    if (file.size < 2000) throw new HttpError(422, "The file is too small to be a photo.");
    const side = form.get("side"); if (side !== "left" && side !== "right") throw new HttpError(400, "side must be 'left' or 'right'");
    const srcRaw = String(form.get("source") || "upload"); const source = srcRaw === "camera" ? "camera" : "upload";
    const pRaw = String(form.get("paper") || session.paper); const paper = pRaw === "a4" || pRaw === "letter" ? pRaw : "auto";
    const existing = await listCaptures(session.id); if (existing.length >= FOOT_LIMITS.maxCapturesPerSession) throw new HttpError(409, "This session already has the maximum number of captures. Delete one first.");
    if (existing.filter((c) => c.side === side).length >= FOOT_LIMITS.maxPerSide) throw new HttpError(409, `This session already has ${FOOT_LIMITS.maxPerSide} photos of the ${side} foot.`);
    const { dto, jpeg } = await intake({ sessionId: session.id, side, source, filename: file.name || "photo", bytes: file.size, paper, buf: Buffer.from(await file.arrayBuffer()) });
    await saveCapture(dto, jpeg); await touch(session.id, { status: "open" });
    return NextResponse.json({ capture: dto, uploadedBy: role }, { status: 201 });
  } catch (e) { return fail(e); }
}
