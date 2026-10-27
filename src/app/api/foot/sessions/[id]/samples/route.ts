import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { renderScene } from "@/lib/foot/synthetic";
import { HttpError, authorize, fail, intake, limit, listCaptures, saveCapture, sameOrigin, touch } from "@/lib/foot/server";

export const runtime = "nodejs";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ side: z.enum(["left", "right"]), lengthMm: z.number().min(200).max(300).optional(), widthMm: z.number().min(70).max(130).optional() });

/** Demo mode: render a SYNTHETIC top-view scene (parametric silhouette + A4 sheet) and run it through the same pipeline as a real photo. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    sameOrigin(req); limit(req, "sample", 20, 10 * 60_000); const { session } = await authorize(req, (await params).id); const b = schema.parse(await req.json());
    if ((await listCaptures(session.id)).length >= 24) throw new HttpError(409, "This session already has the maximum number of captures.");
    const L = b.lengthMm ?? (b.side === "left" ? 254 : 257), W = b.widthMm ?? (b.side === "left" ? 97 : 99);
    const scene = renderScene({ footLengthMm: L, footWidthMm: W, side: b.side, paper: session.paper, footAngleDeg: b.side === "left" ? 5 : -4, yawDeg: b.side === "left" ? 4 : -3, pitchDeg: 4, rollDeg: b.side === "left" ? -2 : 3, footHeightMm: 25, noise: 3, seed: b.side === "left" ? 11 : 23 });
    const jpeg = await sharp(Buffer.from(scene.img.data), { raw: { width: scene.img.w, height: scene.img.h, channels: 3 } }).jpeg({ quality: 88 }).toBuffer();
    const { dto, jpeg: stored } = await intake({ sessionId: session.id, side: b.side, source: "sample", filename: `sample-${b.side}.jpg`, bytes: jpeg.length, paper: session.paper, buf: jpeg, sampleTruth: { lengthMm: L, widthMm: W, note: "Synthetic rendering of a parametric foot outline on a sheet of paper. It is not a real foot and not a real photograph; the true size is known only because the scene was generated." } });
    await saveCapture(dto, stored); await touch(session.id, { status: "open" });
    return NextResponse.json({ capture: dto }, { status: 201 });
  } catch (e) { return fail(e); }
}
